-- Phase 2, part two: remove the columns that show_items replaced.
--
-- Run this ONLY after the client that reads and writes show_items is deployed
-- and verified. Until then the columns are the fallback for any show that
-- hasn't been migrated, and dropping them early turns an old open tab into a
-- stream of failed saves.
--
-- By this point the columns are dead weight: the app stopped writing them when
-- Phase 2 shipped, so they hold a snapshot that gets staler by the edit. Left
-- in place they are worse than useless — they are a plausible-looking copy of
-- the truth, and the next person to read this schema will believe them.

-- One last look before they go. Anything non-zero here is data that exists in
-- the columns; check it also exists in show_items before continuing.
select
  count(*) filter (where jsonb_array_length(coalesce(schedule, '[]')) > 0)     as schedule,
  count(*) filter (where jsonb_array_length(coalesce(acts, '[]')) > 0)         as acts,
  count(*) filter (where jsonb_array_length(coalesce(characters, '[]')) > 0)   as characters,
  count(*) filter (where jsonb_array_length(coalesce(choreography, '[]')) > 0) as choreography,
  count(*) filter (where jsonb_array_length(coalesce(costumes, '[]')) > 0)     as costumes,
  count(*) filter (where jsonb_array_length(coalesce(props, '[]')) > 0)        as props,
  count(*) filter (where jsonb_array_length(coalesce(set_pieces, '[]')) > 0)   as set_pieces,
  count(*) filter (where jsonb_array_length(coalesce(sound_effects, '[]')) > 0) as sound_effects,
  count(*) filter (where jsonb_array_length(coalesce(groups, '[]')) > 0)       as groups
from public.shows;

alter table public.shows
  drop column if exists schedule,
  drop column if exists acts,
  drop column if exists characters,
  drop column if exists choreography,
  drop column if exists costumes,
  drop column if exists props,
  drop column if exists set_pieces,
  drop column if exists sound_effects,
  drop column if exists groups;

-- Check — should return no rows.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'shows'
  and column_name in ('schedule','acts','characters','choreography','costumes','props','set_pieces','sound_effects','groups');
