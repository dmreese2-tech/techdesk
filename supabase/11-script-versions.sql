-- Script versions.
--
-- One production has several scripts, not one: the same pages marked up for
-- choreography, for cues, for blocking. They are siblings, not revisions of
-- each other, and a stage manager needs to hand the right one to the right
-- person without three copies of the app.
--
-- Versions become rows in show_items under a new `script` module, so they
-- inherit everything Phase 2 through 4 already built: per-module permissions,
-- realtime, item-level writes that don't clobber a neighbour. The PDF bytes
-- stay in Storage at {orgId}/{showId}/{versionId}.pdf.
--
-- Published is the line between a working copy and something the cast can
-- open. Uploading is not publishing — a half-marked blocking draft should not
-- appear on forty phones the moment it is saved.

-- ---------------------------------------------------------------------------
-- 1. Let show_items hold scripts
-- ---------------------------------------------------------------------------
alter table public.show_items drop constraint if exists show_items_module_check;
alter table public.show_items add constraint show_items_module_check
  check (module in (
    'schedule', 'scenes', 'characters', 'choreography',
    'costumes', 'props', 'set', 'audio', 'groups', 'script'));

-- Carry across any single script already recorded on a show. Nothing has one
-- today, but a migration that only works on an empty table isn't a migration.
insert into public.show_items (id, org_id, show_id, module, data, sort_order)
select
  'sv-' || s.id,
  s.org_id,
  s.id,
  'script',
  jsonb_build_object(
    'label', 'Original',
    'type', 'original',
    'fileName', coalesce(s.script_meta->>'fileName', 'script.pdf'),
    'pageCount', coalesce((s.script_meta->>'pageCount')::int, 0),
    'markers', coalesce(s.script_meta->'markers', '[]'::jsonb),
    'published', true,
    'legacyPath', true
  ),
  0
from public.shows s
where s.script_meta is not null
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Cast see published versions only
-- ---------------------------------------------------------------------------
-- Every other module stays readable company-wide. Scripts are the exception
-- because "published" only means something if unpublished is actually hidden.
--
-- Anyone who can write scripts sees everything, published or not — that's the
-- person doing the marking up.

drop policy if exists "org members read show_items" on public.show_items;
drop policy if exists "org members can read show_items" on public.show_items;
create policy "org members read show_items" on public.show_items
  for select using (
    is_org_member(org_id)
    and (
      module <> 'script'
      or (data->>'published')::boolean is true
      or can_write(org_id, show_id, 'script')
    )
  );

-- ---------------------------------------------------------------------------
-- 3. The same line, on the bytes
-- ---------------------------------------------------------------------------
-- Hiding the row while leaving the PDF fetchable by anyone who guesses the
-- path would be a lock on the door of an open window. The file name is the
-- version id, so the row is findable from the path.

drop policy if exists "scripts are readable by org members" on storage.objects;
create policy "scripts are readable by org members"
  on storage.objects for select
  using (
    bucket_id = 'scripts'
    and is_org_member((storage.foldername(name))[1]::uuid)
    and (
      can_write((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2], 'script')
      or exists (
        select 1 from public.show_items si
        where si.module = 'script'
          and si.show_id = (storage.foldername(name))[2]
          and si.id = replace(storage.filename(name), '.pdf', '')
          and (si.data->>'published')::boolean is true
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Check — the module is allowed, and the two read policies are in place.
-- ---------------------------------------------------------------------------
select
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'show_items' and cmd = 'SELECT') as show_item_read_policies,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'script%') as storage_policies,
  (select count(*) from public.show_items where module = 'script') as script_versions;
