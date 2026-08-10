import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Menu, Building2, LogOut, LayoutGrid, Users, Boxes, ListChecks, Settings, Plus, X, Zap, Hammer, Volume2, Package, Shirt, ClipboardList, Phone, Mail, Link2, Battery, AlertTriangle, Check, MapPin, Layers, RotateCcw, ChevronDown, ChevronUp, Star, Repeat, Copy, Megaphone, Briefcase, Music, Mic, Pencil, Radio, Bell, CalendarDays, Footprints, Video, Map, Maximize2, Wrench, DollarSign, Box, UserCheck, UserX, Clapperboard, Upload, Download, Crosshair, FileText } from 'lucide-react';
// Requires two extra dependencies not used elsewhere in this file:
//   npm install pdfjs-dist pdf-lib
// pdfjs-dist renders the uploaded script to a canvas so cues can be placed
// with real pixel coordinates; pdf-lib writes those placements into a new
// PDF for export. Both run entirely client-side — nothing is uploaded
// anywhere. Session data (everything below) is now persisted locally in
// this browser via IndexedDB — see the PERSISTENCE section.
// pdf.js and pdf-lib live in Script.jsx, which is the only module that
// renders or writes a PDF. They were left here by the split of the original
// monolith, unused — except for the worker line, which ran *after*
// Script.jsx set its own and quietly put the CDN path back. Last write won,
// so bundling the worker had no effect until this went.
import {
  loadOrgData, saveShows, deleteShows, savePeople, deletePeople, saveCalls, deleteCalls,
  saveInventory, deleteInventory, saveCueSheetForShow, saveSettings, subscribeToOrgChanges,
  uploadScriptPdf, downloadScriptPdf, deleteScriptPdf,
} from './persistence.js';
import { supabase } from './supabaseClient.js';
import { CharactersPanel } from './Characters.jsx';
import { TopBar } from './TopBar.jsx';
import { ClaimBanner } from './Claim.jsx';
import { ReadOnlyGate, PermissionDeniedToast, SECTION_MODULE } from './ReadOnly.jsx';
import { NoProductions } from './NoProductions.jsx';
import { loadMyPermissions } from './permissions.js';

// ---------------------------------------------------------------------------
// PERSISTENCE — two stores, doing two different jobs.
//
// Shared production data (shows, rosters, calls, inventory, cue sheets,
// settings) lives in Supabase — a real Postgres database, shared by every
// signed-in member of the org, with row-level security so one company's
// data is never visible to another's (see supabase/schema.sql). That's
// src/persistence.js; loadOrgData/saveShows/etc. are imported above.
//
// Per-device session state — which show THIS device is currently looking
// at, which identity THIS device is signed in as for the callboard — stays
// in IndexedDB, local to this browser only. Syncing those across every
// device would mean one person's phone dictates what show everyone else's
// screen jumps to, which is wrong. IndexedDB over localStorage for the
// same reason as before: it doesn't block the main thread and has real
// headroom if this ever needs to cache more locally (e.g. offline support).
//
// One complication shows up on both sides of this: six pieces of state
// (departments, cast types, staff areas, band sections, inventory
// categories, cue departments) store a lucide-react ICON COMPONENT as part
// of each entry, and a React component reference can't be JSON-serialized
// — it would silently vanish on save, whether to IndexedDB or Postgres. So
// those six are serialized as label-only maps, and rehydrated by
// re-attaching each entry's original icon (for the built-in categories) or
// a taxonomy-appropriate fallback icon (for anything a user added later) —
// the same fallback TaxonomyEditor already uses when creating a new entry,
// so behavior doesn't change, only where the icon comes from.
// ---------------------------------------------------------------------------
const IDB_NAME = 'techdesk-db';
const IDB_STORE = 'kv';
const IDB_VERSION = 1;
const AUTOSAVE_DEBOUNCE_MS = 600;

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not available in this browser/context.'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Icon-bearing taxonomy <-> plain-JSON conversion.
// Taxonomies are stored label-only because a lucide icon component is not
// JSON. Cue departments now also carry a colour, so an entry is written as
// { label, color } — and read back tolerating the bare string that older rows
// still hold, since a taxonomy that throws on old data takes the app with it.
function serializeTaxonomy(map) {
  return Object.fromEntries(
    Object.entries(map).map(([key, entry]) => [key, entry.color ? { label: entry.label, color: entry.color } : entry.label])
  );
}
function deserializeTaxonomy(initialMap, fallbackIcon, labelMap) {
  const result = {};
  Object.entries(labelMap || {}).forEach(([key, stored]) => {
    const label = typeof stored === 'string' ? stored : stored?.label;
    const color = typeof stored === 'string' ? undefined : stored?.color;
    result[key] = {
      label,
      icon: (initialMap[key] && initialMap[key].icon) || fallbackIcon,
      ...(color || initialMap[key]?.color ? { color: color || initialMap[key].color } : {}),
    };
  });
  return result;
}

// Diff-and-sync a collection against Supabase: whatever's in `items` gets
// upserted, and whatever disappeared since the last successful sync gets
// deleted server-side. The ref starts at null (not yet seeded) so the very
// first run right after hydration never mistakes "we just loaded this from
// the DB" for "everything was just deleted."
// Locally-originated writes, tracked so the realtime subscription can tell the
// echo of our own save apart from a genuine edit made somewhere else. Module
// level rather than a ref: every synced collection in this window shares it.
const localWrites = { inFlight: 0, lastFinishedAt: 0 };
const SELF_ECHO_QUIET_MS = 2500;
function localWriteRecent() {
  return localWrites.inFlight > 0 || Date.now() - localWrites.lastFinishedAt < SELF_ECHO_QUIET_MS;
}

// Postgres says 42501 for a row-level security refusal; PostgREST passes the
// code straight through. Anything else is a genuine fault and keeps the old
// quiet flag, because "check your connection" is not the same message as
// "this isn't yours to edit".
function isPermissionDenial(error) {
  return error?.code === '42501' || /row-level security|permission denied/i.test(error?.message || '');
}

function useSyncedCollection(hydrated, items, getId, saveFn, deleteFn, setLastSavedAt, setPersistenceError, onDenied) {
  const prevIdsRef = useRef(null);
  useEffect(() => {
    if (!hydrated) return undefined;
    const timeout = setTimeout(() => {
      const currentIds = new Set(items.map(getId));
      const removed = prevIdsRef.current ? [...prevIdsRef.current].filter((id) => !currentIds.has(id)) : [];
      localWrites.inFlight += 1;
      Promise.resolve()
        .then(() => (removed.length ? deleteFn(removed) : null))
        .then(() => saveFn(items))
        .then(() => {
          prevIdsRef.current = currentIds;
          setLastSavedAt(new Date());
        })
        .catch((error) => {
          if (isPermissionDenial(error) && onDenied) {
            onDenied(error);
            return;
          }
          setPersistenceError(true);
        })
        .finally(() => {
          localWrites.inFlight -= 1;
          localWrites.lastFinishedAt = Date.now();
        });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, items]);
}

// ---------------------------------------------------------------------------
// DESIGN TOKENS
// ---------------------------------------------------------------------------
import { COLOR, FONTS } from './theme.jsx';
import { Sidebar, HouseClock, NoShowSelected, useIsNarrow } from './Shell.jsx';
import { ShowCard, GetStarted, EditShowForm, NewShowForm } from './ProductionBoard.jsx';
import { ScriptModule } from './Script.jsx';
import { ScenesModule } from './Scenes.jsx';
import { TaxonomyEditor, SettingsModule } from './Settings.jsx';
import { CallsModule } from './Calls.jsx';
import { CrewModule } from './Crew.jsx';
import { ActorsModule, StaffModule, MusiciansModule } from './People.jsx';
import { SetModule } from './Set.jsx';
import { ChoreographyModule } from './Choreography.jsx';
import { ScheduleModule } from './Schedule.jsx';
import { AudioModule } from './Audio.jsx';
import { RunOfShowModule } from './RunOfShow.jsx';
import { InventoryModule } from './Inventory.jsx';
import { PropsModule } from './Props.jsx';
import { CostumesModule } from './Costumes.jsx';
import { StubPanel } from './ui.jsx';


// ---------------------------------------------------------------------------
// DATA MODEL — this is the shape the rest of the app (crew, inventory, run
// sheets) will hang off of. Kept intentionally plain so it can later be
// swapped for a real API/store without touching the components below.
// ---------------------------------------------------------------------------
import {
  PHASES,
  PHASE_LABELS,
  STATUS_META,
  TODAY_STR,
  TODAY,
  seedShows,
  MILESTONE_PRESETS,
  MILESTONE_CALL_TEMPLATES,
  generateCallsForSchedule,
  INITIAL_DEPARTMENTS,
  INITIAL_DEPARTMENT_ORDER,
  seedCrew,
  INITIAL_CAST_TYPES,
  INITIAL_CAST_TYPE_ORDER,
  seedActors,
  INITIAL_STAFF_AREAS,
  INITIAL_STAFF_AREA_ORDER,
  seedStaff,
  INITIAL_MUSIC_SECTIONS,
  INITIAL_MUSIC_SECTION_ORDER,
  seedMusicians,
  assignmentFor,
  PERSON_TYPES,
  PERSON_TYPE_ORDER,
  BUILD_STATUSES,
  BUILD_STATUS_ORDER,
  COSTUME_SOURCES,
  COSTUME_SOURCE_ORDER,
  PROP_SOURCES,
  PROP_SOURCE_ORDER,
  SCENE_TYPES,
  SCENE_TYPE_ORDER,
  allScenes,
  sceneById,
  sceneLabel,
  rosterForType,
  setterForType,
  defaultAssignmentFields,
  seedCalls,
  INITIAL_INVENTORY_CATEGORIES,
  INITIAL_INVENTORY_CATEGORY_ORDER,
  seedInventory,
  INITIAL_CUE_DEPTS,
  cueCode,
  isDuplicateCue,
  nextCueNumber,
  seedCueSheets,
  seedVenues,
  seedLocations,
  seedInstruments,
  itemCheckedOut,
  itemOutOfService,
  conditionForItem,
  itemConflicts,
  daysUntil,
  formatShortDate,
  nextMilestone,
  formatTime12h,
  parseTime12hTo24h,
  addMinutesToTime,
  formatDuration,
  buildAudioPlot,
} from './shared.jsx';




// ---------------------------------------------------------------------------
// NEW PRODUCTION FORM (inline, minimal)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// EDIT PRODUCTION FORM — the same fields as the add form, plus the three that
// used to be write-once (director, phase, status). Opens from the pencil on a
// production card.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// MEMBERS — everyone with an account who can sign in and see this company's
// data. Deliberately separate from the Crew/Actors/Musicians/Staff rosters:
// those are people you schedule, these are people who log in.
//
// Emails live in auth.users, which the client can't read directly, so this
// goes through the org_members_list() SECURITY DEFINER function, which only
// returns rows for an org the caller actually belongs to.
// ---------------------------------------------------------------------------
// Section ids, kept here so the URL hash can be validated against them. The
// sidebar builds its own list with labels and icons from the same ids.
const SECTION_IDS = [
  'dashboard', 'schedule', 'scenes', 'characters', 'crew', 'actors', 'musicians', 'staff',
  'choreography', 'costumes', 'props', 'calls', 'audio', 'inventory', 'set',
  'runofshow', 'script', 'settings',
];






































































export default function TechDeskDashboard({ orgId, onSignOut, onChangeCompany }) {
  const [editingShowId, setEditingShowId] = useState(null);
  // Which section you're on lives in the URL hash, so a refresh — or a bookmark,
  // or opening a second tab — lands you back where you were instead of dumping
  // you on the dashboard.
  const [active, setActive] = useState(() => {
    const fromHash = window.location.hash.replace('#', '');
    return SECTION_IDS.includes(fromHash) ? fromHash : 'dashboard';
  });

  useEffect(() => {
    if (window.location.hash.replace('#', '') !== active) {
      window.history.replaceState(null, '', `#${active}`);
    }
  }, [active]);

  useEffect(() => {
    const onHashChange = () => {
      const id = window.location.hash.replace('#', '');
      setActive(SECTION_IDS.includes(id) ? id : 'dashboard');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [shows, setShows] = useState(seedShows);
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [crew, setCrew] = useState(seedCrew);
  const [calls, setCalls] = useState(seedCalls);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [actors, setActors] = useState(seedActors);
  const [currentActorId, setCurrentActorId] = useState(null);
  const [staff, setStaff] = useState(seedStaff);
  const [currentStaffId, setCurrentStaffId] = useState(null);
  const [musicians, setMusicians] = useState(seedMusicians);
  const [currentMusicianId, setCurrentMusicianId] = useState(null);
  const [inventory, setInventory] = useState(seedInventory);
  const [cueSheets, setCueSheets] = useState(seedCueSheets);
  const [venues, setVenues] = useState(seedVenues);
  // Company-level job titles for crew, band and staff, so the same position
  // reads the same way on every show instead of being retyped per assignment.
  const [positions, setPositions] = useState({ crew: [], musician: [], staff: [] });
  // The company's own logo, kept as a small data URL on org_settings so it
  // travels with the company rather than the browser that uploaded it.
  const [orgLogo, setOrgLogo] = useState('');
  // Settings are the company's vocabulary and are admin-only from Phase 4 on.
  // Without this, every non-admin's debounced settings save would 403 on
  // loop and light up the persistence warning for something they never did.
  const [isAdmin, setIsAdmin] = useState(null);
  // What this person may write, resolved by the database rather than
  // recomputed here — see docs/permissions.md. Null until it has been asked.
  const [canWrite, setCanWrite] = useState(null);
  // Directors and producers manage the roster without being admins.
  const [canManageRoster, setCanManageRoster] = useState(false);
  // The roster entry this account is linked to, if any. Undefined until asked,
  // null if the account isn't linked to anybody.
  const [me, setMe] = useState(undefined);
  const [deniedMessage, setDeniedMessage] = useState('');
  // On a phone the rail is a drawer over the content rather than a column
  // beside it; on a desktop it stays put and this flag is ignored.


  const isNarrow = useIsNarrow();
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('td-nav-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleNavCollapsed = () => {
    setNavCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('td-nav-collapsed', next ? '1' : '0');
      } catch {
        // Private browsing: the choice just won't survive a reload.
      }
      return next;
    });
  };

  // Growing the window back past the breakpoint leaves the drawer stranded
  // open behind a rail that's now permanent, so close it.
  useEffect(() => {
    if (!isNarrow) setNavOpen(false);
  }, [isNarrow]);
  const [locations, setLocations] = useState(seedLocations);
  const [instruments, setInstruments] = useState(seedInstruments);
  const [departments, setDepartments] = useState(INITIAL_DEPARTMENTS);
  const [departmentOrder, setDepartmentOrder] = useState(INITIAL_DEPARTMENT_ORDER);
  const [castTypes, setCastTypes] = useState(INITIAL_CAST_TYPES);
  const [castTypeOrder, setCastTypeOrder] = useState(INITIAL_CAST_TYPE_ORDER);
  const [staffAreas, setStaffAreas] = useState(INITIAL_STAFF_AREAS);
  const [staffAreaOrder, setStaffAreaOrder] = useState(INITIAL_STAFF_AREA_ORDER);
  const [musicSections, setMusicSections] = useState(INITIAL_MUSIC_SECTIONS);
  const [musicSectionOrder, setMusicSectionOrder] = useState(INITIAL_MUSIC_SECTION_ORDER);
  const [inventoryCategories, setInventoryCategories] = useState(INITIAL_INVENTORY_CATEGORIES);
  const [inventoryCategoryOrder, setInventoryCategoryOrder] = useState(INITIAL_INVENTORY_CATEGORY_ORDER);
  const [cueDepts, setCueDepts] = useState(INITIAL_CUE_DEPTS);
  const [cueDeptOrder, setCueDeptOrder] = useState(Object.keys(INITIAL_CUE_DEPTS));
  const [currentShowId, setCurrentShowId] = useState(null);

  const [hydrated, setHydrated] = useState(false);
  const [persistenceError, setPersistenceError] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // Load this org's shared data from Supabase once, on mount. `currentShowId`
  // and the four `currentXId` sign-in values are deliberately NOT part of
  // this — those describe what THIS device is looking at / signed in as,
  // and syncing them across every device would mean one person's phone
  // dictates what show everyone else's screen jumps to. Those five stay in
  // IndexedDB, local to this device only, same mechanism as before.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadOrgData(orgId);
        if (cancelled) return;
        setShows(data.shows);
        setCrew(data.crew);
        setActors(data.actors);
        setStaff(data.staff);
        setMusicians(data.musicians);
        setCalls(data.calls);
        setInventory(data.inventory);
        setCueSheets(data.cueSheets);
        setVenues(data.settings.venues.length ? data.settings.venues : seedVenues);
        setLocations(data.settings.locations.length ? data.settings.locations : seedLocations);
        setInstruments(data.settings.instruments.length ? data.settings.instruments : seedInstruments);
        setPositions(data.settings.positions || { crew: [], musician: [], staff: [] });
        setOrgLogo(data.settings.logoUrl || '');
        supabase.auth.getUser().then(({ data: u }) => {
          if (!u?.user) return;
          supabase
            .from('org_members')
            .select('tier')
            .eq('org_id', orgId)
            .eq('user_id', u.user.id)
            .maybeSingle()
            .then(({ data: m }) => setIsAdmin(m?.tier === 'admin'));
          supabase
            .from('people_view')
            .select('id, name, assignments')
            .eq('org_id', orgId)
            .eq('user_id', u.user.id)
            .maybeSingle()
            .then(({ data: person }) => setMe(person || null));
        });
        supabase.rpc('can_manage_roster', { check_org_id: orgId }).then(({ data }) => setCanManageRoster(!!data));
        loadMyPermissions(orgId)
          .then(setCanWrite)
          .catch(() => {
            // If the permission tables can't be read, assume nothing and let
            // the database do the refusing. Better a greyed-out section than
            // a form that silently discards work.
            setCanWrite({ byShow: {}, inventoryCategories: new Set() });
        });
        setDepartments(deserializeTaxonomy(INITIAL_DEPARTMENTS, Layers, Object.keys(data.settings.departments).length ? data.settings.departments : serializeTaxonomy(INITIAL_DEPARTMENTS)));
        setDepartmentOrder(data.settings.departmentOrder.length ? data.settings.departmentOrder : INITIAL_DEPARTMENT_ORDER);
        setCastTypes(deserializeTaxonomy(INITIAL_CAST_TYPES, Star, Object.keys(data.settings.castTypes).length ? data.settings.castTypes : serializeTaxonomy(INITIAL_CAST_TYPES)));
        setCastTypeOrder(data.settings.castTypeOrder.length ? data.settings.castTypeOrder : INITIAL_CAST_TYPE_ORDER);
        setStaffAreas(deserializeTaxonomy(INITIAL_STAFF_AREAS, Briefcase, Object.keys(data.settings.staffAreas).length ? data.settings.staffAreas : serializeTaxonomy(INITIAL_STAFF_AREAS)));
        setStaffAreaOrder(data.settings.staffAreaOrder.length ? data.settings.staffAreaOrder : INITIAL_STAFF_AREA_ORDER);
        setMusicSections(deserializeTaxonomy(INITIAL_MUSIC_SECTIONS, Music, Object.keys(data.settings.musicSections).length ? data.settings.musicSections : serializeTaxonomy(INITIAL_MUSIC_SECTIONS)));
        setMusicSectionOrder(data.settings.musicSectionOrder.length ? data.settings.musicSectionOrder : INITIAL_MUSIC_SECTION_ORDER);
        setInventoryCategories(deserializeTaxonomy(INITIAL_INVENTORY_CATEGORIES, Boxes, Object.keys(data.settings.inventoryCategories).length ? data.settings.inventoryCategories : serializeTaxonomy(INITIAL_INVENTORY_CATEGORIES)));
        setInventoryCategoryOrder(data.settings.inventoryCategoryOrder.length ? data.settings.inventoryCategoryOrder : INITIAL_INVENTORY_CATEGORY_ORDER);
        setCueDepts(deserializeTaxonomy(INITIAL_CUE_DEPTS, ClipboardList, Object.keys(data.settings.cueDepts).length ? data.settings.cueDepts : serializeTaxonomy(INITIAL_CUE_DEPTS)));
        setCueDeptOrder(data.settings.cueDeptOrder.length ? data.settings.cueDeptOrder : Object.keys(INITIAL_CUE_DEPTS));

        const local = (await idbGet('deviceState')) || {};
        // Fall back to the first production rather than none. A new account on
        // a new machine has no device state, and landing on "no show selected"
        // makes a working app look broken.
        const known = (data.shows || []).some((sh) => sh.id === local.currentShowId);
        setCurrentShowId(known ? local.currentShowId : (data.shows[0] ? data.shows[0].id : null));
        setCurrentUserId(local.currentUserId ?? null);
        setCurrentActorId(local.currentActorId ?? null);
        setCurrentStaffId(local.currentStaffId ?? null);
        setCurrentMusicianId(local.currentMusicianId ?? null);
      } catch (err) {
        if (!cancelled) setPersistenceError(true);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Realtime — when anyone else on the team changes shared data, refetch
  // and replace local state. Simple "go get the truth again" rather than
  // patching individual fields client-side, which is much easier to get
  // subtly wrong against nested JSONB.
  //
  // Supabase also delivers the echo of our OWN writes here, and a wholesale
  // replace on that echo silently eats any edit made between the local patch
  // and the debounced save landing: you change one field, the refetch puts
  // the pre-edit row back, and the save that follows writes the reverted
  // copy — updated_at moves, the value doesn't. So skip the refetch while a
  // local save is in flight or has just finished, and re-arm it for after
  // the quiet period so a genuine edit from another device still lands.
  useEffect(() => {
    if (!hydrated) return undefined;
    let retry;
    const refetch = () => {
      loadOrgData(orgId)
        .then((data) => {
          setShows(data.shows);
          setCrew(data.crew);
          setActors(data.actors);
          setStaff(data.staff);
          setMusicians(data.musicians);
          setCalls(data.calls);
          setInventory(data.inventory);
          setCueSheets(data.cueSheets);
        })
        .catch(() => setPersistenceError(true));
    };
    const unsubscribe = subscribeToOrgChanges(orgId, () => {
      if (localWriteRecent()) {
        clearTimeout(retry);
        retry = setTimeout(refetch, SELF_ECHO_QUIET_MS);
        return;
      }
      refetch();
    });
    return () => {
      clearTimeout(retry);
      unsubscribe();
    };
  }, [hydrated, orgId]);

  // Per-device session state (not shared) — still IndexedDB, still debounced.
  useEffect(() => {
    if (!hydrated) return undefined;
    const timeout = setTimeout(() => {
      idbSet('deviceState', { currentShowId, currentUserId, currentActorId, currentStaffId, currentMusicianId }).catch(() => {});
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [hydrated, currentShowId, currentUserId, currentActorId, currentStaffId, currentMusicianId]);

  // Shared production data — each collection syncs independently, and each
  // diffs against what it saved last time so removed rows actually get
  // deleted server-side instead of quietly sticking around forever.
  // Whether the section on screen is editable. Unknown counts as editable so
  // nothing flashes grey while the answer is still in flight; the database is
  // the one that actually refuses, and this only spares people the surprise.
  const sectionModule = SECTION_MODULE[active] || null;
  const sectionWritable = (() => {
    if (active === 'settings') return isAdmin !== false || canManageRoster;
    if (!sectionModule) return true;
    if (canWrite === null) return true;
    if (active === 'inventory') return canWrite.inventoryCategories.size > 0;
    // No show picked yet — which is where every new person starts, because the
    // selection lives on the device, not the account. Permissions are answered
    // per production, so there is no question to answer here; gating on it
    // silently locked new users, admins included, out of the whole app.
    if (!currentShowId) return true;
    return !!canWrite.byShow[currentShowId]?.has(sectionModule);
  })();

  const reportDenied = React.useCallback(
    () => setDeniedMessage("That change wasn't saved — this section isn't yours to edit. Reload to see where it stands."),
    []
  );
  useSyncedCollection(hydrated, shows, (s) => s.id, (items) => saveShows(items, orgId), deleteShows, setLastSavedAt, setPersistenceError, reportDenied);
  useSyncedCollection(hydrated, crew, (p) => p.id, (items) => savePeople('crew', items, orgId), deletePeople, setLastSavedAt, setPersistenceError, reportDenied);
  useSyncedCollection(hydrated, actors, (p) => p.id, (items) => savePeople('actor', items, orgId), deletePeople, setLastSavedAt, setPersistenceError, reportDenied);
  useSyncedCollection(hydrated, staff, (p) => p.id, (items) => savePeople('staff', items, orgId), deletePeople, setLastSavedAt, setPersistenceError, reportDenied);
  useSyncedCollection(hydrated, musicians, (p) => p.id, (items) => savePeople('musician', items, orgId), deletePeople, setLastSavedAt, setPersistenceError, reportDenied);
  useSyncedCollection(hydrated, calls, (c) => c.id, (items) => saveCalls(items, orgId), deleteCalls, setLastSavedAt, setPersistenceError, reportDenied);
  useSyncedCollection(hydrated, inventory, (i) => i.id, (items) => saveInventory(items, orgId), deleteInventory, setLastSavedAt, setPersistenceError, reportDenied);

  // Cue sheets: keyed by show, replaced wholesale per show on change —
  // simpler and safe since only one department is ever editing a given
  // show's cue sheet at a time in practice.
  useEffect(() => {
    if (!hydrated) return undefined;
    const timeout = setTimeout(() => {
      Promise.all(Object.entries(cueSheets).map(([showId, cues]) => saveCueSheetForShow(showId, cues, orgId)))
        .then(() => setLastSavedAt(new Date()))
        .catch(() => setPersistenceError(true));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [hydrated, cueSheets, orgId]);

  // Org settings — venues, locations, instruments, and every taxonomy —
  // one row, always upserted.
  useEffect(() => {
    if (!hydrated || isAdmin !== true) return undefined;
    const timeout = setTimeout(() => {
      saveSettings(
        {
          venues, locations, instruments, positions, logoUrl: orgLogo,
          departments: serializeTaxonomy(departments), departmentOrder,
          castTypes: serializeTaxonomy(castTypes), castTypeOrder,
          staffAreas: serializeTaxonomy(staffAreas), staffAreaOrder,
          musicSections: serializeTaxonomy(musicSections), musicSectionOrder,
          inventoryCategories: serializeTaxonomy(inventoryCategories), inventoryCategoryOrder,
          cueDepts: serializeTaxonomy(cueDepts), cueDeptOrder,
        },
        orgId
      )
        .then(() => setLastSavedAt(new Date()))
        .catch(() => setPersistenceError(true));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [
    hydrated, isAdmin, orgId, venues, locations, instruments, positions, orgLogo,
    departments, departmentOrder, castTypes, castTypeOrder, staffAreas, staffAreaOrder,
    musicSections, musicSectionOrder, inventoryCategories, inventoryCategoryOrder, cueDepts, cueDeptOrder,
  ]);


  // The schedule is the source of truth. Editing a date updates the call
  // that was generated from it; removing a date retires that call (and
  // frees any gear that had been pulled specifically for it); adding a date
  // generates a fresh open call the same way show creation does.
  function updateShowSchedule(showId, newSchedule) {
    const show = shows.find((s) => s.id === showId);
    if (!show) return;

    setShows((prev) => prev.map((s) => (s.id === showId ? { ...s, schedule: newSchedule } : s)));

    const keptIds = new Set(newSchedule.map((item) => `call-${item.id}`));
    const removedCallIds = new Set(
      calls.filter((c) => c.showId === showId && c.id.startsWith('call-') && !keptIds.has(c.id)).map((c) => c.id)
    );

    setCalls((prev) => {
      let next = prev.filter((c) => !removedCallIds.has(c.id));
      newSchedule.forEach((item) => {
        if (!item.date) return;
        const callId = `call-${item.id}`;
        const idx = next.findIndex((c) => c.id === callId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], date: item.date, time: item.time ? formatTime12h(item.time) : next[idx].time };
        } else {
          const template = MILESTONE_CALL_TEMPLATES[item.label];
          if (template) {
            next = [
              ...next,
              {
                id: callId,
                showId,
                date: item.date,
                time: item.time ? formatTime12h(item.time) : template.time,
                label: template.label,
                location: show.venue,
                slots: template.slots.map((s, i) => ({ id: `${item.id}-slot-${i}`, personType: s.personType, role: s.role, filledBy: null, attendance: 'pending' })),
              },
            ];
          }
        }
      });
      return next;
    });

    if (removedCallIds.size > 0) {
      setInventory((prev) => prev.map((i) => (removedCallIds.has(i.callId) ? { ...i, callId: null } : i)));
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return shows;
    return shows.filter((s) => s.phase === filter);
  }, [shows, filter]);

  const filters = [{ id: 'all', label: 'All' }, ...PHASES.map((p) => ({ id: p, label: PHASE_LABELS[p] }))];
  const currentShow = shows.find((s) => s.id === currentShowId) || null;
  const headerConfig = {
    dashboard: { eyebrow: 'PRODUCTION BOARD', title: `${shows.filter((s) => s.status !== 'dark').length} Active Productions` },
    schedule: currentShow
      ? {
          eyebrow: `SCHEDULE — ${currentShow.title.toUpperCase()}`,
          title: `${(currentShow.schedule || []).length} Entr${(currentShow.schedule || []).length === 1 ? 'y' : 'ies'} on the Calendar`,
        }
      : { eyebrow: 'SCHEDULE', title: 'No Show Selected' },
    scenes: currentShow
      ? {
          eyebrow: `SCENES — ${currentShow.title.toUpperCase()}`,
          title: `${(currentShow.acts || []).length} Act${(currentShow.acts || []).length === 1 ? '' : 's'}, ${(currentShow.acts || []).reduce((sum, a) => sum + (a.scenes || []).length, 0)} Scenes`,
        }
      : { eyebrow: 'SCENES', title: 'No Show Selected' },
    characters: currentShow
      ? {
          eyebrow: `CHARACTERS — ${currentShow.title.toUpperCase()}`,
          title: `${(currentShow.characters || []).length} Character${(currentShow.characters || []).length === 1 ? '' : 's'}`,
        }
      : { eyebrow: 'CHARACTERS', title: 'No Show Selected' },
    crew: { eyebrow: 'CREW ROSTER', title: `${crew.length} Crew Members` },
    actors: { eyebrow: 'CAST LIST', title: `${actors.length} Cast Members` },
    musicians: { eyebrow: 'THE BAND', title: `${musicians.length} Musicians` },
    staff: { eyebrow: 'PRODUCTION STAFF', title: `${staff.length} Staff Members` },
    choreography: currentShow
      ? {
          eyebrow: `CHOREOGRAPHY — ${currentShow.title.toUpperCase()}`,
          title: `${(currentShow.choreography || []).length} Number${(currentShow.choreography || []).length === 1 ? '' : 's'} Blocked`,
        }
      : { eyebrow: 'CHOREOGRAPHY', title: 'No Show Selected' },
    costumes: currentShow
      ? {
          eyebrow: `COSTUMES — ${currentShow.title.toUpperCase()}`,
          title: `${(currentShow.costumes || []).length} Costume Need${(currentShow.costumes || []).length === 1 ? '' : 's'} Logged`,
        }
      : { eyebrow: 'COSTUMES', title: 'No Show Selected' },
    props: currentShow
      ? {
          eyebrow: `PROPS — ${currentShow.title.toUpperCase()}`,
          title: `${(currentShow.props || []).length} Prop Need${(currentShow.props || []).length === 1 ? '' : 's'} Logged`,
        }
      : { eyebrow: 'PROPS', title: 'No Show Selected' },
    calls: currentShow
      ? {
          eyebrow: 'CALLBOARD',
          title: `${calls.filter((c) => c.showId === currentShowId).length} Call${calls.filter((c) => c.showId === currentShowId).length === 1 ? '' : 's'} for ${currentShow.title}`,
        }
      : { eyebrow: 'CALLBOARD', title: 'No Show Selected' },
    audio: currentShow
      ? {
          eyebrow: `AUDIO PROFILE — ${currentShow.title.toUpperCase()}`,
          title: `${(currentShow.soundEffects || []).length} Sound Effect${(currentShow.soundEffects || []).length === 1 ? '' : 's'} Logged`,
        }
      : { eyebrow: 'AUDIO PROFILE', title: 'No Show Selected' },
    inventory: { eyebrow: 'STOCK ROOM', title: `${inventory.length} Tracked Items` },
    set: currentShow
      ? {
          eyebrow: `SET — ${currentShow.title.toUpperCase()}`,
          title: `${(currentShow.setPieces || []).length} Piece${(currentShow.setPieces || []).length === 1 ? '' : 's'} on the Build List`,
        }
      : { eyebrow: 'SET', title: 'No Show Selected' },
    runofshow: currentShow
      ? {
          eyebrow: `CALLING SCRIPT — ${currentShow.title.toUpperCase()}`,
          title: `${(cueSheets[currentShowId] || []).filter((c) => !c.fired).length} Cues Remaining`,
        }
      : { eyebrow: 'CALLING SCRIPT', title: 'No Show Selected' },
    script: currentShow
      ? {
          eyebrow: `SCRIPT — ${currentShow.title.toUpperCase()}`,
          title: currentShow.script ? `${(currentShow.script.markers || []).length} Cues Placed` : 'No Script Uploaded',
        }
      : { eyebrow: 'SCRIPT', title: 'No Show Selected' },
    settings: { eyebrow: 'SHOP SETTINGS', title: 'Board Configuration' },
  };
  const header = headerConfig[active] || headerConfig.dashboard;

  // Taken off every show. The account still works and they're still a member —
  // there is simply nothing assigned to them, so there is nothing to show.
  //
  // Three guards, and all three matter. Admins never see it, because running
  // the company is not the same as being cast in it. Anyone whose account
  // isn't linked to a roster entry never sees it either — `me === null` is
  // "we don't know who you are", not "you have no work", and treating those
  // the same would lock out every member who hasn't claimed themselves yet.
  // And it waits for the answer rather than guessing while it loads.
  const onNoProductions =
    isAdmin === false && me && (me.assignments || []).length === 0;

  if (hydrated && onNoProductions) {
    return <NoProductions personName={me.name} onSignOut={onSignOut} />;
  }

  if (!hydrated) {
    return (
      <div style={{ minHeight: '100vh', background: COLOR.void, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {FONTS}
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.textFaint, letterSpacing: '0.08em' }}>
          LOADING SAVED DATA…
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: COLOR.void }}>
      {FONTS}
      <TopBar orgId={orgId} section={active} orgLogo={orgLogo} />
      <ClaimBanner orgId={orgId} />
      <PermissionDeniedToast message={deniedMessage} onDismiss={() => setDeniedMessage('')} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <Sidebar
        active={active}
        setActive={setActive}
        shows={shows}
        currentShowId={currentShowId}
        setCurrentShowId={setCurrentShowId}
        onSignOut={onSignOut}
        onChangeCompany={onChangeCompany}
        isNarrow={isNarrow}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        collapsed={navCollapsed}
        onToggleCollapse={toggleNavCollapsed}
      />

      {isNarrow && navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
          style={{ position: 'fixed', top: 44, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', zIndex: 55 }}
        />
      )}

      <div style={{ flex: 1, padding: isNarrow ? '16px 16px 32px' : '24px 32px', overflowY: 'auto', minWidth: 0 }} className="td-scrollbar">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isNarrow ? 18 : 26, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
            {isNarrow && (
              <button
                onClick={() => setNavOpen(true)}
                className="td-focusable"
                aria-label="Open menu"
                aria-expanded={navOpen}
                style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, padding: '7px 9px', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
              >
                <Menu size={18} />
              </button>
            )}
            <div style={{ minWidth: 0 }}>
            <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 6 }}>
              {header.eyebrow}
            </div>
            <h1 className="td-display" style={{ fontSize: 28, color: COLOR.textPrimary, letterSpacing: '0.02em', margin: 0 }}>
              {header.title}
            </h1>
            </div>
          </div>
          {!isNarrow && <HouseClock />}
        </div>

        <ReadOnlyGate writable={sectionWritable} module={sectionModule} admin={active === 'settings'}>
        {active === 'dashboard' && (
          <>
            <GetStarted
              onGo={setActive}
              hasShow={!!currentShow}
              steps={[
                { label: 'Set up the company', target: 'settings', done: venues.length > 0, note: 'Venues, storage locations, instruments, and the department, cast and cue vocabularies every picker pulls from.' },
                { label: 'Build your company rosters', target: 'crew', done: crew.length + actors.length + musicians.length + staff.length > 0, note: 'Crew, actors, musicians and staff live at company level once — you assign them to individual shows later.' },
                { label: 'Create the production', target: 'dashboard', done: shows.length > 0, note: 'New production, with its venue and opening date. Everything below hangs off the show you are working on.' },
                { label: 'Enter the scene list', target: 'scenes', done: (currentShow?.acts?.length || 0) > 0, note: 'Acts, scenes and musical numbers. Choreography, costumes, props and cues all reference this, so it comes first.' },
                { label: 'Build the character list', target: 'characters', done: (currentShow?.characters?.length || 0) > 0, note: 'The roles in the show, ticked into the scenes they appear in. Actors get cast into these, and costumes and props hang off them, so it precedes casting.' },
                { label: 'Lay out the schedule', target: 'schedule', done: (currentShow?.schedule?.length || 0) > 0, note: 'Load-in, rehearsals, tech week and strike. Calls are generated from these dates, so schedule before you post calls.' },
                { label: 'Assign people to the show', target: 'crew', done: [...crew, ...actors, ...musicians, ...staff].some((p) => (p.assignments || []).some((a) => a.showId === currentShow?.id)), note: 'Cast actors into characters; crew, band and staff into positions from Settings. The audio plot and callboard both read these.' },
                { label: 'Work the design lists', target: 'costumes', done: ((currentShow?.costumes?.length || 0) + (currentShow?.props?.length || 0) + (currentShow?.setPieces?.length || 0)) > 0, note: 'Costumes, props and set pieces — tied to actor and scene, tracked from needs-building through acquired.' },
                { label: 'Stock and pull inventory', target: 'inventory', done: inventory.length > 0, note: 'What the shop owns, what it cost, and which show has it. Tech-week overlaps between productions get flagged.' },
                { label: 'Post calls to the callboard', target: 'calls', done: calls.some((c) => c.showId === currentShow?.id), note: 'Who is called when, which scenes are being worked, what gear comes out, and who actually turned up.' },
                { label: 'Upload the script', target: 'script', done: !!currentShow?.script, note: 'Then click the page where each cue actually falls, and export an annotated copy.' },
                { label: 'Build the run of show', target: 'runofshow', done: (cueSheets?.[currentShow?.id]?.length || 0) > 0, note: 'The calling script cue by cue, numbered per department — LX 1 and SND 1 are independent.' },
                { label: 'Check the audio plot', target: 'audio', done: false, note: 'Mic, DI and playback channels, generated from your cast and band assignments. Read it last, once the rest is in.' },
              ]}
            />

            {/* Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {filters.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className="td-focusable"
                    style={{
                      background: filter === f.id ? COLOR.amber : 'transparent',
                      color: filter === f.id ? COLOR.void : COLOR.textMuted,
                      border: `1px solid ${filter === f.id ? COLOR.amber : COLOR.line}`,
                      borderRadius: 20,
                      padding: '5px 14px',
                      fontSize: 12,
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowForm((v) => !v)}
                className="td-focusable"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'transparent',
                  color: COLOR.amber,
                  border: `1px solid ${COLOR.amber}`,
                  borderRadius: 3,
                  padding: '7px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} /> New production
              </button>
            </div>

            {showForm && (
              <NewShowForm
                venues={venues}
                onAdd={(show) => {
                  setShows((prev) => [show, ...prev]);
                  const generated = generateCallsForSchedule(show);
                  if (generated.length > 0) setCalls((prev) => [...prev, ...generated]);
                  setShowForm(false);
                }}
                onClose={() => setShowForm(false)}
              />
            )}

            {editingShowId && (() => {
          const editing = shows.find((s) => s.id === editingShowId);
          if (!editing) return null;
          return (
            <EditShowForm
              show={editing}
              venues={venues}
              onSave={(patch) => {
                setShows((prev) => prev.map((s) => (s.id === editingShowId ? { ...s, ...patch } : s)));
                setEditingShowId(null);
              }}
              onClose={() => setEditingShowId(null)}
            />
          );
        })()}

        {/* Grid */}
            {filtered.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {filtered.map((show) => (
                  <ShowCard
                    key={show.id}
                    show={show}
                    isCurrent={show.id === currentShowId}
              onEdit={() => setEditingShowId(show.id)}
                    onSetCurrent={() => setCurrentShowId(show.id)}
                  />
                ))}
              </div>
            ) : (
              <StubPanel label="No productions in this phase" hint="No production is in this phase right now. Switch the filter above, or open a production and change its phase from the pencil on its card." />
            )}

            {/* Legend */}
            <div style={{ display: 'flex', gap: 20, marginTop: 28, paddingTop: 16, borderTop: `1px solid ${COLOR.line}` }}>
              {Object.entries(STATUS_META).map(([key, meta]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
                  <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>{meta.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {active === 'schedule' &&
          (currentShow ? (
            <ScheduleModule
              show={currentShow}
              rosters={{ crew, actors, staff, musicians }}
              onScheduleChange={updateShowSchedule}
            />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="schedule" />
          ))}

        {active === 'scenes' &&
          (currentShow ? (
            <ScenesModule show={currentShow} actors={actors} setShows={setShows} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="scene list" />
          ))}

        {active === 'characters' &&
          (currentShow ? (
            <CharactersPanel show={currentShow} setShows={setShows} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="character list" />
          ))}

        {active === 'crew' && (
          <CrewModule show={currentShow} shows={shows} crew={crew} setCrew={setCrew} currentUserId={currentUserId} setCurrentUserId={setCurrentUserId} DEPARTMENTS={departments} DEPARTMENT_ORDER={departmentOrder} positions={positions.crew} />
        )}
        {active === 'actors' && (
          <ActorsModule show={currentShow} shows={shows} actors={actors} setActors={setActors} currentUserId={currentActorId} setCurrentUserId={setCurrentActorId} CAST_TYPES={castTypes} CAST_TYPE_ORDER={castTypeOrder} characters={currentShow?.characters || []} />
        )}
        {active === 'musicians' && (
          <MusiciansModule show={currentShow} shows={shows} musicians={musicians} setMusicians={setMusicians} currentUserId={currentMusicianId} setCurrentUserId={setCurrentMusicianId} MUSIC_SECTIONS={musicSections} MUSIC_SECTION_ORDER={musicSectionOrder} positions={positions.musician} />
        )}
        {active === 'staff' && (
          <StaffModule show={currentShow} shows={shows} staff={staff} setStaff={setStaff} currentUserId={currentStaffId} setCurrentUserId={setCurrentStaffId} STAFF_AREAS={staffAreas} STAFF_AREA_ORDER={staffAreaOrder} positions={positions.staff} />
        )}
        {active === 'choreography' &&
          (currentShow ? (
            <ChoreographyModule show={currentShow} actors={actors} setShows={setShows} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="choreography" />
          ))}
        {active === 'costumes' &&
          (currentShow ? (
            <CostumesModule show={currentShow} actors={actors} inventory={inventory} locations={locations} setShows={setShows} characters={currentShow?.characters || []} orgId={orgId} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="costume needs" />
          ))}
        {active === 'props' &&
          (currentShow ? (
            <PropsModule show={currentShow} actors={actors} inventory={inventory} locations={locations} setShows={setShows} characters={currentShow?.characters || []} orgId={orgId} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="prop needs" />
          ))}
        {active === 'calls' &&
          (currentShow ? (
            <CallsModule
              show={currentShow}
              venues={venues}
              calls={calls}
              setCalls={setCalls}
              rosters={{ crew, setCrew, actors, setActors, staff, setStaff, musicians, setMusicians }}
              currentIds={{ crew: currentUserId, actor: currentActorId, staff: currentStaffId, musician: currentMusicianId }}
              inventory={inventory}
              setInventory={setInventory}
              setShows={setShows}
              slotOptions={{
                crew: positions.crew,
                staff: positions.staff,
                musician: positions.musician,
                actor: (currentShow?.characters || []).map((c) => c.name),
              }}
            />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="callboard" />
          ))}
        {active === 'audio' &&
          (currentShow ? (
            <AudioModule show={currentShow} actors={actors} musicians={musicians} setShows={setShows} CAST_TYPE_ORDER={castTypeOrder} MUSIC_SECTIONS={musicSections} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="audio profile" />
          ))}
        {active === 'inventory' && <InventoryModule show={currentShow} shows={shows} calls={calls} inventory={inventory} setInventory={setInventory} locations={locations} INVENTORY_CATEGORIES={inventoryCategories} INVENTORY_CATEGORY_ORDER={inventoryCategoryOrder} />}
        {active === 'set' &&
          (currentShow ? (
            <SetModule show={currentShow} inventory={inventory} setInventory={setInventory} locations={locations} setShows={setShows} INVENTORY_CATEGORIES={inventoryCategories} INVENTORY_CATEGORY_ORDER={inventoryCategoryOrder} orgId={orgId} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="build list" />
          ))}
        {active === 'runofshow' &&
          (currentShow ? (
            <RunOfShowModule show={currentShow} cueSheets={cueSheets} setCueSheets={setCueSheets} CUE_DEPTS={cueDepts} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="run of show" />
          ))}
        {active === 'script' &&
          (currentShow ? (
            <ScriptModule show={currentShow} orgId={orgId} cueSheets={cueSheets} setShows={setShows} CUE_DEPTS={cueDepts} canEdit={sectionWritable} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="script" />
          ))}
        {active === 'settings' && (
          <SettingsModule
            venues={venues}
            setVenues={setVenues}
            locations={locations}
            setLocations={setLocations}
            DEPARTMENTS={departments}
            setDEPARTMENTS={setDepartments}
            DEPARTMENT_ORDER={departmentOrder}
            setDEPARTMENT_ORDER={setDepartmentOrder}
            CAST_TYPES={castTypes}
            setCAST_TYPES={setCastTypes}
            CAST_TYPE_ORDER={castTypeOrder}
            setCAST_TYPE_ORDER={setCastTypeOrder}
            STAFF_AREAS={staffAreas}
            setSTAFF_AREAS={setStaffAreas}
            STAFF_AREA_ORDER={staffAreaOrder}
            setSTAFF_AREA_ORDER={setStaffAreaOrder}
            MUSIC_SECTIONS={musicSections}
            setMUSIC_SECTIONS={setMusicSections}
            MUSIC_SECTION_ORDER={musicSectionOrder}
            setMUSIC_SECTION_ORDER={setMusicSectionOrder}
            INVENTORY_CATEGORIES={inventoryCategories}
            setINVENTORY_CATEGORIES={setInventoryCategories}
            INVENTORY_CATEGORY_ORDER={inventoryCategoryOrder}
            setINVENTORY_CATEGORY_ORDER={setInventoryCategoryOrder}
            CUE_DEPTS={cueDepts}
            setCUE_DEPTS={setCueDepts}
            CUE_DEPT_ORDER={cueDeptOrder}
            setCUE_DEPT_ORDER={setCueDeptOrder}
            orgId={orgId}
            onSignOut={onSignOut}
            isAdmin={isAdmin}
            positions={positions}
            setPositions={setPositions}
            orgLogo={orgLogo}
            setOrgLogo={setOrgLogo}
          />
        )}
        </ReadOnlyGate>
      </div>
      </div>
    </div>
  );
}
