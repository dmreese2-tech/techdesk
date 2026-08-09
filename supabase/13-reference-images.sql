-- Reference images for costumes, props and set pieces.
--
-- "Something like this" is how most of these conversations start, and a link to
-- a shop listing rots long before the show opens. These are examples pinned to
-- the item — what a costume could look like, what a prop should be — not
-- photographs of the finished thing, though nothing stops them being that too.
--
-- Same shape as the scripts bucket, which is deliberate: one path convention,
-- one set of policies to reason about.

-- ---------------------------------------------------------------------------
-- 1. The bucket
-- ---------------------------------------------------------------------------
-- Private, like scripts. These sit alongside costume and prop notes that name
-- suppliers and prices, and none of that wants to be one guessed URL away.
-- 10 MB is generous for a reference photo and mean enough to stop someone
-- parking a RAW file in it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('references', 'references', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];

-- ---------------------------------------------------------------------------
-- 2. Who may do what
-- ---------------------------------------------------------------------------
-- Files live at {orgId}/{showId}/{module}/{imageId}, so the path carries
-- everything can_write needs: which company, which production, and which
-- module's permission governs it. A costume designer uploads to costumes and
-- nowhere else.
--
-- Reads stay open to the company. A reference image is the least sensitive
-- thing in here, and half its value is the crew being able to look at it.

drop policy if exists "references readable by org members" on storage.objects;
create policy "references readable by org members"
  on storage.objects for select
  using (
    bucket_id = 'references'
    and is_org_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "module writers upload references" on storage.objects;
create policy "module writers upload references"
  on storage.objects for insert
  with check (
    bucket_id = 'references'
    and can_write(
      (storage.foldername(name))[1]::uuid,
      (storage.foldername(name))[2],
      (storage.foldername(name))[3]
    )
  );

drop policy if exists "module writers replace references" on storage.objects;
create policy "module writers replace references"
  on storage.objects for update
  using (
    bucket_id = 'references'
    and can_write((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2], (storage.foldername(name))[3])
  )
  with check (
    bucket_id = 'references'
    and can_write((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2], (storage.foldername(name))[3])
  );

drop policy if exists "module writers delete references" on storage.objects;
create policy "module writers delete references"
  on storage.objects for delete
  using (
    bucket_id = 'references'
    and can_write((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2], (storage.foldername(name))[3])
  );

-- ---------------------------------------------------------------------------
-- Check — the bucket, and the four policies over it.
-- ---------------------------------------------------------------------------
select
  (select count(*) from storage.buckets where id = 'references') as bucket,
  (select count(*) from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like '%references%') as policies;
