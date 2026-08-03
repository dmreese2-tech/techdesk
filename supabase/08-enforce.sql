-- Phase 4: turn it on.
--
-- The blanket "org members can do anything" policies are replaced with ones
-- that ask can_write(). This is the migration where things can break, and it
-- is deliberately small enough to read in one sitting and revert in one:
-- 08-revert-enforce.sql puts the old policies back exactly.
--
-- Reads are untouched. Every member still reads everything; narrowing what
-- cast can see is Phase 6 and is a separate decision with separate risks.

-- ---------------------------------------------------------------------------
-- 0. The door that only opens one way
-- ---------------------------------------------------------------------------
-- Only an admin can promote an admin. So the last admin demoting or deleting
-- themselves leaves a company nobody can ever administer again — not a bug
-- you find until you need it, and then it is unfixable from inside the app.
-- The UI already discourages it; this makes it impossible.

create or replace function public.protect_last_admin()
returns trigger
language plpgsql
as $$
declare
  admins_left int;
  target_org uuid;
begin
  target_org := old.org_id;

  if tg_op = 'UPDATE' and new.tier = 'admin' then
    return new;                       -- still an admin, nothing to protect
  end if;
  if old.tier <> 'admin' then
    return coalesce(new, old);        -- wasn't one to begin with
  end if;

  select count(*) into admins_left
  from org_members
  where org_id = target_org and tier = 'admin' and user_id <> old.user_id;

  if admins_left = 0 then
    raise exception 'This is the last admin of the company. Promote someone else first.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists org_members_protect_last_admin on public.org_members;
create trigger org_members_protect_last_admin
  before update or delete on public.org_members
  for each row execute function public.protect_last_admin();

-- ---------------------------------------------------------------------------
-- 1. People are company-level, permissions are per show
-- ---------------------------------------------------------------------------
-- A roster entry isn't attached to one production, so "can you edit the crew
-- list" means "is there any production on which you may edit crew".

create or replace function public.can_write_people(check_org_id uuid, check_kind text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from shows s
    where s.org_id = check_org_id
      and can_write(check_org_id, s.id, case check_kind
            when 'crew' then 'crew'
            when 'actor' then 'actors'
            when 'musician' then 'musicians'
            else 'staff' end)
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Out with the blanket policies
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['shows', 'people', 'calls', 'inventory_items', 'cues']
  loop
    execute format('drop policy if exists "org members can read %1$s" on %1$I', t);
    execute format('drop policy if exists "org members can insert %1$s" on %1$I', t);
    execute format('drop policy if exists "org members can update %1$s" on %1$I', t);
    execute format('drop policy if exists "org members can delete %1$s" on %1$I', t);
  end loop;
end;
$$;

-- Reads stay open to the whole company.
do $$
declare
  t text;
begin
  foreach t in array array['shows', 'people', 'calls', 'inventory_items', 'cues']
  loop
    execute format('drop policy if exists "org members read %1$s" on %1$I', t);
    execute format('create policy "org members read %1$s" on %1$I for select using (is_org_member(org_id))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. In with the rules
-- ---------------------------------------------------------------------------

-- shows: the production's own details — title, venue, director, dates, phase.
drop policy if exists "production writers insert shows" on public.shows;
create policy "production writers insert shows" on public.shows
  for insert with check (can_write(org_id, id, 'production'));

drop policy if exists "production writers update shows" on public.shows;
create policy "production writers update shows" on public.shows
  for update using (can_write(org_id, id, 'production'))
  with check (can_write(org_id, id, 'production'));

drop policy if exists "production writers delete shows" on public.shows;
create policy "production writers delete shows" on public.shows
  for delete using (can_write(org_id, id, 'production'));

-- show_items: the whole point of Phase 2. One policy, and the module column
-- is what makes "props only" sayable at last.
drop policy if exists "org members can insert show_items" on public.show_items;
drop policy if exists "org members can update show_items" on public.show_items;
drop policy if exists "org members can delete show_items" on public.show_items;

drop policy if exists "module writers insert show_items" on public.show_items;
create policy "module writers insert show_items" on public.show_items
  for insert with check (can_write(org_id, show_id, module));

drop policy if exists "module writers update show_items" on public.show_items;
create policy "module writers update show_items" on public.show_items
  for update using (can_write(org_id, show_id, module))
  with check (can_write(org_id, show_id, module));

drop policy if exists "module writers delete show_items" on public.show_items;
create policy "module writers delete show_items" on public.show_items
  for delete using (can_write(org_id, show_id, module));

-- people: crew, actors, musicians, staff — each gated by its own module.
drop policy if exists "roster writers insert people" on public.people;
create policy "roster writers insert people" on public.people
  for insert with check (can_write_people(org_id, kind));

drop policy if exists "roster writers update people" on public.people;
create policy "roster writers update people" on public.people
  for update using (can_write_people(org_id, kind))
  with check (can_write_people(org_id, kind));

drop policy if exists "roster writers delete people" on public.people;
create policy "roster writers delete people" on public.people
  for delete using (can_write_people(org_id, kind));

-- calls
drop policy if exists "call writers insert calls" on public.calls;
create policy "call writers insert calls" on public.calls
  for insert with check (can_write(org_id, show_id, 'calls'));

drop policy if exists "call writers update calls" on public.calls;
create policy "call writers update calls" on public.calls
  for update using (can_write(org_id, show_id, 'calls'))
  with check (can_write(org_id, show_id, 'calls'));

drop policy if exists "call writers delete calls" on public.calls;
create policy "call writers delete calls" on public.calls
  for delete using (can_write(org_id, show_id, 'calls'));

-- cues — the run of show
drop policy if exists "cue writers insert cues" on public.cues;
create policy "cue writers insert cues" on public.cues
  for insert with check (can_write(org_id, show_id, 'runofshow'));

drop policy if exists "cue writers update cues" on public.cues;
create policy "cue writers update cues" on public.cues
  for update using (can_write(org_id, show_id, 'runofshow'))
  with check (can_write(org_id, show_id, 'runofshow'));

drop policy if exists "cue writers delete cues" on public.cues;
create policy "cue writers delete cues" on public.cues
  for delete using (can_write(org_id, show_id, 'runofshow'));

-- inventory: company stock, gated by category. A props master keeps the Props
-- shelves; that says nothing about the rest of the warehouse.
drop policy if exists "stock writers insert inventory" on public.inventory_items;
create policy "stock writers insert inventory" on public.inventory_items
  for insert with check (can_write_inventory(org_id, category));

drop policy if exists "stock writers update inventory" on public.inventory_items;
create policy "stock writers update inventory" on public.inventory_items
  for update using (can_write_inventory(org_id, category))
  with check (can_write_inventory(org_id, category));

drop policy if exists "stock writers delete inventory" on public.inventory_items;
create policy "stock writers delete inventory" on public.inventory_items
  for delete using (can_write_inventory(org_id, category));

-- org_settings: the company's vocabulary. Admin only, as can_write already says.
drop policy if exists "org members can read org_settings" on public.org_settings;
drop policy if exists "org members can write org_settings" on public.org_settings;
drop policy if exists "org members can insert org_settings" on public.org_settings;
drop policy if exists "org members can update org_settings" on public.org_settings;

drop policy if exists "members read org_settings" on public.org_settings;
create policy "members read org_settings" on public.org_settings
  for select using (is_org_member(org_id));

drop policy if exists "admins write org_settings" on public.org_settings;
create policy "admins write org_settings" on public.org_settings
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- Check — every policy now on the gated tables.
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('shows', 'show_items', 'people', 'calls', 'cues', 'inventory_items', 'org_settings')
order by tablename, cmd, policyname;
