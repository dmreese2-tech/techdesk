-- Close the join hole: an invite code you can rotate, instead of a UUID you can't.
--
-- Until now the org_members insert policy was `with check (user_id = auth.uid())`.
-- It checked that you were adding *yourself* and nothing else — never whether
-- you had been invited. Any signed-in Tech Desk user who learned a company's
-- UUID could add themselves to it, and `tier` defaults to 'staff', which under
-- Phase 6 reads the whole company: every schedule, script and phone number.
--
-- That UUID was printed in Settings with a Copy button and the instruction to
-- share it. It cannot be rotated. It is in clipboard histories, text messages
-- and screenshots.
--
-- After this: joining goes through a function that requires a code, the code
-- can be changed, and what a joiner lands as is the company's choice rather
-- than a default nobody picked.

-- ---------------------------------------------------------------------------
-- 1. The code
-- ---------------------------------------------------------------------------
alter table public.orgs
  add column if not exists invite_code text,
  -- What somebody becomes when they use the code. Cast is the default on
  -- purpose: it is the tier where a leaked code costs the least, and moving
  -- someone up is one click for an admin who was expecting them.
  add column if not exists invite_tier text not null default 'cast'
    check (invite_tier in ('staff', 'cast'));

create unique index if not exists orgs_invite_code_idx on public.orgs(invite_code)
  where invite_code is not null;

-- Readable over a phone, no ambiguous characters: no O/0, no I/1/l.
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..4 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  out := out || '-';
  for i in 1..4 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out;
end;
$$;

-- Every existing company gets one now, so nobody is locked out of inviting
-- while the old path is being closed.
update public.orgs set invite_code = public.generate_invite_code()
  where invite_code is null;

-- ---------------------------------------------------------------------------
-- 2. Rotating it
-- ---------------------------------------------------------------------------
-- orgs had no update policy at all, so nobody could change anything about
-- their own company. Admins can now — which is what makes the code rotatable
-- rather than decorative.
drop policy if exists "admins can update their org" on public.orgs;
create policy "admins can update their org" on public.orgs
  for update using (is_org_admin(id)) with check (is_org_admin(id));

create or replace function public.rotate_invite_code(check_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  fresh text;
begin
  if not is_org_admin(check_org_id) then
    raise exception 'Only an admin can change the invite code';
  end if;
  fresh := generate_invite_code();
  update orgs set invite_code = fresh where id = check_org_id;
  return fresh;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Joining
-- ---------------------------------------------------------------------------
-- Security definer because a stranger cannot read `orgs` to find the company
-- they are about to join — that is the whole point. The function is the only
-- door, and it needs a code to open.

create or replace function public.join_org_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.orgs;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  select * into target from orgs
    where upper(replace(invite_code, ' ', '')) = upper(replace(trim(code), ' ', ''));

  if not found then
    -- Deliberately vague. A message that distinguished "no such company" from
    -- "wrong code" would turn this into an oracle for guessing codes.
    raise exception 'That invite code does not match a company';
  end if;

  if exists (select 1 from org_members where org_id = target.id and user_id = auth.uid()) then
    return target.id;  -- already in; joining twice is not an error worth showing
  end if;

  insert into org_members (org_id, user_id, tier)
    values (target.id, auth.uid(), target.invite_tier);

  return target.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Shut the old door
-- ---------------------------------------------------------------------------
-- create_org() inserts the founding admin inside a security definer function,
-- so it never needed this policy. Nothing else does either, now that joining
-- goes through join_org_by_code.
drop policy if exists "users can add themselves when creating an org" on public.org_members;

-- ---------------------------------------------------------------------------
-- Check — a code per company, and the self-insert policy gone.
-- ---------------------------------------------------------------------------
select
  (select count(*) from orgs where invite_code is not null) as orgs_with_code,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'org_members'
       and policyname = 'users can add themselves when creating an org') as old_hole_still_open;
