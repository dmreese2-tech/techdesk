-- Company logo for the top bar.
--
-- Stored as a data URL on the company's settings row rather than in a storage
-- bucket: it's one small image per company, it's already only readable by
-- people who can read the settings, and it arrives in the load the app makes
-- anyway. The app redraws whatever is uploaded down to bar size (≤260×64)
-- before saving, so this column holds a few kilobytes, not a photo.

alter table public.org_settings
  add column if not exists logo_url text;

-- check
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'org_settings' and column_name = 'logo_url';
