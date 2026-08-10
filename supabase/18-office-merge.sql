-- Fold `office` into `back_office`, and ask the question pass two should have.
--
-- Pass two's report looked clean and wasn't. It counted staff sitting on
-- `technical` and `other` — the two keys I knew were going away — and moved
-- them. But staff areas were *four*: directing, office, other, technical.
--
-- `directing` survived by luck: the old staff-area key and the new department key
-- are the same string, exactly as the crew keys were. `office` had no such luck.
-- It was never remapped and never added to `departments`, so three people now
-- point at a department that does not exist, while `back_office` — the same
-- department under the name pass one chose — holds one person.
--
-- The real lesson is in the check at the bottom. Pass two asked "who is on a key
-- I am removing?" The question that finds this class of bug is "who is on a key
-- that is not a department?" — it needs no list of doomed keys, so it cannot be
-- incomplete the way mine was.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. Merge the twin
-- ---------------------------------------------------------------------------
-- back_office is the surviving name: it is what pass one built, what the cue and
-- colour data hangs off, and what the Departments editor will show.
with rebuilt as (
  select
    p.id,
    jsonb_agg(
      case
        when a->>'category' = 'office'
        then jsonb_set(a, '{category}', '"back_office"'::jsonb)
        else a
      end
      order by ord
    ) as assignments
  from people p,
       jsonb_array_elements(coalesce(p.assignments, '[]'::jsonb)) with ordinality as t(a, ord)
  where p.kind = 'staff'
  group by p.id
)
update people
   set assignments = rebuilt.assignments
  from rebuilt
 where people.id = rebuilt.id
   and people.assignments is distinct from rebuilt.assignments;

-- ---------------------------------------------------------------------------
-- 2. The check that generalises
-- ---------------------------------------------------------------------------
-- Every department a person is filed under, staff and crew, that is not a key in
-- org_settings.departments. This is the invariant the merge is trying to reach,
-- stated once. Run it after any future change to departments and it will find
-- orphans without being told what to look for.
--
-- Expect zero rows. Anything here is somebody whose department vanished
-- underneath them.
select
  p.kind,
  coalesce(a->>'category', a->>'dept') as orphaned_department,
  count(*)                             as people,
  string_agg(p.name, ', ' order by p.name) as who
from people p,
     jsonb_array_elements(coalesce(p.assignments, '[]'::jsonb)) a
where coalesce(a->>'category', a->>'dept') is not null
  and not exists (
    select 1 from org_settings os
     where os.departments ? coalesce(a->>'category', a->>'dept')
  )
group by 1, 2
order by 3 desc;

-- And the shape of the thing now.
select
  coalesce(a->>'category', a->>'dept') as department,
  p.kind,
  count(*) as people
from people p, jsonb_array_elements(coalesce(p.assignments,'[]')) a
where coalesce(a->>'category', a->>'dept') is not null
group by 1, 2
order by 3 desc, 1;
