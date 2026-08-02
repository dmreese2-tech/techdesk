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
function showRowToJs(row) {
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
    schedule: row.schedule || [],
    soundEffects: row.sound_effects || [],
    choreography: row.choreography || [],
    acts: row.acts || [],
    characters: row.characters || [],
    setPieces: row.set_pieces || [],
    costumes: row.costumes || [],
    props: row.props || [],
    groups: row.groups || [],
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
    schedule: show.schedule || [],
    sound_effects: show.soundEffects || [],
    choreography: show.choreography || [],
    acts: show.acts || [],
    characters: show.characters || [],
    set_pieces: show.setPieces || [],
    costumes: show.costumes || [],
    props: show.props || [],
    groups: show.groups || [],
    script_meta: show.script ? { fileName: show.script.fileName, pageCount: show.script.pageCount, markers: show.script.markers } : null,
  };
}

function personRowToJs(row) {
  return { id: row.id, name: row.name, phone: row.phone, email: row.email, assignments: row.assignments || [] };
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
  if (!row) return { venues: [], locations: [], instruments: [], positions: { crew: [], musician: [], staff: [] }, ...DEFAULT_TAXONOMY_JSON };
  return {
    venues: row.venues || [],
    locations: row.locations || [],
    instruments: row.instruments || [],
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
  const [showsRes, peopleRes, callsRes, itemsRes, cuesRes, settingsRes] = await Promise.all([
    supabase.from('shows').select('*').eq('org_id', orgId),
    supabase.from('people').select('*').eq('org_id', orgId),
    supabase.from('calls').select('*').eq('org_id', orgId),
    supabase.from('inventory_items').select('*').eq('org_id', orgId),
    supabase.from('cues').select('*').eq('org_id', orgId),
    supabase.from('org_settings').select('*').eq('org_id', orgId).maybeSingle(),
  ]);
  const firstError = [showsRes, peopleRes, callsRes, itemsRes, cuesRes, settingsRes].find((r) => r.error)?.error;
  if (firstError) throw firstError;

  const people = peopleRes.data || [];
  return {
    shows: (showsRes.data || []).map(showRowToJs),
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
export async function saveShows(shows, orgId) {
  if (shows.length === 0) return;
  const { error } = await supabase.from('shows').upsert(shows.map((s) => showJsToRow(s, orgId)));
  if (error) throw error;
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
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Script PDF storage — Supabase Storage, not the database. A show's row
// only ever holds script_meta (filename/page count/markers); the bytes
// live in a bucket at org/{orgId}/{showId}/script.pdf.
// ---------------------------------------------------------------------------
const SCRIPTS_BUCKET = 'scripts';

export async function uploadScriptPdf(orgId, showId, file) {
  const path = `${orgId}/${showId}/script.pdf`;
  const { error } = await supabase.storage.from(SCRIPTS_BUCKET).upload(path, file, { upsert: true, contentType: 'application/pdf' });
  if (error) throw error;
  return path;
}
export async function downloadScriptPdf(orgId, showId) {
  const path = `${orgId}/${showId}/script.pdf`;
  const { data, error } = await supabase.storage.from(SCRIPTS_BUCKET).download(path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}
export async function deleteScriptPdf(orgId, showId) {
  const path = `${orgId}/${showId}/script.pdf`;
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'people', filter: `org_id=eq.${orgId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `org_id=eq.${orgId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `org_id=eq.${orgId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cues', filter: `org_id=eq.${orgId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'org_settings', filter: `org_id=eq.${orgId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
