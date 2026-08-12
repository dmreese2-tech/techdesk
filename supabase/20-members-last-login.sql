-- Last login on the People table.
--
-- The Settings → People table can already say who someone is, what position
-- they hold and how far their access reaches. What it could not say is whether
-- they have ever actually signed in — which is the question you ask when
-- somebody says "I never got into the app", and the one that tells an admin
-- whether an invite landed or is still sitting unopened in a spam folder.
--
-- The answer lives in `auth.users.last_sign_in_at`, which the client cannot
-- read: the anon key has no access to the auth schema, and it should not. This
-- function already runs `security definer` and already joins auth.users for the
-- email, so it is the right and only place to surface it.
--
-- Safe to run twice. Adds no column to any table, changes no data, and reads
-- one more field from a join that was already there.

-- ---------------------------------------------------------------------------
-- Drop, then recreate
-- ---------------------------------------------------------------------------
-- `create or replace function` cannot widen a return type — Postgres raises
-- 42P13. This one gains a column, so it has to be dropped first. Both
-- statements are in the same file and, run together, the same transaction, so
-- no signed-in client ever sees the function missing.
--
-- Nothing else in the schema depends on this function; it is called only by
-- MembersPanel via supabase.rpc.

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
  joined_at timestamptz,
  -- Null for an account that has been created but never signed in. The client
  -- renders that as "Never", which is the useful reading: an invite accepted
  -- and then abandoned looks exactly like one that was never opened, and both
  -- want chasing.
  last_sign_in_at timestamptz
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
    m.created_at,
    u.last_sign_in_at
  from org_members m
  join auth.users u on u.id = m.user_id
  left join people p on p.org_id = m.org_id and p.user_id = m.user_id
  where m.org_id = check_org_id
    and is_org_member(check_org_id)
  order by m.created_at;
$$;

-- The drop took the grants with it. Without these the call fails for every
-- signed-in user with "permission denied for function org_members_list", and
-- the People table goes empty rather than erroring in a way anyone can read.
revoke execute on function public.org_members_list(uuid) from public;
grant execute on function public.org_members_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
-- Expect one row per member, with last_sign_in_at populated for anyone who has
-- signed in and null for anyone who has not. If every row is null, the accounts
-- genuinely have not been used — this reads auth.users directly, so there is no
-- caching or replication lag to blame.
select
  email,
  person_name,
  tier,
  joined_at::date   as joined,
  last_sign_in_at   as last_login
from public.org_members_list('<your org id>'::uuid)
order by last_sign_in_at desc nulls last;
