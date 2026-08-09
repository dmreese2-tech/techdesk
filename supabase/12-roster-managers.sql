-- Directors and producers manage people, without becoming admins.
--
-- Linking an account to a roster entry and setting somebody's position is the
-- daily work of running a production, and it has been admin-only — which meant
-- the director had to find an admin to do it. But an admin can also mint other
-- admins, and "let the director cast people" should not quietly mean "let the
-- director hand out the keys to the company".
--
-- So this is a third thing, narrower than admin: whoever holds a position that
-- grants the `staff` module may manage the roster and the links. They still
-- cannot change anyone's tier, and cannot make anyone an admin.

-- ---------------------------------------------------------------------------
-- 1. Who manages the roster
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_roster(check_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_org_admin(check_org_id)
      or exists (
        select 1 from shows s
        where s.org_id = check_org_id
          and can_write(check_org_id, s.id, 'staff')
      );
$$;

-- ---------------------------------------------------------------------------
-- 2. Linking an account to a roster entry
-- ---------------------------------------------------------------------------
-- people already answers to can_write_people for its own columns. The link is
-- the same table, so the existing policies cover it — nothing to add here, and
-- a director who can write staff can already set people.user_id.
--
-- What they could not do is read the member list to pick from. That was
-- admin-gated inside the function rather than by policy.

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
  select m.user_id, u.email::text, m.role, m.tier, p.id, p.name, p.kind, m.created_at
  from org_members m
  join auth.users u on u.id = m.user_id
  left join people p on p.org_id = m.org_id and p.user_id = m.user_id
  where m.org_id = check_org_id
    and is_org_member(check_org_id)
  order by m.created_at;
$$;

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
    and can_manage_roster(check_org_id)
  order by p.kind, p.name;
$$;

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
    and can_manage_roster(check_org_id)
  order by c.created_at;
$$;

-- Confirming a claim is roster work too.
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
  if not can_manage_roster(c.org_id) then
    raise exception 'You do not manage the roster for this company';
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
    update people set user_id = c.user_id
      where id = c.person_id and org_id = c.org_id;

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

-- ---------------------------------------------------------------------------
-- 3. The line they cannot cross
-- ---------------------------------------------------------------------------
-- Tier changes stay with admins. A roster manager who could set tier could set
-- their own to admin, and the distinction this migration exists to draw would
-- last exactly one click.
--
-- The trigger is belt and braces over the policy: `admins can update members`
-- already restricts the table, but a future policy written in a hurry would
-- have to get past this too.

create or replace function public.protect_tier_changes()
returns trigger
language plpgsql
as $$
begin
  if new.tier is distinct from old.tier and not is_org_admin(old.org_id) then
    raise exception 'Only an admin can change what tier somebody is in';
  end if;
  return new;
end;
$$;

drop trigger if exists org_members_protect_tier on public.org_members;
create trigger org_members_protect_tier
  before update on public.org_members
  for each row execute function public.protect_tier_changes();

-- ---------------------------------------------------------------------------
-- Check — the new function exists and the guard is attached.
-- ---------------------------------------------------------------------------
select
  (select count(*) from information_schema.routines
    where routine_schema = 'public' and routine_name = 'can_manage_roster') as can_manage_roster,
  (select count(*) from pg_trigger where tgname = 'org_members_protect_tier') as tier_guard;
