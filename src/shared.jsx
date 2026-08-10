import { Battery, Bell, Box, Boxes, Briefcase, ClipboardList, Copy, DollarSign, Footprints, Hammer, Link2, Megaphone, Music, Package, Repeat, Shirt, Star, Users, Volume2, Zap } from 'lucide-react';
import { COLOR } from './theme.jsx';

// ---------------------------------------------------------------------------
// SHARED DATA MODEL
//
// The vocabulary the whole app agrees on: phases and statuses, the taxonomies
// a fresh company starts with, the demo seed board, and the pure helpers that
// read them. No React state and no components live here, which is what makes
// it safe for every module to import.
// ---------------------------------------------------------------------------

export const PHASES = ['design', 'build', 'tech', 'run', 'strike'];
export const PHASE_LABELS = { design: 'Design', build: 'Build', tech: 'Tech', run: 'Run', strike: 'Strike' };

export const STATUS_META = {
  standby: { label: 'In prep', color: COLOR.amber, dim: COLOR.amberDim, cls: 'cue-light-standby' },
  running: { label: 'Running', color: COLOR.green, dim: COLOR.greenDim, cls: 'cue-light-running' },
  dark: { label: 'Struck', color: COLOR.slate, dim: COLOR.slateDim, cls: '' },
};

export const TODAY_STR = (() => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();
export const TODAY = new Date(TODAY_STR);


export const seedShows = [
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

export const MILESTONE_PRESETS = ['Load-in', 'Focus', 'Q2Q', 'Tech Rehearsal', 'Dress Rehearsal', 'Opening', 'Strike'];

// Each key date on a production's schedule seeds a real call sheet, staffed
// with the roles that milestone typically needs — all open until someone
// signs up.
export const MILESTONE_CALL_TEMPLATES = {
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

export function generateCallsForSchedule(show) {
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

// ---------------------------------------------------------------------------
// DEPARTMENTS — the one list that used to be four.
//
// Crew rosters, staff areas, inventory categories and cue departments were four
// descriptions of the same real-world departments, and they drifted. This is
// what they collapse into; see supabase/15-departments-pass1.sql for the
// migration that built the same shape server-side.
//
// An entry is { label, icon, cue?, color, stock }:
//   cue    — the prefix this department's cues carry (LX 12, SND 4). Absent
//            means the department doesn't call cues and never appears in a cue
//            picker.
//   stock  — true if it keeps inventory. What used to be an inventory category
//            is now a department with the flag set.
//   color  — how its cues draw on a marked-up script, and how it reads in a
//            dark booth. Every department carries one so a department that
//            starts calling cues later doesn't need a colour picked in a panic.
//
// Keys are deliberately the ones the old four lists already shared, so cue
// rows, inventory rows and crew assignments written before the merge still
// resolve without being rewritten.
// ---------------------------------------------------------------------------
export const INITIAL_DEPARTMENTS = {
  electrics: { label: 'Electrics', icon: Zap, cue: 'LX', color: '#E8A33D', stock: true },
  sound: { label: 'Sound', icon: Volume2, cue: 'SND', color: '#4A9FD8', stock: true },
  scenic: { label: 'Scenic', icon: Hammer, cue: 'SCENE', color: '#C77DBF', stock: true },
  rigging: { label: 'Rigging', icon: Link2, cue: 'FLY', color: '#6FCF97', stock: true },
  sm: { label: 'Stage management', icon: ClipboardList, cue: 'SM', color: '#E4695E', stock: false },
  props: { label: 'Props', icon: Package, color: '#8B8FE8', stock: true },
  wardrobe: { label: 'Wardrobe', icon: Shirt, color: '#5FBDB0', stock: true },
  consumables: { label: 'Consumables', icon: Battery, color: '#D9A05B', stock: true },
  general: { label: 'General hands', icon: Users, color: '#9AA5B1', stock: false },
  band: { label: 'Band', icon: Music, color: '#C77DBF', stock: false },
  directing: { label: 'Directing', icon: Megaphone, color: '#E8A33D', stock: false },
  back_office: { label: 'Back office', icon: Briefcase, color: '#4A9FD8', stock: false },
  // The layer over the departments rather than one of them: Producer, Technical
  // Director, General Manager. They are company-wide in the permissions model,
  // so forcing them into Back office would say something untrue about them.
  leadership: { label: 'Production office', icon: Star, color: '#D97C6A', stock: false },
};
export const INITIAL_DEPARTMENT_ORDER = [
  'sm', 'electrics', 'sound', 'scenic', 'rigging', 'props', 'wardrobe',
  'consumables', 'general', 'band', 'directing', 'back_office', 'leadership',
];

// ---------------------------------------------------------------------------
// The four superseded lists, derived rather than stored.
//
// Every module that used to take its own taxonomy now takes one of these. They
// are plain functions over `departments` so there is exactly one place a
// department is described, and no second list to drift from it.
// ---------------------------------------------------------------------------

// Both take the department order and emit their keys in it, so a picker built
// straight from Object.keys() still reads in the order the company chose.
function subset(departments, order, keep, shape) {
  const source = departments || {};
  const wanted = Object.keys(source).filter((key) => source[key] && keep(source[key]));
  const sorted = (order || []).filter((key) => wanted.includes(key));
  const out = {};
  [...sorted, ...wanted.filter((key) => !sorted.includes(key))].forEach((key) => {
    out[key] = shape(source[key]);
  });
  return out;
}

// Departments that call cues, keyed as before, but presenting the CUE PREFIX as
// `label` — cueCode() and every cue picker read `.label`, and on a cue sheet the
// department reads "LX", not "Electrics". The department's own name is kept as
// `name` for the places that need to say it in full.
export function cueDepartments(departments, order) {
  return subset(departments, order, (e) => !!e.cue, (e) => ({ ...e, label: e.cue, name: e.label }));
}

// Departments that keep stock — what "inventory category" used to mean. Keeps
// the department's own label, because in the stock room it reads "Electrics".
export function stockDepartments(departments, order) {
  return subset(departments, order, (e) => !!e.stock, (e) => e);
}

// ---------------------------------------------------------------------------
// POSITIONS — job titles, now with the department they sit in.
//
// A position used to be a bare string in org_settings.crew_positions and
// friends. It is { name, dept } now, so the callboard can say which department
// a chair belongs to without anyone retyping it per assignment. Every read goes
// through these, because the stored value is a bare string for every company
// that hasn't re-saved its settings since — and a position list that throws on
// the old shape takes Settings, Crew, Band and Staff down with it.
// ---------------------------------------------------------------------------
export function positionEntry(position) {
  if (typeof position === 'string') return { name: position, dept: '' };
  return { name: position?.name || '', dept: position?.dept || '' };
}
export function positionList(list) {
  return (list || []).map(positionEntry).filter((p) => p.name);
}
// Just the titles, for the pickers that only ever wanted a list of strings.
export function positionNames(list) {
  return positionList(list).map((p) => p.name);
}

// An order array filtered to the keys a derived map actually has, with anything
// present in the map but missing from the order appended rather than dropped —
// a department added by hand to the JSON still has to show up somewhere.
export function orderFor(map, order) {
  const known = (order || []).filter((key) => map[key]);
  const extras = Object.keys(map).filter((key) => !known.includes(key));
  return [...known, ...extras];
}

export const seedCrew = [
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

export const INITIAL_CAST_TYPES = {
  lead: { label: 'Lead', icon: Star },
  ensemble: { label: 'Ensemble', icon: Users },
  understudy: { label: 'Understudy', icon: Repeat },
  doubleCast: { label: 'Double Cast', icon: Copy },
};
export const INITIAL_CAST_TYPE_ORDER = ['lead', 'ensemble', 'understudy', 'doubleCast'];

export const seedActors = [
  { id: 'a1', name: 'Miranda Boyle', assignments: [{ id: 'asn-a1-s1', showId: 's1', roleTitle: 'Prospero', category: 'lead', miced: true, micType: 'Wireless Lav' }] },
  { id: 'a2', name: 'Devon Cruz', assignments: [{ id: 'asn-a2-s1', showId: 's1', roleTitle: 'Miranda', category: 'lead', miced: true, micType: 'Wireless Lav' }] },
  { id: 'a3', name: 'Priya Shah', assignments: [{ id: 'asn-a3-s1', showId: 's1', roleTitle: 'Ensemble — Spirits', category: 'ensemble', miced: false, micType: '' }] },
  { id: 'a4', name: 'Jordan Blake', assignments: [{ id: 'asn-a4-s1', showId: 's1', roleTitle: 'U/S Prospero', category: 'understudy', miced: false, micType: '' }] },
  { id: 'a5', name: 'Sam Rivera', assignments: [{ id: 'asn-a5-s1', showId: 's1', roleTitle: 'Ariel (alternates with Lee)', category: 'doubleCast', miced: true, micType: 'Wireless Headset' }] },
  { id: 'a6', name: 'Lee Park', assignments: [{ id: 'asn-a6-s1', showId: 's1', roleTitle: 'Ariel (alternates with Sam)', category: 'doubleCast', miced: true, micType: 'Wireless Headset' }] },
  { id: 'a7', name: 'Casey Nguyen', assignments: [{ id: 'asn-a7-s2', showId: 's2', roleTitle: 'Cassie', category: 'lead', miced: true, micType: 'Wireless Lav' }] },
  { id: 'a8', name: 'Morgan Diaz', assignments: [{ id: 'asn-a8-s2', showId: 's2', roleTitle: 'Ensemble', category: 'ensemble', miced: true, micType: 'Wireless Lav' }] },
];

// Staff sit in departments now, same as crew — `people.kind` is what makes them
// staff, not a separate area list. Producers and the TD land in Production
// office, which is the layer over the departments rather than one of them.
export const seedStaff = [
  { id: 'st1', name: 'R. Alvarez', assignments: [{ id: 'asn-st1-s1', showId: 's1', roleTitle: 'Director', category: 'directing' }] },
  { id: 'st2', name: 'Jamie Ellis', assignments: [{ id: 'asn-st2-s1', showId: 's1', roleTitle: 'Assistant Director', category: 'directing' }] },
  { id: 'st3', name: 'Taylor Grant', assignments: [
    { id: 'asn-st3-s1', showId: 's1', roleTitle: 'Producer', category: 'leadership' },
    { id: 'asn-st3-s2', showId: 's2', roleTitle: 'Producer', category: 'leadership' },
  ] },
  { id: 'st4', name: 'Robin Cole', assignments: [{ id: 'asn-st4-s2', showId: 's2', roleTitle: 'House Manager', category: 'back_office' }] },
  { id: 'st5', name: 'K. Osei', assignments: [{ id: 'asn-st5-s2', showId: 's2', roleTitle: 'Director', category: 'directing' }] },
  { id: 'st6', name: 'Alex Kim', assignments: [{ id: 'asn-st6-s2', showId: 's2', roleTitle: 'Marketing & PR', category: 'back_office' }] },
];

// Band sections are unfolded: the pit is one department, and Keys / Strings /
// Reed 1 are POSITIONS within it (Settings → Positions → Band). A section was
// never a department — it was a chair, and every musician already carried the
// chair in their role title.
export const INITIAL_BAND_POSITIONS = ['Music Director', 'Keys', 'Strings', 'Winds/Brass', 'Percussion', 'Vocals'];

export const seedMusicians = [
  { id: 'm1', name: 'Terry Wu', assignments: [{ id: 'asn-m1-s2', showId: 's2', roleTitle: 'Music Director / Conductor', category: 'band', electric: true, monitorMix: true }] },
  { id: 'm2', name: 'Nina Osei', assignments: [{ id: 'asn-m2-s2', showId: 's2', roleTitle: 'Piano 1', category: 'band', electric: true, monitorMix: true }] },
  { id: 'm3', name: 'Chris Bell', assignments: [{ id: 'asn-m3-s2', showId: 's2', roleTitle: 'Violin', category: 'band', electric: false, monitorMix: false }] },
  { id: 'm4', name: 'Drew Fitch', assignments: [{ id: 'asn-m4-s2', showId: 's2', roleTitle: 'Reed 1', category: 'band', electric: false, monitorMix: false }] },
  { id: 'm5', name: 'Sam Okoye', assignments: [{ id: 'asn-m5-s2', showId: 's2', roleTitle: 'Drums/Percussion', category: 'band', electric: false, monitorMix: false }] },
  { id: 'm6', name: 'Val Torres', assignments: [{ id: 'asn-m6-s2', showId: 's2', roleTitle: 'Vocal Captain', category: 'band', electric: false, monitorMix: false }] },
];

// Look up a person's assignment (role/dept/instrument, per show) — the
// person record itself is platform-level; only the assignment is scoped.
export function assignmentFor(person, showId) {
  return (person.assignments || []).find((a) => a.showId === showId) || null;
}

// Person-type metadata for call slots — a slot can be filled from any of
// the four rosters, not just Crew.
export const PERSON_TYPES = {
  crew: { label: 'Crew', icon: Users },
  actor: { label: 'Cast', icon: Star },
  staff: { label: 'Staff', icon: Briefcase },
  musician: { label: 'Band', icon: Music },
};
export const PERSON_TYPE_ORDER = ['crew', 'actor', 'staff', 'musician'];

export const ATTENDANCE_STATUS = {
  pending: { label: 'Pending', color: COLOR.textFaint },
  present: { label: 'Present', color: COLOR.green },
  absent: { label: 'Absent', color: COLOR.slate },
};

export const CHOREO_TYPES = {
  song: { label: 'Song', icon: Music },
  scene: { label: 'Scene', icon: Footprints },
};

export const BUILD_STATUSES = {
  not_started: { label: 'Not Started', color: COLOR.slate },
  in_progress: { label: 'In Progress', color: COLOR.amber },
  built: { label: 'Built', color: COLOR.blueprint },
  painted: { label: 'Painted', color: COLOR.green },
};
export const BUILD_STATUS_ORDER = ['not_started', 'in_progress', 'built', 'painted'];

export const COSTUME_SOURCES = {
  inventory: { label: 'From Inventory', icon: Boxes },
  buy: { label: 'Needs to Buy', icon: DollarSign },
  bring_in: { label: 'Bring In', icon: Package },
};
export const COSTUME_SOURCE_ORDER = ['inventory', 'buy', 'bring_in'];

export const PROP_SOURCES = {
  inventory: { label: 'From Inventory', icon: Boxes },
  buy: { label: 'Needs to Buy', icon: DollarSign },
  build: { label: 'Needs to Build', icon: Hammer },
  bring_in: { label: 'Bring In', icon: Package },
};
export const PROP_SOURCE_ORDER = ['inventory', 'buy', 'build', 'bring_in'];

export const SCENE_TYPES = {
  scene: { label: 'Scene', icon: Footprints },
  number: { label: 'Musical Number', icon: Music },
};
export const SCENE_TYPE_ORDER = ['scene', 'number'];

// Flattens a show's acts into a single list of scenes, each carrying its
// act's name and its number (position within the act) — the canonical list
// everything else (Choreography, Costumes, Props) picks from instead of
// typing a scene name freehand.
export function allScenes(show) {
  return (show.acts || []).flatMap((act) => (act.scenes || []).map((sc, i) => ({ ...sc, actId: act.id, actName: act.name, number: i + 1 })));
}
export function sceneById(show, sceneId) {
  return allScenes(show).find((sc) => sc.id === sceneId) || null;
}
export function sceneLabel(show, sceneId) {
  const sc = sceneById(show, sceneId);
  return sc ? `${sc.actName} — ${sc.number}. ${sc.name}` : 'Throughout / Not scene-specific';
}

export function rosterForType(type, rosters) {
  if (type === 'crew') return rosters.crew;
  if (type === 'actor') return rosters.actors;
  if (type === 'staff') return rosters.staff;
  if (type === 'musician') return rosters.musicians;
  return [];
}

export function setterForType(type, rosters) {
  if (type === 'crew') return rosters.setCrew;
  if (type === 'actor') return rosters.setActors;
  if (type === 'staff') return rosters.setStaff;
  if (type === 'musician') return rosters.setMusicians;
  return null;
}

export function defaultAssignmentFields(type, slotRole) {
  if (type === 'crew') return { role: slotRole, dept: 'general' };
  if (type === 'actor') return { roleTitle: slotRole, category: 'ensemble', miced: false, micType: '' };
  if (type === 'staff') return { roleTitle: slotRole, category: 'other' };
  if (type === 'musician') return { roleTitle: slotRole, category: 'md', electric: false, monitorMix: false };
  return {};
}

export const handwrittenCalls = [
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
export const generatedCalls = seedShows.flatMap((s) => generateCallsForSchedule(s).filter((c) => c.date > TODAY_STR));

export const seedCalls = [...handwrittenCalls, ...generatedCalls];

// Inventory categories were the same seven departments under another name.
// They are now `stock: true` on the department itself — see stockDepartments().

export const seedInventory = [
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

// Cue departments carry a colour so a marked-up page can be read at a glance
// in a dark booth. These are picked to stay legible printed on white paper too,
// which is where most of these scripts actually end up.
export const CUE_DEPT_PALETTE = [
  '#E8A33D', '#4A9FD8', '#6FCF97', '#C77DBF', '#E4695E',
  '#8B8FE8', '#5FBDB0', '#D9A05B', '#9AA5B1',
];

// Which departments call cues, and under what prefix, is now a field on the
// department — see INITIAL_DEPARTMENTS and cueDepartments().

// The colour to draw a cue in. Falls back down a chain rather than throwing:
// a department added before colours existed, or a cue whose department was
// deleted, still has to render.
export function deptColor(deptKey, departments) {
  const entry = departments && departments[deptKey];
  if (entry && entry.color) return entry.color;
  const keys = Object.keys(departments || {});
  const i = keys.indexOf(deptKey);
  return CUE_DEPT_PALETTE[i >= 0 ? i % CUE_DEPT_PALETTE.length : 0];
}

// A cue's identity is its department + number together (LX 1 and SND 1 are
// different cues that happen to share a number) — num itself is just a
// number, never a department-prefixed string.
// Scripts are kept in memory as base64 (same as everything else in this
// app — nothing persists past a reload without a backend), so PDF bytes
// need converting both ways.
export function uint8ArrayToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
export function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function cueCode(cue, CUE_DEPTS) {
  return `${CUE_DEPTS[cue.dept]?.label || cue.dept} ${cue.num}`;
}
export function isDuplicateCue(cues, dept, num, excludeId) {
  return cues.some((c) => c.id !== excludeId && c.dept === dept && String(c.num) === String(num));
}
export function nextCueNumber(cues, dept) {
  const nums = cues.filter((c) => c.dept === dept).map((c) => Number(c.num) || 0);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

export const seedCueSheets = {
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

export const seedVenues = ['Mainstage', 'Black Box', 'Studio'];
export const seedLocations = ['Electrics Cage', 'Sound Booth', 'Scene Shop', 'Rigging Loft', 'Props Storage', 'Costume Shop', 'Shop Stores'];
export const seedInstruments = ['Music Director / Conductor', 'Piano 1', 'Piano 2', 'Violin', 'Viola', 'Cello', 'Bass', 'Guitar', 'Drums/Percussion', 'Reed 1', 'Reed 2', 'Reed 3', 'Trumpet', 'Trombone', 'French Horn', 'Vocal Captain', 'Vocals'];

export function itemCheckedOut(item) {
  return (item.assignments || []).reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
}

// Only "broken" and "retired" units are out of service — a "repaired" unit
// has a history note but counts as available again.
export function itemOutOfService(item) {
  return (item.units || []).filter((u) => u.status === 'broken' || u.status === 'retired').length;
}

export function conditionForItem(item) {
  const checkedOut = itemCheckedOut(item);
  const outOfService = itemOutOfService(item);
  const available = item.totalQty - checkedOut - outOfService;
  if (outOfService > 0 || available <= 0) return 'attention';
  return 'good';
}

// A show's tech week is whichever schedule entries are explicitly marked as
// such — not just "any rehearsal" — spanning from the earliest to the
// latest of those dates.
export function techWeekRange(show) {
  const entries = (show.schedule || []).filter((e) => e.isTechWeek && e.date);
  if (entries.length === 0) return null;
  const dates = entries.map((e) => e.date).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

export function rangesOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}

// Two assignments only conflict if their shows' tech weeks overlap AND the
// combined quantity they need exceeds what's actually in stock.
export function itemConflicts(item, shows) {
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

export function daysUntil(dateStr) {
  const diff = Math.ceil((new Date(dateStr) - TODAY) / (1000 * 60 * 60 * 24));
  return diff;
}

export function formatShortDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function nextMilestone(schedule) {
  if (!schedule || schedule.length === 0) return null;
  const upcoming = schedule.filter((d) => new Date(d.date + 'T00:00:00') >= TODAY).sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] || null;
}

export function formatTime12h(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function parseTime12hTo24h(t) {
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

export function addMinutesToTime(hhmm, minutes) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function formatDuration(mins) {
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
export function buildAudioPlot(show, actors, musicians, CAST_TYPE_ORDER, MUSIC_SECTIONS) {
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
// NEW ITEM FORM
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ITEM DETAIL PANEL — what opening an inventory item gets you: editable
// quantity, per-unit status history, full assignment control, and cost /
// purchase records.
// ---------------------------------------------------------------------------
export const UNIT_STATUS_META = {
  broken: { label: 'Broken', color: COLOR.slate },
  repaired: { label: 'Repaired', color: COLOR.green },
  retired: { label: 'Retired', color: COLOR.textFaint },
};
