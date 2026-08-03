-- Phase 6, part one: cast stop seeing everyone's phone number.
--
-- `people` carries a phone and an email for every person in the company, and
-- until now every member could read the whole table. A cast of forty with an
-- account each is forty people holding the crew's mobile numbers. That is a
-- privacy problem rather than a tidiness one, and it arrived the moment cast
-- got accounts in Phase 1.
--
-- Row-level security gates rows, not columns, so this cannot be a policy. It
-- is a view: same rows, same policies, two columns that go null for anyone
-- who has no business reading them.
--
-- Deliberately narrow. The rest of Phase 6 — cast seeing only the scenes their
-- own characters appear in — is a per-row subquery on the busiest table in the
-- app and wants an index and a query plan before it goes anywhere near a
-- production. This half is independent of that half, and useful on its own.

-- What tier am I in this company? Security definer because org_members is not
-- readable in the middle of an arbitrary query otherwise.
create or replace function public.my_tier(check_org_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select tier from org_members
  where org_id = check_org_id and user_id = auth.uid();
$$;

-- security_invoker keeps the base table's policies in force, so this view
-- widens nothing: it can only ever show you rows you could already read, with
-- less in them. Without that flag the view would run as its owner and hand
-- every row to everyone — the exact opposite of the point.
drop view if exists public.people_view;
create view public.people_view
with (security_invoker = on)
as
select
  p.id,
  p.org_id,
  p.kind,
  p.name,
  p.user_id,
  p.assignments,
  p.created_at,
  p.updated_at,
  -- Your own details are always yours to see.
  case when public.my_tier(p.org_id) in ('admin', 'staff') or p.user_id = auth.uid()
       then p.phone end as phone,
  case when public.my_tier(p.org_id) in ('admin', 'staff') or p.user_id = auth.uid()
       then p.email end as email
from public.people p;

grant select on public.people_view to authenticated;

-- Writes still go to the table. The view is for reading, and making it
-- writable would only invite someone to write through it by accident.

-- ---------------------------------------------------------------------------
-- Check — should be true, and the two columns should be present.
-- ---------------------------------------------------------------------------
select
  (select count(*) from information_schema.views
    where table_schema = 'public' and table_name = 'people_view') as view_exists,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'people_view'
      and column_name in ('phone', 'email')) as contact_columns;
