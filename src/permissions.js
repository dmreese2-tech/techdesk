import { supabase } from './supabaseClient.js';

// ---------------------------------------------------------------------------
// PERMISSIONS — the vocabulary, and the defaults that come with a job title
//
// The *rule* lives in Postgres (can_write, in 07-permissions.sql) and is not
// reimplemented here. Two copies of a permission rule is one copy too many,
// and the client's copy is always the one that drifts. What lives here is the
// list of things that can be granted, and the sensible opening position for
// each job title — a starting point an admin edits, not a law.
// ---------------------------------------------------------------------------

// Grantable modules, in the order they appear in the sidebar. `settings` is
// missing on purpose: the vocabulary of the company is admin-only.
export const GRANTABLE_MODULES = [
  { key: 'production', label: 'Production', note: 'Title, venue, director, dates and phase.' },
  { key: 'schedule', label: 'Schedule', note: 'Rehearsal and performance calendar.' },
  { key: 'scenes', label: 'Scenes', note: 'Acts and scenes — the spine everything else references.' },
  { key: 'characters', label: 'Characters', note: 'The role list for this production.' },
  { key: 'crew', label: 'Crew', note: 'Crew roster and show assignments.' },
  { key: 'actors', label: 'Actors', note: 'Casting: which actor plays which character.' },
  { key: 'musicians', label: 'Musicians', note: 'The pit and their chairs.' },
  { key: 'staff', label: 'Staff', note: 'Production and front-of-house roles.' },
  { key: 'choreography', label: 'Choreography', note: 'Numbers, and who is in them.' },
  { key: 'costumes', label: 'Costumes', note: 'What each character wears, scene by scene.' },
  { key: 'props', label: 'Props', note: 'The props list and who handles each one.' },
  { key: 'calls', label: 'Calls', note: 'Call sheets, slots and attendance.' },
  { key: 'groups', label: 'Call groups', note: 'Named groups used to fill calls quickly.' },
  { key: 'audio', label: 'Audio', note: 'Mic, DI and playback channels.' },
  { key: 'set', label: 'Set', note: 'Set pieces and where they live.' },
  { key: 'runofshow', label: 'Run of Show', note: 'Cue sheets.' },
  { key: 'script', label: 'Script', note: 'The PDF and its markers.' },
];

export const MODULE_LABELS = Object.fromEntries(GRANTABLE_MODULES.map((m) => [m.key, m.label]));

const EVERYTHING = GRANTABLE_MODULES.map((m) => m.key);

// Opening positions, matched on the job title as typed. Anything not listed
// starts with nothing, which is the safe direction to be wrong in.
export const POSITION_DEFAULTS = {
  'producer': { modules: EVERYTHING, companyWide: true, inventory: 'all' },
  'co-producer': { modules: EVERYTHING, companyWide: true, inventory: 'all' },
  'technical director': { modules: EVERYTHING, companyWide: true, inventory: 'all' },
  'director': { modules: ['production', 'scenes', 'characters', 'actors', 'schedule'], companyWide: true },
  'assistant director': { modules: ['production', 'scenes', 'characters', 'actors', 'schedule'], companyWide: true },

  'production manager': { modules: ['schedule', 'calls', 'groups', 'runofshow', 'scenes', 'script'] },
  'stage manager': { modules: ['schedule', 'calls', 'groups', 'runofshow', 'scenes', 'script'] },
  'assistant stage manager': { modules: ['calls', 'groups', 'runofshow'] },

  'props master': { modules: ['props'], inventory: ['Props'] },
  'props': { modules: ['props'], inventory: ['Props'] },
  'costume designer': { modules: ['costumes'], inventory: ['Wardrobe'] },
  'wardrobe': { modules: ['costumes'], inventory: ['Wardrobe'] },
  'wardrobe run': { modules: ['costumes'], inventory: ['Wardrobe'] },
  'master electrician': { modules: ['runofshow'], inventory: ['Electrics', 'Rigging'] },
  'lighting designer': { modules: ['runofshow'], inventory: ['Electrics'] },
  'sound engineer': { modules: ['audio', 'runofshow'], inventory: ['Sound'] },
  'sound designer': { modules: ['audio', 'runofshow'], inventory: ['Sound'] },
  'scenic designer': { modules: ['set'], inventory: ['Scenic'] },
  'carpenter': { modules: ['set'], inventory: ['Scenic'] },
  'choreographer': { modules: ['choreography', 'scenes'] },
  'music director': { modules: ['musicians', 'scenes'] },
};

// The default for a title, or nothing. Matched loosely — "Props Master" and
// "props master " are the same job.
export function defaultsForPosition(title) {
  return POSITION_DEFAULTS[String(title || '').trim().toLowerCase()] || null;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
export async function loadPositionPermissions(orgId) {
  const { data, error } = await supabase
    .from('position_permissions')
    .select('*')
    .eq('org_id', orgId);
  if (error) throw error;
  const byKey = {};
  (data || []).forEach((row) => {
    byKey[`${row.position_kind}:${row.position}`] = {
      modules: row.modules || [],
      inventoryCategories: row.inventory_categories || [],
      companyWide: !!row.company_wide,
    };
  });
  return byKey;
}

export async function savePositionPermission(orgId, kind, position, value) {
  const { error } = await supabase.from('position_permissions').upsert({
    org_id: orgId,
    position_kind: kind,
    position,
    modules: value.modules || [],
    inventory_categories: value.inventoryCategories || [],
    company_wide: !!value.companyWide,
  });
  if (error) throw error;
}

export async function loadMemberPermissions(orgId) {
  const { data, error } = await supabase.from('member_permissions').select('*').eq('org_id', orgId);
  if (error) throw error;
  return data || [];
}

export async function saveMemberPermission(orgId, userId, showId, value) {
  const { error } = await supabase.from('member_permissions').upsert(
    {
      org_id: orgId,
      user_id: userId,
      show_id: showId || null,
      granted: value.granted || [],
      revoked: value.revoked || [],
      inventory_categories: value.inventoryCategories || [],
    },
    { onConflict: 'org_id,user_id,show_id' }
  );
  if (error) throw error;
}

// What the signed-in person may actually write, resolved by the database.
// Returns { [showId]: Set(module) } plus the inventory categories.
export async function loadMyPermissions(orgId) {
  const [modulesRes, inventoryRes] = await Promise.all([
    supabase.rpc('my_writable_modules', { check_org_id: orgId }),
    supabase.rpc('my_writable_inventory', { check_org_id: orgId }),
  ]);
  const byShow = {};
  (modulesRes.data || []).forEach((row) => {
    if (!byShow[row.show_id]) byShow[row.show_id] = new Set();
    byShow[row.show_id].add(row.module);
  });
  return {
    byShow,
    inventoryCategories: new Set((inventoryRes.data || []).map((r) => r.category)),
  };
}
