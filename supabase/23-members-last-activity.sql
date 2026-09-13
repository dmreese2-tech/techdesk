-- Last activity on the People table, alongside last login.
--
-- 20-members-last-login.sql surfaced auth.users.last_sign_in_at, which
-- answers "did this account ever get signed into" — useful for chasing a
-- dead invite. It does NOT answer "is this person actually using the app
-- today": Supabase only stamps last_sign_in_at when a new session is
-- created, and a browser tab left open all day keeps renewing its existing
-- session from the refresh token without ever creating a new one. Someone
-- who signed in once on 9/1 and has had the app open ever since still shows
-- "9/1/26" under the old column, which is exactly the complaint this fixes.
--
-- This adds a second, genuinely live signal: last_active_at, a plain column
-- on org_members that the client bumps to now() itself, on a heartbeat,
-- while the app is actually open. It sits next to last_sign_in_at rather
-- than replacing it — "last signed in" and "last active" are different
-- questions and an admin may want either.
--
-- Safe to run twice: the column add is guarded, and the function
-- drop/recreate is the same idempotent pattern as 20-members-last-login.sql.

-- ---------------------------------------------------------------------------
-- 1. The column the heartbeat writes to.
-- ---------------------------------------------------------------------------
alter table public.org_members
  add column if not exists last_active_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. The heartbeat itself. Security definer isn't for elevated privilege
-- here — it is so this can't be asked to touch anyone else's row: the
-- function ignores whatever it's passed for identity and always writes
-- auth.uid()'s own row, in the org it's actually a member of.
-- ---------------------------------------------------------------------------
create or replace function public.touch_member_activity(check_org_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.org_members
  set last_active_at = now()
  where org_id = check_org_id
    and user_id = auth.uid();
$$;

revoke execute on function public.touch_member_activity(uuid) from public;
grant execute on function public.touch_member_activity(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. org_members_list gains the column so the People table can read it.
-- `create or replace` can't widen a return type (42P13), so drop first —
-- both statements run in the same transaction, so no signed-in client ever
-- sees the function missing.
-- ---------------------------------------------------------------------------
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
  last_sign_in_at timestamptz,
  -- Null until the client's first heartbeat lands — e.g. right after this
  -- migration runs, before anyone's app has reloaded to pick it up.
  last_active_at timestamptz
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
    u.last_sign_in_at,
    m.last_active_at
  from org_members m
  join auth.users u on u.id = m.user_id
  left join people p on p.org_id = m.org_id and p.user_id = m.user_id
  where m.org_id = check_org_id
    and is_org_member(check_org_id)
  order by m.created_at;
$$;

revoke execute on function public.org_members_list(uuid) from public;
grant execute on function public.org_members_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
-- Picks the first org itself rather than asking you to paste an id in —
-- Supabase's SQL editor runs a pasted script as one transaction, so a typo'd
-- placeholder here used to roll back everything above it too, silently.
--
-- Right after this runs, last_active_at is null for everyone — that's
-- expected, nobody's client has called the heartbeat yet. Have someone with
-- the app open reload, wait a few seconds, and re-run just this select:
-- their row should show a fresh last_active_at.
select
  m.email,
  m.person_name,
  m.tier,
  m.last_sign_in_at,
  m.last_active_at
from orgs o
cross join lateral public.org_members_list(o.id) m
order by o.id, m.last_active_at desc nulls last;
