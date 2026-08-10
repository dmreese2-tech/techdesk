-- NOT RUN. Prepared alongside pass one of the client refactor (Item 1).
--
-- READ THIS BEFORE RUNNING PASS THREE.
--
-- Pass three drops `org_settings.inventory_categories`. One thing still reads
-- that column, and it is not in the client:
--
--   public.my_writable_inventory(check_org_id uuid)
--
-- It lists the stock categories the signed-in person may write by walking
-- jsonb_object_keys(org_settings.inventory_categories) and asking
-- can_write_inventory() about each one. Drop the column underneath it and the
-- function fails — and it is the function the Inventory module asks before
-- deciding what is editable, so the failure lands squarely in "who can edit
-- what".
--
-- This repoints it at the merged departments: the stock categories are now the
-- departments with 'stock' true. Same keys, same grants, same answers — the
-- keys were deliberately kept identical through pass one.
--
-- RUN THIS BEFORE 20-departments-pass3.sql, not after. Verify it independently
-- (PostgREST, or the SQL editor with the tab focused) before dropping anything.

create or replace function public.my_writable_inventory(check_org_id uuid)
returns table (category text)
language sql
security definer
stable
set search_path = public
as $$
  select c.category
  from org_settings os
  cross join lateral jsonb_object_keys(
    coalesce(
      (select jsonb_object_agg(k, v)
         from jsonb_each(coalesce(os.departments, '{}'::jsonb)) as d(k, v)
        where coalesce((v->>'stock')::boolean, false)),
      '{}'::jsonb
    )
  ) as c(category)
  where os.org_id = check_org_id
    and can_write_inventory(check_org_id, c.category);
$$;

-- Check: this should return the same rows as the old function did, for the same
-- signed-in user. Expect the stock departments they hold a grant on.
select * from public.my_writable_inventory('<your org id>'::uuid);

-- And the taxonomy side, to eyeball what the function is now walking.
select k as stock_department, v->>'label' as label
from org_settings os, jsonb_each(os.departments) as d(k, v)
where coalesce((v->>'stock')::boolean, false)
order by 1;
