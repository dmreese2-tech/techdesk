import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Building2, LogOut, LayoutGrid, Users, Boxes, ListChecks, Settings, Plus, X, Zap, Hammer, Volume2, Package, Shirt, ClipboardList, Phone, Mail, Link2, Battery, AlertTriangle, Check, MapPin, Layers, RotateCcw, ChevronDown, ChevronUp, Star, Repeat, Copy, Megaphone, Briefcase, Music, Mic, Pencil, Radio, Bell, CalendarDays, Footprints, Video, Map, Maximize2, Wrench, DollarSign, Box, UserCheck, UserX, Clapperboard, Upload, Download, Crosshair, FileText } from 'lucide-react';
// Requires two extra dependencies not used elsewhere in this file:
//   npm install pdfjs-dist pdf-lib
// pdfjs-dist renders the uploaded script to a canvas so cues can be placed
// with real pixel coordinates; pdf-lib writes those placements into a new
// PDF for export. Both run entirely client-side — nothing is uploaded
// anywhere. Session data (everything below) is now persisted locally in
// this browser via IndexedDB — see the PERSISTENCE section.
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';
import {
  loadOrgData, saveShows, deleteShows, savePeople, deletePeople, saveCalls, deleteCalls,
  saveInventory, deleteInventory, saveCueSheetForShow, saveSettings, subscribeToOrgChanges,
  uploadScriptPdf, downloadScriptPdf, deleteScriptPdf,
} from './persistence.js';
import { supabase } from './supabaseClient.js';

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
function serializeTaxonomy(map) {
  return Object.fromEntries(Object.entries(map).map(([key, entry]) => [key, entry.label]));
}
function deserializeTaxonomy(initialMap, fallbackIcon, labelMap) {
  const result = {};
  Object.entries(labelMap || {}).forEach(([key, label]) => {
    result[key] = { label, icon: (initialMap[key] && initialMap[key].icon) || fallbackIcon };
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

function useSyncedCollection(hydrated, items, getId, saveFn, deleteFn, setLastSavedAt, setPersistenceError) {
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
        .catch(() => setPersistenceError(true))
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
const COLOR = {
  void: '#0B0E11',
  panel: '#12161B',
  card: '#181D24',
  cardHover: '#1D232B',
  line: '#2A323C',
  lineBright: '#3C4A58',
  blueprint: '#5B7A8C',
  textPrimary: '#EDEFF2',
  textMuted: '#8A94A3',
  textFaint: '#5B6472',
  amber: '#E8A33D',
  amberDim: '#5A4426',
  green: '#4CAF6D',
  greenDim: '#254A32',
  slate: '#6B7480',
  slateDim: '#2A2E35',
};

const FONTS = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

    .td-display { font-family: 'Oswald', sans-serif; text-transform: uppercase; }
    .td-body { font-family: 'Inter', sans-serif; }
    .td-mono { font-family: 'IBM Plex Mono', monospace; }

    @keyframes pulse-glow {
      0%, 100% { opacity: 1; box-shadow: 0 0 6px 1px var(--glow); }
      50% { opacity: 0.55; box-shadow: 0 0 2px 0px var(--glow); }
    }
    .cue-light-standby {
      --glow: ${COLOR.amber};
      animation: pulse-glow 2.2s ease-in-out infinite;
    }
    .cue-light-running {
      box-shadow: 0 0 8px 2px ${COLOR.green};
    }
    .td-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .td-scrollbar::-webkit-scrollbar-thumb { background: ${COLOR.line}; border-radius: 3px; }

    /* The page itself, not just the app shell — otherwise the browser's default
           8px body margin leaves a white frame around a full-bleed dark UI. */
        html, body, #root {
          margin: 0;
          padding: 0;
          min-height: 100%;
          background: #0B0E11;
        }

        .td-focusable:focus-visible {
      outline: 2px solid ${COLOR.amber};
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      .cue-light-standby { animation: none; }
    }
  `}</style>
);

// ---------------------------------------------------------------------------
// DATA MODEL — this is the shape the rest of the app (crew, inventory, run
// sheets) will hang off of. Kept intentionally plain so it can later be
// swapped for a real API/store without touching the components below.
// ---------------------------------------------------------------------------
const PHASES = ['design', 'build', 'tech', 'run', 'strike'];
const PHASE_LABELS = { design: 'Design', build: 'Build', tech: 'Tech', run: 'Run', strike: 'Strike' };

const STATUS_META = {
  standby: { label: 'In prep', color: COLOR.amber, dim: COLOR.amberDim, cls: 'cue-light-standby' },
  running: { label: 'Running', color: COLOR.green, dim: COLOR.greenDim, cls: 'cue-light-running' },
  dark: { label: 'Struck', color: COLOR.slate, dim: COLOR.slateDim, cls: '' },
};

const TODAY_STR = (() => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();
const TODAY = new Date(TODAY_STR);


const seedShows = [
  {
    id: 's1',
    title: 'The Tempest',
    venue: 'Mainstage',
    director: 'R. Alvarez',
    phase: 'tech',
    status: 'standby',
    openDate: '2026-08-14',
    crewCallToday: '9:00 AM — Focus & Cue-to-Cue',
    headcountToday: 11,
    schedule: [
      {
        id: 's1-d1', label: 'Load-in', date: '2026-07-18', time: '09:00', durationMinutes: 480,
        breaks: [{ id: 's1-d1-b1', label: 'Lunch', durationMinutes: 30 }],
        attendance: { crew: ['c6', 'c7', 'c1'], actors: [], musicians: [], staff: ['st1'] },
        notes: 'Unload trucks, set deck pieces, begin electrics hang and cable run.',
      },
      {
        id: 's1-d2', label: 'Focus', date: '2026-07-24', time: '09:00', durationMinutes: 240,
        breaks: [],
        attendance: { crew: ['c1', 'c2'], actors: [], musicians: [], staff: [] },
        notes: 'Focus all conventional units to plot; confirm gel and template selections.',
      },
      {
        id: 's1-d3', label: 'Q2Q', date: '2026-07-27', time: '09:00', durationMinutes: 360, isTechWeek: true,
        breaks: [{ id: 's1-d3-b1', label: 'Lunch', durationMinutes: 45 }],
        attendance: { crew: ['c1', 'c3', 'c4', 'c10'], actors: ['a1', 'a2', 'a5', 'a6'], musicians: [], staff: ['st1', 'st2'] },
        notes: 'Work cue-to-cue through the full script; hold for lighting and sound cue placement.',
      },
      {
        id: 's1-d4', label: 'Tech Rehearsal', date: '2026-07-30', time: '18:00', durationMinutes: 240, isTechWeek: true,
        breaks: [{ id: 's1-d4-b1', label: '10-minute break', durationMinutes: 10 }],
        attendance: { crew: ['c1', 'c3', 'c4', 'c8', 'c9', 'c10'], actors: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], musicians: [], staff: ['st1', 'st2'] },
        notes: 'First full stumble-through with all technical elements live. Stop for notes as needed.',
      },
      {
        id: 's1-d5', label: 'Dress Rehearsal', date: '2026-08-11', time: '18:00', durationMinutes: 210, isTechWeek: true,
        breaks: [],
        attendance: { crew: ['c1', 'c3', 'c4', 'c8', 'c9', 'c10'], actors: ['a1', 'a2', 'a3', 'a5', 'a6'], musicians: [], staff: ['st1'] },
        notes: 'Full dress, no stops unless safety issue. Photo call before top of show.',
      },
      {
        id: 's1-d6', label: 'Strike', date: '2026-08-30', time: '22:30', durationMinutes: 180,
        breaks: [{ id: 's1-d6-b1', label: 'Pizza break', durationMinutes: 20 }],
        attendance: { crew: ['c1', 'c6', 'c7', 'c4'], actors: [], musicians: [], staff: [] },
        notes: 'Full strike to bare stage. Return rented fixtures to shop, label and store scenic elements.',
      },
    ],
    soundEffects: [
      { id: 'sfx1', name: 'Thunder clap', page: '12', comments: 'Cue with lightning flash, LX 3' },
      { id: 'sfx2', name: 'Ship creaking / wave crash', page: '12', comments: 'Loop under storm scene' },
      { id: 'sfx3', name: "Ariel harpy screech", page: '34', comments: 'Stinger, full volume' },
    ],
    choreography: [
      {
        id: 'ch1',
        sceneId: 'sc-s1-1a',
        notes: 'Ensemble moves as the ship\'s crew — stylized, off-balance staggers timed to thunder cues. Build from scattered chaos into a collapsed pile down center by blackout.',
        videoUrl: 'https://vimeo.com/example-tempest-storm-ref',
        videoLabel: 'Reference: devised movement workshop, take 3',
        diagrams: [
          {
            id: 'dg1',
            label: 'Opening scatter',
            markers: [
              { id: 'm1', x: 20, y: 30 },
              { id: 'm2', x: 45, y: 20 },
              { id: 'm3', x: 70, y: 35 },
              { id: 'm4', x: 55, y: 55 },
              { id: 'm5', x: 30, y: 60 },
            ],
          },
          {
            id: 'dg2',
            label: 'Final collapse, DSC',
            markers: [
              { id: 'm6', x: 48, y: 78 },
              { id: 'm7', x: 52, y: 80 },
              { id: 'm8', x: 45, y: 82 },
              { id: 'm9', x: 55, y: 84 },
              { id: 'm10', x: 50, y: 75 },
            ],
          },
        ],
        positions: [
          { id: 'p1', personId: 'a3', label: '' },
          { id: 'p2', personId: '', label: 'Ensemble — Spirit 2' },
          { id: 'p3', personId: '', label: 'Ensemble — Spirit 3' },
          { id: 'p4', personId: '', label: 'Ensemble — Spirit 4' },
          { id: 'p5', personId: '', label: 'Ensemble — Spirit 5' },
        ],
      },
    ],
    setPieces: [
      {
        id: 'sp1',
        name: 'USR Platform Unit',
        description: 'Upstage right platform, 8x8 footprint, 24in high, for shipwreck landing.',
        quantity: 1,
        buildStatus: 'built',
        components: [
          { id: 'spc1', inventoryItemId: 'i13', qtyPerUnit: 2 },
          { id: 'spc2', inventoryItemId: 'i14', qtyPerUnit: 4 },
        ],
        notes: 'Braced for actor weight during storm sequence. Non-skid deck paint applied.',
      },
      {
        id: 'sp2',
        name: "Ship's Prow",
        description: 'Raked platform unit representing the bow of the ship, upstage center.',
        quantity: 1,
        buildStatus: 'in_progress',
        components: [
          { id: 'spc3', inventoryItemId: 'i13', qtyPerUnit: 3 },
          { id: 'spc4', inventoryItemId: 'i14', qtyPerUnit: 6 },
        ],
        notes: 'Rake angle still being adjusted; awaiting final paint.',
      },
      {
        id: 'sp3',
        name: 'Storm Rigging Points',
        description: 'Hard points for storm effects and drop-in scenery over the deck.',
        quantity: 1,
        buildStatus: 'not_started',
        components: [
          { id: 'spc5', inventoryItemId: 'i3', qtyPerUnit: 2 },
        ],
        notes: 'Coordinate install with rigging loft schedule before Q2Q.',
      },
    ],
    acts: [
      {
        id: 'act-s1-1', name: 'Act 1', order: 1,
        scenes: [
          { id: 'sc-s1-1a', name: 'The Storm', type: 'scene', actorIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], notes: 'Shipwreck sequence, full company.' },
          { id: 'sc-s1-1b', name: "Prospero's Cell", type: 'scene', actorIds: ['a1', 'a2'], notes: '' },
          { id: 'sc-s1-1c', name: 'The Banquet', type: 'scene', actorIds: ['a1', 'a3'], notes: 'Illusory feast, spirits attend.' },
        ],
      },
      {
        id: 'act-s1-2', name: 'Act 2', order: 2,
        scenes: [
          { id: 'sc-s1-2a', name: 'The Wedding Masque', type: 'scene', actorIds: ['a1', 'a2', 'a5', 'a6'], notes: '' },
          { id: 'sc-s1-2b', name: 'Epilogue', type: 'scene', actorIds: ['a1'], notes: "Prospero's final address." },
        ],
      },
    ],
    costumes: [
      {
        id: 'co1', actorId: 'a1', sceneId: null, description: "Prospero's Robe",
        source: 'bring_in', inventoryItemId: null, acquired: true, location: 'Costume Shop', cost: 0,
        notes: 'Borrowed from Riverside Community Theatre stock.',
      },
      {
        id: 'co2', actorId: 'a1', sceneId: 'sc-s1-1a', description: 'Weathered Overlay Corset',
        source: 'inventory', inventoryItemId: 'i10', acquired: true, location: 'Costume Shop', cost: 0,
        notes: 'Pulled from stock, distressed for the storm look.',
      },
      {
        id: 'co3', actorId: 'a2', sceneId: 'sc-s1-1a', description: "Miranda's Shipwreck Dress",
        source: 'buy', inventoryItemId: null, acquired: false, location: '', cost: 120,
        notes: 'Ordering from costume supplier, need by tech.',
      },
      {
        id: 'co4', actorId: 'a5', sceneId: null, description: 'Ariel Wing Harness & Bodysuit',
        source: 'buy', inventoryItemId: null, acquired: true, location: 'Costume Shop', cost: 220,
        notes: 'Custom build, fitted for Sam.',
      },
      {
        id: 'co5', actorId: 'a6', sceneId: null, description: 'Ariel Wing Harness & Bodysuit',
        source: 'buy', inventoryItemId: null, acquired: false, location: '', cost: 220,
        notes: 'Matching build for Lee, in progress.',
      },
    ],
    props: [
      {
        id: 'pr1', sceneId: null, description: "Prospero's Magic Staff", actorId: 'a1',
        source: 'build', inventoryItemId: null, acquired: true, consumable: false, location: 'Props Storage', cost: 0,
        notes: 'Carved wood staff with LED tip for magic effects.',
      },
      {
        id: 'pr2', sceneId: 'sc-s1-1b', description: "Prospero's Spellbook", actorId: 'a1',
        source: 'buy', inventoryItemId: null, acquired: false, consumable: false, location: '', cost: 45,
        notes: 'Ordering a leather-bound prop book online.',
      },
      {
        id: 'pr3', sceneId: 'sc-s1-1a', description: "Ship's Wheel", actorId: null,
        source: 'inventory', inventoryItemId: 'i16', acquired: true, consumable: false, location: 'Props Storage', cost: 0,
        notes: 'Breaks down into two pieces for load-in.',
      },
      {
        id: 'pr4', sceneId: null, description: "Ariel's Mirror Shards", actorId: 'a5',
        source: 'build', inventoryItemId: null, acquired: true, consumable: false, location: 'Props Storage', cost: 0,
        notes: 'Safety acrylic, not glass.',
      },
      {
        id: 'pr5', sceneId: 'sc-s1-1c', description: 'Illusory Banquet (goblets, platters)', actorId: null,
        source: 'bring_in', inventoryItemId: null, acquired: false, consumable: false, location: '', cost: 0,
        notes: 'Borrowing period tableware from Riverside Community Theatre.',
      },
      {
        id: 'pr6', sceneId: 'sc-s1-1a', description: 'Breakaway Rum Bottle', actorId: null,
        source: 'buy', inventoryItemId: null, acquired: true, consumable: true, location: 'Props Storage', cost: 18,
        notes: 'Sugar glass — keep at least one spare loaded for every performance.',
      },
    ],
    groups: [
      { id: 'grp-s1-1', personType: 'actor', name: 'Leads', memberIds: ['a1', 'a2'] },
      { id: 'grp-s1-2', personType: 'actor', name: 'Ensemble 1', memberIds: ['a3', 'a4'] },
      { id: 'grp-s1-3', personType: 'actor', name: 'Ariels', memberIds: ['a5', 'a6'] },
      { id: 'grp-s1-4', personType: 'crew', name: 'Electrics', memberIds: ['c1', 'c2', 'c3'] },
    ],
    script: null,
  },
  {
    id: 's2',
    title: 'A Chorus Line',
    venue: 'Mainstage',
    director: 'K. Osei',
    phase: 'run',
    status: 'running',
    openDate: '2026-07-10',
    crewCallToday: '6:30 PM — Half Hour',
    headcountToday: 8,
    schedule: [
      {
        id: 's2-d1', label: 'Load-in', date: '2026-06-20', time: '09:00', durationMinutes: 480,
        breaks: [{ id: 's2-d1-b1', label: 'Lunch', durationMinutes: 30 }],
        attendance: { crew: ['c6', 'c7'], actors: [], musicians: [], staff: [] },
        notes: 'Load in unit set, hang and focus rig for the musical.',
      },
      {
        id: 's2-d2', label: 'Tech Rehearsal', date: '2026-06-30', time: '18:00', durationMinutes: 300,
        breaks: [{ id: 's2-d2-b1', label: 'Dinner break', durationMinutes: 45 }],
        attendance: { crew: ['c3', 'c8', 'c9'], actors: ['a7', 'a8'], musicians: ['m1', 'm2'], staff: ['st5'] },
        notes: 'Tech full musical numbers with orchestra where available.',
      },
      {
        id: 's2-d3', label: 'Opening', date: '2026-07-10', time: '18:30', durationMinutes: 30,
        breaks: [],
        attendance: { crew: ['c3', 'c4', 'c5', 'c8', 'c9'], actors: ['a7', 'a8'], musicians: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'], staff: ['st3', 'st4', 'st5'] },
        notes: 'Opening night half hour. House opens at 7:00 PM.',
      },
      {
        id: 's2-d4', label: 'Strike', date: '2026-08-02', time: '22:30', durationMinutes: 180,
        breaks: [{ id: 's2-d4-b1', label: 'Break', durationMinutes: 15 }],
        attendance: { crew: ['c3', 'c8', 'c9'], actors: [], musicians: [], staff: [] },
        notes: 'Strike set and pack rented sound gear for return.',
      },
    ],
    soundEffects: [
      { id: 'sfx4', name: 'Audition bell', page: '3', comments: 'Single ding, practical prop cue backup' },
    ],
    choreography: [
      {
        id: 'ch2',
        sceneId: 'sc-s2-1b',
        notes: 'Opening audition combination. Straight line upstage, full-company unison 8-counts. Break to scattered individual "audition" poses on the button, then reform the line for the cut.',
        videoUrl: 'https://vimeo.com/example-choreo-opening-combo',
        videoLabel: 'Reference: dance captain walkthrough',
        diagrams: [
          {
            id: 'dg3',
            label: 'Opening line, US',
            markers: [
              { id: 'm11', x: 15, y: 20 },
              { id: 'm12', x: 28, y: 20 },
              { id: 'm13', x: 41, y: 20 },
              { id: 'm14', x: 54, y: 20 },
              { id: 'm15', x: 67, y: 20 },
              { id: 'm16', x: 80, y: 20 },
            ],
          },
          {
            id: 'dg4',
            label: 'Scattered audition poses',
            markers: [
              { id: 'm17', x: 20, y: 45 },
              { id: 'm18', x: 60, y: 30 },
              { id: 'm19', x: 40, y: 60 },
              { id: 'm20', x: 75, y: 55 },
              { id: 'm21', x: 30, y: 75 },
              { id: 'm22', x: 65, y: 78 },
            ],
          },
        ],
        positions: [
          { id: 'p6', personId: 'a7', label: '' },
          { id: 'p7', personId: 'a8', label: '' },
          { id: 'p8', personId: '', label: 'Ensemble — Val' },
          { id: 'p9', personId: '', label: 'Ensemble — Sheila' },
          { id: 'p10', personId: '', label: 'Ensemble — Mike' },
          { id: 'p11', personId: '', label: 'Ensemble — Bobby' },
        ],
      },
      {
        id: 'ch3',
        sceneId: 'sc-s2-2a',
        notes: 'Finale kickline. Gold costumes, full company, evenly spaced downstage line. Sixteen-count kick pattern in unison — hold spacing tight, arms locked.',
        videoUrl: '',
        videoLabel: '',
        diagrams: [
          {
            id: 'dg5',
            label: 'Finale kickline, DS',
            markers: [
              { id: 'm23', x: 10, y: 70 },
              { id: 'm24', x: 24, y: 70 },
              { id: 'm25', x: 38, y: 70 },
              { id: 'm26', x: 52, y: 70 },
              { id: 'm27', x: 66, y: 70 },
              { id: 'm28', x: 80, y: 70 },
              { id: 'm29', x: 94, y: 70 },
            ],
          },
        ],
        positions: [
          { id: 'p12', personId: 'a7', label: '' },
          { id: 'p13', personId: 'a8', label: '' },
          { id: 'p14', personId: '', label: 'Ensemble' },
          { id: 'p15', personId: '', label: 'Ensemble' },
          { id: 'p16', personId: '', label: 'Ensemble' },
          { id: 'p17', personId: '', label: 'Ensemble' },
          { id: 'p18', personId: '', label: 'Ensemble' },
        ],
      },
    ],
    acts: [
      {
        id: 'act-s2-1', name: 'Act 1', order: 1,
        scenes: [
          { id: 'sc-s2-1a', name: 'Audition', type: 'scene', actorIds: ['a7', 'a8'], notes: 'The line, day one.' },
          { id: 'sc-s2-1b', name: 'I Hope I Get It', type: 'number', actorIds: ['a7', 'a8'], notes: '' },
          { id: 'sc-s2-1c', name: 'At the Ballet', type: 'number', actorIds: ['a8'], notes: '' },
        ],
      },
      {
        id: 'act-s2-2', name: 'Act 2', order: 2,
        scenes: [
          { id: 'sc-s2-2a', name: 'One', type: 'number', actorIds: ['a7', 'a8'], notes: 'Finale.' },
        ],
      },
    ],
    setPieces: [],
    costumes: [
      {
        id: 'co6', actorId: 'a7', sceneId: 'sc-s2-2a', description: "Cassie's Red Rehearsal Outfit",
        source: 'buy', inventoryItemId: null, acquired: true, location: 'Costume Shop', cost: 85,
        notes: '',
      },
      {
        id: 'co7', actorId: 'a8', sceneId: 'sc-s2-2a', description: 'Gold Sequin Finale Costume',
        source: 'inventory', inventoryItemId: 'i15', acquired: true, location: 'Costume Shop', cost: 0,
        notes: '',
      },
    ],
    props: [
      {
        id: 'pr7', sceneId: 'sc-s2-1a', description: 'Dance Audition Number Cards', actorId: null,
        source: 'build', inventoryItemId: null, acquired: true, consumable: false, location: 'Props Storage', cost: 0,
        notes: 'Laminated numbered cards for the audition line.',
      },
    ],
    groups: [
      { id: 'grp-s2-1', personType: 'actor', name: 'Leads', memberIds: ['a7'] },
      { id: 'grp-s2-2', personType: 'actor', name: 'Ensemble', memberIds: ['a8'] },
    ],
    script: null,
  },
  {
    id: 's3',
    title: 'Fun Home',
    venue: 'Black Box',
    director: 'M. Chen',
    phase: 'build',
    status: 'standby',
    openDate: '2026-08-10',
    crewCallToday: '1:00 PM — Deck & Paint Call',
    headcountToday: 6,
    schedule: [
      { id: 's3-d1', label: 'Load-in', date: '2026-07-26', time: '09:00', durationMinutes: 480, breaks: [{ id: 's3-d1-b1', label: 'Lunch', durationMinutes: 30 }], attendance: { crew: ['c6', 'c7'], actors: [], musicians: [], staff: [] }, notes: 'Load in and begin deck build.' },
      { id: 's3-d2', label: 'Focus', date: '2026-07-28', time: '09:00', durationMinutes: 180, breaks: [], attendance: { crew: [], actors: [], musicians: [], staff: [] }, notes: '' },
      { id: 's3-d3', label: 'Q2Q', date: '2026-07-30', time: '09:00', durationMinutes: 300, isTechWeek: true, breaks: [{ id: 's3-d3-b1', label: 'Lunch', durationMinutes: 30 }], attendance: { crew: [], actors: [], musicians: [], staff: [] }, notes: '' },
      { id: 's3-d4', label: 'Tech Rehearsal', date: '2026-08-02', time: '18:00', durationMinutes: 240, isTechWeek: true, breaks: [], attendance: { crew: [], actors: [], musicians: [], staff: [] }, notes: '' },
      { id: 's3-d5', label: 'Dress Rehearsal', date: '2026-08-09', time: '18:00', durationMinutes: 210, isTechWeek: true, breaks: [], attendance: { crew: [], actors: [], musicians: [], staff: [] }, notes: '' },
      { id: 's3-d6', label: 'Strike', date: '2026-08-30', time: '22:00', durationMinutes: 150, breaks: [], attendance: { crew: [], actors: [], musicians: [], staff: [] }, notes: '' },
    ],
    soundEffects: [],
    choreography: [],
    acts: [],
    setPieces: [
      {
        id: 'sp4',
        name: 'Family Home Platform',
        description: 'Two-level unit representing the Bechdel family home, staircase connecting levels.',
        quantity: 1,
        buildStatus: 'not_started',
        components: [
          { id: 'spc6', inventoryItemId: 'i13', qtyPerUnit: 4 },
          { id: 'spc7', inventoryItemId: 'i14', qtyPerUnit: 8 },
        ],
        notes: 'Stair unit design still TBD with director.',
      },
    ],
    costumes: [],
    props: [],
    groups: [],
    script: null,
  },
  {
    id: 's4',
    title: 'Our Town',
    venue: 'Black Box',
    director: 'J. Whitfield',
    phase: 'strike',
    status: 'dark',
    openDate: '2026-06-02',
    crewCallToday: '—',
    headcountToday: 0,
    schedule: [
      { id: 's4-d1', label: 'Load-in', date: '2026-05-10', time: '09:00', durationMinutes: 420, breaks: [], attendance: { crew: [], actors: [], musicians: [], staff: [] }, notes: '' },
      { id: 's4-d2', label: 'Strike', date: '2026-06-03', time: '22:00', durationMinutes: 150, breaks: [], attendance: { crew: [], actors: [], musicians: [], staff: [] }, notes: '' },
    ],
    soundEffects: [],
    choreography: [],
    acts: [],
    setPieces: [],
    costumes: [],
    props: [],
    groups: [],
    script: null,
  },
];

const MILESTONE_PRESETS = ['Load-in', 'Focus', 'Q2Q', 'Tech Rehearsal', 'Dress Rehearsal', 'Opening', 'Strike'];

// Each key date on a production's schedule seeds a real call sheet, staffed
// with the roles that milestone typically needs — all open until someone
// signs up.
const MILESTONE_CALL_TEMPLATES = {
  'Load-in': {
    time: '9:00 AM',
    label: 'Load-in',
    slots: [
      { personType: 'crew', role: 'Charge Scenic' },
      { personType: 'crew', role: 'Carpenter' },
      { personType: 'crew', role: 'Carpenter' },
      { personType: 'crew', role: 'Electrician' },
      { personType: 'crew', role: 'General Hand' },
      { personType: 'crew', role: 'General Hand' },
    ],
  },
  Focus: {
    time: '9:00 AM',
    label: 'Focus',
    slots: [
      { personType: 'crew', role: 'Master Electrician' },
      { personType: 'crew', role: 'Electrician' },
      { personType: 'crew', role: 'General Hand' },
    ],
  },
  Q2Q: {
    time: '9:00 AM',
    label: 'Cue-to-Cue',
    slots: [
      { personType: 'crew', role: 'Stage Manager' },
      { personType: 'crew', role: 'Technical Director' },
      { personType: 'crew', role: 'Board Op' },
      { personType: 'crew', role: 'A2' },
      { personType: 'crew', role: 'General Hand' },
    ],
  },
  'Tech Rehearsal': {
    time: '6:00 PM',
    label: 'Tech Rehearsal',
    slots: [
      { personType: 'crew', role: 'Stage Manager' },
      { personType: 'crew', role: 'Technical Director' },
      { personType: 'crew', role: 'Board Op' },
      { personType: 'crew', role: 'A2' },
      { personType: 'crew', role: 'Wardrobe Supervisor' },
      { personType: 'crew', role: 'General Hand' },
    ],
  },
  'Dress Rehearsal': {
    time: '6:00 PM',
    label: 'Dress Rehearsal',
    slots: [
      { personType: 'crew', role: 'Stage Manager' },
      { personType: 'crew', role: 'Board Op' },
      { personType: 'crew', role: 'A2' },
      { personType: 'crew', role: 'Wardrobe Supervisor' },
      { personType: 'crew', role: 'Props Master' },
      { personType: 'crew', role: 'General Hand' },
    ],
  },
  Opening: {
    time: '6:30 PM',
    label: 'Half Hour',
    slots: [
      { personType: 'crew', role: 'Stage Manager' },
      { personType: 'crew', role: 'Board Op' },
      { personType: 'crew', role: 'A2' },
      { personType: 'crew', role: 'General Hand' },
      { personType: 'actor', role: 'Full Cast Call' },
      { personType: 'musician', role: 'Downbeat / Pit Call' },
    ],
  },
  Strike: {
    time: '10:30 PM',
    label: 'Strike',
    slots: [
      { personType: 'crew', role: 'Charge Scenic' },
      { personType: 'crew', role: 'Carpenter' },
      { personType: 'crew', role: 'Carpenter' },
      { personType: 'crew', role: 'Electrician' },
      { personType: 'crew', role: 'General Hand' },
      { personType: 'crew', role: 'General Hand' },
      { personType: 'crew', role: 'General Hand' },
    ],
  },
};

function generateCallsForSchedule(show) {
  return (show.schedule || [])
    .map((item) => {
      const template = MILESTONE_CALL_TEMPLATES[item.label];
      if (!template) return null;
      return {
        id: `call-${item.id}`,
        showId: show.id,
        date: item.date,
        time: item.time ? formatTime12h(item.time) : template.time,
        label: template.label,
        location: show.venue,
        slots: template.slots.map((s, i) => ({ id: `${item.id}-slot-${i}`, personType: s.personType, role: s.role, filledBy: null, attendance: 'pending' })),
      };
    })
    .filter(Boolean);
}

const INITIAL_DEPARTMENTS = {
  electrics: { label: 'Electrics', icon: Zap },
  scenic: { label: 'Scenic', icon: Hammer },
  sound: { label: 'Sound', icon: Volume2 },
  props: { label: 'Props', icon: Package },
  wardrobe: { label: 'Wardrobe', icon: Shirt },
  sm: { label: 'Stage Mgmt', icon: ClipboardList },
  general: { label: 'General Hands', icon: Users },
};
const INITIAL_DEPARTMENT_ORDER = ['sm', 'electrics', 'scenic', 'sound', 'props', 'wardrobe', 'general'];

const seedCrew = [
  { id: 'c1', name: 'Dana Fitch', phone: '555-0142', email: 'dana.fitch@venue.org', assignments: [
    { id: 'asn-c1-s1', showId: 's1', role: 'Master Electrician', dept: 'electrics' },
  ] },
  { id: 'c2', name: 'Priya Nair', phone: '555-0198', email: 'priya.nair@venue.org', assignments: [
    { id: 'asn-c2-s1', showId: 's1', role: 'Electrician', dept: 'electrics' },
  ] },
  { id: 'c3', name: 'Tomas Reyes', phone: '555-0176', email: 'tomas.reyes@venue.org', assignments: [
    { id: 'asn-c3-s1', showId: 's1', role: 'Board Op', dept: 'electrics' },
    { id: 'asn-c3-s2', showId: 's2', role: 'Electrician', dept: 'electrics' },
  ] },
  { id: 'c4', name: 'Sam Okafor', phone: '555-0110', email: 'sam.okafor@venue.org', assignments: [
    { id: 'asn-c4-s1', showId: 's1', role: 'Technical Director', dept: 'sm' },
    { id: 'asn-c4-s2', showId: 's2', role: 'Technical Director', dept: 'sm' },
    { id: 'asn-c4-s3', showId: 's3', role: 'Technical Director', dept: 'sm' },
    { id: 'asn-c4-s4', showId: 's4', role: 'Technical Director', dept: 'sm' },
  ] },
  { id: 'c5', name: 'Wren Castillo', phone: '555-0187', email: 'wren.castillo@venue.org', assignments: [
    { id: 'asn-c5-s2', showId: 's2', role: 'Stage Manager', dept: 'sm' },
  ] },
  { id: 'c6', name: 'Leo Marchetti', phone: '555-0133', email: 'leo.marchetti@venue.org', assignments: [
    { id: 'asn-c6-s3', showId: 's3', role: 'Charge Scenic', dept: 'scenic' },
  ] },
  { id: 'c7', name: 'Ines Bauer', phone: '555-0165', email: 'ines.bauer@venue.org', assignments: [
    { id: 'asn-c7-s3', showId: 's3', role: 'Carpenter', dept: 'scenic' },
  ] },
  { id: 'c8', name: 'Marcus Webb', phone: '555-0154', email: 'marcus.webb@venue.org', assignments: [
    { id: 'asn-c8-s2', showId: 's2', role: 'A2', dept: 'sound' },
  ] },
  { id: 'c9', name: 'Aisha Bello', phone: '555-0121', email: 'aisha.bello@venue.org', assignments: [
    { id: 'asn-c9-s2', showId: 's2', role: 'Wardrobe Supervisor', dept: 'wardrobe' },
  ] },
  { id: 'c10', name: 'Colin Park', phone: '555-0159', email: 'colin.park@venue.org', assignments: [
    { id: 'asn-c10-s1', showId: 's1', role: 'Props Master', dept: 'props' },
    { id: 'asn-c10-s3', showId: 's3', role: 'Carpenter', dept: 'scenic' },
  ] },
];

const INITIAL_CAST_TYPES = {
  lead: { label: 'Lead', icon: Star },
  ensemble: { label: 'Ensemble', icon: Users },
  understudy: { label: 'Understudy', icon: Repeat },
  doubleCast: { label: 'Double Cast', icon: Copy },
};
const INITIAL_CAST_TYPE_ORDER = ['lead', 'ensemble', 'understudy', 'doubleCast'];

const seedActors = [
  { id: 'a1', name: 'Miranda Boyle', assignments: [{ id: 'asn-a1-s1', showId: 's1', roleTitle: 'Prospero', category: 'lead', miced: true, micType: 'Wireless Lav' }] },
  { id: 'a2', name: 'Devon Cruz', assignments: [{ id: 'asn-a2-s1', showId: 's1', roleTitle: 'Miranda', category: 'lead', miced: true, micType: 'Wireless Lav' }] },
  { id: 'a3', name: 'Priya Shah', assignments: [{ id: 'asn-a3-s1', showId: 's1', roleTitle: 'Ensemble — Spirits', category: 'ensemble', miced: false, micType: '' }] },
  { id: 'a4', name: 'Jordan Blake', assignments: [{ id: 'asn-a4-s1', showId: 's1', roleTitle: 'U/S Prospero', category: 'understudy', miced: false, micType: '' }] },
  { id: 'a5', name: 'Sam Rivera', assignments: [{ id: 'asn-a5-s1', showId: 's1', roleTitle: 'Ariel (alternates with Lee)', category: 'doubleCast', miced: true, micType: 'Wireless Headset' }] },
  { id: 'a6', name: 'Lee Park', assignments: [{ id: 'asn-a6-s1', showId: 's1', roleTitle: 'Ariel (alternates with Sam)', category: 'doubleCast', miced: true, micType: 'Wireless Headset' }] },
  { id: 'a7', name: 'Casey Nguyen', assignments: [{ id: 'asn-a7-s2', showId: 's2', roleTitle: 'Cassie', category: 'lead', miced: true, micType: 'Wireless Lav' }] },
  { id: 'a8', name: 'Morgan Diaz', assignments: [{ id: 'asn-a8-s2', showId: 's2', roleTitle: 'Ensemble', category: 'ensemble', miced: true, micType: 'Wireless Lav' }] },
];

const INITIAL_STAFF_AREAS = {
  directing: { label: 'Directing', icon: Megaphone },
  office: { label: 'Back Office', icon: Briefcase },
  other: { label: 'Production Staff', icon: ClipboardList },
};
const INITIAL_STAFF_AREA_ORDER = ['directing', 'office', 'other'];

const seedStaff = [
  { id: 'st1', name: 'R. Alvarez', assignments: [{ id: 'asn-st1-s1', showId: 's1', roleTitle: 'Director', category: 'directing' }] },
  { id: 'st2', name: 'Jamie Ellis', assignments: [{ id: 'asn-st2-s1', showId: 's1', roleTitle: 'Assistant Director', category: 'directing' }] },
  { id: 'st3', name: 'Taylor Grant', assignments: [
    { id: 'asn-st3-s1', showId: 's1', roleTitle: 'Producer', category: 'office' },
    { id: 'asn-st3-s2', showId: 's2', roleTitle: 'Producer', category: 'office' },
  ] },
  { id: 'st4', name: 'Robin Cole', assignments: [{ id: 'asn-st4-s2', showId: 's2', roleTitle: 'House Manager', category: 'office' }] },
  { id: 'st5', name: 'K. Osei', assignments: [{ id: 'asn-st5-s2', showId: 's2', roleTitle: 'Director', category: 'directing' }] },
  { id: 'st6', name: 'Alex Kim', assignments: [{ id: 'asn-st6-s2', showId: 's2', roleTitle: 'Marketing & PR', category: 'other' }] },
];

const INITIAL_MUSIC_SECTIONS = {
  md: { label: 'Music Director', icon: Music },
  keys: { label: 'Keys', icon: Music },
  strings: { label: 'Strings', icon: Music },
  winds: { label: 'Winds/Brass', icon: Music },
  percussion: { label: 'Percussion', icon: Music },
  vocals: { label: 'Vocals', icon: Mic },
};
const INITIAL_MUSIC_SECTION_ORDER = ['md', 'keys', 'strings', 'winds', 'percussion', 'vocals'];

const seedMusicians = [
  { id: 'm1', name: 'Terry Wu', assignments: [{ id: 'asn-m1-s2', showId: 's2', roleTitle: 'Music Director / Conductor', category: 'md', electric: true, monitorMix: true }] },
  { id: 'm2', name: 'Nina Osei', assignments: [{ id: 'asn-m2-s2', showId: 's2', roleTitle: 'Piano 1', category: 'keys', electric: true, monitorMix: true }] },
  { id: 'm3', name: 'Chris Bell', assignments: [{ id: 'asn-m3-s2', showId: 's2', roleTitle: 'Violin', category: 'strings', electric: false, monitorMix: false }] },
  { id: 'm4', name: 'Drew Fitch', assignments: [{ id: 'asn-m4-s2', showId: 's2', roleTitle: 'Reed 1', category: 'winds', electric: false, monitorMix: false }] },
  { id: 'm5', name: 'Sam Okoye', assignments: [{ id: 'asn-m5-s2', showId: 's2', roleTitle: 'Drums/Percussion', category: 'percussion', electric: false, monitorMix: false }] },
  { id: 'm6', name: 'Val Torres', assignments: [{ id: 'asn-m6-s2', showId: 's2', roleTitle: 'Vocal Captain', category: 'vocals', electric: false, monitorMix: false }] },
];

// Look up a person's assignment (role/dept/instrument, per show) — the
// person record itself is platform-level; only the assignment is scoped.
function assignmentFor(person, showId) {
  return (person.assignments || []).find((a) => a.showId === showId) || null;
}

// Person-type metadata for call slots — a slot can be filled from any of
// the four rosters, not just Crew.
const PERSON_TYPES = {
  crew: { label: 'Crew', icon: Users },
  actor: { label: 'Cast', icon: Star },
  staff: { label: 'Staff', icon: Briefcase },
  musician: { label: 'Band', icon: Music },
};
const PERSON_TYPE_ORDER = ['crew', 'actor', 'staff', 'musician'];

const ATTENDANCE_STATUS = {
  pending: { label: 'Pending', color: COLOR.textFaint },
  present: { label: 'Present', color: COLOR.green },
  absent: { label: 'Absent', color: COLOR.slate },
};

const CHOREO_TYPES = {
  song: { label: 'Song', icon: Music },
  scene: { label: 'Scene', icon: Footprints },
};

const BUILD_STATUSES = {
  not_started: { label: 'Not Started', color: COLOR.slate },
  in_progress: { label: 'In Progress', color: COLOR.amber },
  built: { label: 'Built', color: COLOR.blueprint },
  painted: { label: 'Painted', color: COLOR.green },
};
const BUILD_STATUS_ORDER = ['not_started', 'in_progress', 'built', 'painted'];

const COSTUME_SOURCES = {
  inventory: { label: 'From Inventory', icon: Boxes },
  buy: { label: 'Needs to Buy', icon: DollarSign },
  bring_in: { label: 'Bring In', icon: Package },
};
const COSTUME_SOURCE_ORDER = ['inventory', 'buy', 'bring_in'];

const PROP_SOURCES = {
  inventory: { label: 'From Inventory', icon: Boxes },
  buy: { label: 'Needs to Buy', icon: DollarSign },
  build: { label: 'Needs to Build', icon: Hammer },
  bring_in: { label: 'Bring In', icon: Package },
};
const PROP_SOURCE_ORDER = ['inventory', 'buy', 'build', 'bring_in'];

const SCENE_TYPES = {
  scene: { label: 'Scene', icon: Footprints },
  number: { label: 'Musical Number', icon: Music },
};
const SCENE_TYPE_ORDER = ['scene', 'number'];

// Flattens a show's acts into a single list of scenes, each carrying its
// act's name and its number (position within the act) — the canonical list
// everything else (Choreography, Costumes, Props) picks from instead of
// typing a scene name freehand.
function allScenes(show) {
  return (show.acts || []).flatMap((act) => (act.scenes || []).map((sc, i) => ({ ...sc, actId: act.id, actName: act.name, number: i + 1 })));
}
function sceneById(show, sceneId) {
  return allScenes(show).find((sc) => sc.id === sceneId) || null;
}
function sceneLabel(show, sceneId) {
  const sc = sceneById(show, sceneId);
  return sc ? `${sc.actName} — ${sc.number}. ${sc.name}` : 'Throughout / Not scene-specific';
}

function rosterForType(type, rosters) {
  if (type === 'crew') return rosters.crew;
  if (type === 'actor') return rosters.actors;
  if (type === 'staff') return rosters.staff;
  if (type === 'musician') return rosters.musicians;
  return [];
}

function setterForType(type, rosters) {
  if (type === 'crew') return rosters.setCrew;
  if (type === 'actor') return rosters.setActors;
  if (type === 'staff') return rosters.setStaff;
  if (type === 'musician') return rosters.setMusicians;
  return null;
}

function defaultAssignmentFields(type, slotRole) {
  if (type === 'crew') return { role: slotRole, dept: 'general' };
  if (type === 'actor') return { roleTitle: slotRole, category: 'ensemble', miced: false, micType: '' };
  if (type === 'staff') return { roleTitle: slotRole, category: 'other' };
  if (type === 'musician') return { roleTitle: slotRole, category: 'md', electric: false, monitorMix: false };
  return {};
}

const handwrittenCalls = [
  {
    id: 'call1',
    showId: 's1',
    date: TODAY_STR,
    time: '9:00 AM',
    label: 'Focus & Cue-to-Cue',
    location: 'Mainstage',
    sceneIds: ['sc-s1-1a'],
    slots: [
      { id: 'call1-s1', personType: 'crew', role: 'Master Electrician', filledBy: 'c1', attendance: 'present' },
      { id: 'call1-s2', personType: 'crew', role: 'Electrician', filledBy: 'c2', attendance: 'present' },
      { id: 'call1-s3', personType: 'crew', role: 'Board Op', filledBy: 'c3', attendance: 'absent' },
      { id: 'call1-s4', personType: 'crew', role: 'Technical Director', filledBy: 'c4', attendance: 'present' },
      { id: 'call1-s5', personType: 'crew', role: 'Props Master', filledBy: 'c10', attendance: 'present' },
      { id: 'call1-s6', personType: 'crew', role: 'General Hand', filledBy: null, attendance: 'pending' },
      { id: 'call1-s7', personType: 'crew', role: 'General Hand', filledBy: null, attendance: 'pending' },
    ],
  },
  {
    id: 'call2',
    showId: 's3',
    date: TODAY_STR,
    time: '1:00 PM',
    label: 'Deck & Paint Call',
    location: 'Black Box',
    slots: [
      { id: 'call2-s1', personType: 'crew', role: 'Charge Scenic', filledBy: 'c6', attendance: 'pending' },
      { id: 'call2-s2', personType: 'crew', role: 'Carpenter', filledBy: 'c7', attendance: 'pending' },
      { id: 'call2-s3', personType: 'crew', role: 'Technical Director', filledBy: 'c4', attendance: 'pending' },
      { id: 'call2-s4', personType: 'crew', role: 'Carpenter', filledBy: null, attendance: 'pending' },
      { id: 'call2-s5', personType: 'crew', role: 'General Hand', filledBy: null, attendance: 'pending' },
    ],
  },
  {
    id: 'call3',
    showId: 's2',
    date: TODAY_STR,
    time: '6:30 PM',
    label: 'Half Hour',
    location: 'Mainstage',
    slots: [
      { id: 'call3-s1', personType: 'crew', role: 'Board Op', filledBy: 'c3', attendance: 'pending' },
      { id: 'call3-s2', personType: 'crew', role: 'Technical Director', filledBy: 'c4', attendance: 'pending' },
      { id: 'call3-s3', personType: 'crew', role: 'Stage Manager', filledBy: 'c5', attendance: 'pending' },
      { id: 'call3-s4', personType: 'crew', role: 'A2', filledBy: 'c8', attendance: 'pending' },
      { id: 'call3-s5', personType: 'crew', role: 'Wardrobe Supervisor', filledBy: 'c9', attendance: 'pending' },
      { id: 'call3-s6', personType: 'crew', role: 'General Hand', filledBy: null, attendance: 'pending' },
      { id: 'call3-s7', personType: 'actor', role: 'Cassie — Lead', filledBy: 'a7', attendance: 'pending' },
      { id: 'call3-s8', personType: 'actor', role: 'Ensemble Call', filledBy: null, attendance: 'pending' },
      { id: 'call3-s9', personType: 'musician', role: 'Music Director / Downbeat', filledBy: 'm1', attendance: 'pending' },
    ],
  },
];

// Every future key date on a production's schedule already has an open call
// sheet waiting — generated the same way a newly added show's schedule
// would be.
const generatedCalls = seedShows.flatMap((s) => generateCallsForSchedule(s).filter((c) => c.date > TODAY_STR));

const seedCalls = [...handwrittenCalls, ...generatedCalls];

const INITIAL_INVENTORY_CATEGORIES = {
  electrics: { label: 'Electrics', icon: Zap },
  rigging: { label: 'Rigging', icon: Link2 },
  sound: { label: 'Sound', icon: Volume2 },
  scenic: { label: 'Scenic', icon: Hammer },
  props: { label: 'Props', icon: Package },
  wardrobe: { label: 'Wardrobe', icon: Shirt },
  consumables: { label: 'Consumables', icon: Battery },
};
const INITIAL_INVENTORY_CATEGORY_ORDER = ['electrics', 'rigging', 'sound', 'scenic', 'props', 'wardrobe', 'consumables'];

const seedInventory = [
  { id: 'i1', assetNo: 'LX-0142', name: 'ETC Source Four 26° 750W', category: 'electrics', totalQty: 24, location: 'Electrics Cage',
    costPerUnit: 495, purchaseDate: '2023-01-15', purchaseSource: 'BMI Supply', purchaseNotes: 'Bulk order of 24 units for mainstage rep plot.',
    units: [
      { id: 'u-i1-1', status: 'broken', note: 'Lamp failure, needs replacement', date: '2026-07-10' },
      { id: 'u-i1-2', status: 'broken', note: 'Yoke bolt stripped', date: '2026-07-15' },
    ],
    assignments: [
      { id: 'ia1a', showId: 's1', callId: null, qty: 12 },
    ] },
  { id: 'i2', assetNo: 'LX-0210', name: 'Chauvet Rogue R2 Spot', category: 'electrics', totalQty: 8, location: 'Electrics Cage',
    costPerUnit: 1150, purchaseDate: '2024-03-02', purchaseSource: 'Full Compass', purchaseNotes: '',
    units: [
      { id: 'u-i2-1', status: 'repaired', note: 'Fan motor replaced, back in service', date: '2026-07-01' },
    ],
    assignments: [] },
  { id: 'i3', assetNo: 'RG-0087', name: '1-Ton Chain Motor', category: 'rigging', totalQty: 6, location: 'Rigging Loft',
    costPerUnit: 1850, purchaseDate: '2021-06-01', purchaseSource: 'J.R. Clancy', purchaseNotes: 'Rigging package for mainstage grid.',
    units: [],
    assignments: [
      { id: 'ia3a', showId: 's1', callId: null, qty: 4 },
      { id: 'ia3b', showId: 's3', callId: null, qty: 3 },
    ] },
  { id: 'i4', assetNo: 'RG-0033', name: '3/4" Shackle', category: 'rigging', totalQty: 20, location: 'Rigging Loft',
    costPerUnit: 12, purchaseDate: '2021-06-01', purchaseSource: 'J.R. Clancy', purchaseNotes: '',
    units: [],
    assignments: [
      { id: 'ia4a', showId: 's1', callId: null, qty: 5 },
      { id: 'ia4b', showId: 's3', callId: null, qty: 5 },
    ] },
  { id: 'i5', assetNo: 'SND-0055', name: 'Shure SM58', category: 'sound', totalQty: 12, location: 'Sound Booth',
    costPerUnit: 99, purchaseDate: '2022-08-20', purchaseSource: 'Sweetwater', purchaseNotes: '',
    units: [],
    assignments: [
      { id: 'ia5a', showId: 's2', callId: null, qty: 4 },
    ] },
  { id: 'i6', assetNo: 'SND-0021', name: 'QSC K12.2 Powered Speaker', category: 'sound', totalQty: 4, location: 'Sound Booth',
    costPerUnit: 800, purchaseDate: '2020-05-11', purchaseSource: 'Sweetwater', purchaseNotes: '',
    units: [
      { id: 'u-i6-1', status: 'retired', note: 'Water damage from outdoor event, beyond repair', date: '2026-06-01' },
    ],
    assignments: [] },
  { id: 'i7', assetNo: 'SC-0110', name: 'DeWalt Impact Driver', category: 'scenic', totalQty: 6, location: 'Scene Shop',
    costPerUnit: 180, purchaseDate: '', purchaseSource: '', purchaseNotes: '',
    units: [],
    assignments: [
      { id: 'ia7a', showId: 's3', callId: null, qty: 3 },
    ] },
  { id: 'i8', assetNo: 'SC-0044', name: '4x8 Luan Sheet', category: 'scenic', totalQty: 40, location: 'Scene Shop',
    costPerUnit: 22, purchaseDate: '', purchaseSource: '', purchaseNotes: '',
    units: [],
    assignments: [] },
  { id: 'i9', assetNo: 'PR-0019', name: 'Prop Rifle (non-firing)', category: 'props', totalQty: 3, location: 'Props Storage',
    costPerUnit: 340, purchaseDate: '2019-09-01', purchaseSource: 'Weapons Specialists Ltd', purchaseNotes: 'Non-firing replica rifles for period productions.',
    units: [],
    assignments: [
      { id: 'ia9a', showId: 's1', callId: 'call1', qty: 2 },
    ] },
  { id: 'i10', assetNo: 'WD-0072', name: 'Period Corset (M)', category: 'wardrobe', totalQty: 5, location: 'Costume Shop',
    costPerUnit: 0, purchaseDate: '', purchaseSource: '', purchaseNotes: '',
    units: [],
    assignments: [] },
  { id: 'i11', assetNo: 'CN-0004', name: 'Gaffer Tape, 2" Black', category: 'consumables', totalQty: 30, location: 'Shop Stores',
    costPerUnit: 8, purchaseDate: '', purchaseSource: '', purchaseNotes: '',
    units: [],
    assignments: [] },
  { id: 'i12', assetNo: 'CN-0012', name: 'Rosco Gel, #26 Red', category: 'consumables', totalQty: 15, location: 'Shop Stores',
    costPerUnit: 9, purchaseDate: '', purchaseSource: '', purchaseNotes: '',
    units: [],
    assignments: [
      { id: 'ia12a', showId: 's1', callId: 'call1', qty: 15 },
  ] },
  { id: 'i13', assetNo: 'SC-0201', name: 'Platform Top, 4x8 Standard', category: 'scenic', totalQty: 12, location: 'Scene Shop',
    costPerUnit: 220, purchaseDate: '2020-01-10', purchaseSource: 'Shop-built', purchaseNotes: 'Standard TD-built platform tops, 3/4in ply on 2x4 frame.',
    units: [],
    assignments: [] },
  { id: 'i14', assetNo: 'SC-0202', name: 'Platform Leg, 24in', category: 'scenic', totalQty: 24, location: 'Scene Shop',
    costPerUnit: 45, purchaseDate: '2020-01-10', purchaseSource: 'Shop-built', purchaseNotes: '',
    units: [],
    assignments: [] },
  { id: 'i15', assetNo: 'WD-0073', name: 'Gold Sequin Finale Costume', category: 'wardrobe', totalQty: 8, location: 'Costume Shop',
    costPerUnit: 180, purchaseDate: '2024-05-01', purchaseSource: 'Backstage Costume Co', purchaseNotes: 'Ensemble finale looks, various sizes.',
    units: [],
    assignments: [] },
  { id: 'i16', assetNo: 'PR-0044', name: "Ship's Wheel (Prop)", category: 'props', totalQty: 1, location: 'Props Storage',
    costPerUnit: 210, purchaseDate: '2026-07-12', purchaseSource: 'Shop-built', purchaseNotes: 'Built for the storm scene, breaks down for load-in.',
    units: [],
    assignments: [] },
];

const INITIAL_CUE_DEPTS = {
  electrics: { label: 'LX', icon: Zap },
  sound: { label: 'SND', icon: Volume2 },
  rigging: { label: 'FLY', icon: Link2 },
  scenic: { label: 'SCENE', icon: Hammer },
  sm: { label: 'SM', icon: ClipboardList },
};

// A cue's identity is its department + number together (LX 1 and SND 1 are
// different cues that happen to share a number) — num itself is just a
// number, never a department-prefixed string.
// Scripts are kept in memory as base64 (same as everything else in this
// app — nothing persists past a reload without a backend), so PDF bytes
// need converting both ways.
function uint8ArrayToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function cueCode(cue, CUE_DEPTS) {
  return `${CUE_DEPTS[cue.dept]?.label || cue.dept} ${cue.num}`;
}
function isDuplicateCue(cues, dept, num, excludeId) {
  return cues.some((c) => c.id !== excludeId && c.dept === dept && String(c.num) === String(num));
}
function nextCueNumber(cues, dept) {
  const nums = cues.filter((c) => c.dept === dept).map((c) => Number(c.num) || 0);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

const seedCueSheets = {
  s1: [
    { id: 'q1', num: 1, dept: 'electrics', desc: 'House to half', fired: false },
    { id: 'q2', num: 1, dept: 'sound', desc: 'Preshow music fade', fired: false },
    { id: 'q3', num: 2, dept: 'electrics', desc: 'House out, stage to black', fired: false },
    { id: 'q4', num: 1, dept: 'rigging', desc: 'Storm drop in', fired: false },
    { id: 'q5', num: 2, dept: 'sound', desc: 'Thunder & wave effects up', fired: false },
    { id: 'q6', num: 3, dept: 'electrics', desc: 'Shipwreck strobe sequence', fired: false },
    { id: 'q7', num: 1, dept: 'scenic', desc: 'Deck shift to island', fired: false },
  ],
  s2: [
    { id: 'q1', num: 1, dept: 'sound', desc: 'Overture', fired: true },
    { id: 'q2', num: 1, dept: 'electrics', desc: 'Curtain warmers up', fired: true },
    { id: 'q3', num: 2, dept: 'electrics', desc: 'Full stage wash', fired: false },
    { id: 'q4', num: 1, dept: 'scenic', desc: 'Mirror line strike', fired: false },
    { id: 'q5', num: 2, dept: 'sound', desc: 'One, playback track', fired: false },
  ],
};

const seedVenues = ['Mainstage', 'Black Box', 'Studio'];
const seedLocations = ['Electrics Cage', 'Sound Booth', 'Scene Shop', 'Rigging Loft', 'Props Storage', 'Costume Shop', 'Shop Stores'];
const seedInstruments = ['Music Director / Conductor', 'Piano 1', 'Piano 2', 'Violin', 'Viola', 'Cello', 'Bass', 'Guitar', 'Drums/Percussion', 'Reed 1', 'Reed 2', 'Reed 3', 'Trumpet', 'Trombone', 'French Horn', 'Vocal Captain', 'Vocals'];

function itemCheckedOut(item) {
  return (item.assignments || []).reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
}

// Only "broken" and "retired" units are out of service — a "repaired" unit
// has a history note but counts as available again.
function itemOutOfService(item) {
  return (item.units || []).filter((u) => u.status === 'broken' || u.status === 'retired').length;
}

function conditionForItem(item) {
  const checkedOut = itemCheckedOut(item);
  const outOfService = itemOutOfService(item);
  const available = item.totalQty - checkedOut - outOfService;
  if (outOfService > 0 || available <= 0) return 'attention';
  return 'good';
}

// A show's tech week is whichever schedule entries are explicitly marked as
// such — not just "any rehearsal" — spanning from the earliest to the
// latest of those dates.
function techWeekRange(show) {
  const entries = (show.schedule || []).filter((e) => e.isTechWeek && e.date);
  if (entries.length === 0) return null;
  const dates = entries.map((e) => e.date).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

function rangesOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}

// Two assignments only conflict if their shows' tech weeks overlap AND the
// combined quantity they need exceeds what's actually in stock.
function itemConflicts(item, shows) {
  const withRanges = (item.assignments || [])
    .map((a) => {
      const show = shows.find((s) => s.id === a.showId);
      const range = show ? techWeekRange(show) : null;
      return range ? { ...a, range, show } : null;
    })
    .filter(Boolean);

  const conflicts = [];
  const available = item.totalQty - itemOutOfService(item);
  for (let i = 0; i < withRanges.length; i++) {
    for (let j = i + 1; j < withRanges.length; j++) {
      if (rangesOverlap(withRanges[i].range, withRanges[j].range)) {
        if (withRanges[i].qty + withRanges[j].qty > available) {
          conflicts.push({ a: withRanges[i], b: withRanges[j] });
        }
      }
    }
  }
  return conflicts;
}

function daysUntil(dateStr) {
  const diff = Math.ceil((new Date(dateStr) - TODAY) / (1000 * 60 * 60 * 24));
  return diff;
}

function formatShortDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function nextMilestone(schedule) {
  if (!schedule || schedule.length === 0) return null;
  const upcoming = schedule.filter((d) => new Date(d.date + 'T00:00:00') >= TODAY).sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] || null;
}

function formatTime12h(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function parseTime12hTo24h(t) {
  if (!t) return '09:00';
  const match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return '09:00';
  let h = parseInt(match[1], 10);
  const m = match[2];
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
}

function addMinutesToTime(hhmm, minutes) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function formatDuration(mins) {
  if (!mins) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Derives the mic plot, DI list, monitor sends, and playback channels live
// from the actor/musician rosters — never stored separately, so it can't
// drift out of sync with who's actually mic'd or plugged in.
function buildAudioPlot(show, actors, musicians, CAST_TYPE_ORDER, MUSIC_SECTIONS) {
  const micedEntries = actors
    .map((a) => ({ person: a, assignment: assignmentFor(a, show.id) }))
    .filter(({ assignment }) => assignment && assignment.miced)
    .sort((x, y) => CAST_TYPE_ORDER.indexOf(x.assignment.category) - CAST_TYPE_ORDER.indexOf(y.assignment.category) || x.person.name.localeCompare(y.person.name));

  const musicianEntries = musicians
    .map((m) => ({ person: m, assignment: assignmentFor(m, show.id) }))
    .filter(({ assignment }) => assignment);
  const electricEntries = musicianEntries.filter(({ assignment }) => assignment.electric);
  const monitorMixEntries = musicianEntries.filter(({ assignment }) => assignment.monitorMix);

  let ch = 1;
  const micChannels = micedEntries.map(({ person, assignment }) => ({
    channel: ch++, type: 'Mic', name: person.name, detail: assignment.roleTitle, subtype: assignment.micType || 'Wireless Lav',
  }));
  const diChannels = electricEntries.map(({ person, assignment }) => ({
    channel: ch++, type: 'DI', name: person.name, detail: assignment.roleTitle, subtype: MUSIC_SECTIONS[assignment.category]?.label || 'Electric',
  }));
  const playbackChannels = [
    { channel: ch++, type: 'Playback', name: 'SFX Playback L', detail: 'Sound effects', subtype: 'Stereo' },
    { channel: ch++, type: 'Playback', name: 'SFX Playback R', detail: 'Sound effects', subtype: 'Stereo' },
  ];
  const monitorMixes = monitorMixEntries.map(({ person, assignment }) => ({ id: person.id, name: person.name, roleTitle: assignment.roleTitle }));

  return {
    micChannels,
    diChannels,
    playbackChannels,
    monitorMixes,
    all: [...micChannels, ...diChannels, ...playbackChannels],
  };
}

// ---------------------------------------------------------------------------
// PHASE RULE — a tick-strip like a stage-measure, not decoration: it encodes
// where each production actually sits in the build calendar.
// ---------------------------------------------------------------------------
function PhaseRule({ phase }) {
  const activeIndex = PHASES.indexOf(phase);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 14 }}>
      {PHASES.map((p, i) => (
        <div key={p} style={{ flex: 1 }}>
          <div
            style={{
              height: 3,
              background: i <= activeIndex ? COLOR.amber : COLOR.line,
              borderRadius: 1,
            }}
          />
          <div
            className="td-mono"
            style={{
              fontSize: 9,
              marginTop: 4,
              color: i === activeIndex ? COLOR.amber : COLOR.textFaint,
              letterSpacing: '0.05em',
            }}
          >
            {PHASE_LABELS[p].slice(0, 3).toUpperCase()}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SHOW CARD
// ---------------------------------------------------------------------------
function ShowCard({ show, isCurrent, onSetCurrent, onEdit }) {
  const meta = STATUS_META[show.status];
  const dtOpen = daysUntil(show.openDate);
  const [hover, setHover] = useState(false);
  const schedule = show.schedule || [];
  const next = nextMilestone(schedule);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? COLOR.cardHover : COLOR.card,
        border: `1px solid ${isCurrent ? COLOR.amber : COLOR.line}`,
        borderRadius: 4,
        padding: '18px 18px 16px',
        transition: 'background 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="td-mono" style={{ fontSize: 10, color: COLOR.blueprint, letterSpacing: '0.08em', marginBottom: 4 }}>
            {show.venue.toUpperCase()}
          </div>
          <h3 className="td-display" style={{ fontSize: 20, fontWeight: 600, color: COLOR.textPrimary, letterSpacing: '0.02em', margin: 0 }}>
            {show.title}
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {onEdit && (
            <button
              className="td-focusable"
              onClick={onEdit}
              title="Edit production"
              aria-label="Edit production"
              style={{ background: 'none', border: 'none', padding: 0, marginRight: 2, cursor: 'pointer', color: COLOR.textFaint, display: 'flex' }}
            >
              <Pencil size={13} />
            </button>
          )}
          <span
            className={meta.cls}
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: meta.color,
              display: 'inline-block',
            }}
          />
          <span className="td-mono" style={{ fontSize: 10, color: meta.color, letterSpacing: '0.05em' }}>
            {meta.label.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="td-body" style={{ fontSize: 13, color: COLOR.textMuted, marginTop: 10 }}>
        Directed by {show.director}
      </div>

      <PhaseRule phase={show.phase} />

      <div style={{ marginTop: 14 }}>
        <span className="td-mono" style={{ fontSize: 10, color: next ? COLOR.amber : COLOR.textFaint, letterSpacing: '0.04em' }}>
          {next ? `NEXT: ${next.label.toUpperCase()} · ${formatShortDate(next.date)}` : schedule.length > 0 ? 'SCHEDULE COMPLETE' : 'NO SCHEDULE YET'}
        </span>
      </div>

      <div
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: `1px solid ${COLOR.line}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <div>
          <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, marginBottom: 3 }}>TODAY'S CALL</div>
          <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textPrimary }}>{show.crewCallToday}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="td-mono" style={{ fontSize: 22, color: dtOpen >= 0 && dtOpen <= 7 ? COLOR.amber : COLOR.textPrimary, lineHeight: 1 }}>
            {dtOpen > 0 ? dtOpen : dtOpen === 0 ? 'OPENS' : '—'}
          </div>
          <div className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.05em' }}>
            {dtOpen > 0 ? 'DAYS TO OPEN' : dtOpen === 0 ? 'TONIGHT' : 'CLOSED'}
          </div>
        </div>
      </div>

      <button
        onClick={onSetCurrent}
        disabled={isCurrent}
        className="td-focusable"
        style={{
          marginTop: 14,
          width: '100%',
          background: isCurrent ? 'transparent' : COLOR.panel,
          color: isCurrent ? COLOR.amber : COLOR.textMuted,
          border: `1px solid ${isCurrent ? COLOR.amberDim : COLOR.line}`,
          borderRadius: 3,
          padding: '7px 0',
          fontSize: 11.5,
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          letterSpacing: '0.02em',
          cursor: isCurrent ? 'default' : 'pointer',
        }}
      >
        {isCurrent ? "You're working on this" : 'Work on this show'}
      </button>
    </div>
  );
}

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
  'dashboard', 'schedule', 'scenes', 'crew', 'actors', 'musicians', 'staff',
  'choreography', 'costumes', 'props', 'calls', 'audio', 'inventory', 'set',
  'runofshow', 'script', 'settings',
];

// ---------------------------------------------------------------------------
// GET STARTED — the order a show actually gets built in. Each step leans on
// the ones above it: scenes before anything that references a scene, schedule
// before calls, cast before the audio plot. Steps tick themselves off from
// real data rather than from a checkbox someone has to remember to tick.
// ---------------------------------------------------------------------------
function GetStarted({ steps, onGo, hasShow }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('td-getstarted-collapsed') === '1';
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('td-getstarted-collapsed', next ? '1' : '0');
      } catch {
        // Private browsing — collapsing just won't be remembered.
      }
      return next;
    });
  };

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div style={{ background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '16px 18px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>Get started</div>
          <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginTop: 4 }}>
            Build a show in this order and nothing has to be redone.
            {hasShow ? '' : ' Create a production below to unlock the show-specific steps.'}
          </div>
        </div>
        <button
          onClick={toggle}
          className="td-focusable"
          style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, fontSize: 11, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {doneCount}/{steps.length} · {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 14 }}>
          {steps.map((step, i) => (
            <button
              key={step.label}
              onClick={() => onGo(step.target)}
              className="td-focusable"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'transparent', border: 'none', borderRadius: 3, padding: '8px', cursor: 'pointer', textAlign: 'left' }}
            >
              <span className="td-mono" style={{ width: 22, flexShrink: 0, fontSize: 11, color: step.done ? COLOR.green : COLOR.textFaint, paddingTop: 2 }}>
                {step.done ? '✓' : String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ flex: 1 }}>
                <span className="td-body" style={{ display: 'block', fontSize: 13, color: step.done ? COLOR.textMuted : COLOR.textPrimary }}>{step.label}</span>
                <span className="td-body" style={{ display: 'block', fontSize: 11.5, color: COLOR.textFaint, marginTop: 2 }}>{step.note}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MembersPanel({ orgId, sectionTitle, sectionNote }) {
  const [members, setMembers] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    const { data: userData } = await supabase.auth.getUser();
    setMe(userData?.user?.id || null);
    const { data, error: err } = await supabase.rpc('org_members_list', { check_org_id: orgId });
    if (err) {
      setError(err.message);
      return;
    }
    setError('');
    setMembers(data || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const admins = (members || []).filter((m) => m.role === 'admin');
  const iAmAdmin = !!members && members.some((m) => m.user_id === me && m.role === 'admin');

  const changeRole = async (member, role) => {
    setBusyId(member.user_id);
    const { error: err } = await supabase.from('org_members').update({ role }).eq('org_id', orgId).eq('user_id', member.user_id);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  };

  const removeMember = async (member) => {
    setBusyId(member.user_id);
    const { error: err } = await supabase.from('org_members').delete().eq('org_id', orgId).eq('user_id', member.user_id);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Users size={14} color={COLOR.textMuted} strokeWidth={1.75} />
        <span className="td-display" style={sectionTitle}>Members</span>
      </div>
      <div className="td-body" style={sectionNote}>
        Everyone with an account on this company. The rosters under Crew, Actors, Musicians and Staff are a different list — those are people you schedule, not people who sign in.
      </div>

      {error && (
        <div className="td-body" style={{ ...sectionNote, color: COLOR.amber }}>{error}</div>
      )}

      {members === null ? (
        <div className="td-body" style={sectionNote}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 640 }}>
          {members.map((m) => {
            const isMe = m.user_id === me;
            const lastAdmin = m.role === 'admin' && admins.length === 1;
            return (
              <div
                key={m.user_id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '8px 10px' }}
              >
                <span className="td-body" style={{ flex: 1, fontSize: 12.5, color: COLOR.textPrimary }}>
                  {m.email}{isMe ? ' (you)' : ''}
                </span>
                <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>
                  JOINED {new Date(m.joined_at).toLocaleDateString()}
                </span>
                {iAmAdmin ? (
                  <select
                    className="td-focusable"
                    value={m.role}
                    disabled={busyId === m.user_id || lastAdmin}
                    onChange={(e) => changeRole(m, e.target.value)}
                    style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textPrimary, fontSize: 11.5, padding: '4px 6px' }}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                ) : (
                  <span className="td-mono" style={{ fontSize: 10, color: COLOR.textMuted }}>{m.role.toUpperCase()}</span>
                )}
                {iAmAdmin && !isMe && (
                  <button
                    className="td-focusable"
                    disabled={busyId === m.user_id || lastAdmin}
                    onClick={() => removeMember(m)}
                    style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textFaint, fontSize: 11, padding: '4px 8px', cursor: busyId === m.user_id || lastAdmin ? 'not-allowed' : 'pointer' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {members !== null && admins.length === 1 && (
        <div className="td-body" style={{ ...sectionNote, color: COLOR.textFaint }}>
          The last admin can't be demoted or removed — promote someone else first.
        </div>
      )}
    </div>
  );
}

function EditShowForm({ show, venues, onSave, onClose }) {
  const [title, setTitle] = useState(show.title || '');
  const [venue, setVenue] = useState(show.venue || venues[0] || 'Mainstage');
  const [director, setDirector] = useState(show.director === 'Unassigned' ? '' : show.director || '');
  const [phase, setPhase] = useState(show.phase || 'design');
  const [status, setStatus] = useState(show.status || 'standby');
  const [openDate, setOpenDate] = useState(show.openDate || '');

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>Edit production</div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>TITLE</label>
          <input className="td-focusable" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>VENUE</label>
          <select className="td-focusable" style={inputStyle} value={venue} onChange={(e) => setVenue(e.target.value)}>
            {(venues.includes(venue) ? venues : [venue, ...venues]).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>OPENS</label>
          <input className="td-focusable" type="date" style={inputStyle} value={openDate} onChange={(e) => setOpenDate(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>DIRECTOR</label>
          <input className="td-focusable" style={inputStyle} value={director} onChange={(e) => setDirector(e.target.value)} placeholder="Unassigned" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>PHASE</label>
          <select className="td-focusable" style={inputStyle} value={phase} onChange={(e) => setPhase(e.target.value)}>
            {PHASES.map((p) => (
              <option key={p} value={p}>{PHASE_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>STATUS</label>
          <select className="td-focusable" style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        className="td-focusable"
        disabled={!title.trim()}
        onClick={() => {
          onSave({
            title: title.trim(),
            venue,
            director: director.trim() || 'Unassigned',
            phase,
            status,
            openDate,
          });
        }}
        style={{
          marginTop: 14,
          background: title.trim() ? COLOR.amber : COLOR.slateDim,
          color: title.trim() ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: title.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        Save changes
      </button>
    </div>
  );
}

function NewShowForm({ venues, onAdd, onClose }) {
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState(venues[0] || 'Mainstage');
  const [openDate, setOpenDate] = useState('2026-09-01');

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>Add production</div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>TITLE</label>
          <input className="td-focusable" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Show title" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>VENUE</label>
          <select className="td-focusable" style={inputStyle} value={venue} onChange={(e) => setVenue(e.target.value)}>
            {venues.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>OPENS</label>
          <input className="td-focusable" type="date" style={inputStyle} value={openDate} onChange={(e) => setOpenDate(e.target.value)} />
        </div>
      </div>

      <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginTop: 12 }}>
        Load-in, rehearsals, and strike get built out in the Schedule section once this show is on the board.
      </div>

      <button
        className="td-focusable"
        disabled={!title.trim()}
        onClick={() => {
          onAdd({
            id: `s${Date.now()}`,
            title: title.trim(),
            venue,
            director: 'Unassigned',
            phase: 'design',
            status: 'standby',
            openDate,
            crewCallToday: '—',
            headcountToday: 0,
            schedule: [],
          });
        }}
        style={{
          marginTop: 14,
          background: title.trim() ? COLOR.amber : COLOR.slateDim,
          color: title.trim() ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: title.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        Add to board
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CALL SHEET CARD — one production's call for today, posted the way it would
// be on an actual callboard: time first, largest, in mono.
// ---------------------------------------------------------------------------
function CallCard({ call, show, rosters, currentIds, inventory, onSignUp, onWithdraw, onAddSlot, onSetAttendance, onEdit, showDate }) {
  const [addingSlot, setAddingSlot] = useState(false);
  const [newSlotType, setNewSlotType] = useState('crew');
  const [newSlotRole, setNewSlotRole] = useState('');
  const filledCount = call.slots.filter((s) => s.filledBy).length;
  const linkedGear = inventory.filter((i) => (i.assignments || []).some((a) => a.callId === call.id));
  const scenes = (call.sceneIds || []).map((id) => sceneById(show, id)).filter(Boolean);

  return (
    <div style={{ display: 'flex', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, overflow: 'hidden' }}>
      <div
        style={{
          width: 92,
          flexShrink: 0,
          background: COLOR.panel,
          borderRight: `1px solid ${COLOR.line}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 6px',
        }}
      >
        {showDate && (
          <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.04em', marginBottom: 2 }}>
            {formatShortDate(call.date).toUpperCase()}
          </span>
        )}
        <span className="td-mono" style={{ fontSize: 15, color: COLOR.amber, textAlign: 'center', lineHeight: 1.3 }}>
          {call.time}
        </span>
      </div>
      <div style={{ flex: 1, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
          <div className="td-display" style={{ fontSize: 15, color: COLOR.textPrimary, letterSpacing: '0.02em' }}>
            {call.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>{filledCount}/{call.slots.length} FILLED</span>
            <span className="td-mono" style={{ fontSize: 10, color: COLOR.blueprint, letterSpacing: '0.05em' }}>{call.location.toUpperCase()}</span>
            <button onClick={onEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Edit call">
              <Pencil size={12} />
            </button>
          </div>
        </div>

        {scenes.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
            {scenes.map((sc) => (
              <span key={sc.id} className="td-mono" style={{ fontSize: 9.5, color: COLOR.blueprint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '2px 7px' }}>
                {sc.actName} — {sc.number}. {sc.name}
              </span>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
          {call.slots.map((slot) => {
            const roster = rosterForType(slot.personType, rosters);
            const person = slot.filledBy ? roster.find((p) => p.id === slot.filledBy) : null;
            const myId = currentIds[slot.personType];
            const isMe = slot.filledBy && slot.filledBy === myId;
            const TypeIcon = PERSON_TYPES[slot.personType].icon;
            const attendance = slot.attendance || 'pending';
            return (
              <div
                key={slot.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 0',
                  borderTop: `1px solid ${COLOR.line}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: 62, flexShrink: 0 }}>
                  <TypeIcon size={11} color={COLOR.textFaint} strokeWidth={1.75} />
                  <span className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.03em' }}>
                    {PERSON_TYPES[slot.personType].label.toUpperCase()}
                  </span>
                </div>
                <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, flex: 1 }}>{slot.role}</span>
                {person ? (
                  <span className="td-mono" style={{ fontSize: 11, color: isMe ? COLOR.amber : COLOR.textPrimary, flexShrink: 0 }}>
                    {person.name}{isMe ? ' · you' : ''}
                  </span>
                ) : (
                  <span className="td-mono" style={{ fontSize: 10, color: COLOR.green, flexShrink: 0 }}>OPEN</span>
                )}
                {person && (
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button
                      onClick={() => onSetAttendance(call.id, slot.id, attendance === 'present' ? 'pending' : 'present')}
                      className="td-focusable"
                      style={{ background: 'none', border: 'none', color: attendance === 'present' ? COLOR.green : COLOR.textFaint, cursor: 'pointer', display: 'flex', padding: 2 }}
                      aria-label={`Mark ${person.name} present`}
                      title="Mark present"
                    >
                      <UserCheck size={13} />
                    </button>
                    <button
                      onClick={() => onSetAttendance(call.id, slot.id, attendance === 'absent' ? 'pending' : 'absent')}
                      className="td-focusable"
                      style={{ background: 'none', border: 'none', color: attendance === 'absent' ? COLOR.slate : COLOR.textFaint, cursor: 'pointer', display: 'flex', padding: 2 }}
                      aria-label={`Mark ${person.name} absent`}
                      title="Mark absent"
                    >
                      <UserX size={13} />
                    </button>
                  </div>
                )}
                <div style={{ width: 84, flexShrink: 0, textAlign: 'right' }}>
                  {isMe ? (
                    <button
                      onClick={() => onWithdraw(call.id, slot.id)}
                      className="td-focusable"
                      style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 10.5, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Cancel
                    </button>
                  ) : !person && myId ? (
                    <button
                      onClick={() => onSignUp(call.id, slot.id)}
                      className="td-focusable"
                      style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '3px 10px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Sign up
                    </button>
                  ) : !person ? (
                    <span className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint }}>
                      Sign in as {PERSON_TYPES[slot.personType].label.toLowerCase()}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {linkedGear.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLOR.line}` }}>
            <div className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.04em', marginBottom: 6 }}>GEAR PULLED</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {linkedGear.map((item) => (
                <span
                  key={item.id}
                  className="td-mono"
                  style={{ fontSize: 10, color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '3px 8px' }}
                >
                  {item.assetNo} · {item.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {addingSlot ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLOR.line}`, flexWrap: 'wrap' }}>
            <select
              className="td-focusable"
              value={newSlotType}
              onChange={(e) => setNewSlotType(e.target.value)}
              style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 8px', color: COLOR.textPrimary, fontSize: 11.5 }}
            >
              {PERSON_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>{PERSON_TYPES[t].label}</option>
              ))}
            </select>
            <input
              className="td-focusable"
              value={newSlotRole}
              onChange={(e) => setNewSlotRole(e.target.value)}
              placeholder="Role, e.g. General Hand"
              style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 8px', color: COLOR.textPrimary, fontSize: 11.5, flex: 1, minWidth: 140 }}
            />
            <button
              onClick={() => {
                if (!newSlotRole.trim()) return;
                onAddSlot(call.id, newSlotType, newSlotRole.trim());
                setNewSlotRole('');
                setAddingSlot(false);
              }}
              disabled={!newSlotRole.trim()}
              className="td-focusable"
              style={{ background: newSlotRole.trim() ? COLOR.amber : COLOR.slateDim, color: newSlotRole.trim() ? COLOR.void : COLOR.textFaint, border: 'none', borderRadius: 3, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: newSlotRole.trim() ? 'pointer' : 'not-allowed' }}
            >
              Add
            </button>
            <button
              onClick={() => setAddingSlot(false)}
              className="td-focusable"
              style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingSlot(true)}
            className="td-focusable"
            style={{ background: 'none', border: 'none', color: COLOR.blueprint, fontSize: 11, cursor: 'pointer', marginTop: 10, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Plus size={12} /> Add a slot
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROSTER ROW
// ---------------------------------------------------------------------------
function RosterRow({ member, show, shows, setCrew, DEPARTMENTS, DEPARTMENT_ORDER }) {
  const [editing, setEditing] = useState(false);
  const assignment = show ? assignmentFor(member, show.id) : null;
  const history = show ? (member.assignments || []).filter((a) => a.showId !== show.id) : (member.assignments || []);
  const [draft, setDraft] = useState({
    name: member.name,
    phone: member.phone,
    email: member.email,
    role: assignment?.role || '',
    dept: assignment?.dept || DEPARTMENT_ORDER[0],
  });

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '6px 9px',
    color: COLOR.textPrimary,
    fontSize: 12.5,
    width: '100%',
  };
  const labelStyle = { fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  function startEdit() {
    setDraft({
      name: member.name,
      phone: member.phone,
      email: member.email,
      role: assignment?.role || '',
      dept: assignment?.dept || DEPARTMENT_ORDER[0],
    });
    setEditing(true);
  }
  function save() {
    setCrew((prev) =>
      prev.map((m) => {
        if (m.id !== member.id) return m;
        if (!show) return { ...m, name: draft.name.trim(), phone: draft.phone, email: draft.email };
        const others = (m.assignments || []).filter((a) => a.showId !== show.id);
        const newAssignment = { id: assignment?.id || `asn-${m.id}-${show.id}`, showId: show.id, role: draft.role.trim(), dept: draft.dept };
        return { ...m, name: draft.name.trim(), phone: draft.phone, email: draft.email, assignments: [...others, newAssignment] };
      })
    );
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ padding: '12px 4px', borderBottom: `1px solid ${COLOR.line}`, background: COLOR.panel }}>
        {show && (
          <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.blueprint, letterSpacing: '0.04em', marginBottom: 8 }}>
            ROLE & DEPARTMENT ARE SPECIFIC TO {show.title.toUpperCase()}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: show ? '1.2fr 1.2fr 1fr' : '1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>NAME</label>
            <input className="td-focusable" style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          {show && (
            <>
              <div>
                <label className="td-mono" style={labelStyle}>ROLE (THIS SHOW)</label>
                <input className="td-focusable" style={inputStyle} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
              </div>
              <div>
                <label className="td-mono" style={labelStyle}>DEPARTMENT (THIS SHOW)</label>
                <select className="td-focusable" style={inputStyle} value={draft.dept} onChange={(e) => setDraft({ ...draft, dept: e.target.value })}>
                  {DEPARTMENT_ORDER.map((d) => (
                    <option key={d} value={d}>{DEPARTMENTS[d].label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>PHONE</label>
            <input className="td-focusable" style={inputStyle} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>EMAIL</label>
            <input className="td-focusable" style={inputStyle} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </div>
        </div>
        {history.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <label className="td-mono" style={labelStyle}>{show ? 'HISTORY (OTHER SHOWS)' : 'SHOW HISTORY'}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {history.map((a) => {
                const s = shows.find((sh) => sh.id === a.showId);
                return (
                  <span key={a.id} className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '3px 8px' }}>
                    {s ? s.title : a.showId} — {a.role}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={save}
            disabled={!draft.name.trim() || (!!show && !draft.role.trim())}
            className="td-focusable"
            style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="td-focusable"
            style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 14px', fontSize: 11.5, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 4px',
        borderBottom: `1px solid ${COLOR.line}`,
        gap: 12,
      }}
    >
      <div style={{ minWidth: 160 }}>
        <div className="td-body" style={{ fontSize: 13.5, color: COLOR.textPrimary, fontWeight: 500 }}>{member.name}</div>
        {show && (
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 2, fontStyle: assignment ? 'normal' : 'italic' }}>
            {assignment ? assignment.role : `Not on ${show.title}`}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
        {history.map((a) => {
          const s = shows.find((sh) => sh.id === a.showId);
          return (
            <span
              key={a.id}
              className="td-mono"
              style={{ fontSize: 9.5, color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '2px 6px' }}
            >
              {s ? s.title : a.showId} — {a.role}
            </span>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
        <a href={`tel:${member.phone}`} className="td-focusable" style={{ color: COLOR.textFaint }} aria-label={`Call ${member.name}`}>
          <Phone size={13} strokeWidth={1.75} />
        </a>
        <a href={`mailto:${member.email}`} className="td-focusable" style={{ color: COLOR.textFaint }} aria-label={`Email ${member.name}`}>
          <Mail size={13} strokeWidth={1.75} />
        </a>
        {!show || assignment ? (
          <button onClick={startEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${member.name}`}>
            <Pencil size={13} strokeWidth={1.75} />
          </button>
        ) : (
          <button
            onClick={startEdit}
            className="td-focusable"
            style={{ background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '3px 9px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}
          >
            Add to show
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW CREW MEMBER FORM
// ---------------------------------------------------------------------------
function NewCrewForm({ show, onAdd, onClose, DEPARTMENTS, DEPARTMENT_ORDER }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('electrics');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {show ? `Add to ${show.title}` : 'Add to company roster'}
        </div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: show ? '1.4fr 1.4fr 1fr' : '1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>NAME</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        {show && (
          <>
            <div>
              <label className="td-mono" style={labelStyle}>ROLE (THIS SHOW)</label>
              <input className="td-focusable" style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Board Op" />
            </div>
            <div>
              <label className="td-mono" style={labelStyle}>DEPARTMENT</label>
              <select className="td-focusable" style={inputStyle} value={dept} onChange={(e) => setDept(e.target.value)}>
                {DEPARTMENT_ORDER.map((d) => (
                  <option key={d} value={d}>{DEPARTMENTS[d].label}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>PHONE (IF NEW)</label>
          <input className="td-focusable" style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-0100" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>EMAIL (IF NEW)</label>
          <input className="td-focusable" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@venue.org" />
        </div>
      </div>
      <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginTop: 10 }}>
        {show
          ? `If this name matches someone already on the roster, this just adds them to ${show.title} — it won't create a duplicate person.`
          : "Adds a baseline company member with no show assigned yet. Pick a show later to give them a role."}
      </div>
      <button
        className="td-focusable"
        disabled={!name.trim() || (!!show && !role.trim())}
        onClick={() => onAdd({ name: name.trim(), role: role.trim(), dept, phone: phone.trim() || '—', email: email.trim() || '—' })}
        style={{
          marginTop: 14,
          background: name.trim() && (!show || role.trim()) ? COLOR.amber : COLOR.slateDim,
          color: name.trim() && (!show || role.trim()) ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: name.trim() && (!show || role.trim()) ? 'pointer' : 'not-allowed',
        }}
      >
        Add to roster
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IDENTITY — lightweight self-service sign-in, scoped to the show currently
// selected. Matches an existing platform person by name; if they're not yet
// linked to this show, prompts only for the show-specific role.
// ---------------------------------------------------------------------------
function IdentitySignIn({ show, crew, setCrew, currentUserId, setCurrentUserId, DEPARTMENTS, DEPARTMENT_ORDER }) {
  const currentUser = crew.find((c) => c.id === currentUserId);
  const currentAssignment = currentUser ? assignmentFor(currentUser, show.id) : null;
  const [name, setName] = useState('');
  const [step, setStep] = useState('name');
  const [matchedPerson, setMatchedPerson] = useState(null);
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('general');

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  if (currentUser && currentAssignment) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: COLOR.card,
          border: `1px solid ${COLOR.lineBright}`,
          borderRadius: 4,
          padding: '10px 16px',
          marginBottom: 20,
        }}
      >
        <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary }}>
          Signed in as <strong>{currentUser.name}</strong>
          <span className="td-mono" style={{ fontSize: 11, color: COLOR.textFaint, marginLeft: 8 }}>
            {currentAssignment.role} · {DEPARTMENTS[currentAssignment.dept]?.label} · {show.title}
          </span>
        </span>
        <button
          onClick={() => setCurrentUserId(null)}
          className="td-focusable"
          style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}
        >
          Not you? Sign out
        </button>
      </div>
    );
  }

  function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = crew.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing && assignmentFor(existing, show.id)) {
      setCurrentUserId(existing.id);
    } else if (existing) {
      setMatchedPerson(existing);
      setStep('link');
    } else {
      setMatchedPerson(null);
      setStep('new');
    }
  }

  function handleJoin() {
    if (!role.trim()) return;
    if (matchedPerson) {
      const newAssignment = { id: `asn-${matchedPerson.id}-${show.id}`, showId: show.id, role: role.trim(), dept };
      setCrew((prev) => prev.map((c) => (c.id === matchedPerson.id ? { ...c, assignments: [...(c.assignments || []), newAssignment] } : c)));
      setCurrentUserId(matchedPerson.id);
    } else {
      const newId = `c${Date.now()}`;
      const newAssignment = { id: `asn-${newId}-${show.id}`, showId: show.id, role: role.trim(), dept };
      setCrew((prev) => [...prev, { id: newId, name: name.trim(), phone: '—', email: '—', assignments: [newAssignment] }]);
      setCurrentUserId(newId);
    }
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 16, marginBottom: 20 }}>
      {step === 'name' ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ flex: 1, maxWidth: 260 }}>
            <label className="td-mono" style={labelStyle}>WHO'S SIGNING ON?</label>
            <input
              className="td-focusable"
              style={{ ...inputStyle, width: '100%' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
              placeholder="Type your name"
            />
          </div>
          <button
            onClick={handleContinue}
            disabled={!name.trim()}
            className="td-focusable"
            style={{
              background: name.trim() ? COLOR.amber : COLOR.slateDim,
              color: name.trim() ? COLOR.void : COLOR.textFaint,
              border: 'none',
              borderRadius: 3,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: name.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Continue
          </button>
        </div>
      ) : (
        <div>
          <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, marginBottom: 12 }}>
            {step === 'link'
              ? `${matchedPerson.name} is on the company roster but not yet linked to ${show.title} — what's your role here?`
              : `${name} isn't on the roster yet — finish your profile to sign up for calls.`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="td-mono" style={labelStyle}>ROLE ON {show.title.toUpperCase()}</label>
              <input className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Electrician, or just Flex" />
            </div>
            <div>
              <label className="td-mono" style={labelStyle}>DEPARTMENT</label>
              <select className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={dept} onChange={(e) => setDept(e.target.value)}>
                {DEPARTMENT_ORDER.map((d) => (
                  <option key={d} value={d}>{DEPARTMENTS[d].label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleJoin}
              disabled={!role.trim()}
              className="td-focusable"
              style={{
                background: role.trim() ? COLOR.amber : COLOR.slateDim,
                color: role.trim() ? COLOR.void : COLOR.textFaint,
                border: 'none',
                borderRadius: 3,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: role.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {step === 'link' ? `Join ${show.title}` : 'Join the crew'}
            </button>
            <button
              onClick={() => setStep('name')}
              className="td-focusable"
              style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CrewModule({ show, shows, crew, setCrew, currentUserId, setCurrentUserId, DEPARTMENTS, DEPARTMENT_ORDER }) {
  const [showForm, setShowForm] = useState(false);
  const onShow = show ? crew.filter((m) => assignmentFor(m, show.id)) : [];
  const notOnShow = show ? crew.filter((m) => !assignmentFor(m, show.id)) : crew;

  const byDept = useMemo(() => {
    if (!show) return {};
    const grouped = {};
    DEPARTMENT_ORDER.forEach((d) => (grouped[d] = []));
    onShow.forEach((m) => {
      const a = assignmentFor(m, show.id);
      if (!grouped[a.dept]) grouped[a.dept] = [];
      grouped[a.dept].push(m);
    });
    return grouped;
  }, [onShow, show]);

  function handleManualAdd({ name, role, dept, phone, email }) {
    const existing = crew.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (show) {
      if (existing) {
        const newAssignment = { id: `asn-${existing.id}-${show.id}`, showId: show.id, role, dept };
        setCrew((prev) => prev.map((c) => (c.id === existing.id ? { ...c, assignments: [...(c.assignments || []).filter((a) => a.showId !== show.id), newAssignment] } : c)));
      } else {
        const newId = `c${Date.now()}`;
        const newAssignment = { id: `asn-${newId}-${show.id}`, showId: show.id, role, dept };
        setCrew((prev) => [...prev, { id: newId, name, phone, email, assignments: [newAssignment] }]);
      }
    } else if (!existing) {
      const newId = `c${Date.now()}`;
      setCrew((prev) => [...prev, { id: newId, name, phone, email, assignments: [] }]);
    }
    setShowForm(false);
  }

  return (
    <div>
      {show && <IdentitySignIn show={show} crew={crew} setCrew={setCrew} currentUserId={currentUserId} setCurrentUserId={setCurrentUserId} DEPARTMENTS={DEPARTMENTS} DEPARTMENT_ORDER={DEPARTMENT_ORDER} />}

      {!show && (
        <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginBottom: 16 }}>
          No show selected — showing the full company roster. Pick a show from the sidebar to assign roles and departments here.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em' }}>
          {show ? `ON ${show.title.toUpperCase()} — ${onShow.length} CREW` : `COMPANY ROSTER — ${crew.length} CREW`}
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
          <Plus size={14} /> Add manually
        </button>
      </div>

      {showForm && <NewCrewForm show={show} onAdd={handleManualAdd} onClose={() => setShowForm(false)} DEPARTMENTS={DEPARTMENTS} DEPARTMENT_ORDER={DEPARTMENT_ORDER} />}

      {show && onShow.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 26 }}>
          {DEPARTMENT_ORDER.filter((d) => byDept[d] && byDept[d].length > 0).map((d) => {
            const Icon = DEPARTMENTS[d].icon;
            return (
              <div key={d}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <Icon size={14} color={COLOR.textMuted} strokeWidth={1.75} />
                  <span className="td-display" style={{ fontSize: 13, color: COLOR.textMuted, letterSpacing: '0.05em' }}>
                    {DEPARTMENTS[d].label} — {byDept[d].length}
                  </span>
                </div>
                <div>
                  {byDept[d].map((m) => (
                    <RosterRow key={m.id} member={m} show={show} shows={shows} setCrew={setCrew} DEPARTMENTS={DEPARTMENTS} DEPARTMENT_ORDER={DEPARTMENT_ORDER} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {show && onShow.length === 0 && (
        <div style={{ marginBottom: 26 }}>
          <StubPanel label={`No one is on ${show.title} yet`} />
        </div>
      )}

      {notOnShow.length > 0 && (
        <div>
          {show && (
            <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10 }}>
              REST OF THE COMPANY — {notOnShow.length}
            </div>
          )}
          <div>
            {notOnShow.map((m) => (
              <RosterRow key={m.id} member={m} show={show} shows={shows} setCrew={setCrew} DEPARTMENTS={DEPARTMENTS} DEPARTMENT_ORDER={DEPARTMENT_ORDER} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CALL FORM — create or edit a call sheet: core details, every slot, and
// the gear pulled for it. A stable id is generated up front so gear can be
// linked to a brand-new call before it's even saved.
// ---------------------------------------------------------------------------
function CallForm({ show, venues, rosters, inventory, setInventory, initial, onSave, onCancel }) {
  const [callId] = useState(initial?.id || `call-${Date.now()}`);
  const [date, setDate] = useState(initial?.date || TODAY_STR);
  const [time, setTime] = useState(parseTime12hTo24h(initial?.time) || '09:00');
  const [label, setLabel] = useState(initial?.label || '');
  const [location, setLocation] = useState(initial?.location || show.venue);
  const [slots, setSlots] = useState(initial?.slots || []);
  const [sceneIds, setSceneIds] = useState(initial?.sceneIds || []);

  const [addingGear, setAddingGear] = useState(false);
  const [newGearItemId, setNewGearItemId] = useState(inventory[0]?.id || '');
  const [newGearQty, setNewGearQty] = useState(1);

  const [addingGroup, setAddingGroup] = useState(false);
  const [groupPersonType, setGroupPersonType] = useState('actor');
  const [groupId, setGroupId] = useState('');

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };
  const linkedGear = inventory.filter((i) => (i.assignments || []).some((a) => a.callId === callId));

  function addSlotRow() {
    setSlots((prev) => [...prev, { id: `slot-${Date.now()}`, personType: 'crew', role: '', filledBy: null, attendance: 'pending' }]);
  }
  function updateSlotRow(id, field, value) {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (field === 'personType') return { ...s, personType: value, filledBy: null, attendance: 'pending' };
        return { ...s, [field]: value };
      })
    );
  }
  function removeSlotRow(id) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  function toggleScene(sceneId) {
    setSceneIds((prev) => (prev.includes(sceneId) ? prev.filter((id) => id !== sceneId) : [...prev, sceneId]));
  }

  function assignPerson(slotId, personId) {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, filledBy: personId || null, attendance: 'pending' } : s)));
    if (personId) {
      const setRoster = setterForType(slot.personType, rosters);
      if (setRoster) {
        setRoster((prev) =>
          prev.map((p) => {
            if (p.id !== personId || assignmentFor(p, show.id)) return p;
            const newAssignment = { id: `asn-${p.id}-${show.id}`, showId: show.id, ...defaultAssignmentFields(slot.personType, slot.role) };
            return { ...p, assignments: [...(p.assignments || []), newAssignment] };
          })
        );
      }
    }
  }

  function addGroupSlots() {
    const group = (show.groups || []).find((g) => g.id === groupId);
    if (!group || group.memberIds.length === 0) return;
    const newSlots = group.memberIds.map((personId, i) => ({
      id: `slot-${Date.now()}-${i}`,
      personType: group.personType,
      role: group.name,
      filledBy: personId,
      attendance: 'pending',
    }));
    setSlots((prev) => [...prev, ...newSlots]);
    const setRoster = setterForType(group.personType, rosters);
    if (setRoster) {
      setRoster((prev) =>
        prev.map((p) => {
          if (!group.memberIds.includes(p.id) || assignmentFor(p, show.id)) return p;
          const newAssignment = { id: `asn-${p.id}-${show.id}`, showId: show.id, ...defaultAssignmentFields(group.personType, group.name) };
          return { ...p, assignments: [...(p.assignments || []), newAssignment] };
        })
      );
    }
    setAddingGroup(false);
    setGroupId('');
  }

  function addGear() {
    if (!newGearItemId) return;
    const qty = Math.max(1, Number(newGearQty) || 1);
    setInventory((prev) =>
      prev.map((i) => {
        if (i.id !== newGearItemId) return i;
        const existing = (i.assignments || []).find((a) => a.callId === callId);
        if (existing) {
          return { ...i, assignments: i.assignments.map((a) => (a.callId === callId ? { ...a, qty } : a)) };
        }
        return { ...i, assignments: [...(i.assignments || []), { id: `ia-${callId}-${i.id}`, showId: show.id, callId, qty }] };
      })
    );
    setAddingGear(false);
    setNewGearQty(1);
  }
  function removeGear(itemId) {
    setInventory((prev) => prev.map((i) => (i.id === itemId ? { ...i, assignments: (i.assignments || []).filter((a) => a.callId !== callId) } : i)));
  }

  function handleSave() {
    if (!label.trim() || !date) return;
    onSave({
      id: callId,
      showId: show.id,
      date,
      time: formatTime12h(time),
      label: label.trim(),
      location,
      slots,
      sceneIds,
    });
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {initial ? 'Edit call' : 'Add call'}
        </div>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 0.8fr 0.8fr 1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>LABEL</label>
          <input className="td-focusable" style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Put-in Rehearsal" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>DATE</label>
          <input className="td-focusable" type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>TIME</label>
          <input className="td-focusable" type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>LOCATION</label>
          <select className="td-focusable" style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)}>
            {venues.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
            {!venues.includes(location) && location && <option value={location}>{location} (not in list)</option>}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="td-mono" style={{ ...labelStyle, marginBottom: 0 }}>SLOTS</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setAddingGroup((v) => !v); setGroupId(''); }}
              disabled={!(show.groups || []).length}
              className="td-focusable"
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: (show.groups || []).length ? COLOR.amber : COLOR.textFaint, border: `1px solid ${(show.groups || []).length ? COLOR.amber : COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: (show.groups || []).length ? 'pointer' : 'not-allowed' }}
            >
              <Users size={12} /> Add group
            </button>
            <button onClick={addSlotRow} className="td-focusable" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>
              <Plus size={12} /> Add slot
            </button>
          </div>
        </div>

        {addingGroup && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, padding: 10, background: COLOR.panel, borderRadius: 4 }}>
            <select className="td-focusable" value={groupPersonType} onChange={(e) => { setGroupPersonType(e.target.value); setGroupId(''); }} style={inputStyle}>
              {PERSON_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>{PERSON_TYPES[t].label}</option>
              ))}
            </select>
            <select className="td-focusable" value={groupId} onChange={(e) => setGroupId(e.target.value)} style={inputStyle}>
              <option value="">Choose a group...</option>
              {(show.groups || []).filter((g) => g.personType === groupPersonType).map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.memberIds.length})</option>
              ))}
            </select>
            <button onClick={addGroupSlots} disabled={!groupId} className="td-focusable" style={{ background: groupId ? COLOR.amber : COLOR.slateDim, color: groupId ? COLOR.void : COLOR.textFaint, border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: groupId ? 'pointer' : 'not-allowed' }}>
              Add group's slots
            </button>
            <button onClick={() => setAddingGroup(false)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}
        {slots.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slots.map((s) => {
              const roster = rosterForType(s.personType, rosters);
              const onShow = roster.filter((p) => assignmentFor(p, show.id));
              const restOfCompany = roster.filter((p) => !assignmentFor(p, show.id));
              return (
                <div key={s.id} style={{ border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8, alignItems: 'center' }}>
                    <select className="td-focusable" style={inputStyle} value={s.personType} onChange={(e) => updateSlotRow(s.id, 'personType', e.target.value)}>
                      {PERSON_TYPE_ORDER.map((t) => (
                        <option key={t} value={t}>{PERSON_TYPES[t].label}</option>
                      ))}
                    </select>
                    <input className="td-focusable" style={inputStyle} value={s.role} onChange={(e) => updateSlotRow(s.id, 'role', e.target.value)} placeholder="Role, e.g. Board Op" />
                    <button onClick={() => removeSlotRow(s.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove slot">
                      <X size={14} />
                    </button>
                  </div>
                  <div>
                    <label className="td-mono" style={labelStyle}>ASSIGNED TO</label>
                    <select className="td-focusable" style={inputStyle} value={s.filledBy || ''} onChange={(e) => assignPerson(s.id, e.target.value || null)}>
                      <option value="">— Open —</option>
                      {onShow.length > 0 && (
                        <optgroup label={`On ${show.title}`}>
                          {onShow.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {restOfCompany.length > 0 && (
                        <optgroup label="Rest of the company">
                          {restOfCompany.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {slots.length === 0 && <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>No slots yet — add who needs to be there.</div>}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <label className="td-mono" style={{ ...labelStyle, marginBottom: 8 }}>SCENES BEING REHEARSED</label>
        {(show.acts || []).length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {show.acts.map((act) => (
              <div key={act.id}>
                <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.04em', marginBottom: 5 }}>{act.name.toUpperCase()}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(act.scenes || []).length === 0 && <span className="td-body" style={{ fontSize: 11, color: COLOR.textFaint }}>No scenes in this act yet.</span>}
                  {(act.scenes || []).map((sc, i) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => toggleScene(sc.id)}
                      className="td-focusable"
                      style={{
                        background: sceneIds.includes(sc.id) ? COLOR.amber : 'transparent',
                        color: sceneIds.includes(sc.id) ? COLOR.void : COLOR.textMuted,
                        border: `1px solid ${sceneIds.includes(sc.id) ? COLOR.amber : COLOR.line}`,
                        borderRadius: 20,
                        padding: '4px 12px',
                        fontSize: 11.5,
                        fontFamily: "'Inter', sans-serif",
                        cursor: 'pointer',
                      }}
                    >
                      {i + 1}. {sc.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>No scenes set up for {show.title} yet — add Acts and Scenes on the Scenes page.</div>
        )}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="td-mono" style={{ ...labelStyle, marginBottom: 0 }}>GEAR PULLED</label>
          <button
            onClick={() => setAddingGear((v) => !v)}
            disabled={inventory.length === 0}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: inventory.length ? 'pointer' : 'not-allowed' }}
          >
            <Plus size={12} /> Pull gear
          </button>
        </div>
        {linkedGear.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: addingGear ? 8 : 0 }}>
            {linkedGear.map((item) => {
              const a = (item.assignments || []).find((x) => x.callId === callId);
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: COLOR.panel, borderRadius: 3 }}>
                  <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, flex: 1 }}>{item.assetNo} — {item.name}</span>
                  <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>×{a?.qty || 1}</span>
                  <button onClick={() => removeGear(item.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove gear">
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {linkedGear.length === 0 && !addingGear && <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>No gear pulled for this call yet.</div>}
        {addingGear && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="td-focusable" value={newGearItemId} onChange={(e) => setNewGearItemId(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 180 }}>
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>{item.assetNo} — {item.name}</option>
              ))}
            </select>
            <input className="td-focusable" type="number" min="1" value={newGearQty} onChange={(e) => setNewGearQty(e.target.value)} style={{ ...inputStyle, width: 60 }} />
            <button onClick={addGear} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Add</button>
            <button onClick={() => setAddingGear(false)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer' }}>Cancel</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={!label.trim() || !date}
          className="td-focusable"
          style={{
            background: label.trim() && date ? COLOR.amber : COLOR.slateDim,
            color: label.trim() && date ? COLOR.void : COLOR.textFaint,
            border: 'none',
            borderRadius: 3,
            padding: '9px 16px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.03em',
            cursor: label.trim() && date ? 'pointer' : 'not-allowed',
          }}
        >
          {initial ? 'Save changes' : 'Add call'}
        </button>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '9px 16px', fontSize: 12, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GROUPS PANEL — reusable named groups per person type (Leads, Ensemble 1,
// Electrics...) that a call can pull in all at once instead of filling
// slots one person at a time.
// ---------------------------------------------------------------------------
function GroupsPanel({ show, rosters, setShows }) {
  const [personType, setPersonType] = useState('actor');
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingNameId, setEditingNameId] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const groups = (show.groups || []).filter((g) => g.personType === personType);
  const roster = rosterForType(personType, rosters);
  const showPeople = roster.filter((p) => assignmentFor(p, show.id));

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '7px 9px',
    color: COLOR.textPrimary,
    fontSize: 12.5,
  };

  function addGroup() {
    if (!newGroupName.trim()) return;
    setShows((prev) =>
      prev.map((s) => (s.id === show.id ? { ...s, groups: [...(s.groups || []), { id: `grp-${Date.now()}`, personType, name: newGroupName.trim(), memberIds: [] }] } : s))
    );
    setNewGroupName('');
    setAddingGroup(false);
  }
  function renameGroup(groupId, name) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, groups: (s.groups || []).map((g) => (g.id === groupId ? { ...g, name } : g)) } : s)));
  }
  function removeGroup(groupId) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, groups: (s.groups || []).filter((g) => g.id !== groupId) } : s)));
  }
  function toggleMember(groupId, personId) {
    setShows((prev) =>
      prev.map((s) =>
        s.id === show.id
          ? { ...s, groups: (s.groups || []).map((g) => (g.id === groupId ? { ...g, memberIds: g.memberIds.includes(personId) ? g.memberIds.filter((x) => x !== personId) : [...g.memberIds, personId] } : g)) }
          : s
      )
    );
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERSON_TYPE_ORDER.map((t) => (
            <button
              key={t}
              onClick={() => setPersonType(t)}
              className="td-focusable"
              style={{
                background: personType === t ? COLOR.amber : 'transparent',
                color: personType === t ? COLOR.void : COLOR.textMuted,
                border: `1px solid ${personType === t ? COLOR.amber : COLOR.line}`,
                borderRadius: 20,
                padding: '5px 14px',
                fontSize: 12,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {PERSON_TYPES[t].label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAddingGroup((v) => !v)}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '6px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={13} /> Add group
        </button>
      </div>

      {addingGroup && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            className="td-focusable"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addGroup()}
            placeholder={`e.g. Leads, or ${PERSON_TYPES[personType].label} Ensemble 1`}
            style={{ ...inputStyle, flex: 1, maxWidth: 260 }}
          />
          <button onClick={addGroup} disabled={!newGroupName.trim()} className="td-focusable" style={{ background: newGroupName.trim() ? COLOR.amber : COLOR.slateDim, color: newGroupName.trim() ? COLOR.void : COLOR.textFaint, border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: newGroupName.trim() ? 'pointer' : 'not-allowed' }}>
            Add
          </button>
          <button onClick={() => setAddingGroup(false)} className="td-focusable" style={{ background: 'none', border: `1px solid ${COLOR.line}`, color: COLOR.textFaint, borderRadius: 3, padding: '7px 14px', fontSize: 11.5, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {groups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((g) => (
            <div key={g.id} style={{ background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {editingNameId === g.id ? (
                  <>
                    <input
                      className="td-focusable"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (renameGroup(g.id, nameDraft.trim() || g.name), setEditingNameId(null))}
                      style={inputStyle}
                    />
                    <button onClick={() => { renameGroup(g.id, nameDraft.trim() || g.name); setEditingNameId(null); }} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                  </>
                ) : (
                  <>
                    <span className="td-body" style={{ fontSize: 13.5, color: COLOR.textPrimary, fontWeight: 500, flex: 1 }}>{g.name}</span>
                    <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>{g.memberIds.length} {g.memberIds.length === 1 ? 'member' : 'members'}</span>
                    <button onClick={() => { setEditingNameId(g.id); setNameDraft(g.name); }} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Rename ${g.name}`}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => removeGroup(g.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove ${g.name}`}>
                      <X size={13} />
                    </button>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {showPeople.length === 0 && <span className="td-body" style={{ fontSize: 11, color: COLOR.textFaint }}>No one on {show.title} yet for this roster.</span>}
                {showPeople.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleMember(g.id, p.id)}
                    className="td-focusable"
                    style={{
                      background: g.memberIds.includes(p.id) ? COLOR.amber : 'transparent',
                      color: g.memberIds.includes(p.id) ? COLOR.void : COLOR.textMuted,
                      border: `1px solid ${g.memberIds.includes(p.id) ? COLOR.amber : COLOR.line}`,
                      borderRadius: 20,
                      padding: '3px 10px',
                      fontSize: 11,
                      fontFamily: "'Inter', sans-serif",
                      cursor: 'pointer',
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>No {PERSON_TYPES[personType].label.toLowerCase()} groups yet.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CALLS MODULE — the callboard. A call's slots can be filled from any
// roster (Crew, Cast, Band, Staff), not just Crew, so this now lives
// separately from crew identity/roster management.
// ---------------------------------------------------------------------------
function CallsModule({ show, venues, calls, setCalls, rosters, currentIds, inventory, setInventory, setShows }) {
  const showCalls = useMemo(() => calls.filter((c) => c.showId === show.id), [calls, show.id]);
  const todayCalls = useMemo(() => showCalls.filter((c) => c.date === TODAY_STR), [showCalls]);
  const upcomingCalls = useMemo(
    () =>
      showCalls
        .filter((c) => c.date > TODAY_STR)
        .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date))),
    [showCalls]
  );

  const [editingCallId, setEditingCallId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showingGroups, setShowingGroups] = useState(false);

  function signUp(callId, slotId) {
    const call = calls.find((c) => c.id === callId);
    if (!call) return;
    const slot = call.slots.find((s) => s.id === slotId);
    if (!slot) return;
    const myId = currentIds[slot.personType];
    if (!myId) return;
    setCalls((prev) =>
      prev.map((c) => (c.id !== callId ? c : { ...c, slots: c.slots.map((s) => (s.id === slotId ? { ...s, filledBy: myId } : s)) }))
    );
    const setRoster = setterForType(slot.personType, rosters);
    if (setRoster) {
      setRoster((prev) =>
        prev.map((p) => {
          if (p.id !== myId || assignmentFor(p, call.showId)) return p;
          const newAssignment = { id: `asn-${p.id}-${call.showId}`, showId: call.showId, ...defaultAssignmentFields(slot.personType, slot.role) };
          return { ...p, assignments: [...(p.assignments || []), newAssignment] };
        })
      );
    }
  }

  function withdraw(callId, slotId) {
    setCalls((prev) =>
      prev.map((c) => {
        if (c.id !== callId) return c;
        return {
          ...c,
          slots: c.slots.map((s) => {
            if (s.id !== slotId) return s;
            const myId = currentIds[s.personType];
            return s.filledBy === myId ? { ...s, filledBy: null, attendance: 'pending' } : s;
          }),
        };
      })
    );
  }

  function setAttendance(callId, slotId, status) {
    setCalls((prev) =>
      prev.map((c) => (c.id !== callId ? c : { ...c, slots: c.slots.map((s) => (s.id === slotId ? { ...s, attendance: status } : s)) }))
    );
  }

  function addCall(call) {
    setCalls((prev) => [...prev, call]);
    setAdding(false);
  }
  function saveCall(call) {
    setCalls((prev) => prev.map((c) => (c.id === call.id ? call : c)));
    setEditingCallId(null);
  }
  function removeCall(callId) {
    setCalls((prev) => prev.filter((c) => c.id !== callId));
    setInventory((prev) => prev.map((i) => ({ ...i, assignments: (i.assignments || []).filter((a) => a.callId !== callId) })));
    if (editingCallId === callId) setEditingCallId(null);
  }

  function addSlot(callId, personType, role) {
    setCalls((prev) =>
      prev.map((c) => (c.id !== callId ? c : { ...c, slots: [...c.slots, { id: `slot-${Date.now()}`, personType, role, filledBy: null, attendance: 'pending' }] }))
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        {PERSON_TYPE_ORDER.map((t) => {
          const roster = rosterForType(t, rosters);
          const person = roster.find((p) => p.id === currentIds[t]);
          const TypeIcon = PERSON_TYPES[t].icon;
          return (
            <div
              key={t}
              className="td-mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10.5,
                color: person ? COLOR.textPrimary : COLOR.textFaint,
                border: `1px solid ${person ? COLOR.lineBright : COLOR.line}`,
                borderRadius: 20,
                padding: '4px 10px',
              }}
            >
              <TypeIcon size={11} strokeWidth={1.75} />
              {PERSON_TYPES[t].label}: {person ? person.name : 'not signed in'}
            </div>
          );
        })}
      </div>
      <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginBottom: 20 }}>
        Sign in on the Crew, Actors, Staff, or Musicians page to claim a slot below.
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setShowingGroups((v) => !v)}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: showingGroups ? COLOR.card : 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.lineBright}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Users size={14} /> {showingGroups ? 'Hide groups' : 'Manage groups'}
        </button>
        <button
          onClick={() => { setAdding((v) => !v); setEditingCallId(null); }}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add call
        </button>
      </div>
      {showingGroups && <GroupsPanel show={show} rosters={rosters} setShows={setShows} />}
      {adding && (
        <CallForm show={show} venues={venues} rosters={rosters} inventory={inventory} setInventory={setInventory} onSave={addCall} onCancel={() => setAdding(false)} />
      )}

      <div>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10 }}>
          TODAY'S CALLS — {show.title.toUpperCase()}
        </div>
        {todayCalls.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {todayCalls
              .slice()
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((call) =>
                editingCallId === call.id ? (
                  <CallForm key={call.id} show={show} venues={venues} rosters={rosters} inventory={inventory} setInventory={setInventory} initial={call} onSave={saveCall} onCancel={() => setEditingCallId(null)} />
                ) : (
                  <CallCard
                    key={call.id}
                    call={call}
                    show={show}
                    rosters={rosters}
                    currentIds={currentIds}
                    inventory={inventory}
                    onSignUp={signUp}
                    onWithdraw={withdraw}
                    onAddSlot={addSlot}
                    onSetAttendance={setAttendance}
                    onEdit={() => { setEditingCallId(call.id); setAdding(false); }}
                  />
                )
              )}
          </div>
        ) : (
          <div style={{ marginBottom: 24 }}>
            <StubPanel label="No calls posted for today" />
          </div>
        )}
      </div>

      {upcomingCalls.length > 0 && (
        <div>
          <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10 }}>
            UPCOMING — FROM THE SCHEDULE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 30 }}>
            {upcomingCalls.map((call) =>
              editingCallId === call.id ? (
                <CallForm key={call.id} show={show} venues={venues} rosters={rosters} inventory={inventory} setInventory={setInventory} initial={call} onSave={saveCall} onCancel={() => setEditingCallId(null)} />
              ) : (
                <CallCard
                  key={call.id}
                  call={call}
                  show={show}
                  rosters={rosters}
                  currentIds={currentIds}
                  inventory={inventory}
                  onSignUp={signUp}
                  onWithdraw={withdraw}
                  onAddSlot={addSlot}
                  onSetAttendance={setAttendance}
                  onEdit={() => { setEditingCallId(call.id); setAdding(false); }}
                  showDate
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// STOCK BAR — a fader-level readout: available / checked out / out of
// service, in the same green/amber/slate language as the cue lights.
// ---------------------------------------------------------------------------
function StockBar({ item }) {
  const checkedOut = itemCheckedOut(item);
  const outOfService = itemOutOfService(item);
  const available = item.totalQty - checkedOut - outOfService;
  const seg = (n) => (item.totalQty > 0 ? (Math.max(0, n) / item.totalQty) * 100 : 0);
  return (
    <div>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: COLOR.line }}>
        <div style={{ width: `${seg(available)}%`, background: COLOR.green }} />
        <div style={{ width: `${seg(checkedOut)}%`, background: COLOR.amber }} />
        <div style={{ width: `${seg(outOfService)}%`, background: COLOR.slate }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span className="td-mono" style={{ fontSize: 9.5, color: available < 0 ? COLOR.amber : COLOR.green }}>{available} AVAIL</span>
        <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber }}>{checkedOut} OUT</span>
        {outOfService > 0 && <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.slate }}>{outOfService} OOS</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ASSET CARD — styled like an equipment tag: asset number up top, the way
// it'd read printed on the DYMO label taped to the case.
// ---------------------------------------------------------------------------
function ItemCard({ item, shows, calls, onOpen, INVENTORY_CATEGORIES }) {
  const Icon = INVENTORY_CATEGORIES[item.category].icon;
  const condition = conditionForItem(item);
  const conflicts = itemConflicts(item, shows);
  const hasConflict = conflicts.length > 0;
  const outOfService = itemOutOfService(item);
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      style={{
        background: hover ? COLOR.cardHover : COLOR.card,
        border: `1px solid ${hasConflict ? COLOR.amber : condition === 'attention' ? COLOR.amberDim : COLOR.line}`,
        borderRadius: 4,
        padding: '14px 16px 16px',
        transition: 'background 0.15s ease',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.blueprint, letterSpacing: '0.06em' }}>{item.assetNo}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon size={12.5} color={COLOR.textFaint} strokeWidth={1.75} />
            <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.05em' }}>
              {INVENTORY_CATEGORIES[item.category].label.toUpperCase()}
            </span>
          </div>
          <Maximize2 size={12} color={COLOR.textFaint} strokeWidth={1.75} />
        </div>
      </div>

      <div className="td-body" style={{ fontSize: 14, color: COLOR.textPrimary, fontWeight: 500, marginTop: 7, lineHeight: 1.3 }}>
        {item.name}
      </div>

      <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 6 }}>
        {item.location}
      </div>

      {hasConflict && (
        <div style={{ marginTop: 10, padding: '7px 9px', background: COLOR.amberDim, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {conflicts.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
              <AlertTriangle size={11} color={COLOR.amber} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, lineHeight: 1.4 }}>
                CONFLICT — {c.a.show.title} & {c.b.show.title} tech weeks overlap, need {c.a.qty + c.b.qty}, only {item.totalQty - outOfService} in stock
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {(item.assignments || []).length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {item.assignments.map((a) => {
              const s = shows.find((sh) => sh.id === a.showId);
              return (
                <span key={a.id} className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '2px 6px' }}>
                  {s ? s.title : a.showId} ×{a.qty}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint }}>General stock — not assigned to a show</div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <StockBar item={item} />
      </div>

      {condition === 'attention' && !hasConflict && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10 }}>
          <AlertTriangle size={11} color={COLOR.amber} strokeWidth={2} />
          <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, letterSpacing: '0.03em' }}>
            {outOfService > 0 ? 'Some units out of service' : 'None available'}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW ITEM FORM
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ITEM DETAIL PANEL — what opening an inventory item gets you: editable
// quantity, per-unit status history, full assignment control, and cost /
// purchase records.
// ---------------------------------------------------------------------------
const UNIT_STATUS_META = {
  broken: { label: 'Broken', color: COLOR.slate },
  repaired: { label: 'Repaired', color: COLOR.green },
  retired: { label: 'Retired', color: COLOR.textFaint },
};

function ItemDetailPanel({ item, shows, calls, locations, setInventory, onBack, INVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER }) {
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoDraft, setInfoDraft] = useState({ name: item.name, location: item.location, totalQty: item.totalQty });

  const [addingUnit, setAddingUnit] = useState(false);
  const [unitStatus, setUnitStatus] = useState('broken');
  const [unitNote, setUnitNote] = useState('');

  const [assigning, setAssigning] = useState(false);
  const [newShowId, setNewShowId] = useState(shows[0]?.id || '');
  const [newCallId, setNewCallId] = useState('');
  const [newQty, setNewQty] = useState(1);

  const [editingCost, setEditingCost] = useState(false);
  const [costDraft, setCostDraft] = useState({
    costPerUnit: item.costPerUnit || 0,
    purchaseDate: item.purchaseDate || '',
    purchaseSource: item.purchaseSource || '',
    purchaseNotes: item.purchaseNotes || '',
  });

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '7px 9px',
    color: COLOR.textPrimary,
    fontSize: 12.5,
  };
  const labelStyle = { fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  const checkedOut = itemCheckedOut(item);
  const outOfService = itemOutOfService(item);
  const available = item.totalQty - checkedOut - outOfService;
  const conflicts = itemConflicts(item, shows);
  const showCallsForNew = calls.filter((c) => c.showId === newShowId);
  const Icon = INVENTORY_CATEGORIES[item.category].icon;

  function saveInfo() {
    setInventory((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, name: infoDraft.name.trim(), location: infoDraft.location.trim(), totalQty: Math.max(0, Number(infoDraft.totalQty) || 0) } : i))
    );
    setEditingInfo(false);
  }

  function addUnit() {
    const unit = { id: `u-${item.id}-${Date.now()}`, status: unitStatus, note: unitNote.trim(), date: TODAY_STR };
    setInventory((prev) => prev.map((i) => (i.id === item.id ? { ...i, units: [...(i.units || []), unit] } : i)));
    setAddingUnit(false);
    setUnitNote('');
  }
  function removeUnit(unitId) {
    setInventory((prev) => prev.map((i) => (i.id === item.id ? { ...i, units: (i.units || []).filter((u) => u.id !== unitId) } : i)));
  }

  function addAssignment() {
    if (!newShowId) return;
    const assignment = { id: `ia-${item.id}-${Date.now()}`, showId: newShowId, callId: newCallId || null, qty: Math.max(1, Number(newQty) || 1) };
    setInventory((prev) => prev.map((i) => (i.id === item.id ? { ...i, assignments: [...(i.assignments || []), assignment] } : i)));
    setAssigning(false);
    setNewCallId('');
    setNewQty(1);
  }
  function removeAssignment(assignmentId) {
    setInventory((prev) => prev.map((i) => (i.id === item.id ? { ...i, assignments: (i.assignments || []).filter((a) => a.id !== assignmentId) } : i)));
  }

  function saveCost() {
    setInventory((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, costPerUnit: Number(costDraft.costPerUnit) || 0, purchaseDate: costDraft.purchaseDate, purchaseSource: costDraft.purchaseSource.trim(), purchaseNotes: costDraft.purchaseNotes.trim() }
          : i
      )
    );
    setEditingCost(false);
  }

  const totalInvestment = (item.costPerUnit || 0) * item.totalQty;

  return (
    <div>
      <button
        onClick={onBack}
        className="td-focusable"
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: COLOR.blueprint, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 18 }}
      >
        ← Back to inventory
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="td-mono" style={{ fontSize: 12, color: COLOR.blueprint, letterSpacing: '0.06em' }}>{item.assetNo}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon size={13} color={COLOR.textFaint} strokeWidth={1.75} />
            <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em' }}>
              {INVENTORY_CATEGORIES[item.category].label.toUpperCase()}
            </span>
          </div>
        </div>
        <button
          onClick={() => (editingInfo ? saveInfo() : (setInfoDraft({ name: item.name, location: item.location, totalQty: item.totalQty }), setEditingInfo(true)))}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, fontSize: 11, padding: '5px 10px', cursor: 'pointer' }}
        >
          <Pencil size={12} /> {editingInfo ? 'Save' : 'Edit'}
        </button>
      </div>

      {editingInfo ? (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 0.8fr', gap: 10, marginTop: 12, maxWidth: 560 }}>
          <div>
            <label className="td-mono" style={labelStyle}>NAME</label>
            <input className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={infoDraft.name} onChange={(e) => setInfoDraft({ ...infoDraft, name: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>LOCATION</label>
            <select className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={infoDraft.location} onChange={(e) => setInfoDraft({ ...infoDraft, location: e.target.value })}>
              {locations.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
              {!locations.includes(infoDraft.location) && infoDraft.location && (
                <option value={infoDraft.location}>{infoDraft.location} (not in list)</option>
              )}
            </select>
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>TOTAL QTY</label>
            <input className="td-focusable" type="number" min="0" style={{ ...inputStyle, width: '100%' }} value={infoDraft.totalQty} onChange={(e) => setInfoDraft({ ...infoDraft, totalQty: e.target.value })} />
          </div>
        </div>
      ) : (
        <>
          <h2 className="td-display" style={{ fontSize: 22, color: COLOR.textPrimary, letterSpacing: '0.02em', margin: '10px 0 4px' }}>{item.name}</h2>
          <div className="td-mono" style={{ fontSize: 11.5, color: COLOR.textFaint }}>{item.location}</div>
        </>
      )}

      {conflicts.length > 0 && (
        <div style={{ marginTop: 14, padding: '9px 12px', background: COLOR.amberDim, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {conflicts.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertTriangle size={13} color={COLOR.amber} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, lineHeight: 1.5 }}>
                CONFLICT — {c.a.show.title} & {c.b.show.title} tech weeks overlap ({c.a.range.start} to {c.a.range.end} vs {c.b.range.start} to {c.b.range.end}), need {c.a.qty + c.b.qty}, only {item.totalQty - outOfService} in stock
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, maxWidth: 420 }}>
        <StockBar item={item} />
      </div>

      <AudioSectionHeader label="ASSIGNED TO" />
      {(item.assignments || []).length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {item.assignments.map((a) => {
            const s = shows.find((sh) => sh.id === a.showId);
            const c = a.callId ? calls.find((cc) => cc.id === a.callId) : null;
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
                <span className="td-mono" style={{ fontSize: 12, color: COLOR.amber, flex: 1 }}>
                  {s ? s.title : a.showId}{c ? ` · ${c.label} · ${formatShortDate(c.date)}` : ' · whole run'}
                </span>
                <span className="td-mono" style={{ fontSize: 11, color: COLOR.textFaint }}>×{a.qty}</span>
                <button onClick={() => removeAssignment(a.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove assignment">
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <StubPanel label="General stock — not assigned to a show" />
        </div>
      )}
      {assigning ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="td-focusable" value={newShowId} onChange={(e) => { setNewShowId(e.target.value); setNewCallId(''); }} style={inputStyle}>
            {shows.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <select className="td-focusable" value={newCallId} onChange={(e) => setNewCallId(e.target.value)} style={inputStyle}>
            <option value="">Whole run</option>
            {showCallsForNew.map((c) => (
              <option key={c.id} value={c.id}>{c.label} · {formatShortDate(c.date)}</option>
            ))}
          </select>
          <input className="td-focusable" type="number" min="1" value={newQty} onChange={(e) => setNewQty(e.target.value)} style={{ ...inputStyle, width: 56 }} />
          <button onClick={addAssignment} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Add</button>
          <button onClick={() => setAssigning(false)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        shows.length > 0 && (
          <button onClick={() => setAssigning(true)} className="td-focusable" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={13} /> Assign to show
          </button>
        )
      )}

      <AudioSectionHeader label="UNIT STATUS" />
      {(item.units || []).length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {item.units.map((u) => {
            const meta = UNIT_STATUS_META[u.status];
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
                <span className="td-mono" style={{ fontSize: 10.5, color: meta.color, border: `1px solid ${meta.color}`, borderRadius: 3, padding: '2px 7px', flexShrink: 0 }}>
                  {meta.label.toUpperCase()}
                </span>
                <span className="td-body" style={{ fontSize: 12, color: COLOR.textMuted, flex: 1 }}>{u.note || '—'}</span>
                <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>{formatShortDate(u.date)}</span>
                <button onClick={() => removeUnit(u.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove unit record">
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <StubPanel label="No unit issues logged — everything's presumed good" />
        </div>
      )}
      {addingUnit ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="td-focusable" value={unitStatus} onChange={(e) => setUnitStatus(e.target.value)} style={inputStyle}>
            {Object.keys(UNIT_STATUS_META).map((s) => (
              <option key={s} value={s}>{UNIT_STATUS_META[s].label}</option>
            ))}
          </select>
          <input className="td-focusable" value={unitNote} onChange={(e) => setUnitNote(e.target.value)} placeholder="What happened?" style={{ ...inputStyle, minWidth: 200 }} />
          <button onClick={addUnit} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Log it</button>
          <button onClick={() => setAddingUnit(false)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAddingUnit(true)} className="td-focusable" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Wrench size={13} /> Log a broken, repaired, or retired unit
        </button>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em' }}>COST & PURCHASE</div>
        <button
          onClick={() => (editingCost ? saveCost() : (setCostDraft({ costPerUnit: item.costPerUnit || 0, purchaseDate: item.purchaseDate || '', purchaseSource: item.purchaseSource || '', purchaseNotes: item.purchaseNotes || '' }), setEditingCost(true)))}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, fontSize: 11, padding: '5px 10px', cursor: 'pointer' }}
        >
          <Pencil size={12} /> {editingCost ? 'Save' : 'Edit'}
        </button>
      </div>

      {editingCost ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10, maxWidth: 480 }}>
          <div>
            <label className="td-mono" style={labelStyle}>COST PER UNIT ($)</label>
            <input className="td-focusable" type="number" min="0" style={{ ...inputStyle, width: '100%' }} value={costDraft.costPerUnit} onChange={(e) => setCostDraft({ ...costDraft, costPerUnit: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>PURCHASE DATE</label>
            <input className="td-focusable" type="date" style={{ ...inputStyle, width: '100%' }} value={costDraft.purchaseDate} onChange={(e) => setCostDraft({ ...costDraft, purchaseDate: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>PURCHASED FROM</label>
            <input className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={costDraft.purchaseSource} onChange={(e) => setCostDraft({ ...costDraft, purchaseSource: e.target.value })} placeholder="Vendor" />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>NOTES</label>
            <input className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={costDraft.purchaseNotes} onChange={(e) => setCostDraft({ ...costDraft, purchaseNotes: e.target.value })} />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarSign size={13} color={COLOR.textFaint} />
            <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted }}>
              {item.costPerUnit ? `$${item.costPerUnit.toLocaleString()} / unit` : 'No cost on file'}
              {item.costPerUnit ? ` · $${totalInvestment.toLocaleString()} total` : ''}
            </span>
          </div>
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint }}>
            {item.purchaseDate ? `Purchased ${formatShortDate(item.purchaseDate)}` : 'No purchase date on file'}
            {item.purchaseSource ? ` from ${item.purchaseSource}` : ''}
          </div>
          {item.purchaseNotes && <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginTop: 2 }}>{item.purchaseNotes}</div>}
        </div>
      )}
    </div>
  );
}

function NewItemForm({ show, calls, locations, onAdd, onClose, INVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('electrics');
  const [totalQty, setTotalQty] = useState(1);
  const [location, setLocation] = useState(locations[0] || '');
  const [pullFor, setPullFor] = useState('none');
  const [pullQty, setPullQty] = useState(1);

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };
  const sortedCalls = calls.slice().sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>Add inventory item</div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.7fr 1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>NAME</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shure SM58" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>CATEGORY</label>
          <select className="td-focusable" style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
            {INVENTORY_CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{INVENTORY_CATEGORIES[c].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>QTY</label>
          <input
            className="td-focusable"
            type="number"
            min="1"
            style={inputStyle}
            value={totalQty}
            onChange={(e) => setTotalQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>LOCATION</label>
          <select className="td-focusable" style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)}>
            {locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {show && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '2.4fr 1fr', gap: 12 }}>
          <div>
            <label className="td-mono" style={labelStyle}>PULL FOR</label>
            <select className="td-focusable" style={inputStyle} value={pullFor} onChange={(e) => setPullFor(e.target.value)}>
              <option value="none">General stock (not tied to a show)</option>
              <option value="show">{show.title} — whole run</option>
              {sortedCalls.map((c) => (
                <option key={c.id} value={c.id}>{show.title} — {c.label} · {formatShortDate(c.date)}</option>
              ))}
            </select>
          </div>
          {pullFor !== 'none' && (
            <div>
              <label className="td-mono" style={labelStyle}>QTY PULLED</label>
              <input
                className="td-focusable"
                type="number"
                min="1"
                style={inputStyle}
                value={pullQty}
                onChange={(e) => setPullQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>
          )}
        </div>
      )}

      <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginTop: 10 }}>
        Gear can be assigned to more than one show later — this just sets its first assignment.
      </div>

      <button
        className="td-focusable"
        disabled={!name.trim() || !location.trim()}
        onClick={() =>
          onAdd({
            id: `i${Date.now()}`,
            assetNo: `NEW-${String(Math.floor(Math.random() * 900) + 100)}`,
            name: name.trim(),
            category,
            totalQty,
            location: location.trim(),
            units: [],
            costPerUnit: 0,
            purchaseDate: '',
            purchaseSource: '',
            purchaseNotes: '',
            assignments:
              show && pullFor !== 'none'
                ? [{ id: `ia-new-${Date.now()}`, showId: show.id, callId: pullFor === 'show' ? null : pullFor, qty: pullQty }]
                : [],
          })
        }
        style={{
          marginTop: 14,
          background: name.trim() && location.trim() ? COLOR.amber : COLOR.slateDim,
          color: name.trim() && location.trim() ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: name.trim() && location.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        Add to inventory
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// INVENTORY MODULE
// ---------------------------------------------------------------------------
function InventoryModule({ show, shows, calls, inventory, setInventory, locations, INVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER }) {
  const [category, setCategory] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [thisShowOnly, setThisShowOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [openItemId, setOpenItemId] = useState(null);

  const filtered = useMemo(() => {
    let list = inventory;
    if (category !== 'all') list = list.filter((i) => i.category === category);
    if (attentionOnly) list = list.filter((i) => conditionForItem(i) === 'attention');
    if (conflictsOnly) list = list.filter((i) => itemConflicts(i, shows).length > 0);
    if (thisShowOnly && show) list = list.filter((i) => (i.assignments || []).some((a) => a.showId === show.id));
    return list;
  }, [inventory, category, attentionOnly, conflictsOnly, thisShowOnly, show, shows]);

  const attentionCount = inventory.filter((i) => conditionForItem(i) === 'attention').length;
  const conflictCount = inventory.filter((i) => itemConflicts(i, shows).length > 0).length;
  const thisShowCount = show ? inventory.filter((i) => (i.assignments || []).some((a) => a.showId === show.id)).length : 0;
  const categoryFilters = [{ id: 'all', label: 'All' }, ...INVENTORY_CATEGORY_ORDER.map((c) => ({ id: c, label: INVENTORY_CATEGORIES[c].label }))];
  const openItem = openItemId ? inventory.find((i) => i.id === openItemId) : null;

  if (openItem) {
    return <ItemDetailPanel item={openItem} shows={shows} calls={calls} locations={locations} setInventory={setInventory} onBack={() => setOpenItemId(null)} INVENTORY_CATEGORIES={INVENTORY_CATEGORIES} INVENTORY_CATEGORY_ORDER={INVENTORY_CATEGORY_ORDER} />;
  }

  return (
    <div>
      {!show && (
        <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginBottom: 16 }}>
          No show selected — adding general shop stock. Pick a show from the sidebar to pull gear for a specific production or call.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categoryFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setCategory(f.id)}
              className="td-focusable"
              style={{
                background: category === f.id ? COLOR.amber : 'transparent',
                color: category === f.id ? COLOR.void : COLOR.textMuted,
                border: `1px solid ${category === f.id ? COLOR.amber : COLOR.line}`,
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {show && (
            <button
              onClick={() => setThisShowOnly((v) => !v)}
              className="td-focusable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: thisShowOnly ? COLOR.card : 'transparent',
                color: COLOR.textMuted,
                border: `1px solid ${thisShowOnly ? COLOR.lineBright : COLOR.line}`,
                borderRadius: 3,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Pulled for {show.title}{thisShowCount > 0 ? ` (${thisShowCount})` : ''}
            </button>
          )}
          <button
            onClick={() => setConflictsOnly((v) => !v)}
            disabled={conflictCount === 0}
            className="td-focusable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: conflictsOnly ? COLOR.amberDim : 'transparent',
              color: conflictCount > 0 ? COLOR.amber : COLOR.textFaint,
              border: `1px solid ${conflictCount > 0 ? COLOR.amber : COLOR.line}`,
              borderRadius: 3,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: conflictCount > 0 ? 'pointer' : 'default',
            }}
          >
            <AlertTriangle size={13} /> Conflicts{conflictCount > 0 ? ` (${conflictCount})` : ''}
          </button>
          <button
            onClick={() => setAttentionOnly((v) => !v)}
            className="td-focusable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: attentionOnly ? COLOR.amberDim : 'transparent',
              color: COLOR.amber,
              border: `1px solid ${COLOR.amber}`,
              borderRadius: 3,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <AlertTriangle size={13} /> Needs attention{attentionCount > 0 ? ` (${attentionCount})` : ''}
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="td-focusable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              color: COLOR.textPrimary,
              border: `1px solid ${COLOR.lineBright}`,
              borderRadius: 3,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Add item
          </button>
        </div>
      </div>

      {showForm && (
        <NewItemForm
          show={show}
          calls={show ? calls.filter((c) => c.showId === show.id) : []}
          locations={locations}
          onAdd={(item) => {
            setInventory((prev) => [item, ...prev]);
            setShowForm(false);
          }}
          onClose={() => setShowForm(false)}
          INVENTORY_CATEGORIES={INVENTORY_CATEGORIES}
          INVENTORY_CATEGORY_ORDER={INVENTORY_CATEGORY_ORDER}
        />
      )}

      {filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              shows={shows}
              calls={calls}
              onOpen={() => setOpenItemId(item.id)}
              INVENTORY_CATEGORIES={INVENTORY_CATEGORIES}
            />
          ))}
        </div>
      ) : (
        <StubPanel label="Nothing matches this filter" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CUE ROW — cues call in order, the way a stage manager actually runs a
// show: only the next cue in the stack is live for a GO.
// ---------------------------------------------------------------------------
function CueRow({ cue, cues, isNext, onFire, onSave, onRemove, onMove, isFirst, isLast, CUE_DEPTS }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cue);
  const dept = CUE_DEPTS[cue.dept];
  const Icon = dept.icon;
  const duplicate = editing && draft.num !== '' && isDuplicateCue(cues, draft.dept, draft.num, cue.id);

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '6px 9px',
    color: COLOR.textPrimary,
    fontSize: 12.5,
    width: '100%',
  };
  const labelStyle = { fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  if (editing) {
    return (
      <div style={{ padding: '12px 14px', border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, background: COLOR.panel }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1fr 2.5fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>CUE #</label>
            <input className="td-focusable" type="number" min="1" style={inputStyle} value={draft.num} onChange={(e) => setDraft({ ...draft, num: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>DEPARTMENT</label>
            <select className="td-focusable" style={inputStyle} value={draft.dept} onChange={(e) => setDraft({ ...draft, dept: e.target.value })}>
              {Object.keys(CUE_DEPTS).map((d) => (
                <option key={d} value={d}>{CUE_DEPTS[d].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>DESCRIPTION</label>
            <input className="td-focusable" style={inputStyle} value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} />
          </div>
        </div>
        {duplicate && (
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, marginBottom: 8 }}>
            {CUE_DEPTS[draft.dept]?.label} {draft.num} already exists on this cue sheet.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onSave(draft); setEditing(false); }}
            disabled={!String(draft.num).trim() || !draft.desc.trim() || duplicate}
            className="td-focusable"
            style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="td-focusable"
            style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 14px', fontSize: 11.5, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: cue.fired ? COLOR.panel : COLOR.card,
        border: `1px solid ${isNext ? COLOR.amber : COLOR.line}`,
        borderRadius: 4,
        padding: '10px 14px',
        opacity: cue.fired ? 0.55 : 1,
      }}
    >
      <span
        className={isNext ? 'cue-light-standby' : ''}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          flexShrink: 0,
          background: cue.fired ? COLOR.green : isNext ? COLOR.amber : COLOR.slate,
        }}
      />
      <div style={{ width: 62, flexShrink: 0 }}>
        <span className="td-mono" style={{ fontSize: 13, color: cue.fired ? COLOR.textFaint : COLOR.textPrimary }}>{cueCode(cue, CUE_DEPTS)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: 76, flexShrink: 0 }}>
        <Icon size={12} color={COLOR.textFaint} strokeWidth={1.75} />
        <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.04em' }}>{dept.label}</span>
      </div>
      <div className="td-body" style={{ flex: 1, fontSize: 13, color: cue.fired ? COLOR.textFaint : COLOR.textMuted }}>
        {cue.desc}
      </div>
      {cue.fired ? (
        <span className="td-mono" style={{ fontSize: 10, color: COLOR.green, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Check size={12} strokeWidth={2.5} /> CALLED
        </span>
      ) : isNext ? (
        <button
          onClick={onFire}
          className="td-focusable"
          style={{
            background: COLOR.amber,
            color: COLOR.void,
            border: 'none',
            borderRadius: 3,
            padding: '6px 18px',
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          GO
        </button>
      ) : (
        <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, flexShrink: 0 }}>STANDBY</span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, marginLeft: 4 }}>
        <button onClick={() => onMove(-1)} disabled={isFirst} className="td-focusable" style={{ background: 'none', border: 'none', color: isFirst ? COLOR.slateDim : COLOR.textFaint, cursor: isFirst ? 'default' : 'pointer', display: 'flex', padding: 2 }} aria-label="Move up">
          <ChevronUp size={13} />
        </button>
        <button onClick={() => onMove(1)} disabled={isLast} className="td-focusable" style={{ background: 'none', border: 'none', color: isLast ? COLOR.slateDim : COLOR.textFaint, cursor: isLast ? 'default' : 'pointer', display: 'flex', padding: 2 }} aria-label="Move down">
          <ChevronDown size={13} />
        </button>
        <button onClick={() => { setDraft(cue); setEditing(true); }} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex', padding: 2 }} aria-label={`Edit cue ${cueCode(cue, CUE_DEPTS)}`}>
          <Pencil size={13} />
        </button>
        <button onClick={onRemove} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex', padding: 2 }} aria-label={`Remove cue ${cueCode(cue, CUE_DEPTS)}`}>
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function NewCueForm({ cues, onAdd, onClose, CUE_DEPTS }) {
  const [dept, setDept] = useState(Object.keys(CUE_DEPTS)[0]);
  const [num, setNum] = useState(nextCueNumber(cues, Object.keys(CUE_DEPTS)[0]));
  const [desc, setDesc] = useState('');
  const duplicate = num !== '' && isDuplicateCue(cues, dept, num);

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  function handleDeptChange(d) {
    setDept(d);
    setNum(nextCueNumber(cues, d));
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>Add cue</div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 2.5fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>DEPARTMENT</label>
          <select className="td-focusable" style={inputStyle} value={dept} onChange={(e) => handleDeptChange(e.target.value)}>
            {Object.keys(CUE_DEPTS).map((d) => (
              <option key={d} value={d}>{CUE_DEPTS[d].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>CUE #</label>
          <input className="td-focusable" type="number" min="1" style={inputStyle} value={num} onChange={(e) => setNum(e.target.value)} />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>DESCRIPTION</label>
          <input className="td-focusable" style={inputStyle} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What happens on this cue" />
        </div>
      </div>
      {duplicate && (
        <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, marginTop: 8 }}>
          {CUE_DEPTS[dept].label} {num} already exists on this cue sheet.
        </div>
      )}
      <button
        className="td-focusable"
        disabled={!String(num).trim() || !desc.trim() || duplicate}
        onClick={() => onAdd({ id: `q${Date.now()}`, num: Number(num), dept, desc: desc.trim(), fired: false })}
        style={{
          marginTop: 14,
          background: String(num).trim() && desc.trim() && !duplicate ? COLOR.amber : COLOR.slateDim,
          color: String(num).trim() && desc.trim() && !duplicate ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: String(num).trim() && desc.trim() && !duplicate ? 'pointer' : 'not-allowed',
        }}
      >
        Add to cue sheet
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RUN OF SHOW MODULE
// ---------------------------------------------------------------------------
function RunOfShowModule({ show, cueSheets, setCueSheets, CUE_DEPTS }) {
  const [showCueForm, setShowCueForm] = useState(false);
  const cues = show ? cueSheets[show.id] || [] : [];
  const firedCount = cues.filter((c) => c.fired).length;
  const nextIndex = cues.findIndex((c) => !c.fired);

  function fireCue(id) {
    setCueSheets((prev) => ({
      ...prev,
      [show.id]: (prev[show.id] || []).map((c) => (c.id === id ? { ...c, fired: true } : c)),
    }));
  }
  function resetShow() {
    setCueSheets((prev) => ({
      ...prev,
      [show.id]: (prev[show.id] || []).map((c) => ({ ...c, fired: false })),
    }));
  }
  function addCue(cue) {
    setCueSheets((prev) => ({ ...prev, [show.id]: [...(prev[show.id] || []), cue] }));
    setShowCueForm(false);
  }
  function saveCue(id, draft) {
    setCueSheets((prev) => ({
      ...prev,
      [show.id]: (prev[show.id] || []).map((c) => (c.id === id ? { ...c, num: Number(draft.num), dept: draft.dept, desc: draft.desc } : c)),
    }));
  }
  function removeCue(id) {
    setCueSheets((prev) => ({ ...prev, [show.id]: (prev[show.id] || []).filter((c) => c.id !== id) }));
  }
  function moveCue(id, direction) {
    setCueSheets((prev) => {
      const list = [...(prev[show.id] || [])];
      const idx = list.findIndex((c) => c.id === id);
      const newIdx = idx + direction;
      if (idx < 0 || newIdx < 0 || newIdx >= list.length) return prev;
      [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
      return { ...prev, [show.id]: list };
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ height: 6, background: COLOR.line, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${cues.length ? (firedCount / cues.length) * 100 : 0}%`, height: '100%', background: COLOR.green, transition: 'width 0.2s ease' }} />
          </div>
          <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, marginTop: 6, letterSpacing: '0.03em' }}>
            {firedCount} OF {cues.length} CUES CALLED
          </div>
        </div>
        <button
          onClick={() => setShowCueForm((v) => !v)}
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
            flexShrink: 0,
          }}
        >
          <Plus size={14} /> Add cue
        </button>
        <button
          onClick={resetShow}
          disabled={cues.length === 0}
          className="td-focusable"
          style={{
            background: 'transparent',
            color: cues.length === 0 ? COLOR.slateDim : COLOR.textMuted,
            border: `1px solid ${COLOR.line}`,
            borderRadius: 3,
            padding: '7px 14px',
            fontSize: 11.5,
            fontWeight: 500,
            cursor: cues.length === 0 ? 'default' : 'pointer',
            flexShrink: 0,
          }}
        >
          Reset to top of show
        </button>
      </div>

      {showCueForm && <NewCueForm cues={cues} onAdd={addCue} onClose={() => setShowCueForm(false)} CUE_DEPTS={CUE_DEPTS} />}

      {cues.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cues.map((cue, i) => (
            <CueRow
              key={cue.id}
              cue={cue}
              cues={cues}
              isNext={i === nextIndex}
              onFire={() => fireCue(cue.id)}
              onSave={(draft) => saveCue(cue.id, draft)}
              onRemove={() => removeCue(cue.id)}
              onMove={(dir) => moveCue(cue.id, dir)}
              isFirst={i === 0}
              isLast={i === cues.length - 1}
              CUE_DEPTS={CUE_DEPTS}
            />
          ))}
        </div>
      ) : (
        <StubPanel label={`No cue sheet posted for ${show.title} yet — add the first cue above`} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SETTINGS MODULE
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// TAXONOMY EDITOR — a single editable category list (department, cast type,
// staff area, instrument section, inventory category, cue department).
// Existing entries keep their original icon; new entries get a shared
// fallback icon since there's no icon picker here.
// ---------------------------------------------------------------------------
function TaxonomyEditor({ title, note, map, order, setMap, setOrder, defaultIcon }) {
  const [newLabel, setNewLabel] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [labelDraft, setLabelDraft] = useState('');

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '5px 8px',
    color: COLOR.textPrimary,
    fontSize: 12,
  };

  function slugify(label) {
    const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
    let key = base;
    let n = 1;
    while (map[key]) key = `${base}_${++n}`;
    return key;
  }
  function addEntry() {
    if (!newLabel.trim()) return;
    const key = slugify(newLabel);
    setMap((prev) => ({ ...prev, [key]: { label: newLabel.trim(), icon: defaultIcon } }));
    setOrder((prev) => [...prev, key]);
    setNewLabel('');
  }
  function saveLabel(key) {
    const label = labelDraft.trim();
    if (!label) return;
    setMap((prev) => ({ ...prev, [key]: { ...prev[key], label } }));
    setEditingKey(null);
  }
  function removeEntry(key) {
    setMap((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setOrder((prev) => prev.filter((k) => k !== key));
  }

  return (
    <div style={{ border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '12px 14px' }}>
      <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: note ? 4 : 10 }}>
        {title.toUpperCase()}
      </div>
      {note && <div className="td-body" style={{ fontSize: 10.5, color: COLOR.textFaint, marginBottom: 10, lineHeight: 1.4 }}>{note}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {order.filter((key) => map[key]).map((key) => {
          const entry = map[key];
          const Icon = entry.icon || defaultIcon;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Icon size={12.5} color={COLOR.textMuted} strokeWidth={1.75} />
              {editingKey === key ? (
                <>
                  <input
                    className="td-focusable"
                    autoFocus
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveLabel(key)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={() => saveLabel(key)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.amber, cursor: 'pointer', display: 'flex' }} aria-label="Save">
                    <Check size={13} />
                  </button>
                </>
              ) : (
                <>
                  <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, flex: 1 }}>{entry.label}</span>
                  <button
                    onClick={() => { setEditingKey(key); setLabelDraft(entry.label); }}
                    className="td-focusable"
                    style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
                    aria-label={`Rename ${entry.label}`}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => removeEntry(key)}
                    className="td-focusable"
                    style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
                    aria-label={`Remove ${entry.label}`}
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          );
        })}
        {order.filter((key) => map[key]).length === 0 && (
          <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>Nothing here yet.</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="td-focusable"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEntry()}
          placeholder="Add new..."
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={addEntry}
          disabled={!newLabel.trim()}
          className="td-focusable"
          style={{
            background: 'none',
            border: `1px solid ${newLabel.trim() ? COLOR.amber : COLOR.line}`,
            color: newLabel.trim() ? COLOR.amber : COLOR.textFaint,
            borderRadius: 3,
            padding: '5px 9px',
            cursor: newLabel.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
          }}
          aria-label={`Add to ${title}`}
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

function SettingsModule({
  venues, setVenues, locations, setLocations, instruments, setInstruments, onReset,
  DEPARTMENTS, setDEPARTMENTS, DEPARTMENT_ORDER, setDEPARTMENT_ORDER,
  CAST_TYPES, setCAST_TYPES, CAST_TYPE_ORDER, setCAST_TYPE_ORDER,
  STAFF_AREAS, setSTAFF_AREAS, STAFF_AREA_ORDER, setSTAFF_AREA_ORDER,
  MUSIC_SECTIONS, setMUSIC_SECTIONS, MUSIC_SECTION_ORDER, setMUSIC_SECTION_ORDER,
  INVENTORY_CATEGORIES, setINVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER, setINVENTORY_CATEGORY_ORDER,
  CUE_DEPTS, setCUE_DEPTS, CUE_DEPT_ORDER, setCUE_DEPT_ORDER,
  lastSavedAt, persistenceError, orgId, onSignOut,
}) {
  const [newVenue, setNewVenue] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newInstrument, setNewInstrument] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [orgName, setOrgName] = useState('your company');

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('orgs')
      .select('name')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setOrgName(data.name);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  function addVenue() {
    const v = newVenue.trim();
    if (!v || venues.includes(v)) return;
    setVenues((prev) => [...prev, v]);
    setNewVenue('');
  }
  function removeVenue(v) {
    setVenues((prev) => prev.filter((x) => x !== v));
  }

  function addLocation() {
    const l = newLocation.trim();
    if (!l || locations.includes(l)) return;
    setLocations((prev) => [...prev, l]);
    setNewLocation('');
  }
  function removeLocation(l) {
    setLocations((prev) => prev.filter((x) => x !== l));
  }

  function addInstrument() {
    const i = newInstrument.trim();
    if (!i || instruments.includes(i)) return;
    setInstruments((prev) => [...prev, i]);
    setNewInstrument('');
  }
  function removeInstrument(i) {
    setInstruments((prev) => prev.filter((x) => x !== i));
  }

  const sectionTitle = { fontSize: 13, color: COLOR.textMuted, letterSpacing: '0.05em', marginBottom: 4 };
  const sectionNote = { fontSize: 12.5, color: COLOR.textFaint, marginBottom: 14 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 640 }}>
      {/* Venues & Spaces */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <MapPin size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Venues &amp; Spaces</span>
        </div>
        <div className="td-body" style={sectionNote}>These appear in the venue list when a production is added to the board.</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {venues.map((v) => (
            <span
              key={v}
              className="td-mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11.5,
                color: COLOR.textPrimary,
                border: `1px solid ${COLOR.line}`,
                borderRadius: 20,
                padding: '5px 8px 5px 12px',
              }}
            >
              {v}
              <button
                onClick={() => removeVenue(v)}
                className="td-focusable"
                style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
                aria-label={`Remove ${v}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="td-focusable"
            value={newVenue}
            onChange={(e) => setNewVenue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addVenue()}
            placeholder="Add a space, e.g. Courtyard Stage"
            style={{
              background: COLOR.void,
              border: `1px solid ${COLOR.line}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLOR.textPrimary,
              fontSize: 13,
              flex: 1,
              maxWidth: 280,
            }}
          />
          <button
            onClick={addVenue}
            disabled={!newVenue.trim()}
            className="td-focusable"
            style={{
              background: newVenue.trim() ? COLOR.amber : COLOR.slateDim,
              color: newVenue.trim() ? COLOR.void : COLOR.textFaint,
              border: 'none',
              borderRadius: 3,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: newVenue.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Locations */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Box size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Locations</span>
        </div>
        <div className="td-body" style={sectionNote}>Storage and staging spots — anywhere a location is picked (inventory, set pieces) pulls from this list.</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {locations.map((l) => (
            <span
              key={l}
              className="td-mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11.5,
                color: COLOR.textPrimary,
                border: `1px solid ${COLOR.line}`,
                borderRadius: 20,
                padding: '5px 8px 5px 12px',
              }}
            >
              {l}
              <button
                onClick={() => removeLocation(l)}
                className="td-focusable"
                style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
                aria-label={`Remove ${l}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="td-focusable"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLocation()}
            placeholder="Add a location, e.g. Paint Loft"
            style={{
              background: COLOR.void,
              border: `1px solid ${COLOR.line}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLOR.textPrimary,
              fontSize: 13,
              flex: 1,
              maxWidth: 280,
            }}
          />
          <button
            onClick={addLocation}
            disabled={!newLocation.trim()}
            className="td-focusable"
            style={{
              background: newLocation.trim() ? COLOR.amber : COLOR.slateDim,
              color: newLocation.trim() ? COLOR.void : COLOR.textFaint,
              border: 'none',
              borderRadius: 3,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: newLocation.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Instruments */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Music size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Instruments</span>
        </div>
        <div className="td-body" style={sectionNote}>What shows up when picking a musician's instrument on the Band page.</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {instruments.map((i) => (
            <span
              key={i}
              className="td-mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11.5,
                color: COLOR.textPrimary,
                border: `1px solid ${COLOR.line}`,
                borderRadius: 20,
                padding: '5px 8px 5px 12px',
              }}
            >
              {i}
              <button
                onClick={() => removeInstrument(i)}
                className="td-focusable"
                style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
                aria-label={`Remove ${i}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="td-focusable"
            value={newInstrument}
            onChange={(e) => setNewInstrument(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addInstrument()}
            placeholder="Add an instrument, e.g. Oboe"
            style={{
              background: COLOR.void,
              border: `1px solid ${COLOR.line}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLOR.textPrimary,
              fontSize: 13,
              flex: 1,
              maxWidth: 280,
            }}
          />
          <button
            onClick={addInstrument}
            disabled={!newInstrument.trim()}
            className="td-focusable"
            style={{
              background: newInstrument.trim() ? COLOR.amber : COLOR.slateDim,
              color: newInstrument.trim() ? COLOR.void : COLOR.textFaint,
              border: 'none',
              borderRadius: 3,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: newInstrument.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Categories & taxonomies */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Layers size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Categories & taxonomies</span>
        </div>
        <div className="td-body" style={sectionNote}>
          The vocabulary that threads through Crew, Cast, Band, Staff, Inventory, Set, and Run of Show. Rename or remove existing entries, or add new ones — everywhere these show up as a picker pulls from this list.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <TaxonomyEditor
            title="Crew rosters"
            note="Departments crew members belong to, per show."
            map={DEPARTMENTS}
            order={DEPARTMENT_ORDER}
            setMap={setDEPARTMENTS}
            setOrder={setDEPARTMENT_ORDER}
            defaultIcon={Layers}
          />
          <TaxonomyEditor
            title="Cast types"
            note="How actors are grouped — lead, ensemble, understudy..."
            map={CAST_TYPES}
            order={CAST_TYPE_ORDER}
            setMap={setCAST_TYPES}
            setOrder={setCAST_TYPE_ORDER}
            defaultIcon={Star}
          />
          <TaxonomyEditor
            title="Staff areas"
            note="Directing, back office, and other production staff."
            map={STAFF_AREAS}
            order={STAFF_AREA_ORDER}
            setMap={setSTAFF_AREAS}
            setOrder={setSTAFF_AREA_ORDER}
            defaultIcon={Briefcase}
          />
          <TaxonomyEditor
            title="Band sections"
            note="Instrument parts — keys, strings, winds..."
            map={MUSIC_SECTIONS}
            order={MUSIC_SECTION_ORDER}
            setMap={setMUSIC_SECTIONS}
            setOrder={setMUSIC_SECTION_ORDER}
            defaultIcon={Music}
          />
          <TaxonomyEditor
            title="Inventory categories"
            note="How gear is grouped in the stock room."
            map={INVENTORY_CATEGORIES}
            order={INVENTORY_CATEGORY_ORDER}
            setMap={setINVENTORY_CATEGORIES}
            setOrder={setINVENTORY_CATEGORY_ORDER}
            defaultIcon={Boxes}
          />
          <TaxonomyEditor
            title="Cue departments"
            note="LX, sound, fly... the prefix on every cue number."
            map={CUE_DEPTS}
            order={CUE_DEPT_ORDER}
            setMap={setCUE_DEPTS}
            setOrder={setCUE_DEPT_ORDER}
            defaultIcon={ClipboardList}
          />
        </div>
      </div>

        {/* Persistence */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Check size={14} color={persistenceError ? COLOR.amber : COLOR.green} strokeWidth={1.75} />
            <span className="td-display" style={sectionTitle}>
              Saving{lastSavedAt ? ` — last saved ${lastSavedAt.toLocaleTimeString()}` : ''}
            </span>
          </div>
          {persistenceError && (
            <div className="td-body" style={{ ...sectionNote, color: COLOR.amber }}>
              Couldn't reach the database — recent changes may not have been saved. Check your connection; the app keeps retrying as you work.
            </div>
          )}
        </div>

      {/* Data */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <RotateCcw size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Data</span>
        </div>
        <div className="td-body" style={{ ...sectionNote, color: COLOR.amber }}>
          This clears production data for your whole company — every show, every roster, everything — for everyone signed in, not just this device. Restores the sample board in its place.
        </div>
        {confirmingReset ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
            <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted }}>
              Type your company's name (<strong>{orgName}</strong>) to confirm. This can't be undone.
            </span>
            <input
              className="td-focusable"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder={orgName}
              style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 10px', color: COLOR.textPrimary, fontSize: 12.5 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { onReset(); setConfirmingReset(false); setResetConfirmText(''); }}
                disabled={resetConfirmText.trim() !== orgName}
                className="td-focusable"
                style={{
                  background: resetConfirmText.trim() === orgName ? COLOR.amber : COLOR.slateDim,
                  color: resetConfirmText.trim() === orgName ? COLOR.void : COLOR.textFaint,
                  border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 700,
                  cursor: resetConfirmText.trim() === orgName ? 'pointer' : 'not-allowed',
                }}
              >
                Confirm reset
              </button>
              <button
                onClick={() => { setConfirmingReset(false); setResetConfirmText(''); }}
                className="td-focusable"
                style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingReset(true)}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
          >
            <RotateCcw size={13} /> Reset to demo data
          </button>
        )}
      </div>

      {/* Members */}
        <MembersPanel orgId={orgId} sectionTitle={sectionTitle} sectionNote={sectionNote} />

        {/* Company */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Users size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Company</span>
        </div>
        <div className="td-body" style={sectionNote}>
          Share this ID with teammates so they can join <strong>{orgName}</strong> from the "Join existing" option when they sign up.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <code style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 10px', color: COLOR.textMuted, fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace" }}>
            {orgId}
          </code>
          <button
            onClick={() => navigator.clipboard && navigator.clipboard.writeText(orgId)}
            className="td-focusable"
            style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}
          >
            Copy
          </button>
        </div>
        <button
          onClick={onSignOut}
          className="td-focusable"
          style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PEOPLE SIGN-IN — the same self-service pattern as Crew's identity flow,
// generalized so Actors, Staff, and Musicians each get their own roster
// and their own vocabulary for what a "role" means.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// AUDIO OPTIONS — the mic'd toggle for actors, and the electric/monitor-mix
// toggles for musicians. Feeds the mic plot and channel plot directly.
// ---------------------------------------------------------------------------
function AudioOptionsFields({ audioOptions, value, onChange }) {
  if (!audioOptions) return null;
  const rowStyle = { display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' };
  const checkboxLabel = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' };
  const smallInput = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '5px 8px',
    color: COLOR.textPrimary,
    fontSize: 12,
    width: 150,
  };

  if (audioOptions === 'mic') {
    return (
      <div style={rowStyle}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!value.miced}
            onChange={(e) => onChange({ ...value, miced: e.target.checked, micType: e.target.checked ? value.micType || 'Wireless Lav' : '' })}
          />
          <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>Mic'd for this show</span>
        </label>
        {value.miced && (
          <input
            className="td-focusable"
            style={smallInput}
            value={value.micType || ''}
            onChange={(e) => onChange({ ...value, micType: e.target.value })}
            placeholder="Mic type"
          />
        )}
      </div>
    );
  }

  if (audioOptions === 'electric') {
    return (
      <div style={rowStyle}>
        <label style={checkboxLabel}>
          <input type="checkbox" checked={!!value.electric} onChange={(e) => onChange({ ...value, electric: e.target.checked })} />
          <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>Plays electric</span>
        </label>
        <label style={checkboxLabel}>
          <input type="checkbox" checked={!!value.monitorMix} onChange={(e) => onChange({ ...value, monitorMix: e.target.checked })} />
          <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>Needs own monitor mix</span>
        </label>
      </div>
    );
  }

  return null;
}

function PeopleSignIn({ personLabel, roleLabel, rolePlaceholder, roleOptions, categoryMap, categoryOrder, audioOptions, show, people, setPeople, currentUserId, setCurrentUserId }) {
  const currentUser = people.find((p) => p.id === currentUserId);
  const currentAssignment = currentUser ? assignmentFor(currentUser, show.id) : null;
  const [name, setName] = useState('');
  const [step, setStep] = useState('name');
  const [matchedPerson, setMatchedPerson] = useState(null);
  const [roleTitle, setRoleTitle] = useState('');
  const [category, setCategory] = useState(categoryOrder[0]);
  const [audioFields, setAudioFields] = useState({ miced: false, micType: '', electric: false, monitorMix: false });

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  if (currentUser && currentAssignment) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: COLOR.card,
          border: `1px solid ${COLOR.lineBright}`,
          borderRadius: 4,
          padding: '10px 16px',
          marginBottom: 20,
        }}
      >
        <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary }}>
          Signed in as <strong>{currentUser.name}</strong>
          <span className="td-mono" style={{ fontSize: 11, color: COLOR.textFaint, marginLeft: 8 }}>
            {currentAssignment.roleTitle} · {categoryMap[currentAssignment.category]?.label} · {show.title}
          </span>
        </span>
        <button
          onClick={() => setCurrentUserId(null)}
          className="td-focusable"
          style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}
        >
          Not you? Sign out
        </button>
      </div>
    );
  }

  function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = people.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (existing && assignmentFor(existing, show.id)) {
      setCurrentUserId(existing.id);
    } else if (existing) {
      setMatchedPerson(existing);
      setStep('link');
    } else {
      setMatchedPerson(null);
      setStep('new');
    }
  }

  function handleJoin() {
    if (!roleTitle.trim()) return;
    if (matchedPerson) {
      const newAssignment = { id: `asn-${matchedPerson.id}-${show.id}`, showId: show.id, roleTitle: roleTitle.trim(), category, ...audioFields };
      setPeople((prev) => prev.map((p) => (p.id === matchedPerson.id ? { ...p, assignments: [...(p.assignments || []), newAssignment] } : p)));
      setCurrentUserId(matchedPerson.id);
    } else {
      const newId = `p${Date.now()}`;
      const newAssignment = { id: `asn-${newId}-${show.id}`, showId: show.id, roleTitle: roleTitle.trim(), category, ...audioFields };
      setPeople((prev) => [...prev, { id: newId, name: name.trim(), assignments: [newAssignment] }]);
      setCurrentUserId(newId);
    }
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 16, marginBottom: 20 }}>
      {step === 'name' ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ flex: 1, maxWidth: 260 }}>
            <label className="td-mono" style={labelStyle}>WHO'S SIGNING ON?</label>
            <input
              className="td-focusable"
              style={{ ...inputStyle, width: '100%' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
              placeholder="Type your name"
            />
          </div>
          <button
            onClick={handleContinue}
            disabled={!name.trim()}
            className="td-focusable"
            style={{
              background: name.trim() ? COLOR.amber : COLOR.slateDim,
              color: name.trim() ? COLOR.void : COLOR.textFaint,
              border: 'none',
              borderRadius: 3,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: name.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Continue
          </button>
        </div>
      ) : (
        <div>
          <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, marginBottom: 12 }}>
            {step === 'link'
              ? `${matchedPerson.name} is on the ${personLabel} list but not linked to ${show.title} yet — what's your role here?`
              : `${name} isn't on the ${personLabel} list yet — finish your profile to join.`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="td-mono" style={labelStyle}>{roleLabel} ON {show.title.toUpperCase()}</label>
              {roleOptions ? (
                <select className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)}>
                  <option value="">Choose...</option>
                  {roleOptions.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder={rolePlaceholder} />
              )}
            </div>
            <div>
              <label className="td-mono" style={labelStyle}>CATEGORY</label>
              <select className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categoryOrder.map((c) => (
                  <option key={c} value={c}>{categoryMap[c].label}</option>
                ))}
              </select>
            </div>
          </div>
          <AudioOptionsFields audioOptions={audioOptions} value={audioFields} onChange={setAudioFields} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={handleJoin}
              disabled={!roleTitle.trim()}
              className="td-focusable"
              style={{
                background: roleTitle.trim() ? COLOR.amber : COLOR.slateDim,
                color: roleTitle.trim() ? COLOR.void : COLOR.textFaint,
                border: 'none',
                borderRadius: 3,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: roleTitle.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {step === 'link' ? `Join ${show.title}` : 'Join'}
            </button>
            <button
              onClick={() => setStep('name')}
              className="td-focusable"
              style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PEOPLE ROSTER ROW + GROUPED LIST
// ---------------------------------------------------------------------------
function PeopleRosterRow({ person, show, shows, categoryMap, categoryOrder, roleLabel, roleOptions, audioOptions, setPeople }) {
  const [editing, setEditing] = useState(false);
  const assignment = show ? assignmentFor(person, show.id) : null;
  const history = show ? (person.assignments || []).filter((a) => a.showId !== show.id) : (person.assignments || []);
  const [draft, setDraft] = useState({
    name: person.name,
    roleTitle: assignment?.roleTitle || '',
    category: assignment?.category || categoryOrder[0],
    miced: assignment?.miced || false,
    micType: assignment?.micType || '',
    electric: assignment?.electric || false,
    monitorMix: assignment?.monitorMix || false,
  });
  const Icon = assignment ? categoryMap[assignment.category]?.icon : null;

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '6px 9px',
    color: COLOR.textPrimary,
    fontSize: 12.5,
    width: '100%',
  };
  const labelStyle = { fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  function startEdit() {
    setDraft({
      name: person.name,
      roleTitle: assignment?.roleTitle || '',
      category: assignment?.category || categoryOrder[0],
      miced: assignment?.miced || false,
      micType: assignment?.micType || '',
      electric: assignment?.electric || false,
      monitorMix: assignment?.monitorMix || false,
    });
    setEditing(true);
  }
  function save() {
    setPeople((prev) =>
      prev.map((p) => {
        if (p.id !== person.id) return p;
        if (!show) return { ...p, name: draft.name.trim() };
        const others = (p.assignments || []).filter((a) => a.showId !== show.id);
        const newAssignment = {
          id: assignment?.id || `asn-${p.id}-${show.id}`,
          showId: show.id,
          roleTitle: draft.roleTitle.trim(),
          category: draft.category,
          miced: draft.miced,
          micType: draft.micType,
          electric: draft.electric,
          monitorMix: draft.monitorMix,
        };
        return { ...p, name: draft.name.trim(), assignments: [...others, newAssignment] };
      })
    );
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ padding: '12px 4px', borderBottom: `1px solid ${COLOR.line}`, background: COLOR.panel }}>
        {show && (
          <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.blueprint, letterSpacing: '0.04em', marginBottom: 8 }}>
            {roleLabel} & CATEGORY ARE SPECIFIC TO {show.title.toUpperCase()}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: show ? '1.2fr 1.2fr 1fr' : '1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>NAME</label>
            <input className="td-focusable" style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          {show && (
            <>
              <div>
                <label className="td-mono" style={labelStyle}>{roleLabel}</label>
                {roleOptions ? (
                  <select className="td-focusable" style={inputStyle} value={draft.roleTitle} onChange={(e) => setDraft({ ...draft, roleTitle: e.target.value })}>
                    <option value="">Choose...</option>
                    {roleOptions.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                    {draft.roleTitle && !roleOptions.includes(draft.roleTitle) && (
                      <option value={draft.roleTitle}>{draft.roleTitle} (not in list)</option>
                    )}
                  </select>
                ) : (
                  <input className="td-focusable" style={inputStyle} value={draft.roleTitle} onChange={(e) => setDraft({ ...draft, roleTitle: e.target.value })} />
                )}
              </div>
              <div>
                <label className="td-mono" style={labelStyle}>CATEGORY</label>
                <select className="td-focusable" style={inputStyle} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {categoryOrder.map((c) => (
                    <option key={c} value={c}>{categoryMap[c].label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        {show && <AudioOptionsFields audioOptions={audioOptions} value={draft} onChange={setDraft} />}
        {history.length > 0 && (
          <div style={{ marginBottom: 10, marginTop: 10 }}>
            <label className="td-mono" style={labelStyle}>{show ? 'HISTORY (OTHER SHOWS)' : 'SHOW HISTORY'}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {history.map((a) => {
                const s = shows.find((sh) => sh.id === a.showId);
                return (
                  <span key={a.id} className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '3px 8px' }}>
                    {s ? s.title : a.showId} — {a.roleTitle}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={save}
            disabled={!draft.name.trim() || (!!show && !draft.roleTitle.trim())}
            className="td-focusable"
            style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="td-focusable"
            style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 14px', fontSize: 11.5, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 4px',
        borderBottom: `1px solid ${COLOR.line}`,
        gap: 12,
      }}
    >
      <div style={{ minWidth: 160 }}>
        <div className="td-body" style={{ fontSize: 13.5, color: COLOR.textPrimary, fontWeight: 500 }}>{person.name}</div>
        {show && (
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 2, fontStyle: assignment ? 'normal' : 'italic' }}>
            {assignment ? assignment.roleTitle : `Not on ${show.title}`}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
        {history.map((a) => {
          const s = shows.find((sh) => sh.id === a.showId);
          return (
            <span key={a.id} className="td-mono" style={{ fontSize: 9.5, color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '2px 6px' }}>
              {s ? s.title : a.showId} — {a.roleTitle}
            </span>
          );
        })}
        {audioOptions === 'mic' && assignment?.miced && (
          <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '2px 6px' }}>
            MIC'D · {assignment.micType || 'Wireless Lav'}
          </span>
        )}
        {audioOptions === 'electric' && assignment?.electric && (
          <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '2px 6px' }}>
            ELECTRIC{assignment.monitorMix ? ' · OWN MIX' : ''}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {Icon && <Icon size={13} color={COLOR.textFaint} strokeWidth={1.75} />}
        {!show || assignment ? (
          <button onClick={startEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${person.name}`}>
            <Pencil size={13} strokeWidth={1.75} />
          </button>
        ) : (
          <button
            onClick={startEdit}
            className="td-focusable"
            style={{ background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '3px 9px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}
          >
            Add to show
          </button>
        )}
      </div>
    </div>
  );
}

function PeopleRosterGroups({ people, show, shows, categoryMap, categoryOrder, roleLabel, roleOptions, audioOptions, setPeople }) {
  const onShow = show ? people.filter((p) => assignmentFor(p, show.id)) : [];
  const notOnShow = show ? people.filter((p) => !assignmentFor(p, show.id)) : people;

  const grouped = useMemo(() => {
    if (!show) return {};
    const g = {};
    categoryOrder.forEach((c) => (g[c] = []));
    onShow.forEach((p) => {
      const a = assignmentFor(p, show.id);
      if (!g[a.category]) g[a.category] = [];
      g[a.category].push(p);
    });
    return g;
  }, [onShow, show, categoryOrder]);

  return (
    <div>
      {show && onShow.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 26 }}>
          {categoryOrder.filter((c) => grouped[c] && grouped[c].length > 0).map((c) => {
            const Icon = categoryMap[c].icon;
            return (
              <div key={c}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <Icon size={14} color={COLOR.textMuted} strokeWidth={1.75} />
                  <span className="td-display" style={{ fontSize: 13, color: COLOR.textMuted, letterSpacing: '0.05em' }}>
                    {categoryMap[c].label} — {grouped[c].length}
                  </span>
                </div>
                <div>
                  {grouped[c].map((p) => (
                    <PeopleRosterRow key={p.id} person={p} show={show} shows={shows} categoryMap={categoryMap} categoryOrder={categoryOrder} roleLabel={roleLabel} roleOptions={roleOptions} audioOptions={audioOptions} setPeople={setPeople} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {show && onShow.length === 0 && (
        <div style={{ marginBottom: 26 }}>
          <StubPanel label={`No one is on ${show.title} yet`} />
        </div>
      )}

      {notOnShow.length > 0 && (
        <div>
          {show && (
            <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10 }}>
              REST OF THE COMPANY — {notOnShow.length}
            </div>
          )}
          <div>
            {notOnShow.map((p) => (
              <PeopleRosterRow key={p.id} person={p} show={show} shows={shows} categoryMap={categoryMap} categoryOrder={categoryOrder} roleLabel={roleLabel} roleOptions={roleOptions} audioOptions={audioOptions} setPeople={setPeople} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW PERSON FORM (manual add, for whoever isn't signing themselves up)
// ---------------------------------------------------------------------------
function NewPersonForm({ show, personLabel, roleLabel, rolePlaceholder, roleOptions, categoryMap, categoryOrder, audioOptions, onAdd, onClose }) {
  const [name, setName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [category, setCategory] = useState(categoryOrder[0]);
  const [audioFields, setAudioFields] = useState({ miced: false, micType: '', electric: false, monitorMix: false });

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {show ? `Add to ${show.title}` : `Add to ${personLabel} list`}
        </div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: show ? '1.4fr 1.4fr 1fr' : '1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>NAME</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        {show && (
          <>
            <div>
              <label className="td-mono" style={labelStyle}>{roleLabel} (THIS SHOW)</label>
              {roleOptions ? (
                <select className="td-focusable" style={inputStyle} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)}>
                  <option value="">Choose...</option>
                  {roleOptions.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input className="td-focusable" style={inputStyle} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder={rolePlaceholder} />
              )}
            </div>
            <div>
              <label className="td-mono" style={labelStyle}>CATEGORY</label>
              <select className="td-focusable" style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categoryOrder.map((c) => (
                  <option key={c} value={c}>{categoryMap[c].label}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {show && <AudioOptionsFields audioOptions={audioOptions} value={audioFields} onChange={setAudioFields} />}

      <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginTop: 12 }}>
        {show
          ? `If this name matches someone already on the ${personLabel} list, this just adds them to ${show.title} — it won't create a duplicate person.`
          : 'Adds a baseline entry with no show assigned yet. Pick a show later to give them a role.'}
      </div>

      <button
        className="td-focusable"
        disabled={!name.trim() || (!!show && !roleTitle.trim())}
        onClick={() =>
          onAdd({
            name: name.trim(),
            roleTitle: roleTitle.trim(),
            category,
            ...audioFields,
          })
        }
        style={{
          marginTop: 14,
          background: name.trim() && (!show || roleTitle.trim()) ? COLOR.amber : COLOR.slateDim,
          color: name.trim() && (!show || roleTitle.trim()) ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: name.trim() && (!show || roleTitle.trim()) ? 'pointer' : 'not-allowed',
        }}
      >
        Add to roster
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SHARED MODULE SHELL for Actors / Staff / Musicians
// ---------------------------------------------------------------------------
function PeopleModule({ show, shows, people, setPeople, currentUserId, setCurrentUserId, personLabel, roleLabel, rolePlaceholder, roleOptions, categoryMap, categoryOrder, audioOptions }) {
  const [showForm, setShowForm] = useState(false);

  function handleManualAdd({ name, roleTitle, category, ...audioFields }) {
    const existing = people.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (show) {
      if (existing) {
        const newAssignment = { id: `asn-${existing.id}-${show.id}`, showId: show.id, roleTitle, category, ...audioFields };
        setPeople((prev) => prev.map((p) => (p.id === existing.id ? { ...p, assignments: [...(p.assignments || []).filter((a) => a.showId !== show.id), newAssignment] } : p)));
      } else {
        const newId = `p${Date.now()}`;
        const newAssignment = { id: `asn-${newId}-${show.id}`, showId: show.id, roleTitle, category, ...audioFields };
        setPeople((prev) => [...prev, { id: newId, name, assignments: [newAssignment] }]);
      }
    } else if (!existing) {
      const newId = `p${Date.now()}`;
      setPeople((prev) => [...prev, { id: newId, name, assignments: [] }]);
    }
    setShowForm(false);
  }

  return (
    <div>
      {show ? (
        <PeopleSignIn
          personLabel={personLabel}
          roleLabel={roleLabel}
          rolePlaceholder={rolePlaceholder}
          roleOptions={roleOptions}
          categoryMap={categoryMap}
          categoryOrder={categoryOrder}
          audioOptions={audioOptions}
          show={show}
          people={people}
          setPeople={setPeople}
          currentUserId={currentUserId}
          setCurrentUserId={setCurrentUserId}
        />
      ) : (
        <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginBottom: 16 }}>
          No show selected — showing the full {personLabel} list. Pick a show from the sidebar to sign in or assign roles here.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em' }}>
          {people.length} ON THE {personLabel.toUpperCase()} LIST
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
          <Plus size={14} /> Add manually
        </button>
      </div>

      {showForm && (
        <NewPersonForm
          show={show}
          personLabel={personLabel}
          roleLabel={roleLabel}
          rolePlaceholder={rolePlaceholder}
          roleOptions={roleOptions}
          categoryMap={categoryMap}
          categoryOrder={categoryOrder}
          audioOptions={audioOptions}
          onAdd={handleManualAdd}
          onClose={() => setShowForm(false)}
        />
      )}

      {people.length > 0 ? (
        <PeopleRosterGroups people={people} show={show} shows={shows} categoryMap={categoryMap} categoryOrder={categoryOrder} roleLabel={roleLabel} roleOptions={roleOptions} audioOptions={audioOptions} setPeople={setPeople} />
      ) : (
        <StubPanel label={`No one on the ${personLabel} list yet`} />
      )}
    </div>
  );
}

function ActorsModule({ show, shows, actors, setActors, currentUserId, setCurrentUserId, CAST_TYPES, CAST_TYPE_ORDER }) {
  return (
    <PeopleModule
      show={show}
      shows={shows}
      people={actors}
      setPeople={setActors}
      currentUserId={currentUserId}
      setCurrentUserId={setCurrentUserId}
      personLabel="cast"
      roleLabel="CHARACTER"
      rolePlaceholder="e.g. Prospero, or Ensemble"
      categoryMap={CAST_TYPES}
      categoryOrder={CAST_TYPE_ORDER}
      audioOptions="mic"
    />
  );
}

function StaffModule({ show, shows, staff, setStaff, currentUserId, setCurrentUserId, STAFF_AREAS, STAFF_AREA_ORDER }) {
  return (
    <PeopleModule
      show={show}
      shows={shows}
      people={staff}
      setPeople={setStaff}
      currentUserId={currentUserId}
      setCurrentUserId={setCurrentUserId}
      personLabel="staff"
      roleLabel="TITLE"
      rolePlaceholder="e.g. Director, Producer"
      categoryMap={STAFF_AREAS}
      categoryOrder={STAFF_AREA_ORDER}
    />
  );
}

function MusiciansModule({ show, shows, musicians, setMusicians, currentUserId, setCurrentUserId, MUSIC_SECTIONS, MUSIC_SECTION_ORDER, instruments }) {
  return (
    <PeopleModule
      show={show}
      shows={shows}
      people={musicians}
      setPeople={setMusicians}
      currentUserId={currentUserId}
      setCurrentUserId={setCurrentUserId}
      personLabel="band"
      roleLabel="INSTRUMENT"
      rolePlaceholder="e.g. Violin, Piano 1"
      roleOptions={instruments}
      categoryMap={MUSIC_SECTIONS}
      categoryOrder={MUSIC_SECTION_ORDER}
      audioOptions="electric"
    />
  );
}

// ---------------------------------------------------------------------------
// CHANNEL ROW — one line of the mic/channel plot, styled like the cue and
// call rows elsewhere: channel number big and mono, type tagged, detail
// muted to the right.
// ---------------------------------------------------------------------------
function ChannelRow({ row }) {
  const typeColor = row.type === 'Mic' ? COLOR.green : row.type === 'DI' ? COLOR.amber : COLOR.blueprint;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
      <span className="td-mono" style={{ fontSize: 14, color: COLOR.amber, width: 26, flexShrink: 0 }}>{String(row.channel).padStart(2, '0')}</span>
      <span
        className="td-mono"
        style={{ fontSize: 9, color: typeColor, border: `1px solid ${typeColor}`, borderRadius: 3, padding: '2px 7px', width: 60, textAlign: 'center', flexShrink: 0, letterSpacing: '0.03em' }}
      >
        {row.type.toUpperCase()}
      </span>
      <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, flex: 1 }}>{row.name}</span>
      <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>{row.detail}</span>
      <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, width: 90, textAlign: 'right', flexShrink: 0 }}>{row.subtype}</span>
    </div>
  );
}

function AudioSectionHeader({ label }) {
  return (
    <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10, marginTop: 26 }}>
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SOUND EFFECT ROW — inline-editable, like the other roster rows.
// ---------------------------------------------------------------------------
function SoundEffectRow({ effect, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(effect);

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '6px 9px',
    color: COLOR.textPrimary,
    fontSize: 12.5,
    width: '100%',
  };
  const labelStyle = { fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  if (editing) {
    return (
      <div style={{ padding: '12px 14px', border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, background: COLOR.panel }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.6fr 2fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>EFFECT</label>
            <input className="td-focusable" style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>PAGE</label>
            <input className="td-focusable" style={inputStyle} value={draft.page} onChange={(e) => setDraft({ ...draft, page: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>COMMENTS</label>
            <input className="td-focusable" style={inputStyle} value={draft.comments} onChange={(e) => setDraft({ ...draft, comments: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onSave(draft); setEditing(false); }}
            disabled={!draft.name.trim()}
            className="td-focusable"
            style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="td-focusable"
            style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 14px', fontSize: 11.5, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 14px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
      <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.blueprint, width: 44, flexShrink: 0 }}>PG {effect.page || '—'}</span>
      <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, width: 200, flexShrink: 0 }}>{effect.name}</span>
      <span className="td-body" style={{ fontSize: 12, color: COLOR.textMuted, flex: 1 }}>{effect.comments}</span>
      <button onClick={() => { setDraft(effect); setEditing(true); }} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${effect.name}`}>
        <Pencil size={13} strokeWidth={1.75} />
      </button>
      <button onClick={() => onRemove(effect.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove ${effect.name}`}>
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function NewSoundEffectForm({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const [page, setPage] = useState('');
  const [comments, setComments] = useState('');
  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>Add sound effect</div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.6fr 2fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>EFFECT</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Doorbell" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>PAGE</label>
          <input className="td-focusable" style={inputStyle} value={page} onChange={(e) => setPage(e.target.value)} placeholder="12" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>COMMENTS</label>
          <input className="td-focusable" style={inputStyle} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Timing, level, notes" />
        </div>
      </div>
      <button
        className="td-focusable"
        disabled={!name.trim()}
        onClick={() => onAdd({ id: `sfx${Date.now()}`, name: name.trim(), page: page.trim(), comments: comments.trim() })}
        style={{
          marginTop: 14,
          background: name.trim() ? COLOR.amber : COLOR.slateDim,
          color: name.trim() ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: name.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        Add effect
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AUDIO MODULE — the show's audio profile: mic plot, channel plot, monitor
// mixes, and the sound effects log. Everything above the effects log is
// derived live from the Actors and Musicians rosters.
// ---------------------------------------------------------------------------
function AudioModule({ show, actors, musicians, setShows, CAST_TYPE_ORDER, MUSIC_SECTIONS }) {
  const [showEffectForm, setShowEffectForm] = useState(false);
  const plot = useMemo(() => buildAudioPlot(show, actors, musicians, CAST_TYPE_ORDER, MUSIC_SECTIONS), [show, actors, musicians, CAST_TYPE_ORDER, MUSIC_SECTIONS]);
  const effects = show.soundEffects || [];

  function addEffect(effect) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, soundEffects: [...(s.soundEffects || []), effect] } : s)));
    setShowEffectForm(false);
  }
  function saveEffect(updated) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, soundEffects: (s.soundEffects || []).map((e) => (e.id === updated.id ? updated : e)) } : s)));
  }
  function removeEffect(id) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, soundEffects: (s.soundEffects || []).filter((e) => e.id !== id) } : s)));
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{plot.micChannels.length}</strong> mic'd
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{plot.diChannels.length}</strong> DI / electric
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{plot.monitorMixes.length}</strong> monitor mixes
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{effects.length}</strong> sound effects
        </span>
      </div>

      <AudioSectionHeader label="MIC PLOT" />
      {plot.micChannels.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plot.micChannels.map((row) => (
            <ChannelRow key={row.channel} row={row} />
          ))}
        </div>
      ) : (
        <StubPanel label="No one on the cast is mic'd yet" />
      )}

      <AudioSectionHeader label="AUDIO CHANNEL PLOT" />
      {plot.all.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plot.all.map((row) => (
            <ChannelRow key={`${row.type}-${row.channel}`} row={row} />
          ))}
        </div>
      ) : (
        <StubPanel label="No channels assigned yet" />
      )}

      <AudioSectionHeader label="MONITOR MIXES" />
      {plot.monitorMixes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plot.monitorMixes.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
              <span className="td-mono" style={{ fontSize: 13, color: COLOR.amber, width: 60 }}>MIX {i + 1}</span>
              <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, flex: 1 }}>{m.name}</span>
              <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>{m.roleTitle}</span>
            </div>
          ))}
        </div>
      ) : (
        <StubPanel label="No one needs their own monitor mix yet" />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 10 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em' }}>SOUND EFFECTS</div>
        <button
          onClick={() => setShowEffectForm((v) => !v)}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add effect
        </button>
      </div>

      {showEffectForm && <NewSoundEffectForm onAdd={addEffect} onClose={() => setShowEffectForm(false)} />}

      {effects.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {effects.map((e) => (
            <SoundEffectRow key={e.id} effect={e} onSave={saveEffect} onRemove={removeEffect} />
          ))}
        </div>
      ) : (
        <StubPanel label="No sound effects logged for this production yet" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCHEDULE HELPERS
// ---------------------------------------------------------------------------
function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function attendanceCount(entry) {
  const a = entry.attendance || {};
  return (a.crew || []).length + (a.actors || []).length + (a.musicians || []).length + (a.staff || []).length;
}

// ---------------------------------------------------------------------------
// ATTENDANCE PICKER — one column per roster, scoped to people already
// linked to this show.
// ---------------------------------------------------------------------------
function AttendancePicker({ rosters, show, attendance, onToggle }) {
  const columns = [
    { type: 'crew', label: 'Crew', icon: Users, people: rosters.crew.filter((p) => assignmentFor(p, show.id)) },
    { type: 'actors', label: 'Cast', icon: Star, people: rosters.actors.filter((p) => assignmentFor(p, show.id)) },
    { type: 'musicians', label: 'Band', icon: Music, people: rosters.musicians.filter((p) => assignmentFor(p, show.id)) },
    { type: 'staff', label: 'Staff', icon: Briefcase, people: rosters.staff.filter((p) => assignmentFor(p, show.id)) },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      {columns.map((col) => {
        const Icon = col.icon;
        return (
          <div key={col.type}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <Icon size={12} color={COLOR.textFaint} strokeWidth={1.75} />
              <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.04em' }}>
                {col.label.toUpperCase()} — {(attendance[col.type] || []).length}
              </span>
            </div>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 8px' }} className="td-scrollbar">
              {col.people.length > 0 ? (
                col.people.map((p) => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={(attendance[col.type] || []).includes(p.id)}
                      onChange={() => onToggle(col.type, p.id)}
                    />
                    <span className="td-body" style={{ fontSize: 11.5, color: COLOR.textMuted }}>{p.name}</span>
                  </label>
                ))
              ) : (
                <span className="td-body" style={{ fontSize: 10.5, color: COLOR.textFaint }}>No one assigned yet</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCHEDULE ENTRY FORM — shared by add and edit
// ---------------------------------------------------------------------------
function ScheduleEntryForm({ show, rosters, initial, onSave, onCancel }) {
  const [label, setLabel] = useState(initial?.label || '');
  const [date, setDate] = useState(initial?.date || '');
  const [time, setTime] = useState(initial?.time || '18:00');
  const [duration, setDuration] = useState(initial?.durationMinutes ?? 120);
  const [isTechWeek, setIsTechWeek] = useState(initial?.isTechWeek || false);
  const [breaks, setBreaks] = useState(initial?.breaks || []);
  const [attendance, setAttendance] = useState(initial?.attendance || { crew: [], actors: [], musicians: [], staff: [] });
  const [notes, setNotes] = useState(initial?.notes || '');

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  function addBreak() {
    setBreaks((prev) => [...prev, { id: `brk${Date.now()}`, label: 'Break', durationMinutes: 15 }]);
  }
  function updateBreak(id, field, value) {
    setBreaks((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  }
  function removeBreak(id) {
    setBreaks((prev) => prev.filter((b) => b.id !== id));
  }
  function toggleAttendance(type, personId) {
    setAttendance((prev) => ({
      ...prev,
      [type]: prev[type].includes(personId) ? prev[type].filter((x) => x !== personId) : [...prev[type], personId],
    }));
  }

  const breaksTotal = breaks.reduce((sum, b) => sum + (Number(b.durationMinutes) || 0), 0);
  const endTime = time ? formatTime12h(addMinutesToTime(time, (Number(duration) || 0) + breaksTotal)) : '';

  function handleSave() {
    if (!label.trim() || !date) return;
    onSave({
      id: initial?.id || `sd${Date.now()}`,
      label: label.trim(),
      date,
      time,
      durationMinutes: Number(duration) || 0,
      isTechWeek,
      breaks,
      attendance,
      notes: notes.trim(),
    });
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {initial ? 'Edit schedule entry' : 'Add schedule entry'}
        </div>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.8fr 0.8fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>LABEL</label>
          <input className="td-focusable" style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Tech Rehearsal" list="schedule-label-presets" />
          <datalist id="schedule-label-presets">
            {MILESTONE_PRESETS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>DATE</label>
          <input className="td-focusable" type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>TIME</label>
          <input className="td-focusable" type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>DURATION (MIN)</label>
          <input className="td-focusable" type="number" min="0" step="15" style={inputStyle} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
      </div>

      {time && (
        <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 8 }}>
          {formatTime12h(time)} – {endTime}{breaksTotal > 0 ? ` (includes ${formatDuration(breaksTotal)} of breaks)` : ''}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={isTechWeek} onChange={(e) => setIsTechWeek(e.target.checked)} />
        <span className="td-mono" style={{ fontSize: 11, color: isTechWeek ? COLOR.amber : COLOR.textMuted }}>Part of tech week</span>
        <span className="td-body" style={{ fontSize: 10.5, color: COLOR.textFaint }}>— used to catch gear double-booked across overlapping productions</span>
      </label>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <label className="td-mono" style={labelStyle}>BREAKS</label>
        {breaks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {breaks.map((b) => (
              <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'center' }}>
                <input className="td-focusable" style={inputStyle} value={b.label} onChange={(e) => updateBreak(b.id, 'label', e.target.value)} placeholder="Break label" />
                <input className="td-focusable" type="number" min="0" step="5" style={inputStyle} value={b.durationMinutes} onChange={(e) => updateBreak(b.id, 'durationMinutes', e.target.value)} />
                <button onClick={() => removeBreak(b.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex', padding: 4 }} aria-label="Remove break">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={addBreak}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 12px', fontSize: 11.5, fontWeight: 500, cursor: 'pointer' }}
        >
          <Plus size={12} /> Add a break
        </button>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <label className="td-mono" style={labelStyle}>ATTENDANCE</label>
        <AttendancePicker rosters={rosters} show={show} attendance={attendance} onToggle={toggleAttendance} />
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <label className="td-mono" style={labelStyle}>NOTES — WHAT WILL BE DONE</label>
        <textarea
          className="td-focusable"
          style={{ ...inputStyle, minHeight: 64, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What's on the agenda for this call?"
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={!label.trim() || !date}
          className="td-focusable"
          style={{
            background: label.trim() && date ? COLOR.amber : COLOR.slateDim,
            color: label.trim() && date ? COLOR.void : COLOR.textFaint,
            border: 'none',
            borderRadius: 3,
            padding: '9px 16px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.03em',
            cursor: label.trim() && date ? 'pointer' : 'not-allowed',
          }}
        >
          {initial ? 'Save changes' : 'Add to schedule'}
        </button>
        <button
          onClick={onCancel}
          className="td-focusable"
          style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '9px 16px', fontSize: 12, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCHEDULE ENTRY CARD (list view + detail panel)
// ---------------------------------------------------------------------------
function ScheduleEntryCard({ entry, onEdit, onRemove }) {
  const isPast = new Date(entry.date + 'T00:00:00') < TODAY;
  const breaksTotal = (entry.breaks || []).reduce((s, b) => s + (Number(b.durationMinutes) || 0), 0);
  const endTime = entry.time ? formatTime12h(addMinutesToTime(entry.time, (entry.durationMinutes || 0) + breaksTotal)) : '';
  const count = attendanceCount(entry);

  return (
    <div style={{ display: 'flex', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, overflow: 'hidden', opacity: isPast ? 0.6 : 1 }}>
      <div style={{ width: 92, flexShrink: 0, background: COLOR.panel, borderRight: `1px solid ${COLOR.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 6px' }}>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint }}>{formatShortDate(entry.date).toUpperCase()}</span>
        <span className="td-mono" style={{ fontSize: 13, color: COLOR.amber, marginTop: 2 }}>{formatTime12h(entry.time)}</span>
      </div>
      <div style={{ flex: 1, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="td-display" style={{ fontSize: 15, color: COLOR.textPrimary, letterSpacing: '0.02em' }}>{entry.label}</div>
              {entry.isTechWeek && (
                <span className="td-mono" style={{ fontSize: 8.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '1px 6px', letterSpacing: '0.04em' }}>
                  TECH WEEK
                </span>
              )}
            </div>
            <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 3 }}>
              {formatTime12h(entry.time)} – {endTime} · {formatDuration(entry.durationMinutes)}
              {breaksTotal > 0 ? ` + ${formatDuration(breaksTotal)} break` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={onEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${entry.label}`}>
              <Pencil size={13} />
            </button>
            <button onClick={onRemove} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove ${entry.label}`}>
              <X size={13} />
            </button>
          </div>
        </div>
        {entry.notes && <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, marginTop: 8 }}>{entry.notes}</div>}
        <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, marginTop: 8 }}>
          {count > 0 ? `${count} expected · ${(entry.attendance?.crew || []).length} crew · ${(entry.attendance?.actors || []).length} cast · ${(entry.attendance?.musicians || []).length} band · ${(entry.attendance?.staff || []).length} staff` : 'No attendance set'}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCHEDULE MODULE — list and calendar views over one show's schedule.
// ---------------------------------------------------------------------------
function ScheduleModule({ show, rosters, onScheduleChange }) {
  const [view, setView] = useState('list');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [calendarDate, setCalendarDate] = useState(TODAY);

  const schedule = show.schedule || [];
  const sorted = schedule.slice().sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));

  function addEntry(entry) {
    onScheduleChange(show.id, [...schedule, entry]);
    setAdding(false);
  }
  function saveEntry(entry) {
    onScheduleChange(show.id, schedule.map((e) => (e.id === entry.id ? entry : e)));
    setEditingId(null);
  }
  function removeEntry(id) {
    onScheduleChange(show.id, schedule.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const weeks = buildMonthGrid(year, month);
  const monthLabel = calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const selectedEntry = schedule.find((e) => e.id === selectedId);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['list', 'calendar'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="td-focusable"
              style={{
                background: view === v ? COLOR.amber : 'transparent',
                color: view === v ? COLOR.void : COLOR.textMuted,
                border: `1px solid ${view === v ? COLOR.amber : COLOR.line}`,
                borderRadius: 20,
                padding: '5px 14px',
                fontSize: 12,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setAdding((v) => !v); setEditingId(null); }}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add schedule entry
        </button>
      </div>

      {adding && (
        <ScheduleEntryForm show={show} rosters={rosters} onSave={addEntry} onCancel={() => setAdding(false)} />
      )}

      {view === 'list' ? (
        sorted.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map((entry) =>
              editingId === entry.id ? (
                <ScheduleEntryForm key={entry.id} show={show} rosters={rosters} initial={entry} onSave={saveEntry} onCancel={() => setEditingId(null)} />
              ) : (
                <ScheduleEntryCard
                  key={entry.id}
                  entry={entry}
                  onEdit={() => { setEditingId(entry.id); setAdding(false); }}
                  onRemove={() => removeEntry(entry.id)}
                />
              )
            )}
          </div>
        ) : (
          <StubPanel label={`No schedule entries for ${show.title} yet`} />
        )
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button onClick={() => setCalendarDate(new Date(year, month - 1, 1))} className="td-focusable" style={{ background: 'none', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, padding: '5px 10px', cursor: 'pointer' }}>
              ‹
            </button>
            <span className="td-display" style={{ fontSize: 15, color: COLOR.textPrimary, letterSpacing: '0.02em' }}>{monthLabel}</span>
            <button onClick={() => setCalendarDate(new Date(year, month + 1, 1))} className="td-focusable" style={{ background: 'none', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, padding: '5px 10px', cursor: 'pointer' }}>
              ›
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, textAlign: 'center', letterSpacing: '0.05em' }}>{d}</div>
            ))}
          </div>

          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
              {week.map((day, di) => {
                if (!day) return <div key={di} style={{ minHeight: 68 }} />;
                const key = dateKey(day);
                const dayEntries = schedule.filter((e) => e.date === key);
                const isToday = key === dateKey(TODAY);
                return (
                  <div
                    key={di}
                    style={{
                      minHeight: 68,
                      border: `1px solid ${isToday ? COLOR.amberDim : COLOR.line}`,
                      borderRadius: 3,
                      padding: 4,
                      background: isToday ? COLOR.panel : 'transparent',
                    }}
                  >
                    <div className="td-mono" style={{ fontSize: 9.5, color: isToday ? COLOR.amber : COLOR.textFaint, marginBottom: 3 }}>{day.getDate()}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {dayEntries.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => setSelectedId(e.id)}
                          className="td-focusable"
                          style={{
                            background: selectedId === e.id ? COLOR.amber : COLOR.card,
                            color: selectedId === e.id ? COLOR.void : COLOR.textMuted,
                            border: 'none',
                            borderLeft: e.isTechWeek ? `2px solid ${selectedId === e.id ? COLOR.void : COLOR.amber}` : 'none',
                            borderRadius: 2,
                            padding: '2px 4px',
                            fontSize: 9,
                            fontFamily: "'IBM Plex Mono', monospace",
                            textAlign: 'left',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {selectedEntry && (
            <div style={{ marginTop: 18 }}>
              {editingId === selectedEntry.id ? (
                <ScheduleEntryForm show={show} rosters={rosters} initial={selectedEntry} onSave={saveEntry} onCancel={() => setEditingId(null)} />
              ) : (
                <ScheduleEntryCard
                  entry={selectedEntry}
                  onEdit={() => setEditingId(selectedEntry.id)}
                  onRemove={() => removeEntry(selectedEntry.id)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// STAGE DIAGRAM — an actual interactive aerial view, not a fake upload.
// Click the floor to drop a numbered position marker; click a marker to
// remove it.
// ---------------------------------------------------------------------------
function StageDiagram({ markers, onChange, editable }) {
  function handleClick(e) {
    if (!editable) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
    onChange([...markers, { id: `mk${Date.now()}`, x, y }]);
  }
  function removeMarker(id, e) {
    e.stopPropagation();
    if (!editable) return;
    onChange(markers.filter((m) => m.id !== id));
  }

  return (
    <svg
      viewBox="0 0 300 200"
      preserveAspectRatio="none"
      onClick={handleClick}
      style={{
        width: '100%',
        aspectRatio: '3 / 2',
        background: COLOR.void,
        border: `1px solid ${COLOR.line}`,
        borderRadius: 4,
        cursor: editable ? 'crosshair' : 'default',
        display: 'block',
      }}
    >
      <rect x="3" y="3" width="294" height="194" fill="none" stroke={COLOR.line} strokeWidth="1" />
      <line x1="3" y1="69" x2="297" y2="69" stroke={COLOR.line} strokeWidth="0.5" strokeDasharray="3,3" />
      <line x1="3" y1="131" x2="297" y2="131" stroke={COLOR.line} strokeWidth="0.5" strokeDasharray="3,3" />
      <line x1="101" y1="3" x2="101" y2="197" stroke={COLOR.line} strokeWidth="0.5" strokeDasharray="3,3" />
      <line x1="199" y1="3" x2="199" y2="197" stroke={COLOR.line} strokeWidth="0.5" strokeDasharray="3,3" />
      <text x="150" y="15" fontSize="8" fill={COLOR.textFaint} textAnchor="middle" fontFamily="IBM Plex Mono, monospace">UPSTAGE</text>
      <text x="150" y="192" fontSize="8" fill={COLOR.textFaint} textAnchor="middle" fontFamily="IBM Plex Mono, monospace">DOWNSTAGE / AUDIENCE</text>
      {markers.map((m, i) => (
        <g key={m.id} onClick={(e) => removeMarker(m.id, e)} style={{ cursor: editable ? 'pointer' : 'default' }}>
          <circle cx={(m.x / 100) * 300} cy={(m.y / 100) * 200} r="8" fill={COLOR.amber} stroke={COLOR.void} strokeWidth="1" />
          <text x={(m.x / 100) * 300} y={(m.y / 100) * 200 + 3} fontSize="9" fontWeight="700" fill={COLOR.void} textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// CHOREOGRAPHY ENTRY FORM
// ---------------------------------------------------------------------------
function ChoreographyEntryForm({ show, actors, initial, onSave, onCancel }) {
  const [sceneId, setSceneId] = useState(initial?.sceneId || allScenes(show)[0]?.id || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl || '');
  const [videoLabel, setVideoLabel] = useState(initial?.videoLabel || '');
  const [diagrams, setDiagrams] = useState(initial?.diagrams || []);
  const [positions, setPositions] = useState(initial?.positions || []);
  const scenes = allScenes(show);
  const acts = show.acts || [];

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  function addDiagram() {
    setDiagrams((prev) => [...prev, { id: `dg${Date.now()}`, label: `Formation ${prev.length + 1}`, markers: [] }]);
  }
  function renameDiagram(id, label) {
    setDiagrams((prev) => prev.map((d) => (d.id === id ? { ...d, label } : d)));
  }
  function updateMarkers(id, markers) {
    setDiagrams((prev) => prev.map((d) => (d.id === id ? { ...d, markers } : d)));
  }
  function removeDiagram(id) {
    setDiagrams((prev) => prev.filter((d) => d.id !== id));
  }

  function addPosition() {
    setPositions((prev) => [...prev, { id: `pos${Date.now()}`, personId: '', label: '' }]);
  }
  function updatePosition(id, field, value) {
    setPositions((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, [field]: value };
        if (field === 'personId' && value && !p.label) {
          const actor = actors.find((a) => a.id === value);
          if (actor) next.label = `${actor.name} — ${actor.roleTitle}`;
        }
        return next;
      })
    );
  }
  function removePosition(id) {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  }

  function handleSave() {
    if (!sceneId) return;
    onSave({
      id: initial?.id || `ch${Date.now()}`,
      sceneId,
      notes: notes.trim(),
      videoUrl: videoUrl.trim(),
      videoLabel: videoLabel.trim(),
      diagrams,
      positions,
    });
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {initial ? 'Edit blocking' : 'Add blocking'}
        </div>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div>
        <label className="td-mono" style={labelStyle}>SONG OR SCENE</label>
        <select className="td-focusable" style={inputStyle} value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
          {scenes.length === 0 && <option value="">No scenes yet — add one on the Scenes page</option>}
          {acts.map((act) => (
            <optgroup key={act.id} label={act.name}>
              {(act.scenes || []).map((sc, i) => (
                <option key={sc.id} value={sc.id}>{i + 1}. {sc.name} ({SCENE_TYPES[sc.type]?.label})</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="td-mono" style={labelStyle}>BLOCKING NOTES</label>
        <textarea
          className="td-focusable"
          style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Formations, counts, entrances and exits, spacing notes..."
        />
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>REFERENCE VIDEO URL</label>
          <input className="td-focusable" style={inputStyle} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>VIDEO DESCRIPTION</label>
          <input className="td-focusable" style={inputStyle} value={videoLabel} onChange={(e) => setVideoLabel(e.target.value)} placeholder="e.g. Dance captain walkthrough" />
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="td-mono" style={{ ...labelStyle, marginBottom: 0 }}>AERIAL FORMATIONS</label>
          <button
            onClick={addDiagram}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}
          >
            <Plus size={12} /> Add formation
          </button>
        </div>
        <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginBottom: 10 }}>
          Click the floor to drop a numbered position. Click a marker to remove it.
        </div>
        {diagrams.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {diagrams.map((d) => (
              <div key={d.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <input
                    className="td-focusable"
                    style={{ ...inputStyle, fontSize: 11.5, padding: '5px 8px' }}
                    value={d.label}
                    onChange={(e) => renameDiagram(d.id, e.target.value)}
                  />
                  <button onClick={() => removeDiagram(d.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex', flexShrink: 0 }} aria-label="Remove formation">
                    <X size={13} />
                  </button>
                </div>
                <StageDiagram markers={d.markers} onChange={(markers) => updateMarkers(d.id, markers)} editable />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="td-mono" style={{ ...labelStyle, marginBottom: 0 }}>POSITION KEY</label>
          <button
            onClick={addPosition}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}
          >
            <Plus size={12} /> Add position
          </button>
        </div>
        <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginBottom: 10 }}>
          Maps each numbered marker above to who stands there — pick a cast member or type a role for ensemble/swing positions.
        </div>
        {positions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {positions.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '28px 1.3fr 1.3fr auto', gap: 8, alignItems: 'center' }}>
                <span className="td-mono" style={{ fontSize: 12, color: COLOR.amber, textAlign: 'center' }}>{i + 1}</span>
                <select
                  className="td-focusable"
                  style={{ ...inputStyle, fontSize: 12, padding: '6px 8px' }}
                  value={p.personId}
                  onChange={(e) => updatePosition(p.id, 'personId', e.target.value)}
                >
                  <option value="">— custom / ensemble —</option>
                  {actors.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {a.roleTitle}</option>
                  ))}
                </select>
                <input
                  className="td-focusable"
                  style={{ ...inputStyle, fontSize: 12, padding: '6px 8px' }}
                  value={p.label}
                  onChange={(e) => updatePosition(p.id, 'label', e.target.value)}
                  placeholder="Label, e.g. Ensemble — SR"
                />
                <button onClick={() => removePosition(p.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove position">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={!sceneId}
          className="td-focusable"
          style={{
            background: sceneId ? COLOR.amber : COLOR.slateDim,
            color: sceneId ? COLOR.void : COLOR.textFaint,
            border: 'none',
            borderRadius: 3,
            padding: '9px 16px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.03em',
            cursor: sceneId ? 'pointer' : 'not-allowed',
          }}
        >
          {initial ? 'Save changes' : 'Add blocking'}
        </button>
        <button
          onClick={onCancel}
          className="td-focusable"
          style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '9px 16px', fontSize: 12, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CHOREOGRAPHY ENTRY CARD
// ---------------------------------------------------------------------------
function PositionKeyTable({ positions, actors }) {
  if (!positions || positions.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, marginBottom: 6, letterSpacing: '0.04em' }}>POSITION KEY</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {positions.map((p, i) => {
          const actor = p.personId ? actors.find((a) => a.id === p.personId) : null;
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: COLOR.panel, borderRadius: 3 }}>
              <span className="td-mono" style={{ fontSize: 11, color: COLOR.amber, width: 18, flexShrink: 0 }}>{i + 1}</span>
              <span className="td-body" style={{ fontSize: 12, color: COLOR.textPrimary, flex: 1 }}>{p.label || (actor ? actor.name : '—')}</span>
              {actor && <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>{actor.roleTitle}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChoreographyEntryCard({ entry, show, actors, onEdit, onRemove }) {
  const scene = sceneById(show, entry.sceneId);
  const type = scene?.type || 'scene';
  const title = scene ? scene.name : 'Unknown scene';
  const TypeIcon = SCENE_TYPES[type]?.icon || Footprints;
  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <TypeIcon size={12} color={COLOR.textFaint} strokeWidth={1.75} />
            <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.05em' }}>
              {SCENE_TYPES[type]?.label.toUpperCase()}{scene ? ` · ${scene.actName.toUpperCase()}` : ''}
            </span>
          </div>
          <div className="td-display" style={{ fontSize: 16, color: COLOR.textPrimary, letterSpacing: '0.02em' }}>{scene ? `${scene.number}. ${title}` : title}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${title}`}>
            <Pencil size={13} />
          </button>
          <button onClick={onRemove} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove ${title}`}>
            <X size={13} />
          </button>
        </div>
      </div>

      {entry.notes && <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, marginTop: 8, lineHeight: 1.5 }}>{entry.notes}</div>}

      {entry.videoUrl && (
        <a
          href={entry.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="td-focusable"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, color: COLOR.amber, fontSize: 11.5, textDecoration: 'none' }}
        >
          <Video size={13} /> {entry.videoLabel || 'Watch reference video'} ↗
        </a>
      )}

      {entry.diagrams && entry.diagrams.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
          {entry.diagrams.map((d) => (
            <div key={d.id}>
              <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, marginBottom: 4 }}>{d.label.toUpperCase()}</div>
              <StageDiagram markers={d.markers} onChange={() => {}} editable={false} />
            </div>
          ))}
        </div>
      )}

      <PositionKeyTable positions={entry.positions} actors={actors} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CHOREOGRAPHY MODULE
// ---------------------------------------------------------------------------
function ChoreographyModule({ show, actors, setShows }) {
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const entries = show.choreography || [];
  const filtered = filter === 'all' ? entries : entries.filter((e) => sceneById(show, e.sceneId)?.type === filter);
  const showActors = actors
    .filter((a) => assignmentFor(a, show.id))
    .map((a) => ({ id: a.id, name: a.name, roleTitle: assignmentFor(a, show.id).roleTitle }));
  const hasScenes = allScenes(show).length > 0;

  function addEntry(entry) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, choreography: [...(s.choreography || []), entry] } : s)));
    setAdding(false);
  }
  function saveEntry(entry) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, choreography: (s.choreography || []).map((e) => (e.id === entry.id ? entry : e)) } : s)));
    setEditingId(null);
  }
  function removeEntry(id) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, choreography: (s.choreography || []).filter((e) => e.id !== id) } : s)));
  }

  return (
    <div>
      {!hasScenes && (
        <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginBottom: 16 }}>
          No scenes set up yet — add Acts and Scenes on the Scenes page before logging blocking.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ id: 'all', label: 'All' }, { id: 'number', label: 'Musical Numbers' }, { id: 'scene', label: 'Scenes' }].map((f) => (
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
          onClick={() => { setAdding((v) => !v); setEditingId(null); }}
          disabled={!hasScenes}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: hasScenes ? 'pointer' : 'not-allowed' }}
        >
          <Plus size={14} /> Add blocking
        </button>
      </div>

      {adding && <ChoreographyEntryForm show={show} actors={showActors} onSave={addEntry} onCancel={() => setAdding(false)} />}

      {filtered.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((entry) =>
            editingId === entry.id ? (
              <ChoreographyEntryForm key={entry.id} show={show} actors={showActors} initial={entry} onSave={saveEntry} onCancel={() => setEditingId(null)} />
            ) : (
              <ChoreographyEntryCard
                key={entry.id}
                entry={entry}
                show={show}
                actors={showActors}
                onEdit={() => { setEditingId(entry.id); setAdding(false); }}
                onRemove={() => removeEntry(entry.id)}
              />
            )
          )}
        </div>
      ) : (
        <StubPanel label={`No blocking logged for ${show.title} yet`} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SET PIECE FORM — the build list entry. Components link straight to
// inventory (e.g. a platform unit made of platform tops + legs).
// ---------------------------------------------------------------------------
function SetPieceForm({ show, inventory, setInventory, locations, initial, onSave, onCancel, INVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [buildStatus, setBuildStatus] = useState(initial?.buildStatus || 'not_started');
  const [components, setComponents] = useState(initial?.components || []);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [creatingItemFor, setCreatingItemFor] = useState(null);
  const [newItem, setNewItem] = useState({ name: '', category: 'scenic', totalQty: 1, location: locations[0] || '' });

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  function addComponent() {
    setComponents((prev) => [...prev, { id: `spc${Date.now()}`, inventoryItemId: inventory[0]?.id || '', qtyPerUnit: 1 }]);
  }
  function updateComponent(id, field, value) {
    setComponents((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }
  function removeComponent(id) {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }

  function startCreateItem(componentId) {
    setNewItem({ name: '', category: 'scenic', totalQty: components.find((c) => c.id === componentId)?.qtyPerUnit || 1, location: locations[0] || '' });
    setCreatingItemFor(componentId);
  }
  function createAndLinkItem() {
    if (!newItem.name.trim() || !newItem.location.trim()) return;
    const id = `i${Date.now()}`;
    const qty = Math.max(1, Number(newItem.totalQty) || 1);
    const item = {
      id,
      assetNo: `NEW-${String(Math.floor(Math.random() * 900) + 100)}`,
      name: newItem.name.trim(),
      category: newItem.category,
      totalQty: qty,
      location: newItem.location.trim(),
      units: [],
      costPerUnit: 0,
      purchaseDate: '',
      purchaseSource: '',
      purchaseNotes: '',
      assignments: show ? [{ id: `ia-${id}`, showId: show.id, callId: null, qty }] : [],
    };
    setInventory((prev) => [item, ...prev]);
    updateComponent(creatingItemFor, 'inventoryItemId', id);
    setCreatingItemFor(null);
  }

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      id: initial?.id || `sp${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      quantity: Math.max(1, Number(quantity) || 1),
      buildStatus,
      components,
      notes: notes.trim(),
    });
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {initial ? 'Edit set piece' : 'Add set piece'}
        </div>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>NAME</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. USR Platform Unit" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>QTY NEEDED</label>
          <input className="td-focusable" type="number" min="1" style={inputStyle} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>BUILD STATUS</label>
          <select className="td-focusable" style={inputStyle} value={buildStatus} onChange={(e) => setBuildStatus(e.target.value)}>
            {BUILD_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{BUILD_STATUSES[s].label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="td-mono" style={labelStyle}>DESCRIPTION</label>
        <input className="td-focusable" style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it, where does it live onstage" />
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="td-mono" style={{ ...labelStyle, marginBottom: 0 }}>COMPONENTS (FROM INVENTORY)</label>
          <button
            onClick={addComponent}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}
          >
            <Plus size={12} /> Add component
          </button>
        </div>
        <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginBottom: 10 }}>
          Qty is per unit — with {quantity > 1 ? `${quantity} needed, ` : ''}totals are shown once saved. Building something new? Add it to inventory right from here so it's tracked after the show.
        </div>
        {components.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {components.map((c) =>
              creatingItemFor === c.id ? (
                <div key={c.id} style={{ background: COLOR.panel, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 12 }}>
                  <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.blueprint, letterSpacing: '0.04em', marginBottom: 8 }}>NEW INVENTORY ITEM</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.7fr 1fr', gap: 8, marginBottom: 8 }}>
                    <input className="td-focusable" style={inputStyle} value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="e.g. Stair Unit, 3-step" />
                    <select className="td-focusable" style={inputStyle} value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}>
                      {INVENTORY_CATEGORY_ORDER.map((cat) => (
                        <option key={cat} value={cat}>{INVENTORY_CATEGORIES[cat].label}</option>
                      ))}
                    </select>
                    <input className="td-focusable" type="number" min="1" style={inputStyle} value={newItem.totalQty} onChange={(e) => setNewItem({ ...newItem, totalQty: e.target.value })} />
                    <select className="td-focusable" style={inputStyle} value={newItem.location} onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}>
                      {locations.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={createAndLinkItem}
                      disabled={!newItem.name.trim() || !newItem.location.trim()}
                      className="td-focusable"
                      style={{ background: newItem.name.trim() && newItem.location.trim() ? COLOR.amber : COLOR.slateDim, color: newItem.name.trim() && newItem.location.trim() ? COLOR.void : COLOR.textFaint, border: 'none', borderRadius: 3, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Create & link
                    </button>
                    <button onClick={() => setCreatingItemFor(null)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2.4fr 0.8fr auto auto', gap: 8, alignItems: 'center' }}>
                  <select className="td-focusable" style={inputStyle} value={c.inventoryItemId} onChange={(e) => updateComponent(c.id, 'inventoryItemId', e.target.value)}>
                    {inventory.map((item) => (
                      <option key={item.id} value={item.id}>{item.assetNo} — {item.name}</option>
                    ))}
                  </select>
                  <input className="td-focusable" type="number" min="1" style={inputStyle} value={c.qtyPerUnit} onChange={(e) => updateComponent(c.id, 'qtyPerUnit', e.target.value)} />
                  <button
                    onClick={() => startCreateItem(c.id)}
                    className="td-focusable"
                    style={{ background: 'none', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, padding: '6px 8px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                    aria-label="Create a new inventory item for this component"
                    title="Create a new inventory item"
                  >
                    <Plus size={13} />
                  </button>
                  <button onClick={() => removeComponent(c.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove component">
                    <X size={14} />
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <label className="td-mono" style={labelStyle}>NOTES</label>
        <textarea
          className="td-focusable"
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Build notes, bracing, finish, deadlines..."
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="td-focusable"
          style={{
            background: name.trim() ? COLOR.amber : COLOR.slateDim,
            color: name.trim() ? COLOR.void : COLOR.textFaint,
            border: 'none',
            borderRadius: 3,
            padding: '9px 16px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.03em',
            cursor: name.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          {initial ? 'Save changes' : 'Add to build list'}
        </button>
        <button
          onClick={onCancel}
          className="td-focusable"
          style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '9px 16px', fontSize: 12, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SET PIECE CARD
// ---------------------------------------------------------------------------
function SetPieceCard({ piece, inventory, onEdit, onRemove, onStatusChange }) {
  const statusMeta = BUILD_STATUSES[piece.buildStatus] || BUILD_STATUSES.not_started;

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div className="td-display" style={{ fontSize: 16, color: COLOR.textPrimary, letterSpacing: '0.02em' }}>
            {piece.name}{piece.quantity > 1 ? <span className="td-mono" style={{ fontSize: 12, color: COLOR.textFaint, marginLeft: 6 }}>× {piece.quantity}</span> : null}
          </div>
          {piece.description && <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, marginTop: 4 }}>{piece.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${piece.name}`}>
            <Pencil size={13} />
          </button>
          <button onClick={onRemove} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove ${piece.name}`}>
            <X size={13} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <select
          value={piece.buildStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className="td-focusable"
          style={{
            background: COLOR.panel,
            border: `1px solid ${statusMeta.color}`,
            color: statusMeta.color,
            borderRadius: 20,
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.04em',
            cursor: 'pointer',
          }}
        >
          {BUILD_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{BUILD_STATUSES[s].label.toUpperCase()}</option>
          ))}
        </select>
      </div>

      {piece.components && piece.components.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {piece.components.map((c) => {
            const item = inventory.find((i) => i.id === c.inventoryItemId);
            const total = c.qtyPerUnit * piece.quantity;
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.blueprint, flex: 1 }}>
                  {item ? `${item.assetNo} — ${item.name}` : 'Unknown item'}
                </span>
                <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>
                  {c.qtyPerUnit}{piece.quantity > 1 ? ` × ${piece.quantity} = ${total}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {piece.notes && <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginTop: 10, lineHeight: 1.5 }}>{piece.notes}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SET MODULE
// ---------------------------------------------------------------------------
function SetModule({ show, inventory, setInventory, locations, setShows, INVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER }) {
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const pieces = show.setPieces || [];
  const filtered = filter === 'all' ? pieces : pieces.filter((p) => p.buildStatus === filter);

  function addPiece(piece) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, setPieces: [...(s.setPieces || []), piece] } : s)));
    setAdding(false);
  }
  function savePiece(piece) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, setPieces: (s.setPieces || []).map((p) => (p.id === piece.id ? piece : p)) } : s)));
    setEditingId(null);
  }
  function removePiece(id) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, setPieces: (s.setPieces || []).filter((p) => p.id !== id) } : s)));
  }
  function changeStatus(id, buildStatus) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, setPieces: (s.setPieces || []).map((p) => (p.id === id ? { ...p, buildStatus } : p)) } : s)));
  }

  const counts = BUILD_STATUS_ORDER.reduce((acc, s) => {
    acc[s] = pieces.filter((p) => p.buildStatus === s).length;
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{pieces.length}</strong> pieces on the build list
        </span>
        {BUILD_STATUS_ORDER.map((s) => (
          <span key={s} className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
            <strong style={{ color: BUILD_STATUSES[s].color }}>{counts[s]}</strong> {BUILD_STATUSES[s].label.toLowerCase()}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ id: 'all', label: 'All' }, ...BUILD_STATUS_ORDER.map((s) => ({ id: s, label: BUILD_STATUSES[s].label }))].map((f) => (
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
          onClick={() => { setAdding((v) => !v); setEditingId(null); }}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add set piece
        </button>
      </div>

      {adding && <SetPieceForm show={show} inventory={inventory} setInventory={setInventory} locations={locations} onSave={addPiece} onCancel={() => setAdding(false)} INVENTORY_CATEGORIES={INVENTORY_CATEGORIES} INVENTORY_CATEGORY_ORDER={INVENTORY_CATEGORY_ORDER} />}

      {filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtered.map((piece) =>
            editingId === piece.id ? (
              <div key={piece.id} style={{ gridColumn: '1 / -1' }}>
                <SetPieceForm show={show} inventory={inventory} setInventory={setInventory} locations={locations} initial={piece} onSave={savePiece} onCancel={() => setEditingId(null)} INVENTORY_CATEGORIES={INVENTORY_CATEGORIES} INVENTORY_CATEGORY_ORDER={INVENTORY_CATEGORY_ORDER} />
              </div>
            ) : (
              <SetPieceCard
                key={piece.id}
                piece={piece}
                inventory={inventory}
                onEdit={() => { setEditingId(piece.id); setAdding(false); }}
                onRemove={() => removePiece(piece.id)}
                onStatusChange={(status) => changeStatus(piece.id, status)}
              />
            )
          )}
        </div>
      ) : (
        <StubPanel label={pieces.length === 0 ? `No set pieces on the build list for ${show.title} yet` : 'Nothing matches this filter'} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COSTUME FORM
// ---------------------------------------------------------------------------
function CostumeForm({ show, showActors, inventory, locations, initial, onSave, onCancel }) {
  const [actorId, setActorId] = useState(initial?.actorId || showActors[0]?.id || '');
  const [sceneId, setSceneId] = useState(initial?.sceneId || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [source, setSource] = useState(initial?.source || 'inventory');
  const [inventoryItemId, setInventoryItemId] = useState(initial?.inventoryItemId || inventory[0]?.id || '');
  const [acquired, setAcquired] = useState(initial?.acquired || false);
  const [location, setLocation] = useState(initial?.location || '');
  const [cost, setCost] = useState(initial?.cost ?? 0);
  const [notes, setNotes] = useState(initial?.notes || '');
  const acts = show.acts || [];

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  function pickInventoryItem(id) {
    setInventoryItemId(id);
    const item = inventory.find((i) => i.id === id);
    if (item && !location) setLocation(item.location);
  }

  function handleSave() {
    if (!description.trim() || !actorId) return;
    onSave({
      id: initial?.id || `co${Date.now()}`,
      actorId,
      sceneId: sceneId || null,
      description: description.trim(),
      source,
      inventoryItemId: source === 'inventory' ? inventoryItemId : null,
      acquired,
      location,
      cost: Number(cost) || 0,
      notes: notes.trim(),
    });
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {initial ? 'Edit costume need' : 'Add costume need'}
        </div>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 2fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>CASTED ROLE</label>
          <select className="td-focusable" style={inputStyle} value={actorId} onChange={(e) => setActorId(e.target.value)}>
            {showActors.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {a.roleTitle}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>SCENE</label>
          <select className="td-focusable" style={inputStyle} value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
            <option value="">Throughout / Not scene-specific</option>
            {acts.map((act) => (
              <optgroup key={act.id} label={act.name}>
                {(act.scenes || []).map((sc, i) => (
                  <option key={sc.id} value={sc.id}>{i + 1}. {sc.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>DESCRIPTION</label>
          <input className="td-focusable" style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is the piece" />
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1.4fr 0.8fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>SOURCE</label>
          <select className="td-focusable" style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)}>
            {COSTUME_SOURCE_ORDER.map((s) => (
              <option key={s} value={s}>{COSTUME_SOURCES[s].label}</option>
            ))}
          </select>
        </div>
        {source === 'inventory' ? (
          <div>
            <label className="td-mono" style={labelStyle}>INVENTORY ITEM</label>
            <select className="td-focusable" style={inputStyle} value={inventoryItemId} onChange={(e) => pickInventoryItem(e.target.value)}>
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>{item.assetNo} — {item.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="td-mono" style={labelStyle}>COST ($)</label>
            <input className="td-focusable" type="number" min="0" style={inputStyle} value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        )}
        <div>
          <label className="td-mono" style={labelStyle}>LOCATION</label>
          <select className="td-focusable" style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">Not yet acquired</option>
            {locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={acquired} onChange={(e) => setAcquired(e.target.checked)} />
        <span className="td-mono" style={{ fontSize: 11, color: acquired ? COLOR.green : COLOR.textMuted }}>Acquired</span>
      </label>

      <div style={{ marginTop: 12 }}>
        <label className="td-mono" style={labelStyle}>NOTES</label>
        <textarea
          className="td-focusable"
          style={{ ...inputStyle, minHeight: 56, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Fit notes, sizing, vendor, deadlines..."
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={!description.trim() || !actorId}
          className="td-focusable"
          style={{
            background: description.trim() && actorId ? COLOR.amber : COLOR.slateDim,
            color: description.trim() && actorId ? COLOR.void : COLOR.textFaint,
            border: 'none',
            borderRadius: 3,
            padding: '9px 16px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.03em',
            cursor: description.trim() && actorId ? 'pointer' : 'not-allowed',
          }}
        >
          {initial ? 'Save changes' : 'Add costume need'}
        </button>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '9px 16px', fontSize: 12, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// COSTUME CARD
// ---------------------------------------------------------------------------
function CostumeCard({ costume, show, inventory, onEdit, onRemove }) {
  const sourceMeta = COSTUME_SOURCES[costume.source] || COSTUME_SOURCES.buy;
  const SourceIcon = sourceMeta.icon;
  const linkedItem = costume.inventoryItemId ? inventory.find((i) => i.id === costume.inventoryItemId) : null;

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, fontWeight: 500 }}>{costume.description}</div>
          <div className="td-mono" style={{ fontSize: 10, color: COLOR.blueprint, marginTop: 3 }}>{sceneLabel(show, costume.sceneId)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Edit costume need">
            <Pencil size={12} />
          </button>
          <button onClick={onRemove} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove costume need">
            <X size={13} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <span
          className="td-mono"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: costume.acquired ? COLOR.green : COLOR.amber, border: `1px solid ${costume.acquired ? COLOR.green : COLOR.amberDim}`, borderRadius: 3, padding: '2px 7px' }}
        >
          {costume.acquired ? <Check size={10} /> : <AlertTriangle size={10} />}
          {costume.acquired ? 'ACQUIRED' : 'STILL NEEDED'}
        </span>
        <span className="td-mono" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: COLOR.textFaint }}>
          <SourceIcon size={10} /> {sourceMeta.label.toUpperCase()}
        </span>
        {costume.location && <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint }}>· {costume.location}</span>}
        {costume.cost > 0 && <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint }}>· ${costume.cost}</span>}
      </div>

      {linkedItem && (
        <div className="td-mono" style={{ fontSize: 10, color: COLOR.amber, marginTop: 6 }}>
          {linkedItem.assetNo} — {linkedItem.name}
        </div>
      )}

      {costume.notes && <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginTop: 6, lineHeight: 1.4 }}>{costume.notes}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COSTUMES MODULE
// ---------------------------------------------------------------------------
function CostumesModule({ show, actors, inventory, locations, setShows }) {
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const costumes = show.costumes || [];

  const showActors = actors
    .filter((a) => assignmentFor(a, show.id))
    .map((a) => ({ id: a.id, name: a.name, roleTitle: assignmentFor(a, show.id).roleTitle }));

  const filtered = filter === 'all' ? costumes : filter === 'acquired' ? costumes.filter((c) => c.acquired) : costumes.filter((c) => !c.acquired);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((c) => {
      if (!g[c.actorId]) g[c.actorId] = [];
      g[c.actorId].push(c);
    });
    return g;
  }, [filtered]);

  function addCostume(c) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, costumes: [...(s.costumes || []), c] } : s)));
    setAdding(false);
  }
  function saveCostume(c) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, costumes: (s.costumes || []).map((x) => (x.id === c.id ? c : x)) } : s)));
    setEditingId(null);
  }
  function removeCostume(id) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, costumes: (s.costumes || []).filter((x) => x.id !== id) } : s)));
  }

  const acquiredCount = costumes.filter((c) => c.acquired).length;
  const neededCount = costumes.length - acquiredCount;

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{costumes.length}</strong> costume needs
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.green }}>{acquiredCount}</strong> acquired
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{neededCount}</strong> still needed
        </span>
      </div>

      {showActors.length === 0 && (
        <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginBottom: 16 }}>
          No cast assigned to {show.title} yet — add actors on the Actors page before logging costume needs.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ id: 'all', label: 'All' }, { id: 'acquired', label: 'Acquired' }, { id: 'needed', label: 'Still Needed' }].map((f) => (
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
          onClick={() => { setAdding((v) => !v); setEditingId(null); }}
          disabled={showActors.length === 0}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: showActors.length ? 'pointer' : 'not-allowed' }}
        >
          <Plus size={14} /> Add costume need
        </button>
      </div>

      {adding && <CostumeForm show={show} showActors={showActors} inventory={inventory} locations={locations} onSave={addCostume} onCancel={() => setAdding(false)} />}

      {Object.keys(grouped).length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {showActors.filter((a) => grouped[a.id] && grouped[a.id].length > 0).map((a) => (
            <div key={a.id}>
              <div className="td-display" style={{ fontSize: 14, color: COLOR.textMuted, letterSpacing: '0.03em', marginBottom: 8 }}>
                {a.name} <span className="td-mono" style={{ fontSize: 11, color: COLOR.textFaint, letterSpacing: 0, textTransform: 'none' }}>— {a.roleTitle}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {grouped[a.id].map((c) =>
                  editingId === c.id ? (
                    <div key={c.id} style={{ gridColumn: '1 / -1' }}>
                      <CostumeForm show={show} showActors={showActors} inventory={inventory} locations={locations} initial={c} onSave={saveCostume} onCancel={() => setEditingId(null)} />
                    </div>
                  ) : (
                    <CostumeCard
                      key={c.id}
                      costume={c}
                      show={show}
                      inventory={inventory}
                      onEdit={() => { setEditingId(c.id); setAdding(false); }}
                      onRemove={() => removeCostume(c.id)}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <StubPanel label={costumes.length === 0 ? `No costume needs logged for ${show.title} yet` : 'Nothing matches this filter'} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROP FORM
// ---------------------------------------------------------------------------
function PropForm({ show, showActors, inventory, locations, initial, onSave, onCancel }) {
  const [sceneId, setSceneId] = useState(initial?.sceneId || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [actorId, setActorId] = useState(initial?.actorId || '');
  const [source, setSource] = useState(initial?.source || 'inventory');
  const [inventoryItemId, setInventoryItemId] = useState(initial?.inventoryItemId || inventory[0]?.id || '');
  const [acquired, setAcquired] = useState(initial?.acquired || false);
  const [consumable, setConsumable] = useState(initial?.consumable || false);
  const [location, setLocation] = useState(initial?.location || '');
  const [cost, setCost] = useState(initial?.cost ?? 0);
  const [notes, setNotes] = useState(initial?.notes || '');
  const acts = show.acts || [];

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
    width: '100%',
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  function pickInventoryItem(id) {
    setInventoryItemId(id);
    const item = inventory.find((i) => i.id === id);
    if (item && !location) setLocation(item.location);
  }

  function handleSave() {
    if (!description.trim()) return;
    onSave({
      id: initial?.id || `pr${Date.now()}`,
      sceneId: sceneId || null,
      description: description.trim(),
      actorId: actorId || null,
      source,
      inventoryItemId: source === 'inventory' ? inventoryItemId : null,
      acquired,
      consumable,
      location,
      cost: Number(cost) || 0,
      notes: notes.trim(),
    });
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {initial ? 'Edit prop need' : 'Add prop need'}
        </div>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.3fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>SCENE</label>
          <select className="td-focusable" style={inputStyle} value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
            <option value="">Throughout / Not scene-specific</option>
            {acts.map((act) => (
              <optgroup key={act.id} label={act.name}>
                {(act.scenes || []).map((sc, i) => (
                  <option key={sc.id} value={sc.id}>{i + 1}. {sc.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>DESCRIPTION</label>
          <input className="td-focusable" style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is the prop" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>USED BY (OPTIONAL)</label>
          <select className="td-focusable" style={inputStyle} value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">— Set prop, no one specific —</option>
            {showActors.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {a.roleTitle}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1.4fr 0.8fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>SOURCE</label>
          <select className="td-focusable" style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)}>
            {PROP_SOURCE_ORDER.map((s) => (
              <option key={s} value={s}>{PROP_SOURCES[s].label}</option>
            ))}
          </select>
        </div>
        {source === 'inventory' ? (
          <div>
            <label className="td-mono" style={labelStyle}>INVENTORY ITEM</label>
            <select className="td-focusable" style={inputStyle} value={inventoryItemId} onChange={(e) => pickInventoryItem(e.target.value)}>
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>{item.assetNo} — {item.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="td-mono" style={labelStyle}>COST ($)</label>
            <input className="td-focusable" type="number" min="0" style={inputStyle} value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        )}
        <div>
          <label className="td-mono" style={labelStyle}>LOCATION</label>
          <select className="td-focusable" style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">Not yet acquired</option>
            {locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
          <input type="checkbox" checked={acquired} onChange={(e) => setAcquired(e.target.checked)} />
          <span className="td-mono" style={{ fontSize: 11, color: acquired ? COLOR.green : COLOR.textMuted }}>Acquired</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
          <input type="checkbox" checked={consumable} onChange={(e) => setConsumable(e.target.checked)} />
          <span className="td-mono" style={{ fontSize: 11, color: consumable ? COLOR.amber : COLOR.textMuted }}>Consumable — restock each performance</span>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="td-mono" style={labelStyle}>NOTES</label>
        <textarea
          className="td-focusable"
          style={{ ...inputStyle, minHeight: 56, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Build notes, safety notes, vendor, deadlines..."
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={!description.trim()}
          className="td-focusable"
          style={{
            background: description.trim() ? COLOR.amber : COLOR.slateDim,
            color: description.trim() ? COLOR.void : COLOR.textFaint,
            border: 'none',
            borderRadius: 3,
            padding: '9px 16px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.03em',
            cursor: description.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          {initial ? 'Save changes' : 'Add prop need'}
        </button>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '9px 16px', fontSize: 12, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROP CARD
// ---------------------------------------------------------------------------
function PropCard({ prop, show, showActors, inventory, onEdit, onRemove }) {
  const sourceMeta = PROP_SOURCES[prop.source] || PROP_SOURCES.buy;
  const SourceIcon = sourceMeta.icon;
  const linkedItem = prop.inventoryItemId ? inventory.find((i) => i.id === prop.inventoryItemId) : null;
  const usedBy = prop.actorId ? showActors.find((a) => a.id === prop.actorId) : null;

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, fontWeight: 500 }}>{prop.description}</div>
          <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, marginTop: 3 }}>
            {usedBy ? `Used by ${usedBy.name}` : 'Set prop'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Edit prop need">
            <Pencil size={12} />
          </button>
          <button onClick={onRemove} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove prop need">
            <X size={13} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <span
          className="td-mono"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: prop.acquired ? COLOR.green : COLOR.amber, border: `1px solid ${prop.acquired ? COLOR.green : COLOR.amberDim}`, borderRadius: 3, padding: '2px 7px' }}
        >
          {prop.acquired ? <Check size={10} /> : <AlertTriangle size={10} />}
          {prop.acquired ? 'ACQUIRED' : 'STILL NEEDED'}
        </span>
        <span className="td-mono" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: COLOR.textFaint }}>
          <SourceIcon size={10} /> {sourceMeta.label.toUpperCase()}
        </span>
        {prop.consumable && (
          <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '2px 7px' }}>
            CONSUMABLE
          </span>
        )}
        {prop.location && <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint }}>· {prop.location}</span>}
        {prop.cost > 0 && <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint }}>· ${prop.cost}</span>}
      </div>

      {linkedItem && (
        <div className="td-mono" style={{ fontSize: 10, color: COLOR.amber, marginTop: 6 }}>
          {linkedItem.assetNo} — {linkedItem.name}
        </div>
      )}

      {prop.notes && <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginTop: 6, lineHeight: 1.4 }}>{prop.notes}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROPS MODULE — grouped by scene, since most props belong to a moment in
// the show more than to a single actor.
// ---------------------------------------------------------------------------
function PropsModule({ show, actors, inventory, locations, setShows }) {
  const [filter, setFilter] = useState('all');
  const [consumableOnly, setConsumableOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const props_ = show.props || [];

  const showActors = actors
    .filter((a) => assignmentFor(a, show.id))
    .map((a) => ({ id: a.id, name: a.name, roleTitle: assignmentFor(a, show.id).roleTitle }));

  const filtered = props_
    .filter((p) => (filter === 'all' ? true : filter === 'acquired' ? p.acquired : !p.acquired))
    .filter((p) => (consumableOnly ? p.consumable : true));

  const scenes = useMemo(() => {
    const order = [];
    filtered.forEach((p) => {
      if (!order.includes(p.sceneId)) order.push(p.sceneId);
    });
    return order;
  }, [filtered]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((p) => {
      if (!g[p.sceneId]) g[p.sceneId] = [];
      g[p.sceneId].push(p);
    });
    return g;
  }, [filtered]);

  const hasScenes = allScenes(show).length > 0;

  function addProp(p) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, props: [...(s.props || []), p] } : s)));
    setAdding(false);
  }
  function saveProp(p) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, props: (s.props || []).map((x) => (x.id === p.id ? p : x)) } : s)));
    setEditingId(null);
  }
  function removeProp(id) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, props: (s.props || []).filter((x) => x.id !== id) } : s)));
  }

  const acquiredCount = props_.filter((p) => p.acquired).length;
  const neededCount = props_.length - acquiredCount;
  const consumableCount = props_.filter((p) => p.consumable).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{props_.length}</strong> prop needs
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.green }}>{acquiredCount}</strong> acquired
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{neededCount}</strong> still needed
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{consumableCount}</strong> consumable
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ id: 'all', label: 'All' }, { id: 'acquired', label: 'Acquired' }, { id: 'needed', label: 'Still Needed' }].map((f) => (
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
          <button
            onClick={() => setConsumableOnly((v) => !v)}
            className="td-focusable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: consumableOnly ? COLOR.amberDim : 'transparent',
              color: COLOR.amber,
              border: `1px solid ${COLOR.amber}`,
              borderRadius: 20,
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Consumables{consumableCount > 0 ? ` (${consumableCount})` : ''}
          </button>
        </div>
        <button
          onClick={() => { setAdding((v) => !v); setEditingId(null); }}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add prop need
        </button>
      </div>

      {!hasScenes && (
        <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginBottom: 16 }}>
          No scenes set up yet — add Acts and Scenes on the Scenes page to tag props to a specific moment, or log them as "Throughout" for now.
        </div>
      )}

      {adding && <PropForm show={show} showActors={showActors} inventory={inventory} locations={locations} onSave={addProp} onCancel={() => setAdding(false)} />}

      {scenes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {scenes.map((sceneId) => (
            <div key={sceneId || 'throughout'}>
              <div className="td-display" style={{ fontSize: 14, color: COLOR.textMuted, letterSpacing: '0.03em', marginBottom: 8 }}>
                {sceneLabel(show, sceneId)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {grouped[sceneId].map((p) =>
                  editingId === p.id ? (
                    <div key={p.id} style={{ gridColumn: '1 / -1' }}>
                      <PropForm show={show} showActors={showActors} inventory={inventory} locations={locations} initial={p} onSave={saveProp} onCancel={() => setEditingId(null)} />
                    </div>
                  ) : (
                    <PropCard
                      key={p.id}
                      prop={p}
                      show={show}
                      showActors={showActors}
                      inventory={inventory}
                      onEdit={() => { setEditingId(p.id); setAdding(false); }}
                      onRemove={() => removeProp(p.id)}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <StubPanel label={props_.length === 0 ? `No prop needs logged for ${show.title} yet` : 'Nothing matches this filter'} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCENE FORM — a single scene or musical number within an act, with the
// cast that appears in it.
// ---------------------------------------------------------------------------
function SceneForm({ showActors, initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [type, setType] = useState(initial?.type || 'scene');
  const [actorIds, setActorIds] = useState(initial?.actorIds || []);
  const [notes, setNotes] = useState(initial?.notes || '');

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '7px 9px',
    color: COLOR.textPrimary,
    fontSize: 12.5,
    width: '100%',
  };
  const labelStyle = { fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  function toggleActor(id) {
    setActorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function handleSave() {
    if (!name.trim()) return;
    onSave({ id: initial?.id || `sc${Date.now()}`, name: name.trim(), type, actorIds, notes: notes.trim() });
  }

  return (
    <div style={{ background: COLOR.panel, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <label className="td-mono" style={labelStyle}>NAME</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Storm, or One" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>TYPE</label>
          <select className="td-focusable" style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
            {SCENE_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>{SCENE_TYPES[t].label}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label className="td-mono" style={labelStyle}>CAST IN THIS {type === 'number' ? 'NUMBER' : 'SCENE'}</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {showActors.length === 0 && <span className="td-body" style={{ fontSize: 11, color: COLOR.textFaint }}>No cast assigned to this show yet.</span>}
          {showActors.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => toggleActor(a.id)}
              className="td-focusable"
              style={{
                background: actorIds.includes(a.id) ? COLOR.amber : 'transparent',
                color: actorIds.includes(a.id) ? COLOR.void : COLOR.textMuted,
                border: `1px solid ${actorIds.includes(a.id) ? COLOR.amber : COLOR.line}`,
                borderRadius: 20,
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: "'Inter', sans-serif",
                cursor: 'pointer',
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className="td-mono" style={labelStyle}>NOTES</label>
        <input className="td-focusable" style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Setting, timing, anything worth flagging" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="td-focusable"
          style={{ background: name.trim() ? COLOR.amber : COLOR.slateDim, color: name.trim() ? COLOR.void : COLOR.textFaint, border: 'none', borderRadius: 3, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: name.trim() ? 'pointer' : 'not-allowed' }}
        >
          Save
        </button>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'none', border: `1px solid ${COLOR.line}`, color: COLOR.textFaint, borderRadius: 3, padding: '6px 14px', fontSize: 11.5, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCENE CARD
// ---------------------------------------------------------------------------
function SceneCard({ scene, number, showActors, onEdit, onRemove, onMove, isFirst, isLast }) {
  const TypeIcon = SCENE_TYPES[scene.type]?.icon || Footprints;
  const cast = (scene.actorIds || []).map((id) => showActors.find((a) => a.id === id)).filter(Boolean);

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '10px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="td-mono" style={{ fontSize: 11, color: COLOR.amber, width: 16, flexShrink: 0 }}>{number}</span>
          <TypeIcon size={12} color={COLOR.textFaint} strokeWidth={1.75} />
          <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, fontWeight: 500 }}>{scene.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button onClick={() => onMove(-1)} disabled={isFirst} className="td-focusable" style={{ background: 'none', border: 'none', color: isFirst ? COLOR.slateDim : COLOR.textFaint, cursor: isFirst ? 'default' : 'pointer', display: 'flex', padding: 2 }} aria-label="Move up">
            <ChevronUp size={13} />
          </button>
          <button onClick={() => onMove(1)} disabled={isLast} className="td-focusable" style={{ background: 'none', border: 'none', color: isLast ? COLOR.slateDim : COLOR.textFaint, cursor: isLast ? 'default' : 'pointer', display: 'flex', padding: 2 }} aria-label="Move down">
            <ChevronDown size={13} />
          </button>
          <button onClick={onEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${scene.name}`}>
            <Pencil size={12} />
          </button>
          <button onClick={onRemove} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove ${scene.name}`}>
            <X size={13} />
          </button>
        </div>
      </div>
      {cast.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
          {cast.map((a) => (
            <span key={a.id} className="td-mono" style={{ fontSize: 9.5, color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '2px 6px' }}>
              {a.name}
            </span>
          ))}
        </div>
      )}
      {scene.notes && <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginTop: 6 }}>{scene.notes}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ACT ROW — one act with its scenes; name is inline-editable, scenes are
// added/edited/removed here.
// ---------------------------------------------------------------------------
function ActRow({ act, showActors, onRenameAct, onRemoveAct, onAddScene, onSaveScene, onRemoveScene, onMoveScene }) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(act.name);
  const [addingScene, setAddingScene] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState(null);

  function saveName() {
    if (!nameDraft.trim()) return;
    onRenameAct(nameDraft.trim());
    setEditingName(false);
  }

  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {editingName ? (
          <>
            <input
              className="td-focusable"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              style={{ background: COLOR.void, border: `1px solid ${COLOR.lineBright}`, borderRadius: 3, padding: '6px 9px', color: COLOR.textPrimary, fontSize: 14, fontFamily: "'Oswald', sans-serif" }}
            />
            <button onClick={saveName} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button onClick={() => { setEditingName(false); setNameDraft(act.name); }} className="td-focusable" style={{ background: 'none', border: `1px solid ${COLOR.line}`, color: COLOR.textFaint, borderRadius: 3, padding: '5px 12px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
          </>
        ) : (
          <>
            <span className="td-display" style={{ fontSize: 17, color: COLOR.textPrimary, letterSpacing: '0.02em' }}>{act.name}</span>
            <button onClick={() => setEditingName(true)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Rename ${act.name}`}>
              <Pencil size={12} />
            </button>
            <button onClick={onRemoveAct} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove ${act.name}`}>
              <X size={13} />
            </button>
          </>
        )}
        <button
          onClick={() => setAddingScene((v) => !v)}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '5px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}
        >
          <Plus size={12} /> Add scene
        </button>
      </div>

      {addingScene && (
        <div style={{ marginBottom: 10 }}>
          <SceneForm showActors={showActors} onSave={(sc) => { onAddScene(sc); setAddingScene(false); }} onCancel={() => setAddingScene(false)} />
        </div>
      )}

      {(act.scenes || []).length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
          {act.scenes.map((sc, i) =>
            editingSceneId === sc.id ? (
              <div key={sc.id} style={{ gridColumn: '1 / -1' }}>
                <SceneForm showActors={showActors} initial={sc} onSave={(updated) => { onSaveScene(updated); setEditingSceneId(null); }} onCancel={() => setEditingSceneId(null)} />
              </div>
            ) : (
              <SceneCard
                key={sc.id}
                scene={sc}
                number={i + 1}
                showActors={showActors}
                onEdit={() => setEditingSceneId(sc.id)}
                onRemove={() => onRemoveScene(sc.id)}
                onMove={(dir) => onMoveScene(sc.id, dir)}
                isFirst={i === 0}
                isLast={i === act.scenes.length - 1}
              />
            )
          )}
        </div>
      ) : (
        !addingScene && <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>No scenes in this act yet.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCENES MODULE — the canonical Act/Scene list for the show. Choreography,
// Costumes, and Props all pick from here instead of typing a scene name.
// ---------------------------------------------------------------------------
function ScenesModule({ show, actors, setShows }) {
  const [addingAct, setAddingAct] = useState(false);
  const [newActName, setNewActName] = useState('');
  const acts = show.acts || [];
  const showActors = actors
    .filter((a) => assignmentFor(a, show.id))
    .map((a) => ({ id: a.id, name: a.name, roleTitle: assignmentFor(a, show.id).roleTitle }));

  function addAct() {
    if (!newActName.trim()) return;
    setShows((prev) =>
      prev.map((s) => (s.id === show.id ? { ...s, acts: [...(s.acts || []), { id: `act-${Date.now()}`, name: newActName.trim(), order: (s.acts || []).length + 1, scenes: [] }] } : s))
    );
    setNewActName('');
    setAddingAct(false);
  }
  function renameAct(actId, name) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, acts: (s.acts || []).map((a) => (a.id === actId ? { ...a, name } : a)) } : s)));
  }
  function removeAct(actId) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, acts: (s.acts || []).filter((a) => a.id !== actId) } : s)));
  }
  function addScene(actId, scene) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, acts: (s.acts || []).map((a) => (a.id === actId ? { ...a, scenes: [...(a.scenes || []), scene] } : a)) } : s)));
  }
  function saveScene(actId, scene) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, acts: (s.acts || []).map((a) => (a.id === actId ? { ...a, scenes: (a.scenes || []).map((sc) => (sc.id === scene.id ? scene : sc)) } : a)) } : s)));
  }
  function removeScene(actId, sceneId) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, acts: (s.acts || []).map((a) => (a.id === actId ? { ...a, scenes: (a.scenes || []).filter((sc) => sc.id !== sceneId) } : a)) } : s)));
  }
  function moveScene(actId, sceneId, direction) {
    setShows((prev) =>
      prev.map((s) => {
        if (s.id !== show.id) return s;
        return {
          ...s,
          acts: (s.acts || []).map((a) => {
            if (a.id !== actId) return a;
            const list = [...(a.scenes || [])];
            const idx = list.findIndex((sc) => sc.id === sceneId);
            const newIdx = idx + direction;
            if (idx < 0 || newIdx < 0 || newIdx >= list.length) return a;
            [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
            return { ...a, scenes: list };
          }),
        };
      })
    );
  }

  const totalScenes = acts.reduce((sum, a) => sum + (a.scenes || []).length, 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{acts.length}</strong> acts
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{totalScenes}</strong> scenes & numbers
        </span>
      </div>

      <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginBottom: 18 }}>
        This is the canonical scene list — Choreography, Costumes, and Props all reference scenes from here instead of typing a scene name each time.
      </div>

      {addingAct ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
          <input
            className="td-focusable"
            value={newActName}
            onChange={(e) => setNewActName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAct()}
            placeholder="e.g. Act 1"
            style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '8px 10px', color: COLOR.textPrimary, fontSize: 13, maxWidth: 220 }}
          />
          <button onClick={addAct} disabled={!newActName.trim()} className="td-focusable" style={{ background: newActName.trim() ? COLOR.amber : COLOR.slateDim, color: newActName.trim() ? COLOR.void : COLOR.textFaint, border: 'none', borderRadius: 3, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: newActName.trim() ? 'pointer' : 'not-allowed' }}>
            Add
          </button>
          <button onClick={() => setAddingAct(false)} className="td-focusable" style={{ background: 'none', border: `1px solid ${COLOR.line}`, color: COLOR.textFaint, borderRadius: 3, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingAct(true)}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 20 }}
        >
          <Plus size={14} /> Add act
        </button>
      )}

      {acts.length > 0 ? (
        acts.map((act) => (
          <ActRow
            key={act.id}
            act={act}
            showActors={showActors}
            onRenameAct={(name) => renameAct(act.id, name)}
            onRemoveAct={() => removeAct(act.id)}
            onAddScene={(sc) => addScene(act.id, sc)}
            onSaveScene={(sc) => saveScene(act.id, sc)}
            onRemoveScene={(id) => removeScene(act.id, id)}
            onMoveScene={(id, dir) => moveScene(act.id, id, dir)}
          />
        ))
      ) : (
        <StubPanel label={`No acts set up for ${show.title} yet`} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCRIPT MODULE — upload the show's PDF, click on a page to drop a cue at
// that spot, export a new PDF with every cue burned onto the page it was
// placed on. Rendering (pdfjs-dist) and export (pdf-lib) are the only two
// features in this file that depend on packages outside lucide-react —
// see the import comment at the top of the file.
// ---------------------------------------------------------------------------
function ScriptModule({ show, orgId, cueSheets, setShows, CUE_DEPTS }) {
  const script = show.script;
  const cues = cueSheets[show.id] || [];
  const [pageNum, setPageNum] = useState(1);
  const [placingCueId, setPlacingCueId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // (Re)load the pdfjs document from Storage whenever a different show's
  // script comes into view. The bytes never live in React state — only
  // fileName/pageCount/markers do — so this always fetches fresh.
  useEffect(() => {
    let cancelled = false;
    if (!script) {
      setPdfDoc(null);
      return undefined;
    }
    (async () => {
      try {
        const bytes = await downloadScriptPdf(orgId, show.id);
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (!cancelled) {
          setPdfDoc(doc);
          setPageNum(1);
        }
      } catch (err) {
        if (!cancelled) setUploadError('Could not load that script from storage.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, show.id, script?.fileName]);

  // Render the current page to the canvas whenever the doc or page changes.
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return undefined;
    let cancelled = false;
    setRendering(true);
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        // Page failed to render — leave the previous frame up rather than crash.
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNum]);

  async function handleUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setUploadError('That file isn\u2019t a PDF.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const pageCount = doc.numPages;
      await uploadScriptPdf(orgId, show.id, file);
      setShows((prev) =>
        prev.map((s) => (s.id === show.id ? { ...s, script: { fileName: file.name, pageCount, markers: [] } } : s))
      );
    } catch (err) {
      setUploadError('Could not upload that PDF. Try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function replaceScript() {
    deleteScriptPdf(orgId, show.id).catch(() => {});
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, script: null } : s)));
    setPlacingCueId(null);
  }

  function handleCanvasClick(e) {
    if (!placingCueId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;
    const marker = { id: `mk-${Date.now()}`, cueId: placingCueId, page: pageNum, xPct, yPct };
    setShows((prev) =>
      prev.map((s) =>
        s.id === show.id
          ? { ...s, script: { ...s.script, markers: [...(s.script.markers || []).filter((m) => m.cueId !== placingCueId), marker] } }
          : s
      )
    );
    setPlacingCueId(null);
  }

  function removeMarker(markerId) {
    setShows((prev) =>
      prev.map((s) => (s.id === show.id ? { ...s, script: { ...s.script, markers: (s.script.markers || []).filter((m) => m.id !== markerId) } } : s))
    );
  }

  async function handleExport() {
    if (!script) return;
    setExporting(true);
    try {
      const bytes = await downloadScriptPdf(orgId, show.id);
      const outDoc = await PDFDocument.load(bytes);
      const font = await outDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = outDoc.getPages();
      (script.markers || []).forEach((marker) => {
        const page = pages[marker.page - 1];
        if (!page) return;
        const cue = cues.find((c) => c.id === marker.cueId);
        const label = cue ? cueCode(cue, CUE_DEPTS) : '?';
        const { width, height } = page.getSize();
        const x = marker.xPct * width;
        const y = height - marker.yPct * height;
        page.drawCircle({ x, y, size: 9, color: rgb(0.91, 0.64, 0.24), opacity: 0.85 });
        page.drawText(label, { x: x + 12, y: y - 4, size: 10, font, color: rgb(0.72, 0.47, 0.08) });
      });
      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${show.title.replace(/\s+/g, '_')}_cued_script.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setUploadError('Could not export the annotated script.');
    } finally {
      setExporting(false);
    }
  }

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '7px 12px',
    color: COLOR.textPrimary,
    fontSize: 12.5,
  };

  if (!script) {
    return (
      <div>
        <div
          style={{
            border: `1px dashed ${COLOR.lineBright}`,
            borderRadius: 6,
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <FileText size={28} color={COLOR.textFaint} strokeWidth={1.5} style={{ margin: '0 auto 12px' }} />
          <div className="td-body" style={{ fontSize: 13.5, color: COLOR.textMuted, marginBottom: 4 }}>
            No script uploaded for {show.title} yet.
          </div>
          <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginBottom: 18 }}>
            Upload the show's PDF to start placing cues on it.
          </div>
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleUpload} style={{ display: 'none' }} id="script-upload-input" />
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={uploading}
            className="td-focusable"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: COLOR.amber,
              color: COLOR.void,
              border: 'none',
              borderRadius: 3,
              padding: '9px 18px',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: uploading ? 'default' : 'pointer',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            <Upload size={14} /> {uploading ? 'Reading PDF...' : 'Upload script PDF'}
          </button>
          {uploadError && (
            <div className="td-mono" style={{ fontSize: 11, color: COLOR.amber, marginTop: 12 }}>{uploadError}</div>
          )}
        </div>
      </div>
    );
  }

  const markersOnPage = (script.markers || []).filter((m) => m.page === pageNum);

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 480px', minWidth: 320 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, fontWeight: 500 }}>{script.fileName}</div>
            <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 2 }}>
              {(script.markers || []).length} cue{(script.markers || []).length === 1 ? '' : 's'} placed · {script.pageCount} page{script.pageCount === 1 ? '' : 's'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={replaceScript} className="td-focusable" style={{ background: 'none', border: `1px solid ${COLOR.line}`, color: COLOR.textFaint, borderRadius: 3, padding: '7px 12px', fontSize: 11.5, cursor: 'pointer' }}>
              Replace script
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || (script.markers || []).length === 0}
              className="td-focusable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: (script.markers || []).length > 0 ? COLOR.amber : COLOR.slateDim,
                color: (script.markers || []).length > 0 ? COLOR.void : COLOR.textFaint,
                border: 'none',
                borderRadius: 3,
                padding: '7px 14px',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: (script.markers || []).length > 0 && !exporting ? 'pointer' : 'not-allowed',
              }}
            >
              <Download size={13} /> {exporting ? 'Exporting...' : 'Export cued script'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            className="td-focusable"
            style={{ background: 'none', border: `1px solid ${COLOR.line}`, color: pageNum <= 1 ? COLOR.slateDim : COLOR.textMuted, borderRadius: 3, padding: '5px 10px', cursor: pageNum <= 1 ? 'default' : 'pointer' }}
          >
            <ChevronUp size={13} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <span className="td-mono" style={{ fontSize: 11.5, color: COLOR.textMuted }}>
            Page {pageNum} of {script.pageCount}
          </span>
          <button
            onClick={() => setPageNum((p) => Math.min(script.pageCount, p + 1))}
            disabled={pageNum >= script.pageCount}
            className="td-focusable"
            style={{ background: 'none', border: `1px solid ${COLOR.line}`, color: pageNum >= script.pageCount ? COLOR.slateDim : COLOR.textMuted, borderRadius: 3, padding: '5px 10px', cursor: pageNum >= script.pageCount ? 'default' : 'pointer' }}
          >
            <ChevronDown size={13} style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>

        {placingCueId && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: COLOR.amberDim, borderRadius: 4, padding: '8px 12px', marginBottom: 10 }}>
            <span className="td-mono" style={{ fontSize: 11, color: COLOR.amber, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crosshair size={12} /> Click the script where {cueCode(cues.find((c) => c.id === placingCueId) || {}, CUE_DEPTS)} calls
            </span>
            <button onClick={() => setPlacingCueId(null)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.amber, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
              Cancel
            </button>
          </div>
        )}

        <div style={{ position: 'relative', display: 'inline-block', border: `1px solid ${COLOR.line}`, borderRadius: 4, overflow: 'hidden', maxWidth: '100%' }}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{ display: 'block', maxWidth: '100%', height: 'auto', cursor: placingCueId ? 'crosshair' : 'default' }}
          />
          {rendering && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(11,14,17,0.6)' }}>
              <span className="td-mono" style={{ fontSize: 11, color: COLOR.textFaint }}>Rendering page...</span>
            </div>
          )}
          {markersOnPage.map((m) => {
            const cue = cues.find((c) => c.id === m.cueId);
            return (
              <button
                key={m.id}
                onClick={() => removeMarker(m.id)}
                className="td-focusable"
                title="Click to remove"
                style={{
                  position: 'absolute',
                  left: `${m.xPct * 100}%`,
                  top: `${m.yPct * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  background: COLOR.amber,
                  color: COLOR.void,
                  border: `2px solid ${COLOR.void}`,
                  borderRadius: 20,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {cue ? cueCode(cue, CUE_DEPTS) : '?'}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: '0 0 260px', minWidth: 220 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10 }}>
          CUE SHEET
        </div>
        {cues.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cues.map((cue) => {
              const marker = (script.markers || []).find((m) => m.cueId === cue.id);
              return (
                <div key={cue.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="td-mono" style={{ fontSize: 11, color: COLOR.amber }}>{cueCode(cue, CUE_DEPTS)}</div>
                    <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cue.desc}</div>
                  </div>
                  {marker ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                      <button onClick={() => setPageNum(marker.page)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.green, fontSize: 10, cursor: 'pointer' }}>
                        p.{marker.page}
                      </button>
                      <button onClick={() => removeMarker(marker.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 9.5, cursor: 'pointer', textDecoration: 'underline' }}>
                        remove
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPlacingCueId(cue.id)}
                      className="td-focusable"
                      style={{
                        flexShrink: 0,
                        background: placingCueId === cue.id ? COLOR.amber : 'transparent',
                        color: placingCueId === cue.id ? COLOR.void : COLOR.amber,
                        border: `1px solid ${COLOR.amber}`,
                        borderRadius: 3,
                        padding: '4px 9px',
                        fontSize: 10.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Place
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <StubPanel label="No cues on this show's cue sheet yet — add them on Run of Show first" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SIDEBAR
// ---------------------------------------------------------------------------
function ShowSwitcher({ shows, currentShowId, setCurrentShowId }) {
  const [open, setOpen] = useState(false);
  const current = shows.find((s) => s.id === currentShowId);
  const meta = current ? STATUS_META[current.status] : null;

  return (
    <div style={{ position: 'relative', marginBottom: 16 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="td-focusable"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          background: COLOR.card,
          border: `1px solid ${COLOR.lineBright}`,
          borderRadius: 4,
          padding: '10px 10px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 3 }}>WORKING ON</div>
          {current ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
              <span className="td-display" style={{ fontSize: 13, color: COLOR.textPrimary, letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {current.title}
              </span>
            </div>
          ) : (
            <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textFaint }}>None selected</span>
          )}
        </div>
        <ChevronDown size={14} color={COLOR.textFaint} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: COLOR.card,
            border: `1px solid ${COLOR.lineBright}`,
            borderRadius: 4,
            padding: 6,
            zIndex: 10,
            boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          }}
        >
          {shows.map((s) => {
            const m = STATUS_META[s.status];
            const isSel = s.id === currentShowId;
            return (
              <button
                key={s.id}
                onClick={() => { setCurrentShowId(s.id); setOpen(false); }}
                className="td-focusable"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: isSel ? COLOR.panel : 'transparent',
                  border: 'none',
                  borderRadius: 3,
                  padding: '8px 8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                <span className="td-body" style={{ fontSize: 12.5, color: isSel ? COLOR.amber : COLOR.textPrimary, flex: 1 }}>{s.title}</span>
                <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint }}>{s.venue}</span>
              </button>
            );
          })}
          <div style={{ borderTop: `1px solid ${COLOR.line}`, marginTop: 4, paddingTop: 4 }}>
            <button
              onClick={() => { setCurrentShowId(null); setOpen(false); }}
              className="td-focusable"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: !currentShowId ? COLOR.panel : 'transparent',
                border: 'none',
                borderRadius: 3,
                padding: '8px 8px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLOR.slate, flexShrink: 0 }} />
              <span className="td-body" style={{ fontSize: 12.5, color: !currentShowId ? COLOR.amber : COLOR.textMuted, flex: 1 }}>None — baseline / company-wide</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ active, setActive, shows, currentShowId, setCurrentShowId, onSignOut, onChangeCompany }) {
  // Bottom-of-rail actions: leaving this company, and leaving the app entirely.
  const footerButton = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 3,
    border: 'none',
    background: 'transparent',
    color: COLOR.textMuted,
    cursor: 'pointer',
    textAlign: 'left',
    borderLeft: '2px solid transparent',
    width: '100%',
  };
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'schedule', label: 'Schedule', icon: CalendarDays },
    { id: 'scenes', label: 'Scenes', icon: Clapperboard },
    { id: 'crew', label: 'Crew', icon: Users },
    { id: 'actors', label: 'Actors', icon: Star },
    { id: 'musicians', label: 'Musicians', icon: Music },
    { id: 'staff', label: 'Staff', icon: Briefcase },
    { id: 'choreography', label: 'Choreography', icon: Footprints },
    { id: 'costumes', label: 'Costumes', icon: Shirt },
    { id: 'props', label: 'Props', icon: Package },
    { id: 'calls', label: 'Calls', icon: Bell },
    { id: 'audio', label: 'Audio', icon: Radio },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
    { id: 'set', label: 'Set', icon: Box },
    { id: 'runofshow', label: 'Run of Show', icon: ListChecks },
    { id: 'script', label: 'Script', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];
  return (
    <div style={{ width: 200, background: COLOR.panel, borderRight: `1px solid ${COLOR.line}`, padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
      <div className="td-display" style={{ color: COLOR.textPrimary, fontSize: 16, letterSpacing: '0.08em', padding: '0 10px 16px' }}>
        Tech Desk
      </div>
      <ShowSwitcher shows={shows} currentShowId={currentShowId} setCurrentShowId={setCurrentShowId} />
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActive(item.id)}
            className="td-focusable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 10px',
              borderRadius: 3,
              border: 'none',
              background: isActive ? COLOR.card : 'transparent',
              color: isActive ? COLOR.amber : COLOR.textMuted,
              cursor: 'pointer',
              textAlign: 'left',
              borderLeft: isActive ? `2px solid ${COLOR.amber}` : '2px solid transparent',
            }}
          >
            <Icon size={15} strokeWidth={1.75} />
            <span className="td-body" style={{ fontSize: 13 }}>{item.label}</span>
          </button>
        );
        })}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 10, borderTop: `1px solid ${COLOR.line}` }}>
          <button onClick={onChangeCompany} className="td-focusable" style={footerButton}>
            <Building2 size={15} strokeWidth={1.75} />
            <span className="td-body" style={{ fontSize: 13 }}>Change company</span>
          </button>
          <button onClick={onSignOut} className="td-focusable" style={footerButton}>
            <LogOut size={15} strokeWidth={1.75} />
            <span className="td-body" style={{ fontSize: 13 }}>Sign out</span>
          </button>
        </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// STUB PANEL for not-yet-built modules
// ---------------------------------------------------------------------------
function StubPanel({ label }) {
  return (
    <div
      style={{
        border: `1px dashed ${COLOR.line}`,
        borderRadius: 4,
        padding: '60px 24px',
        textAlign: 'center',
      }}
    >
      <div className="td-display" style={{ color: COLOR.textFaint, fontSize: 22, letterSpacing: '0.05em' }}>
        {label} — under construction
      </div>
      <div className="td-body" style={{ color: COLOR.textFaint, fontSize: 13, marginTop: 8 }}>
        This module isn't wired up yet. It'll plug into the same show data as the dashboard.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLOCK
// ---------------------------------------------------------------------------
function HouseClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div style={{ textAlign: 'right' }}>
      <div className="td-mono" style={{ fontSize: 18, color: COLOR.textPrimary, letterSpacing: '0.03em' }}>{time}</div>
      <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em' }}>{date.toUpperCase()}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// SHOW GATE — the front door. Open the app, pick what you're working on,
// then every module downstream already knows.
// ---------------------------------------------------------------------------
function NoShowSelected({ shows, setCurrentShowId, label }) {
  return (
    <div>
      <StubPanel label={`Select a show to view its ${label}`} />
      {shows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, maxWidth: 420 }}>
          {shows.map((s) => {
            const meta = STATUS_META[s.status];
            return (
              <button
                key={s.id}
                onClick={() => setCurrentShowId(s.id)}
                className="td-focusable"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: COLOR.card,
                  border: `1px solid ${COLOR.line}`,
                  borderRadius: 4,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary }}>{s.title}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={meta.cls} style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
                  <span className="td-mono" style={{ fontSize: 9.5, color: meta.color }}>{meta.label.toUpperCase()}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
        setCurrentShowId(local.currentShowId ?? null);
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
  useSyncedCollection(hydrated, shows, (s) => s.id, (items) => saveShows(items, orgId), deleteShows, setLastSavedAt, setPersistenceError);
  useSyncedCollection(hydrated, crew, (p) => p.id, (items) => savePeople('crew', items, orgId), deletePeople, setLastSavedAt, setPersistenceError);
  useSyncedCollection(hydrated, actors, (p) => p.id, (items) => savePeople('actor', items, orgId), deletePeople, setLastSavedAt, setPersistenceError);
  useSyncedCollection(hydrated, staff, (p) => p.id, (items) => savePeople('staff', items, orgId), deletePeople, setLastSavedAt, setPersistenceError);
  useSyncedCollection(hydrated, musicians, (p) => p.id, (items) => savePeople('musician', items, orgId), deletePeople, setLastSavedAt, setPersistenceError);
  useSyncedCollection(hydrated, calls, (c) => c.id, (items) => saveCalls(items, orgId), deleteCalls, setLastSavedAt, setPersistenceError);
  useSyncedCollection(hydrated, inventory, (i) => i.id, (items) => saveInventory(items, orgId), deleteInventory, setLastSavedAt, setPersistenceError);

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
    if (!hydrated) return undefined;
    const timeout = setTimeout(() => {
      saveSettings(
        {
          venues, locations, instruments,
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
    hydrated, orgId, venues, locations, instruments,
    departments, departmentOrder, castTypes, castTypeOrder, staffAreas, staffAreaOrder,
    musicSections, musicSectionOrder, inventoryCategories, inventoryCategoryOrder, cueDepts, cueDeptOrder,
  ]);

  function resetAllData() {
    setShows(seedShows);
    setCrew(seedCrew);
    setCalls(seedCalls);
    setCurrentUserId(null);
    setActors(seedActors);
    setCurrentActorId(null);
    setStaff(seedStaff);
    setCurrentStaffId(null);
    setMusicians(seedMusicians);
    setCurrentMusicianId(null);
    setInventory(seedInventory);
    setCueSheets(seedCueSheets);
    setVenues(seedVenues);
    setLocations(seedLocations);
    setInstruments(seedInstruments);
    setDepartments(INITIAL_DEPARTMENTS);
    setDepartmentOrder(INITIAL_DEPARTMENT_ORDER);
    setCastTypes(INITIAL_CAST_TYPES);
    setCastTypeOrder(INITIAL_CAST_TYPE_ORDER);
    setStaffAreas(INITIAL_STAFF_AREAS);
    setStaffAreaOrder(INITIAL_STAFF_AREA_ORDER);
    setMusicSections(INITIAL_MUSIC_SECTIONS);
    setMusicSectionOrder(INITIAL_MUSIC_SECTION_ORDER);
    setInventoryCategories(INITIAL_INVENTORY_CATEGORIES);
    setInventoryCategoryOrder(INITIAL_INVENTORY_CATEGORY_ORDER);
    setCueDepts(INITIAL_CUE_DEPTS);
    setCueDeptOrder(Object.keys(INITIAL_CUE_DEPTS));
    setFilter('all');
    setCurrentShowId(null);
  }

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
    <div style={{ display: 'flex', minHeight: '100vh', background: COLOR.void }}>
      {FONTS}
      <Sidebar active={active} setActive={setActive} shows={shows} currentShowId={currentShowId} setCurrentShowId={setCurrentShowId} onSignOut={onSignOut} onChangeCompany={onChangeCompany} />

      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }} className="td-scrollbar">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 26 }}>
          <div>
            <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 6 }}>
              {header.eyebrow}
            </div>
            <h1 className="td-display" style={{ fontSize: 28, color: COLOR.textPrimary, letterSpacing: '0.02em', margin: 0 }}>
              {header.title}
            </h1>
          </div>
          <HouseClock />
        </div>

        {active === 'dashboard' && (
          <>
            <GetStarted
              onGo={setActive}
              hasShow={!!currentShow}
              steps={[
                { label: 'Set up the company', target: 'settings', done: venues.length > 0, note: 'Venues, storage locations, instruments, and the department, cast and cue vocabularies every picker pulls from.' },
                { label: 'Build your company rosters', target: 'crew', done: crew.length + actors.length + musicians.length + staff.length > 0, note: 'Crew, actors, musicians and staff live at company level once — you assign them to individual shows later.' },
                { label: 'Create the production', target: 'dashboard', done: shows.length > 0, note: 'New production, with its venue and opening date. Everything below hangs off the show you are working on.' },
                { label: 'Enter the scene list', target: 'scenes', done: (currentShow?.acts?.length || 0) > 0, note: 'Acts, scenes and musical numbers, with cast per scene. Choreography, costumes, props and cues all reference this, so it comes first.' },
                { label: 'Lay out the schedule', target: 'schedule', done: (currentShow?.schedule?.length || 0) > 0, note: 'Load-in, rehearsals, tech week and strike. Calls are generated from these dates, so schedule before you post calls.' },
                { label: 'Assign people to the show', target: 'crew', done: [...crew, ...actors, ...musicians, ...staff].some((p) => (p.assignments || []).some((a) => a.showId === currentShow?.id)), note: 'Per-show roles and departments, pulled from the rosters. The audio plot and callboard both read these.' },
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
              <StubPanel label="No productions in this phase" />
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

        {active === 'crew' && (
          <CrewModule show={currentShow} shows={shows} crew={crew} setCrew={setCrew} currentUserId={currentUserId} setCurrentUserId={setCurrentUserId} DEPARTMENTS={departments} DEPARTMENT_ORDER={departmentOrder} />
        )}
        {active === 'actors' && (
          <ActorsModule show={currentShow} shows={shows} actors={actors} setActors={setActors} currentUserId={currentActorId} setCurrentUserId={setCurrentActorId} CAST_TYPES={castTypes} CAST_TYPE_ORDER={castTypeOrder} />
        )}
        {active === 'musicians' && (
          <MusiciansModule show={currentShow} shows={shows} musicians={musicians} setMusicians={setMusicians} currentUserId={currentMusicianId} setCurrentUserId={setCurrentMusicianId} MUSIC_SECTIONS={musicSections} MUSIC_SECTION_ORDER={musicSectionOrder} instruments={instruments} />
        )}
        {active === 'staff' && (
          <StaffModule show={currentShow} shows={shows} staff={staff} setStaff={setStaff} currentUserId={currentStaffId} setCurrentUserId={setCurrentStaffId} STAFF_AREAS={staffAreas} STAFF_AREA_ORDER={staffAreaOrder} />
        )}
        {active === 'choreography' &&
          (currentShow ? (
            <ChoreographyModule show={currentShow} actors={actors} setShows={setShows} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="choreography" />
          ))}
        {active === 'costumes' &&
          (currentShow ? (
            <CostumesModule show={currentShow} actors={actors} inventory={inventory} locations={locations} setShows={setShows} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="costume needs" />
          ))}
        {active === 'props' &&
          (currentShow ? (
            <PropsModule show={currentShow} actors={actors} inventory={inventory} locations={locations} setShows={setShows} />
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
            <SetModule show={currentShow} inventory={inventory} setInventory={setInventory} locations={locations} setShows={setShows} INVENTORY_CATEGORIES={inventoryCategories} INVENTORY_CATEGORY_ORDER={inventoryCategoryOrder} />
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
            <ScriptModule show={currentShow} orgId={orgId} cueSheets={cueSheets} setShows={setShows} CUE_DEPTS={cueDepts} />
          ) : (
            <NoShowSelected shows={shows} setCurrentShowId={setCurrentShowId} label="script" />
          ))}
        {active === 'settings' && (
          <SettingsModule
            venues={venues}
            setVenues={setVenues}
            locations={locations}
            setLocations={setLocations}
            instruments={instruments}
            setInstruments={setInstruments}
            onReset={resetAllData}
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
            lastSavedAt={lastSavedAt}
            persistenceError={persistenceError}
            orgId={orgId}
            onSignOut={onSignOut}
          />
        )}
      </div>
    </div>
  );
}
