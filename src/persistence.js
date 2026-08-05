import { supabase } from './supabaseClient.js';

// =============================================================================
// PERSISTENCE (Supabase) — same job as the IndexedDB module this replaces:
// load everything for the signed-in org on startup, and save changes as
// they happen. The difference is this is now shared, server-side data that
// every signed-in member of the org reads and writes, instead of a private
// per-browser copy.
//
// The taxonomy icon problem is the same one solved for IndexedDB: a lucide
// icon component isn't JSON-serializable, so departments/cast types/staff
// areas/band sections/inventory categories/cue departments are stored as
// label-only maps and rehydrated by re-attaching each entry's original
// icon (built-ins) or a taxonomy-appropriate fallback (anything added
// later) — see serializeTaxonomy/deserializeTaxonomy in TechDeskDashboard.jsx.
// =============================================================================

// ---------------------------------------------------------------------------
// Shape conversion — DB rows (snake_case, relational) <-> the JS shapes the
// rest of the app already works with (camelCase, nested).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// THE SHOW'S CONTENTS LIVE IN `show_items`, ONE ROW PER ITEM
//
// These nine used to be JSONB columns on the show. They are rows now, for two
// reasons: row-level security can gate a row and not a column, so per-module
// permissions were unsayable; and saving the whole show row on every edit made
// two people editing different modules overwrite each other.
//
// The app's shape doesn't change at all — `show.props` is still an array of
// props. Only what happens underneath it does.
// ---------------------------------------------------------------------------
const SHOW_MODULES = {
  schedule: 'schedule',
  scenes: 'acts',
  characters: 'characters',
  choreography: 'choreography',
  costumes: 'costumes',
  props: 'props',
  set: 'setPieces',
  audio: 'soundEffects',
  groups: 'groups',
  // Script versions: the same production's pages marked up for choreography,
  // for cues, for blocking. Siblings, not revisions of one another.
  script: 'scriptVersions',
};

// What we last wrote, per show and module, by array identity. Modules update
// immutably, so editing props gives props a new array and leaves costumes
// pointing at the same one — which is exactly the signal needed to write only
// what changed. A false positive costs one redundant upsert; there are no
// false negatives, because you cannot edit an array without replacing it.
const savedModules = new Map();
const moduleKey = (showId, module) => `${showId}:${module}`;

function itemsToShowFields(rows) {
  const byShow = {};
  (rows || []).forEach((row) => {
    if (!byShow[row.show_id]) byShow[row.show_id] = {};
    const bucket = byShow[row.show_id];
    if (!bucket[row.module]) bucket[row.module] = [];
    bucket[row.module].push(row);
  });
  Object.values(byShow).forEach((bucket) => {
    Object.keys(bucket).forEach((module) => {
      bucket[module] = bucket[module]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((row) => ({ ...row.data, id: row.id }));
    });
  });
  return byShow;
}

function showRowToJs(row, itemsForShow) {
  const meta = row.script_meta || null;
  return {
    id: row.id,
    title: row.title,
    venue: row.venue,
    director: row.director,
    phase: row.phase,
    status: row.status,
    openDate: row.open_date,
    crewCallToday: row.crew_call_today,
    headcountToday: row.headcount_today,
    // A show with no rows at all hasn't been migrated yet (or is brand new),
    // so read the old columns. Once it has any row, the table is the truth —
    // otherwise deleting the last prop would resurrect the column's copy.
    schedule: itemsForShow ? itemsForShow.schedule || [] : row.schedule || [],
    soundEffects: itemsForShow ? itemsForShow.audio || [] : row.sound_effects || [],
    choreography: itemsForShow ? itemsForShow.choreography || [] : row.choreography || [],
    acts: itemsForShow ? itemsForShow.scenes || [] : row.acts || [],
    characters: itemsForShow ? itemsForShow.characters || [] : row.characters || [],
    setPieces: itemsForShow ? itemsForShow.set || [] : row.set_pieces || [],
    costumes: itemsForShow ? itemsForShow.costumes || [] : row.costumes || [],
    props: itemsForShow ? itemsForShow.props || [] : row.props || [],
    groups: itemsForShow ? itemsForShow.groups || [] : row.groups || [],
    scriptVersions: itemsForShow ? itemsForShow.script || [] : [],

    script: meta ? { ...meta, pdfBytes: null } : null, // bytes fetched separately, on demand, from Storage
  };
}
function showJsToRow(show, orgId) {
  return {
    id: show.id,
    org_id: orgId,
    title: show.title,
    venue: show.venue,
    director: show.director,
    phase: show.phase,
    status: show.status,
    open_date: show.openDate || null,
    crew_call_today: show.crewCallToday,
    headcount_today: show.headcountToday,
    script_meta: show.script ? { fileName: show.script.fileName, pageCount: show.script.pageCount, markers: show.script.markers } : null,
  };
}

function personRowToJs(row) {
  // userId comes along so the roster can warn before deleting somebody whose
  // account is attached to them. It is never edited here — linking and
  // unlinking happen in Settings.
  return { id: row.id, name: row.name, phone: row.phone, email: row.email, userId: row.user_id || null, assignments: row.assignments || [] };
}
function personJsToRow(person, kind, orgId) {
  return { id: person.id, org_id: orgId, kind, name: person.name, phone: person.phone || null, email: person.email || null, assignments: person.assignments || [] };
}

function callRowToJs(row) {
  return { id: row.id, showId: row.show_id, date: row.call_date, time: row.call_time, label: row.label, location: row.location, sceneIds: row.scene_ids || [], slots: row.slots || [] };
}
function callJsToRow(call, orgId) {
  return { id: call.id, org_id: orgId, show_id: call.showId, call_date: call.date, call_time: call.time, label: call.label, location: call.location, scene_ids: call.sceneIds || [], slots: call.slots || [] };
}

function itemRowToJs(row) {
  return {
    id: row.id, assetNo: row.asset_no, name: row.name, category: row.category, totalQty: row.total_qty, location: row.location,
    costPerUnit: row.cost_per_unit ? Number(row.cost_per_unit) : 0, purchaseDate: row.purchase_date, purchaseSource: row.purchase_source,
    purchaseNotes: row.purchase_notes, units: row.units || [], assignments: row.assignments || [],
  };
}
function itemJsToRow(item, orgId) {
  return {
    id: item.id, org_id: orgId, asset_no: item.assetNo, name: item.name, category: item.category, total_qty: item.totalQty, location: item.location,
    cost_per_unit: item.costPerUnit || 0, purchase_date: item.purchaseDate || null, purchase_source: item.purchaseSource || null,
    purchase_notes: item.purchaseNotes || null, units: item.units || [], assignments: item.assignments || [],
  };
}

// cues: DB is one row per cue; the app works with cueSheets[showId] = [cue, ...]
function cueRowToJs(row) {
  return { id: row.id, showId: row.show_id, num: row.num, dept: row.dept, desc: row.description, fired: row.fired, sortOrder: row.sort_order };
}
function cueJsToRow(cue, showId, orgId, sortOrder) {
  return { id: cue.id, org_id: orgId, show_id: showId, num: Number(cue.num), dept: cue.dept, description: cue.desc, fired: !!cue.fired, sort_order: sortOrder };
}

function rowsToCueSheets(rows) {
  const byShow = {};
  rows.slice().sort((a, b) => a.sort_order - b.sort_order).forEach((row) => {
    const cue = cueRowToJs(row);
    if (!byShow[cue.showId]) byShow[cue.showId] = [];
    byShow[cue.showId].push(cue);
  });
  return byShow;
}

const DEFAULT_TAXONOMY_JSON = { departments: {}, departmentOrder: [], castTypes: {}, castTypeOrder: [], staffAreas: {}, staffAreaOrder: [], musicSections: {}, musicSectionOrder: [], inventoryCategories: {}, inventoryCategoryOrder: [], cueDepts: {}, cueDeptOrder: [] };

function settingsRowToJs(row) {
  if (!row) return { venues: [], locations: [], instruments: [], logoUrl: '', positions: { crew: [], musician: [], staff: [] }, ...DEFAULT_TAXONOMY_JSON };
  return {
    venues: row.venues || [],
    locations: row.locations || [],
    instruments: row.instruments || [],
    logoUrl: row.logo_url || '',
    positions: {
      crew: row.crew_positions || [],
      musician: row.musician_positions || [],
      staff: row.staff_positions || [],
    },
    departments: row.departments || {},
    departmentOrder: row.department_order || [],
    castTypes: row.cast_types || {},
    castTypeOrder: row.cast_type_order || [],
    staffAreas: row.staff_areas || {},
    staffAreaOrder: row.staff_area_order || [],
    musicSections: row.music_sections || {},
    musicSectionOrder: row.music_section_order || [],
    inventoryCategories: row.inventory_categories || {},
    inventoryCategoryOrder: row.inventory_category_order || [],
    cueDepts: row.cue_depts || {},
    cueDeptOrder: row.cue_dept_order || [],
  };
}

// ---------------------------------------------------------------------------
// Load everything for an org in one pass.
// ---------------------------------------------------------------------------
export async function loadOrgData(orgId) {
  const [showsRes, showItemsRes, peopleRes, callsRes, itemsRes, cuesRes, settingsRes] = await Promise.all([
    supabase.from('shows').select('*').eq('org_id', orgId),
    supabase.from('show_items').select('*').eq('org_id', orgId),
    // people_view, not people: same rows and the same policies, but the phone
    // and email columns come back null for cast. Writes still go to the table.
    supabase.from('people_view').select('*').eq('org_id', orgId),
    supabase.from('calls').select('*').eq('org_id', orgId),
    supabase.from('inventory_items').select('*').eq('org_id', orgId),
    supabase.from('cues').select('*').eq('org_id', orgId),
    supabase.from('org_settings').select('*').eq('org_id', orgId).maybeSingle(),
  ]);
  const firstError = [showsRes, showItemsRes, peopleRes, callsRes, itemsRes, cuesRes, settingsRes].find((r) => r.error)?.error;
  if (firstError) throw firstError;

  const people = peopleRes.data || [];
  const itemsByShow = itemsToShowFields(showItemsRes.data);
  const shows = (showsRes.data || []).map((row) => showRowToJs(row, itemsByShow[row.id]));

  // A fresh load is the truth; forget anything we thought we had written, so
  // the next save compares against what the database actually holds.
  savedModules.clear();
  shows.forEach((show) => {
    Object.entries(SHOW_MODULES).forEach(([module, field]) => {
      savedModules.set(moduleKey(show.id, module), show[field]);
    });
  });
  return {
    shows: shows,
    crew: people.filter((p) => p.kind === 'crew').map(personRowToJs),
    actors: people.filter((p) => p.kind === 'actor').map(personRowToJs),
    staff: people.filter((p) => p.kind === 'staff').map(personRowToJs),
    musicians: people.filter((p) => p.kind === 'musician').map(personRowToJs),
    calls: (callsRes.data || []).map(callRowToJs),
    inventory: (itemsRes.data || []).map(itemRowToJs),
    cueSheets: rowsToCueSheets(cuesRes.data || []),
    settings: settingsRowToJs(settingsRes.data),
  };
}

// ---------------------------------------------------------------------------
// Save one entity type at a time — targeted upserts, not one giant blob,
// since this is a real relational store now. Each of these is called from
// its own debounced effect in TechDeskDashboard.jsx, only firing when that
// specific slice of state actually changes.
// ---------------------------------------------------------------------------
// PostgREST wants a parenthesised, quoted list for `not.in`.
function inList(ids) {
  return `(${ids.map((id) => `"${String(id).replace(/"/g, '""')}"`).join(',')})`;
}

// Replace one module's items for one show: upsert what's there now, delete
// whatever used to be and isn't. Scoped to (show, module), so a props edit
// never touches a costume row and the two can happen at the same time.
async function saveShowModule(showId, module, items, orgId) {
  const rows = items.map((item, index) => ({
    id: item.id,
    org_id: orgId,
    show_id: showId,
    module,
    data: item,
    sort_order: index,
  }));

  let del = supabase.from('show_items').delete().eq('show_id', showId).eq('module', module);
  if (rows.length > 0) del = del.not('id', 'in', inList(rows.map((r) => r.id)));
  const { error: delErr } = await del;
  if (delErr) throw delErr;

  if (rows.length === 0) return;
  const { error } = await supabase.from('show_items').upsert(rows);
  if (error) throw error;
}

export async function saveShows(shows, orgId) {
  if (shows.length === 0) return;
  const { error } = await supabase.from('shows').upsert(shows.map((s) => showJsToRow(s, orgId)));
  if (error) throw error;

  const writes = [];
  shows.forEach((show) => {
    Object.entries(SHOW_MODULES).forEach(([module, field]) => {
      const items = show[field] || [];
      const key = moduleKey(show.id, module);
      if (savedModules.get(key) === items) return;
      writes.push(
        saveShowModule(show.id, module, items, orgId).then(() => {
          savedModules.set(key, items);
        })
      );
    });
  });
  await Promise.all(writes);
}
export async function deleteShows(ids) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('shows').delete().in('id', ids);
  if (error) throw error;
}

export async function savePeople(kind, people, orgId) {
  if (people.length === 0) return;
  const { error } = await supabase.from('people').upsert(people.map((p) => personJsToRow(p, kind, orgId)));
  if (error) throw error;
}
export async function deletePeople(ids) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('people').delete().in('id', ids);
  if (error) throw error;
}

export async function saveCalls(calls, orgId) {
  if (calls.length === 0) return;
  const { error } = await supabase.from('calls').upsert(calls.map((c) => callJsToRow(c, orgId)));
  if (error) throw error;
}
export async function deleteCalls(ids) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('calls').delete().in('id', ids);
  if (error) throw error;
}

export async function saveInventory(items, orgId) {
  if (items.length === 0) return;
  const { error } = await supabase.from('inventory_items').upsert(items.map((i) => itemJsToRow(i, orgId)));
  if (error) throw error;
}
export async function deleteInventory(ids) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('inventory_items').delete().in('id', ids);
  if (error) throw error;
}

// cueSheets is { [showId]: cue[] } — flatten to rows, replacing each show's
// cue set wholesale (simplest correct approach; cue sheets are edited by
// one department at a time in practice, so wholesale replace-per-show
// doesn't create the contention a wholesale replace of ALL shows would).
export async function saveCueSheetForShow(showId, cues, orgId) {
  const { error: delErr } = await supabase.from('cues').delete().eq('show_id', showId);
  if (delErr) throw delErr;
  if (cues.length === 0) return;
  const rows = cues.map((c, i) => cueJsToRow(c, showId, orgId, i));
  const { error } = await supabase.from('cues').insert(rows);
  if (error) throw error;
}

export async function saveSettings(settings, orgId) {
  const row = {
    org_id: orgId,
    venues: settings.venues,
    locations: settings.locations,
    instruments: settings.instruments,
    logo_url: settings.logoUrl || null,
    crew_positions: settings.positions?.crew || [],
    musician_positions: settings.positions?.musician || [],
    staff_positions: settings.positions?.staff || [],
    departments: settings.departments,
    department_order: settings.departmentOrder,
    cast_types: settings.castTypes,
    cast_type_order: settings.castTypeOrder,
    staff_areas: settings.staffAreas,
    staff_area_order: settings.staffAreaOrder,
    music_sections: settings.musicSections,
    music_section_order: settings.musicSectionOrder,
    inventory_categories: settings.inventoryCategories,
    inventory_category_order: settings.inventoryCategoryOrder,
    cue_depts: settings.cueDepts,
    cue_dept_order: settings.cueDeptOrder,
  };
  const { error } = await supabase.from('org_settings').upsert(row);
  if (!error) return;
  // If 03-company-logo.sql hasn't been run on this project yet, PostgREST
  // rejects the whole row for the one column it doesn't know about. Everything
  // else in Settings is more important than the logo, so save it without.
  if (error.code === 'PGRST204' || /logo_url/.test(error.message || '')) {
    delete row.logo_url;
    const retry = await supabase.from('org_settings').upsert(row);
    if (retry.error) throw retry.error;
    return;
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Script PDF storage — Supabase Storage, not the database. A show's row
// only ever holds script_meta (filename/page count/markers); the bytes
// live in a bucket at org/{orgId}/{showId}/script.pdf.
// ---------------------------------------------------------------------------
const SCRIPTS_BUCKET = 'scripts';

// One file per version, named for the version. The path is what the storage
// policy reads to decide whether you may see it, so the version id has to be
// in it — see 11-script-versions.sql.
function scriptPath(orgId, showId, versionId) {
  return `${orgId}/${showId}/${versionId}.pdf`;
}

export async function uploadScriptPdf(orgId, showId, versionId, file) {
  const path = scriptPath(orgId, showId, versionId);
  const { error } = await supabase.storage.from(SCRIPTS_BUCKET).upload(path, file, { upsert: true, contentType: 'application/pdf' });
  if (error) throw error;
  return path;
}
export async function downloadScriptPdf(orgId, showId, versionId) {
  const path = scriptPath(orgId, showId, versionId);
  const { data, error } = await supabase.storage.from(SCRIPTS_BUCKET).download(path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}
export async function deleteScriptPdf(orgId, showId, versionId) {
  const path = scriptPath(orgId, showId, versionId);
  await supabase.storage.from(SCRIPTS_BUCKET).remove([path]);
}

// ---------------------------------------------------------------------------
// Realtime — subscribe to changes on the shared tables for this org and
// call `onChange` (a simple "go refetch" signal, not a merge/diff) so
// other people's edits show up without a manual reload. Deliberately
// simple: refetch-on-notify rather than patching individual rows client
// side, which is easy to get subtly wrong with nested JSONB.
// ---------------------------------------------------------------------------
export function subscribeToOrgChanges(orgId, onChange) {
  const channel = supabase
    .channel(`org-${orgId}-changes`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shows', filter: `org_id=eq.${orgId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'show_items', filter: `org_id=eq.${orgId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'people', filter: `org_id=eq.${orgId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `org_id=eq.${orgId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `org_id=eq.${orgId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cues', filter: `org_id=eq.${orgId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'org_settings', filter: `org_id=eq.${orgId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
