-- The department merge, pass two. Moves the only things that need moving.
--
-- Pass one's report said the merge is landing before the data does: no cues, no
-- inventory, no crew assignments, and nobody filed under the three drifted
-- department entries. The only real work is fourteen staff assignments sitting
-- under `technical` or `other`, neither of which survives as a department.
--
-- Safe to run twice. Every statement is conditional on the old values still
-- being there, so a second run finds nothing to do.

-- ---------------------------------------------------------------------------
-- 1. Delete the three that were never departments
-- ---------------------------------------------------------------------------
-- Light Op, Sound Op and Stage Hand are positions. They ended up in the
-- department list because Crew only ever exposed that one field. Pass one's
-- report confirmed nobody is filed under them, so they can go rather than being
-- demoted and migrated — there is nothing to migrate.
update org_settings
   set departments = departments - 'light_op' - 'sound_op' - 'stage_hand';

-- ---------------------------------------------------------------------------
-- 2. A department for a job title
-- ---------------------------------------------------------------------------
-- Deriving it beats asking someone to type fourteen departments by hand, and
-- the job title already implies the department in every case that matters.
--
-- Deliberately returns null rather than guessing. A Producer forced into Back
-- office, or a Technical Director into Electrics, is a wrong answer that looks
-- like a right one — and wrong answers here decide who can edit what once
-- positions start granting permissions. Unmatched people keep their current
-- value and get listed at the bottom for you to place.
create or replace function public.dept_for_title(title text)
returns text
language sql
immutable
as $$
  select case
    when title is null then null

    -- Titles that must NOT be caught by the broad "director" rule below.
    -- A Technical Director runs the build; putting them in Directing would be a
    -- word match, not a fact. Left unmatched on purpose so it gets reported.
    when lower(title) ~ 'technical director|^td$'                  then null
    when lower(title) ~ 'produc'                                   then null

    -- Specific domains, before anything broad.
    when lower(title) ~ 'light|lx|projection'                      then 'electrics'
    when lower(title) ~ 'sound|audio'                              then 'sound'
    when lower(title) ~ 'compos|music|band|orchestr|conduct'       then 'band'
    when lower(title) ~ 'scenic|paint|carpent|set build|set design' then 'scenic'
    when lower(title) ~ 'prop'                                     then 'props'
    when lower(title) ~ 'costum|wardrobe|hair|makeup|make-up|dress' then 'wardrobe'
    when lower(title) ~ 'stage manager|^asm$|^sm$|deck'            then 'sm'
    when lower(title) ~ 'rigg|^fly'                                then 'rigging'

    -- Back office BEFORE directing: 'Social Media Director' is not a director.
    when lower(title) ~ 'box office|social media|marketing|photograph|publicity|front of house|house manager|program|graphic' then 'back_office'

    -- The broad one, last, now that everything it would wrongly swallow is gone.
    when lower(title) ~ 'director|choreograph|intimacy|fight|dramaturg|assistant to' then 'directing'

    else null
  end;
$$;

-- The ordering above is load-bearing, and it bit me twice writing it. Every rule
-- containing the word "director" as a *modifier* — Technical, Social Media,
-- Projections, Music — has to be settled before the rule that matches "director"
-- as a *job*, or the broad rule swallows them. If you add titles later, add them
-- above that last case, not below it.

-- ---------------------------------------------------------------------------
-- 3. Move the staff
-- ---------------------------------------------------------------------------
with rebuilt as (
  select
    p.id,
    jsonb_agg(
      case
        when a->>'category' in ('technical', 'other')
             and public.dept_for_title(a->>'roleTitle') is not null
        then jsonb_set(a, '{category}', to_jsonb(public.dept_for_title(a->>'roleTitle')))
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
-- 4. What moved, and who still needs placing
-- ---------------------------------------------------------------------------
select
  (select count(*) from org_settings os, jsonb_object_keys(os.departments) k)  as departments_now,
  (select count(*) from people p, jsonb_array_elements(coalesce(p.assignments,'[]')) a
     where p.kind = 'staff' and a->>'category' in ('technical','other'))       as staff_still_unplaced,
  (select count(*) from people p, jsonb_array_elements(coalesce(p.assignments,'[]')) a
     where p.kind = 'staff' and a->>'category' not in ('technical','other'))   as staff_now_in_departments;

-- Everyone the derivation would not guess at. Place these by hand in Staff —
-- the list is short and being asked beats being told wrongly.
select p.name, a->>'roleTitle' as position, a->>'category' as still_under
  from people p, jsonb_array_elements(coalesce(p.assignments,'[]')) a
 where p.kind = 'staff'
   and a->>'category' in ('technical','other')
 order by p.name;
