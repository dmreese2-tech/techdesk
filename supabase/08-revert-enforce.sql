-- Undo of 08-enforce.sql.
--
-- Keep this to hand. If enforcement locks someone out of work they need to do
-- — during tech week, on a Sunday, with an opening on Friday — this puts every
-- table back to "any member of the company can do anything" in one statement
-- block, and nothing else changes: the permission tables, can_write() and the
-- Settings editor all survive, so nothing you have configured is lost.
--
-- Re-run 08-enforce.sql to turn it back on once the reason is understood.

do $$
declare
  t text;
begin
  -- The module-aware policies.
  execute 'drop policy if exists "production writers insert shows" on public.shows';
  execute 'drop policy if exists "production writers update shows" on public.shows';
  execute 'drop policy if exists "production writers delete shows" on public.shows';

  execute 'drop policy if exists "module writers insert show_items" on public.show_items';
  execute 'drop policy if exists "module writers update show_items" on public.show_items';
  execute 'drop policy if exists "module writers delete show_items" on public.show_items';

  execute 'drop policy if exists "roster writers insert people" on public.people';
  execute 'drop policy if exists "roster writers update people" on public.people';
  execute 'drop policy if exists "roster writers delete people" on public.people';

  execute 'drop policy if exists "call writers insert calls" on public.calls';
  execute 'drop policy if exists "call writers update calls" on public.calls';
  execute 'drop policy if exists "call writers delete calls" on public.calls';

  execute 'drop policy if exists "cue writers insert cues" on public.cues';
  execute 'drop policy if exists "cue writers update cues" on public.cues';
  execute 'drop policy if exists "cue writers delete cues" on public.cues';

  execute 'drop policy if exists "stock writers insert inventory" on public.inventory_items';
  execute 'drop policy if exists "stock writers update inventory" on public.inventory_items';
  execute 'drop policy if exists "stock writers delete inventory" on public.inventory_items';

  execute 'drop policy if exists "admins write org_settings" on public.org_settings';

  -- Back to the blanket rules.
  foreach t in array array['shows', 'people', 'calls', 'inventory_items', 'cues', 'show_items', 'org_settings']
  loop
    execute format('drop policy if exists "org members can write %1$s" on %1$I', t);
    execute format(
      'create policy "org members can write %1$s" on %1$I for all using (is_org_member(org_id)) with check (is_org_member(org_id))',
      t);
  end loop;
end;
$$;

-- The last-admin guard stays. It protects against a mistake that enforcement
-- didn't create and reverting doesn't fix.

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('shows', 'show_items', 'people', 'calls', 'cues', 'inventory_items', 'org_settings')
order by tablename, policyname;
