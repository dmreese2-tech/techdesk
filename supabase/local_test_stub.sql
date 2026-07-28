-- Local-only stand-in for what Supabase provides automatically in production.
-- Not part of the shipped schema — this file only exists so schema.sql can
-- be tested against a real Postgres instance without a live Supabase project.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase's auth.uid() reads the JWT claim of the current request. Locally,
-- we simulate "the current signed-in user" with a settable session variable:
--   select set_config('request.jwt.claim.sub', '<uuid>', false);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text
);

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

alter table storage.objects enable row level security;

-- Real Supabase creates this publication automatically; stub it so the
-- `alter publication supabase_realtime add table ...` line in schema.sql
-- doesn't error out locally.
create publication supabase_realtime;
