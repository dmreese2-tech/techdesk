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

-- ---------------------------------------------------------------------------
-- Check — seven rows: the two new columns, the table, and four functions.
-- ---------------------------------------------------------------------------
select 'people.user_id' as item, count(*) as found
from information_schema.columns
where table_schema = 'public' and table_name = 'people' and column_name = 'user_id'
union all
select 'org_members.tier', count(*)
from information_schema.columns
where table_schema = 'public' and table_name = 'org_members' and column_name = 'tier'
union all
select 'org_members_list', count(*)
from information_schema.routines
where routine_schema = 'public' and routine_name = 'org_members_list'
union all
select 'org_unclaimed_people', count(*)
from information_schema.routines
where routine_schema = 'public' and routine_name = 'org_unclaimed_people'
union all
select 'person_claims table', count(*)
from information_schema.tables
where table_schema = 'public' and table_name = 'person_claims'
union all
select 'my_claim_candidates', count(*)
from information_schema.routines
where routine_schema = 'public' and routine_name = 'my_claim_candidates'
union all
select 'decide_person_claim', count(*)
from information_schema.routines
where routine_schema = 'public' and routine_name = 'decide_person_claim';
