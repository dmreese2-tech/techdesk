-- The scripts bucket, which never existed.
--
-- schema.sql has described this bucket since before the permissions work
-- started, but schema.sql is the file for standing up a *fresh* project, and
-- this project was built by incremental migration. The bucket section was
-- never run. Every script upload has been failing on "Bucket not found", and
-- the app reported it as a generic upload error, so it looked like a bug in
-- the uploader rather than a missing container.
--
-- Creating it here, with policies that answer to the same permission model as
-- everything else rather than the blanket org-membership check schema.sql
-- assumed back when every member could do everything.

-- ---------------------------------------------------------------------------
-- 1. The bucket
-- ---------------------------------------------------------------------------
-- Private. Scripts are licensed material and a public bucket would put them
-- one guessed URL away from anyone. 50 MB covers a full-length musical with
-- scanned pages; PDFs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scripts', 'scripts', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 52428800,
      allowed_mime_types = array['application/pdf'];

-- ---------------------------------------------------------------------------
-- 2. Who may do what
-- ---------------------------------------------------------------------------
-- Files live at {orgId}/{showId}/... so the first two path segments are the
-- org and the show — exactly what can_write() needs.
--
--   read   — any member of the company. Cast download their script like
--            everyone else; that is the point of putting it here.
--   write  — whoever holds the `script` module on that production, which is
--            admins and anyone whose position grants it. Cast never.

-- Note: no `alter table storage.objects enable row level security` here.
-- Supabase already enables it, and the SQL editor's role does not own that
-- table, so the statement fails with 42501 and takes the whole migration
-- down with it.

drop policy if exists "scripts are readable by org members" on storage.objects;
create policy "scripts are readable by org members"
  on storage.objects for select
  using (
    bucket_id = 'scripts'
    and is_org_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "script writers can upload" on storage.objects;
create policy "script writers can upload"
  on storage.objects for insert
  with check (
    bucket_id = 'scripts'
    and can_write((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2], 'script')
  );

drop policy if exists "script writers can replace" on storage.objects;
create policy "script writers can replace"
  on storage.objects for update
  using (
    bucket_id = 'scripts'
    and can_write((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2], 'script')
  )
  with check (
    bucket_id = 'scripts'
    and can_write((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2], 'script')
  );

drop policy if exists "script writers can delete" on storage.objects;
create policy "script writers can delete"
  on storage.objects for delete
  using (
    bucket_id = 'scripts'
    and can_write((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2], 'script')
  );

-- The blanket policies schema.sql described, in case an older run created
-- them. They granted write to every member and are now wrong.
drop policy if exists "org members can read scripts" on storage.objects;
drop policy if exists "org members can upload scripts" on storage.objects;
drop policy if exists "org members can update scripts" on storage.objects;
drop policy if exists "org members can delete scripts" on storage.objects;

-- ---------------------------------------------------------------------------
-- Check — one bucket, four policies.
-- ---------------------------------------------------------------------------
select
  (select count(*) from storage.buckets where id = 'scripts') as bucket,
  (select count(*) from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'script%') as script_policies;
