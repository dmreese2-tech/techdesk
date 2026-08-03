-- Phase 2 of per-module permissions: the show's contents become rows.
--
-- Props, costumes, scenes, characters, the schedule, choreography, set pieces,
-- the audio plot and call groups have all been JSONB columns on a single
-- `shows` row. That has two consequences, and this migration ends both:
--
--   1. Row-level security decides whether you may write *a row*. It has no
--      opinion about which columns you touched. "Props only" is unsayable
--      while props is a column.
--   2. The client saves the whole row on every edit, so the props master and
--      the costume designer working at the same time overwrite each other
--      silently — no conflict, no warning, last debounce wins.
--
-- One row per prop, per costume, per scene. A discriminator column instead of
-- nine near-identical tables, following the pattern `people` already uses.
--
-- This migration COPIES. The old columns stay, still populated, until the new
-- client is deployed and verified — 06-drop-show-columns.sql removes them.
-- Nothing breaks if an old tab is still open while this runs.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table if not exists public.show_items (
  id         text primary key default gen_random_uuid()::text,
  org_id     uuid not null references orgs(id) on delete cascade,
  show_id    text not null references shows(id) on delete cascade,
  module     text not null check (module in (
               'schedule', 'scenes', 'characters', 'choreography',
               'costumes', 'props', 'set', 'audio', 'groups')),
  -- The item, in exactly the shape the app already works with. Splitting
  -- these into real columns would be a second migration's worth of churn for
  -- no gain: nothing queries inside them, and the modules own their shapes.
  data       jsonb not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists show_items_show_module_idx
  on public.show_items(org_id, show_id, module, sort_order);

drop trigger if exists show_items_updated_at on public.show_items;
create trigger show_items_updated_at
  before update on public.show_items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Policies — unchanged rules, new table
-- ---------------------------------------------------------------------------
-- Every org member can still do everything. Phase 4 replaces these four with
-- module-aware ones; until then this table behaves exactly like the columns
-- it replaces.
alter table public.show_items enable row level security;

drop policy if exists "org members can read show_items" on public.show_items;
create policy "org members can read show_items" on public.show_items
  for select using (is_org_member(org_id));

drop policy if exists "org members can insert show_items" on public.show_items;
create policy "org members can insert show_items" on public.show_items
  for insert with check (is_org_member(org_id));

drop policy if exists "org members can update show_items" on public.show_items;
create policy "org members can update show_items" on public.show_items
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));

drop policy if exists "org members can delete show_items" on public.show_items;
create policy "org members can delete show_items" on public.show_items
  for delete using (is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- 3. Copy what's there
-- ---------------------------------------------------------------------------
-- Each item keeps its own id. Scenes, characters, props and costumes all
-- reference each other by id — regenerating them here would quietly sever
-- every one of those links.
--
-- `on conflict do nothing` makes this safe to run twice.

insert into public.show_items (id, org_id, show_id, module, data, sort_order)
select
  coalesce(nullif(e.value->>'id', ''), gen_random_uuid()::text),
  s.org_id,
  s.id,
  m.module,
  e.value,
  (e.ord - 1)::int
from public.shows s
cross join lateral (values
  ('schedule',     s.schedule),
  ('scenes',       s.acts),
  ('characters',   s.characters),
  ('choreography', s.choreography),
  ('costumes',     s.costumes),
  ('props',        s.props),
  ('set',          s.set_pieces),
  ('audio',        s.sound_effects),
  ('groups',       s.groups)
) as m(module, arr)
cross join lateral jsonb_array_elements(coalesce(m.arr, '[]'::jsonb))
  with ordinality as e(value, ord)
where jsonb_typeof(coalesce(m.arr, '[]'::jsonb)) = 'array'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Realtime
-- ---------------------------------------------------------------------------
-- The client listens for other people's edits. Without this the new table is
-- silent and two people on the same show stop seeing each other's work.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'show_items'
  ) then
    alter publication supabase_realtime add table public.show_items;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Check — what got copied, per module. Compare against what you see in the app.
-- ---------------------------------------------------------------------------
select module, count(*) as items
from public.show_items
group by module
order by module;
