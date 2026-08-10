-- The department merge, pass one of three. REWRITES NOTHING.
--
-- Four lists described the same real-world departments and drifted apart:
-- crew rosters, staff areas, inventory categories, cue departments. This builds
-- the one list they collapse into. It does not touch a single reference, so it
-- is safe to run on a live company and safe to run twice.
--
-- The lucky part: your keys already coincide. `electrics`, `sound`, `scenic`,
-- `props`, `wardrobe` and `sm` are the same key in crew, cues and inventory, so
-- extending `departments` in place leaves every one of those references working
-- untouched. What was going to be a rewrite of four tables is now a rewrite of
-- two small things, in pass two.
--
-- Decisions baked in here, from the review:
--   * `people.kind` is the section — Crew, Staff, Musicians, Actors. The staff
--     area "Technical" was a second, worse copy of the Crew roster, so it does
--     not become a department.
--   * General hands is a department in its own right.
--   * Light Op, Sound Op and Stage Hand are positions that drifted into the
--     department list. Pass two demotes them; this pass leaves them alone so
--     nothing breaks in between.
--   * Cue colours already live on the cue departments and are carried across
--     verbatim, so nobody re-picks them.

update org_settings set departments = departments
  || jsonb_build_object(
    -- Calls cues and keeps stock
    'electrics',   jsonb_build_object('label','Electrics',        'cue','LX',    'color','#E8A33D','stock',true),
    'sound',       jsonb_build_object('label','Sound',            'cue','SND',   'color','#4A9FD8','stock',true),
    'scenic',      jsonb_build_object('label','Scenic',           'cue','SCENE', 'color','#C77DBF','stock',true),
    -- New: was an inventory category and a cue department, never a crew roster,
    -- so until now you could not put a crew member in Rigging at all.
    'rigging',     jsonb_build_object('label','Rigging',          'cue','FLY',   'color','#6FCF97','stock',true),
    -- Calls cues, keeps nothing
    'sm',          jsonb_build_object('label','Stage management', 'cue','SM',    'color','#E4695E','stock',false),
    -- Keeps stock, calls nothing
    'props',       jsonb_build_object('label','Props',                           'color','#8B8FE8','stock',true),
    'wardrobe',    jsonb_build_object('label','Wardrobe',                        'color','#5FBDB0','stock',true),
    'consumables', jsonb_build_object('label','Consumables',                     'color','#D9A05B','stock',true),
    -- Neither: people-only departments
    'general',     jsonb_build_object('label','General hands',                   'color','#9AA5B1','stock',false),
    'directing',   jsonb_build_object('label','Directing',                       'color','#E8A33D','stock',false),
    'back_office', jsonb_build_object('label','Back office',                     'color','#4A9FD8','stock',false),
    'band',        jsonb_build_object('label','Band',                            'color','#C77DBF','stock',false)
  );

-- ---------------------------------------------------------------------------
-- The report. This is the point of running pass one on its own: see what pass
-- two would have to move, before anything moves.
-- ---------------------------------------------------------------------------
select
  (select count(*) from org_settings os, jsonb_object_keys(os.departments) k)      as departments_now,

  -- Crew filed under a position rather than a department. Pass two gives each of
  -- them a department and turns the old value into their position.
  (select count(*) from people p, jsonb_array_elements(coalesce(p.assignments,'[]')) a
     where a->>'dept' in ('light_op','sound_op','stage_hand'))                     as crew_to_remap,

  -- Staff filed under an area that is not becoming a department.
  (select count(*) from people p, jsonb_array_elements(coalesce(p.assignments,'[]')) a
     where p.kind = 'staff' and a->>'category' in ('technical','other'))           as staff_to_remap,

  -- These need nothing, because the keys already match.
  (select count(*) from cues)                                                      as cues_unchanged,
  (select count(*) from inventory_items)                                           as stock_unchanged,
  (select count(*) from people p, jsonb_array_elements(coalesce(p.assignments,'[]')) a
     where a->>'dept' in ('electrics','sound','scenic','props','wardrobe','sm','general')) as crew_unchanged;
