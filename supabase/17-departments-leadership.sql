-- The last four staff, and the department they actually belong to.
--
-- Pass two placed ten of fourteen and refused four: three Producers and one
-- Technical Director. That refusal was correct, and it surfaced something the
-- merge had not accounted for.
--
-- Every other department is a working group — Electrics does the light, Wardrobe
-- does the clothes, and its members' permissions stop at its edge. Producer and
-- Technical Director are already *company-wide* in the permissions model: they
-- read and write across all of it. They are not a group inside the structure,
-- they are the layer over it.
--
-- Options were: leave them with no department (a blank in every roster view and
-- a null to special-case in the client), or name the layer. Naming it is
-- cheaper and it documents itself in the UI.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. The department
-- ---------------------------------------------------------------------------
-- Calls no cues and keeps no stock. It exists to group people, and to give the
-- Departments editor somewhere honest to show the company-wide positions.
update org_settings
   set departments = departments
     || jsonb_build_object(
       'leadership', jsonb_build_object(
         'label', 'Production office',
         'color', '#D97C6A',
         'stock', false
       )
     );

-- ---------------------------------------------------------------------------
-- 2. Place the four
-- ---------------------------------------------------------------------------
-- Narrow on purpose: only the titles pass two reported, only where they are
-- still sitting on a category that is going away. It will not touch anyone who
-- has since been placed by hand.
with rebuilt as (
  select
    p.id,
    jsonb_agg(
      case
        when a->>'category' in ('technical', 'other')
             and lower(a->>'roleTitle') ~ 'produc|technical director|^td$|general manager'
        then jsonb_set(a, '{category}', '"leadership"'::jsonb)
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
-- Check — nobody left on a department that is about to disappear.
-- ---------------------------------------------------------------------------
select
  (select count(*) from org_settings os, jsonb_object_keys(os.departments) k)  as departments_now,
  (select count(*) from people p, jsonb_array_elements(coalesce(p.assignments,'[]')) a
     where p.kind = 'staff' and a->>'category' in ('technical','other'))       as still_unplaced;

select a->>'category' as department, count(*) as staff
  from people p, jsonb_array_elements(coalesce(p.assignments,'[]')) a
 where p.kind = 'staff'
 group by 1
 order by 2 desc, 1;
