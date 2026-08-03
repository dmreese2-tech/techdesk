-- Phase 3 of per-module permissions: the rules, and the function that reads them.
--
-- Still nothing enforced. This migration creates the two tables that hold the
-- rules and the function that resolves them, so the rules can be written and
-- inspected before anything starts refusing writes. Phase 4 is one small
-- migration that points the policies at can_write() — and one that can be
-- reverted in a sentence if it goes wrong.
--
-- The rule, in one line:
--
--   writable = (the modules of every position you hold — on this show, or
--   anywhere if the position is company-wide) ∪ granted − revoked
--
-- Admins skip the calculation. Cast write nothing unless granted by name.

-- ---------------------------------------------------------------------------
-- 1. What a position implies
-- ---------------------------------------------------------------------------
-- Positions already exist as company-level lists in Settings. This hangs a set
-- of writable modules off each one, so nobody has to remember what a props
-- master is allowed to touch — the job title says it.

create table if not exists public.position_permissions (
  org_id        uuid not null references orgs(id) on delete cascade,
  position_kind text not null check (position_kind in ('crew', 'musician', 'staff', 'actor')),
  position      text not null,
  modules       jsonb not null default '[]',
  -- Inventory is company stock, so it is granted by category rather than
  -- wholesale: a props master writes the Props shelves, not the warehouse.
  -- 'inventory' in `modules` means every category.
  inventory_categories jsonb not null default '[]',
  -- Producer, Co-Producer, Director, Assistant Director and Technical Director
  -- hold the company, not one production. They don't stop being what they are
  -- on a show nobody remembered to assign them to.
  company_wide  boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (org_id, position_kind, position)
);

-- ---------------------------------------------------------------------------
-- 2. The exception to the rule
-- ---------------------------------------------------------------------------
-- Grant and revoke rather than a replacement list, so an admin can say "also
-- let her edit props on this one show" without restating everything the
-- position already allows. show_id null means every show in the company.

create table if not exists public.member_permissions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  show_id    text references shows(id) on delete cascade,
  granted    jsonb not null default '[]',
  revoked    jsonb not null default '[]',
  inventory_categories jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per person per scope. Postgres won't take coalesce() in a primary
-- key, so the uniqueness lives in an index.
create unique index if not exists member_permissions_scope_idx
  on public.member_permissions(org_id, user_id, coalesce(show_id, ''));

drop trigger if exists position_permissions_updated_at on public.position_permissions;
create trigger position_permissions_updated_at
  before update on public.position_permissions
  for each row execute function set_updated_at();

drop trigger if exists member_permissions_updated_at on public.member_permissions;
create trigger member_permissions_updated_at
  before update on public.member_permissions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Who can change the rules
-- ---------------------------------------------------------------------------
-- Everyone reads them — you should be able to see why you can't edit something
-- — and only an admin writes them. A member who could edit their own
-- permissions row has, in effect, every permission.

alter table public.position_permissions enable row level security;
alter table public.member_permissions enable row level security;

drop policy if exists "members read position permissions" on public.position_permissions;
create policy "members read position permissions" on public.position_permissions
  for select using (is_org_member(org_id));

drop policy if exists "admins write position permissions" on public.position_permissions;
create policy "admins write position permissions" on public.position_permissions
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

drop policy if exists "members read member permissions" on public.member_permissions;
create policy "members read member permissions" on public.member_permissions
  for select using (is_org_member(org_id));

drop policy if exists "admins write member permissions" on public.member_permissions;
create policy "admins write member permissions" on public.member_permissions
  for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- 4. The answer
-- ---------------------------------------------------------------------------
-- One function, called by every policy in Phase 4. It runs per row of every
-- statement, so it is `stable` and it is one query rather than three lookups.
--
-- The order matters: revoke beats grant beats position. An explicit revoke is
-- someone deciding by hand, and a hand should always beat a job title.

create or replace function public.can_write(check_org_id uuid, check_show_id text, check_module text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  my_tier text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select tier into my_tier
  from org_members
  where org_id = check_org_id and user_id = auth.uid();

  if my_tier is null then
    return false;              -- not a member of this company
  end if;
  if my_tier = 'admin' then
    return true;
  end if;
  if check_module = 'settings' then
    return false;              -- the vocabulary of the company is admin-only
  end if;

  -- Taken away by hand, on this show or across the company.
  if exists (
    select 1 from member_permissions mp
    where mp.org_id = check_org_id
      and mp.user_id = auth.uid()
      and (mp.show_id is null or mp.show_id = check_show_id)
      and mp.revoked ? check_module
  ) then
    return false;
  end if;

  -- Given by hand. This is deliberately above the cast check: a performer who
  -- is also running the props table gets props, without being promoted.
  if exists (
    select 1 from member_permissions mp
    where mp.org_id = check_org_id
      and mp.user_id = auth.uid()
      and (mp.show_id is null or mp.show_id = check_show_id)
      and mp.granted ? check_module
  ) then
    return true;
  end if;

  if my_tier = 'cast' then
    return false;
  end if;

  -- Earned by the job. Crew store the title as `role`, everyone else as
  -- `roleTitle`; compared case-insensitively because nobody types a position
  -- the same way twice.
  return exists (
    select 1
    from people p
    cross join lateral jsonb_array_elements(coalesce(p.assignments, '[]'::jsonb)) as a
    join position_permissions pp
      on pp.org_id = check_org_id
     and pp.position_kind = p.kind
     and lower(pp.position) = lower(coalesce(a->>'role', a->>'roleTitle', ''))
    where p.org_id = check_org_id
      and p.user_id = auth.uid()
      and (pp.company_wide or a->>'showId' = check_show_id)
      and pp.modules ? check_module
  );
end;
$$;

-- Inventory is company stock: no show, and granted per category.
create or replace function public.can_write_inventory(check_org_id uuid, check_category text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  my_tier text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select tier into my_tier
  from org_members
  where org_id = check_org_id and user_id = auth.uid();

  if my_tier is null then
    return false;
  end if;
  if my_tier = 'admin' then
    return true;
  end if;

  if exists (
    select 1 from member_permissions mp
    where mp.org_id = check_org_id
      and mp.user_id = auth.uid()
      and (mp.granted ? 'inventory' or mp.inventory_categories ? check_category)
  ) then
    return true;
  end if;

  if my_tier = 'cast' then
    return false;
  end if;

  return exists (
    select 1
    from people p
    cross join lateral jsonb_array_elements(coalesce(p.assignments, '[]'::jsonb)) as a
    join position_permissions pp
      on pp.org_id = check_org_id
     and pp.position_kind = p.kind
     and lower(pp.position) = lower(coalesce(a->>'role', a->>'roleTitle', ''))
    where p.org_id = check_org_id
      and p.user_id = auth.uid()
      and (pp.modules ? 'inventory' or pp.inventory_categories ? check_category)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. What the client asks
-- ---------------------------------------------------------------------------
-- The app needs the resolved answer to decide what to hide and what to grey
-- out. It asks here rather than reimplementing the rule in JavaScript — two
-- copies of a permission rule is one copy too many, and the client's copy is
-- always the one that drifts.

create or replace function public.my_writable_modules(check_org_id uuid)
returns table (show_id text, module text)
language sql
security definer
stable
set search_path = public
as $$
  select s.id, m.module
  from shows s
  cross join (values
    ('production'), ('schedule'), ('scenes'), ('characters'), ('choreography'),
    ('costumes'), ('props'), ('set'), ('audio'), ('crew'), ('actors'),
    ('musicians'), ('staff'), ('calls'), ('runofshow'), ('script'), ('groups')
  ) as m(module)
  where s.org_id = check_org_id
    and can_write(check_org_id, s.id, m.module);
$$;

create or replace function public.my_writable_inventory(check_org_id uuid)
returns table (category text)
language sql
security definer
stable
set search_path = public
as $$
  select c.category
  from org_settings os
  cross join lateral jsonb_object_keys(coalesce(os.inventory_categories, '{}'::jsonb)) as c(category)
  where os.org_id = check_org_id
    and can_write_inventory(check_org_id, c.category);
$$;

-- ---------------------------------------------------------------------------
-- Check — two tables, four functions.
-- ---------------------------------------------------------------------------
select 'position_permissions' as item, count(*) as found from information_schema.tables
  where table_schema = 'public' and table_name = 'position_permissions'
union all select 'member_permissions', count(*) from information_schema.tables
  where table_schema = 'public' and table_name = 'member_permissions'
union all select 'can_write', count(*) from information_schema.routines
  where routine_schema = 'public' and routine_name = 'can_write'
union all select 'can_write_inventory', count(*) from information_schema.routines
  where routine_schema = 'public' and routine_name = 'can_write_inventory'
union all select 'my_writable_modules', count(*) from information_schema.routines
  where routine_schema = 'public' and routine_name = 'my_writable_modules'
union all select 'my_writable_inventory', count(*) from information_schema.routines
  where routine_schema = 'public' and routine_name = 'my_writable_inventory';
