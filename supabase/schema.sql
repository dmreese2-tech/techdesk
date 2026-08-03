-- =============================================================================
-- Tech Desk Dashboard — Supabase schema
-- =============================================================================
-- Multi-tenant by "org" (one theater company / venue). Every data table has
-- an org_id, and row-level security means a signed-in user can only ever
-- read or write rows belonging to an org they're a member of. This costs
-- almost nothing to set up now and avoids a painful migration later if this
-- tool is ever used by more than one company.
--
-- Deeply nested, show-specific collections (schedule, acts/scenes,
-- choreography, costumes, props, set pieces, groups) stay as JSONB columns
-- on `shows` rather than being fully normalized into their own tables —
-- that mirrors the shape the React app already works with, so the
-- client-side data model barely has to change. Things that benefit from
-- row-level updates and realtime (cues, in particular — "fired" status
-- changes constantly during a show) get real tables instead.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ORGS & MEMBERSHIP
-- ---------------------------------------------------------------------------
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Helper used by every RLS policy below. security definer so it can read
-- org_members regardless of the calling user's own row-level permissions.
create or replace function is_org_member(check_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_id = check_org_id and user_id = auth.uid()
  );
$$;

create or replace function is_org_admin(check_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_id = check_org_id and user_id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- SHOWS
-- ---------------------------------------------------------------------------
create table if not exists shows (
  id text primary key default gen_random_uuid()::text,
  org_id uuid not null references orgs(id) on delete cascade,
  title text not null,
  venue text,
  director text,
  phase text,
  status text,
  open_date date,
  crew_call_today text,
  headcount_today int default 0,
  schedule jsonb not null default '[]',
  sound_effects jsonb not null default '[]',
  choreography jsonb not null default '[]',
  acts jsonb not null default '[]',
  set_pieces jsonb not null default '[]',
  costumes jsonb not null default '[]',
  props jsonb not null default '[]',
  groups jsonb not null default '[]',
  script_meta jsonb, -- { fileName, pageCount, markers } — the PDF bytes live in Storage, not here
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shows_org_id_idx on shows(org_id);

-- ---------------------------------------------------------------------------
-- PEOPLE — crew, actors, staff, musicians share a shape (platform-level
-- identity + a list of per-show assignments), so one table with a `kind`
-- discriminator instead of four near-identical tables.
-- ---------------------------------------------------------------------------
create table if not exists people (
  id text primary key default gen_random_uuid()::text,
  org_id uuid not null references orgs(id) on delete cascade,
  kind text not null check (kind in ('crew', 'actor', 'staff', 'musician')),
  name text not null,
  phone text,
  email text,
  assignments jsonb not null default '[]', -- [{ id, showId, role/roleTitle, dept/category, ...audio fields }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists people_org_id_idx on people(org_id);
create index if not exists people_kind_idx on people(org_id, kind);

-- ---------------------------------------------------------------------------
-- CALLS
-- ---------------------------------------------------------------------------
create table if not exists calls (
  id text primary key default gen_random_uuid()::text,
  org_id uuid not null references orgs(id) on delete cascade,
  show_id text not null references shows(id) on delete cascade,
  call_date date not null,
  call_time text not null,
  label text not null,
  location text,
  scene_ids jsonb not null default '[]',
  slots jsonb not null default '[]', -- [{ id, personType, role, filledBy, attendance }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calls_org_id_idx on calls(org_id);
create index if not exists calls_show_id_idx on calls(show_id);

-- ---------------------------------------------------------------------------
-- INVENTORY
-- ---------------------------------------------------------------------------
create table if not exists inventory_items (
  id text primary key default gen_random_uuid()::text,
  org_id uuid not null references orgs(id) on delete cascade,
  asset_no text,
  name text not null,
  category text,
  total_qty int not null default 0,
  location text,
  cost_per_unit numeric(10, 2) default 0,
  purchase_date date,
  purchase_source text,
  purchase_notes text,
  units jsonb not null default '[]',       -- [{ id, status, note, date }]
  assignments jsonb not null default '[]', -- [{ id, showId, callId, qty }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inventory_items_org_id_idx on inventory_items(org_id);

-- ---------------------------------------------------------------------------
-- CUES — a real table (not JSONB) because "fired" toggles constantly
-- during a show and benefits from row-level updates + realtime.
-- ---------------------------------------------------------------------------
create table if not exists cues (
  id text primary key default gen_random_uuid()::text,
  org_id uuid not null references orgs(id) on delete cascade,
  show_id text not null references shows(id) on delete cascade,
  num int not null,
  dept text not null,
  description text,
  fired boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (show_id, dept, num)
);
create index if not exists cues_org_id_idx on cues(org_id);
create index if not exists cues_show_id_idx on cues(show_id);

-- ---------------------------------------------------------------------------
-- ORG SETTINGS — venues, storage locations, instruments, and every editable
-- taxonomy (crew departments, cast types, staff areas, band sections,
-- inventory categories, cue departments). One row per org.
-- ---------------------------------------------------------------------------
create table if not exists org_settings (
  org_id uuid primary key references orgs(id) on delete cascade,
  venues jsonb not null default '[]',
  locations jsonb not null default '[]',
  instruments jsonb not null default '[]',
  -- Company logo for the top bar, as a small data URL (see 03-company-logo.sql).
  logo_url text,
  departments jsonb not null default '{}',
  department_order jsonb not null default '[]',
  cast_types jsonb not null default '{}',
  cast_type_order jsonb not null default '[]',
  staff_areas jsonb not null default '{}',
  staff_area_order jsonb not null default '[]',
  music_sections jsonb not null default '{}',
  music_section_order jsonb not null default '[]',
  inventory_categories jsonb not null default '{}',
  inventory_category_order jsonb not null default '[]',
  cue_depts jsonb not null default '{}',
  cue_dept_order jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['shows', 'people', 'calls', 'inventory_items', 'org_settings']
  loop
    execute format('drop trigger if exists set_updated_at on %I;', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table orgs enable row level security;
alter table org_members enable row level security;
alter table shows enable row level security;
alter table people enable row level security;
alter table calls enable row level security;
alter table inventory_items enable row level security;
alter table cues enable row level security;
alter table org_settings enable row level security;

-- orgs: members can see their own org; anyone signed in can create one
-- (that's how "sign up and start a new company" works).
create policy "members can read their org" on orgs
  for select using (is_org_member(id));
create policy "signed-in users can create an org" on orgs
  for insert with check (auth.uid() is not null);

-- org_members: members can see the roster of their own org; admins manage it.
create policy "members can read their org's membership" on org_members
  for select using (is_org_member(org_id));
create policy "users can add themselves when creating an org" on org_members
  for insert with check (user_id = auth.uid());
create policy "admins can add members" on org_members
  for insert with check (is_org_admin(org_id));
create policy "admins can remove members" on org_members
  for delete using (is_org_admin(org_id));

-- Every data table gets the same four policies: org members can read,
-- insert, update, and delete rows that belong to their org, full stop.
do $$
declare
  t text;
begin
  foreach t in array array['shows', 'people', 'calls', 'inventory_items', 'cues']
  loop
    execute format($p$
      create policy "org members can read %1$I" on %1$I
        for select using (is_org_member(org_id));
    $p$, t);
    execute format($p$
      create policy "org members can insert %1$I" on %1$I
        for insert with check (is_org_member(org_id));
    $p$, t);
    execute format($p$
      create policy "org members can update %1$I" on %1$I
        for update using (is_org_member(org_id));
    $p$, t);
    execute format($p$
      create policy "org members can delete %1$I" on %1$I
        for delete using (is_org_member(org_id));
    $p$, t);
  end loop;
end $$;

-- org_settings: same idea, keyed by org_id directly rather than a separate id.
create policy "org members can read org_settings" on org_settings
  for select using (is_org_member(org_id));
create policy "org members can insert org_settings" on org_settings
  for insert with check (is_org_member(org_id));
create policy "org members can update org_settings" on org_settings
  for update using (is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- REALTIME — Supabase turns this on by adding tables to a publication.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table shows, people, calls, inventory_items, cues, org_settings;

-- ---------------------------------------------------------------------------
-- STORAGE — uploaded scripts. Bucket is private; access is governed by RLS
-- on storage.objects, same org-membership check as everything else. Files
-- are stored at {org_id}/{show_id}/script.pdf, so the first path segment
-- IS the org_id and can be checked directly.
--
-- Note: Storage has its own separate RLS system from regular tables (this
-- policies storage.objects, not a table this schema created) — easy to
-- set up the table-level RLS correctly and still have uploads fail with a
-- permission error because this half was skipped.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('scripts', 'scripts', false)
on conflict (id) do nothing;

create policy "org members can read their scripts"
  on storage.objects for select
  using (bucket_id = 'scripts' and is_org_member((storage.foldername(name))[1]::uuid));

create policy "org members can upload their scripts"
  on storage.objects for insert
  with check (bucket_id = 'scripts' and is_org_member((storage.foldername(name))[1]::uuid));

create policy "org members can replace their scripts"
  on storage.objects for update
  using (bucket_id = 'scripts' and is_org_member((storage.foldername(name))[1]::uuid));

create policy "org members can delete their scripts"
  on storage.objects for delete
  using (bucket_id = 'scripts' and is_org_member((storage.foldername(name))[1]::uuid));

-- ---------------------------------------------------------------------------
-- GRANTS — Supabase's PostgREST API talks to your tables as the `anon` and
-- `authenticated` roles, not as the table owner. RLS only restricts
-- non-owner roles in the first place, so this isn't optional set-dressing:
-- without it, `authenticated` has no privileges on these tables at all and
-- every request 403s, regardless of what the RLS policies say. As of
-- May 30, 2026 Supabase also requires these to be explicit for new
-- projects rather than assumed.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on orgs, org_members, shows, people, calls, inventory_items, cues, org_settings to authenticated;

-- =============================================================================
-- create_org() — atomic company creation
-- =============================================================================
-- Why this exists:
--
-- Creating a company used to be two client-side writes:
--
--   supabase.from('orgs').insert({ name }).select().single()
--   supabase.from('org_members').insert({ org_id, user_id, role: 'admin' })
--
-- The first one always failed with:
--
--   new row violates row-level security policy for table "orgs"  (42501)
--
-- ...even though the INSERT policy (auth.uid() is not null) was correct and
-- auth.uid() resolved fine. The culprit is `.select()`: it sends
-- `Prefer: return=representation`, and when an INSERT has a RETURNING clause
-- Postgres also applies the table's SELECT policy to the new row. That policy
-- is `is_org_member(id)` — and at that instant you are not yet a member of the
-- org you are creating, because the org_members row is written next. Postgres
-- reports that as the same generic "new row violates row-level security
-- policy" message, which points at the INSERT policy and sends you hunting in
-- the wrong place.
--
-- Inserting without RETURNING succeeds, but then you have no id to insert the
-- membership with. Hence: do both writes in one SECURITY DEFINER function,
-- which runs as the owner and is not subject to those policies. It is also
-- genuinely more correct — an org and its first admin are one unit of work,
-- and a client-side pair can leave an orphaned, memberless org if the second
-- insert fails.
-- =============================================================================

create or replace function create_org(org_name text)
returns orgs
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org orgs;
begin
  -- SECURITY DEFINER bypasses RLS, so the auth check has to be explicit here.
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into orgs (name) values (org_name) returning * into new_org;

  insert into org_members (org_id, user_id, role)
    values (new_org.id, auth.uid(), 'admin');

  return new_org;
end $$;

-- Only signed-in users. `anon` must not be able to call this.
revoke execute on function create_org(text) from public;
grant execute on function create_org(text) to authenticated;


-- ---------------------------------------------------------------------------
-- MEMBERS — listing who actually belongs to a company. Emails live in
-- auth.users, which the anon/authenticated roles can't read, so a client-side
-- query can only ever see bare user_ids. This function joins the two and
-- returns rows only when the caller is themselves a member of the org being
-- asked about — security definer means the guard has to be explicit.
-- ---------------------------------------------------------------------------
create or replace function org_members_list(check_org_id uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from org_members m
  join auth.users u on u.id = m.user_id
  where m.org_id = check_org_id and is_org_member(check_org_id)
  order by m.created_at
$$;

revoke execute on function org_members_list(uuid) from public;
grant execute on function org_members_list(uuid) to authenticated;

-- Promoting and demoting. The insert and delete policies above let an admin
-- add and remove people; without this one they can't change anyone's role.
create policy "admins can update members" on org_members
  for update using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- ===========================================================================
-- PHASE 1 OF PER-MODULE PERMISSIONS (04-accounts-and-identity.sql)
-- Kept verbatim so a fresh project comes out matching a migrated one.
-- ===========================================================================

-- Phase 1 of per-module permissions: accounts and identity.
--
-- Nothing is restricted by this migration. It only builds the wiring that
-- later phases need: a link from a person on the company list to the account
-- they sign in with, and a three-way tier on membership.
--
-- Safe to run on a live project. Every statement is additive, existing
-- policies keep working, and the app behaves identically until Phase 4 turns
-- enforcement on.

-- ---------------------------------------------------------------------------
-- 1. People know who they are
-- ---------------------------------------------------------------------------
-- A person on the crew list and the account they sign in with have been two
-- unrelated things. Positions can't grant anything until they're one thing.

alter table public.people
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists people_user_id_idx on public.people(org_id, user_id);

-- One account per person per company. A single user can still appear as more
-- than one person only if the company genuinely lists them twice, which it
-- shouldn't.
create unique index if not exists people_user_unique_idx
  on public.people(org_id, user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Membership gets a tier
-- ---------------------------------------------------------------------------
--   admin — everything, plus the roster and Settings
--   staff — reads the whole company, writes what their positions allow
--   cast  — reads only what concerns them, writes nothing
--
-- `role` stays for now because every existing policy reads it. It becomes
-- derived from `tier` (admin => 'admin', otherwise 'member') and is dropped in
-- Phase 4 when the policies are rewritten.

alter table public.org_members
  add column if not exists tier text not null default 'staff'
  check (tier in ('admin', 'staff', 'cast'));

update public.org_members
  set tier = case when role = 'admin' then 'admin' else 'staff' end
  where tier is distinct from (case when role = 'admin' then 'admin' else 'staff' end);

-- Keep the two in step while both exist, so no code path can leave a member
-- with a tier that says one thing and a role that says another.
create or replace function public.sync_member_role()
returns trigger
language plpgsql
as $$
begin
  new.role := case when new.tier = 'admin' then 'admin' else 'member' end;
  return new;
end;
$$;

drop trigger if exists org_members_sync_role on public.org_members;
create trigger org_members_sync_role
  before insert or update of tier on public.org_members
  for each row execute function public.sync_member_role();

-- ---------------------------------------------------------------------------
-- 3. The roster query carries the tier
-- ---------------------------------------------------------------------------
-- Replaces the Phase 0 version. Same shape plus `tier` and the person this
-- account is linked to, so the members list can show "Sarah Chen — Props
-- Master" instead of an email and a shrug.

-- Postgres won't let `create or replace` widen a function's return type, and
-- this one gains four columns. Drop it first; it is recreated immediately
-- below, inside the same transaction, so no client ever sees it missing.
drop function if exists public.org_members_list(uuid);

create or replace function public.org_members_list(check_org_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  tier text,
  person_id text,
  person_name text,
  person_kind text,
  joined_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.user_id,
    u.email::text,
    m.role,
    m.tier,
    p.id,
    p.name,
    p.kind,
    m.created_at
  from org_members m
  join auth.users u on u.id = m.user_id
  left join people p on p.org_id = m.org_id and p.user_id = m.user_id
  where m.org_id = check_org_id
    and is_org_member(check_org_id)
  order by m.created_at;
$$;

-- ---------------------------------------------------------------------------
-- 4. Unclaimed people, for the linking dropdown
-- ---------------------------------------------------------------------------
-- An admin linking an account needs the list of people who aren't linked yet.
-- This is readable through the normal people policies already, but having it
-- as one call keeps the UI honest about what "unclaimed" means.

create or replace function public.org_unclaimed_people(check_org_id uuid)
returns table (id text, name text, kind text, email text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.name, p.kind, p.email
  from people p
  where p.org_id = check_org_id
    and p.user_id is null
    and is_org_member(check_org_id)
  order by p.kind, p.name;
$$;

-- ---------------------------------------------------------------------------
-- 5. Claims — the person says who they are, an admin agrees
-- ---------------------------------------------------------------------------
-- A cast of forty can't be linked by hand twice a season, and a link made on
-- an unverified claim is a permission granted to whoever typed the address.
-- So: the person proposes, an admin confirms, and nothing changes until they do.

create table if not exists public.person_claims (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  person_id  text not null references people(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);

create index if not exists person_claims_org_idx on public.person_claims(org_id, status);

-- One open claim per person per company. Re-claiming after a rejection is
-- allowed; claiming twice at once is not.
create unique index if not exists person_claims_open_idx
  on public.person_claims(org_id, user_id) where status = 'pending';

alter table public.person_claims enable row level security;

drop policy if exists "claim your own identity" on public.person_claims;
create policy "claim your own identity" on public.person_claims
  for insert with check (user_id = auth.uid() and is_org_member(org_id));

drop policy if exists "see your own claims, admins see all" on public.person_claims;
create policy "see your own claims, admins see all" on public.person_claims
  for select using (user_id = auth.uid() or is_org_admin(org_id));

drop policy if exists "withdraw your own claim" on public.person_claims;
create policy "withdraw your own claim" on public.person_claims
  for delete using (user_id = auth.uid() and status = 'pending');

-- Deciding is not a plain update: approving has to write people.user_id too,
-- and that is exactly the write the claimant must not be able to make.
-- So there is no update policy — only the function below.

-- Who might I be? Unclaimed people in this company whose email matches mine.
create or replace function public.my_claim_candidates(check_org_id uuid)
returns table (id text, name text, kind text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.name, p.kind
  from people p
  where p.org_id = check_org_id
    and p.user_id is null
    and is_org_member(check_org_id)
    and lower(p.email) = lower(auth.email())
  order by p.name;
$$;

-- Approve or reject. Admin only, and the link is written here or nowhere.
create or replace function public.decide_person_claim(claim_id uuid, approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.person_claims;
begin
  select * into c from person_claims where id = claim_id;
  if not found then
    raise exception 'No such claim';
  end if;
  if not is_org_admin(c.org_id) then
    raise exception 'Only an admin can decide a claim';
  end if;
  if c.status <> 'pending' then
    raise exception 'That claim has already been decided';
  end if;

  update person_claims
    set status = case when approve then 'approved' else 'rejected' end,
        decided_at = now(),
        decided_by = auth.uid()
    where id = claim_id;

  if approve then
    -- Last write wins on purpose: if two people claimed the same person, the
    -- unique index below stops the second approval rather than silently
    -- reassigning the first.
    update people set user_id = c.user_id
      where id = c.person_id and org_id = c.org_id;

    -- An actor or musician who claims themselves is cast; anyone else stays
    -- whatever tier they were given.
    update org_members m
      set tier = 'cast'
      where m.org_id = c.org_id
        and m.user_id = c.user_id
        and m.tier = 'staff'
        and exists (
          select 1 from people p
          where p.id = c.person_id and p.kind in ('actor', 'musician')
        );
  end if;
end;
$$;

-- Pending claims for the members list, with the names attached.
create or replace function public.org_pending_claims(check_org_id uuid)
returns table (id uuid, user_id uuid, email text, person_id text, person_name text, person_kind text, created_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.user_id, u.email::text, p.id, p.name, p.kind, c.created_at
  from person_claims c
  join auth.users u on u.id = c.user_id
  join people p on p.id = c.person_id
  where c.org_id = check_org_id
    and c.status = 'pending'
    and is_org_admin(check_org_id)
  order by c.created_at;
$$;

-- ===========================================================================
-- PHASE 2 OF PER-MODULE PERMISSIONS (05-show-items.sql)
-- ===========================================================================

-- Phase 2 of per-module permissions: the show's contents become rows.
--
-- Props, costumes, scenes, characters, the schedule, choreography, set pieces,
-- the audio plot and call groups have all been JSONB columns on a single
-- `shows` row. That has two consequences, and this migration ends both:
--
--   1. Row-level security decides whether you may write *a row*. It has no
--      opinion about which columns you touched. "Props only" is unsayable
--      while props is a column.
--   2. The client saves the whole row on every edit, so the props master and
--      the costume designer working at the same time overwrite each other
--      silently — no conflict, no warning, last debounce wins.
--
-- One row per prop, per costume, per scene. A discriminator column instead of
-- nine near-identical tables, following the pattern `people` already uses.
--
-- This migration COPIES. The old columns stay, still populated, until the new
-- client is deployed and verified — 06-drop-show-columns.sql removes them.
-- Nothing breaks if an old tab is still open while this runs.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table if not exists public.show_items (
  id         text primary key default gen_random_uuid()::text,
  org_id     uuid not null references orgs(id) on delete cascade,
  show_id    text not null references shows(id) on delete cascade,
  module     text not null check (module in (
               'schedule', 'scenes', 'characters', 'choreography',
               'costumes', 'props', 'set', 'audio', 'groups')),
  -- The item, in exactly the shape the app already works with. Splitting
  -- these into real columns would be a second migration's worth of churn for
  -- no gain: nothing queries inside them, and the modules own their shapes.
  data       jsonb not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists show_items_show_module_idx
  on public.show_items(org_id, show_id, module, sort_order);

drop trigger if exists show_items_updated_at on public.show_items;
create trigger show_items_updated_at
  before update on public.show_items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Policies — unchanged rules, new table
-- ---------------------------------------------------------------------------
-- Every org member can still do everything. Phase 4 replaces these four with
-- module-aware ones; until then this table behaves exactly like the columns
-- it replaces.
alter table public.show_items enable row level security;

drop policy if exists "org members can read show_items" on public.show_items;
create policy "org members can read show_items" on public.show_items
  for select using (is_org_member(org_id));

drop policy if exists "org members can insert show_items" on public.show_items;
create policy "org members can insert show_items" on public.show_items
  for insert with check (is_org_member(org_id));

drop policy if exists "org members can update show_items" on public.show_items;
create policy "org members can update show_items" on public.show_items
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));

drop policy if exists "org members can delete show_items" on public.show_items;
create policy "org members can delete show_items" on public.show_items
  for delete using (is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- 3. Copy what's there
-- ---------------------------------------------------------------------------
-- Each item keeps its own id. Scenes, characters, props and costumes all
-- reference each other by id — regenerating them here would quietly sever
-- every one of those links.
--
-- `on conflict do nothing` makes this safe to run twice.

insert into public.show_items (id, org_id, show_id, module, data, sort_order)
select
  coalesce(nullif(e.value->>'id', ''), gen_random_uuid()::text),
  s.org_id,
  s.id,
  m.module,
  e.value,
  (e.ord - 1)::int
from public.shows s
cross join lateral (values
  ('schedule',     s.schedule),
  ('scenes',       s.acts),
  ('characters',   s.characters),
  ('choreography', s.choreography),
  ('costumes',     s.costumes),
  ('props',        s.props),
  ('set',          s.set_pieces),
  ('audio',        s.sound_effects),
  ('groups',       s.groups)
) as m(module, arr)
cross join lateral jsonb_array_elements(coalesce(m.arr, '[]'::jsonb))
  with ordinality as e(value, ord)
where jsonb_typeof(coalesce(m.arr, '[]'::jsonb)) = 'array'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Realtime
-- ---------------------------------------------------------------------------
-- The client listens for other people's edits. Without this the new table is
-- silent and two people on the same show stop seeing each other's work.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'show_items'
  ) then
    alter publication supabase_realtime add table public.show_items;
  end if;
end;
$$;
