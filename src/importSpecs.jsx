import { yes, num, uid, byName } from './csvImport.jsx';
import { allScenes } from './shared.jsx';

// ---------------------------------------------------------------------------
// WHAT EACH MODULE'S SPREADSHEET LOOKS LIKE
//
// Every spec is a list of columns and a builder that turns one row into one
// item. They live together so the vocabulary stays consistent — a Scene column
// means the same thing in Props as it does in Costumes, and Notes is always
// Notes.
//
// Two habits throughout:
//
// Names, not ids. Nobody types `sc-s1-1a` into a spreadsheet. Columns that
// point at something else in the app are matched by name, and a name that
// doesn't match is left unset rather than guessed at — an unlinked prop is
// easy to spot and fix; a prop attached to the wrong scene is not.
//
// A sample row in every template. A header alone leaves people guessing what a
// date or a yes/no is supposed to look like.
// ---------------------------------------------------------------------------

const C = (key, required = false) => ({ key, required });

// --- Schedule ---------------------------------------------------------------
export const scheduleSpec = {
  filename: 'schedule',
  columns: [C('Label', true), C('Date', true), C('Time'), C('Minutes'), C('Location'), C('Notes')],
  sample: { Label: 'Load-in', Date: '2026-10-01', Time: '09:00', Minutes: '480', Location: 'Mainstage', Notes: 'Full crew call' },
  build: (r) => ({
    id: uid('sch'),
    label: r.get('Label'),
    date: r.get('Date'),
    time: r.get('Time') || '09:00',
    durationMinutes: num(r.get('Minutes'), 120),
    location: r.get('Location') || '',
    notes: r.get('Notes') || '',
    breaks: [],
    attendance: { crew: [], actors: [], musicians: [], staff: [] },
  }),
};

// --- Scenes -----------------------------------------------------------------
// One row per scene, with the act named on each row. Acts are created as they
// are first seen, which means a spreadsheet sorted by act comes out in order.
export const scenesSpec = {
  filename: 'scenes',
  columns: [C('Act', true), C('Scene', true), C('Type'), C('Notes')],
  sample: { Act: 'Act 1', Scene: 'The Storm', Type: 'scene', Notes: 'Shipwreck sequence, full company' },
  buildInto: (rows, acts) => {
    const next = acts.map((a) => ({ ...a, scenes: [...(a.scenes || [])] }));
    let added = 0;
    rows.forEach((r) => {
      const actName = r.get('Act');
      let act = next.find((a) => String(a.name || '').trim().toLowerCase() === actName.toLowerCase());
      if (!act) {
        act = { id: uid('act'), name: actName, order: next.length + 1, scenes: [] };
        next.push(act);
      }
      act.scenes.push({
        id: uid('sc'),
        name: r.get('Scene'),
        type: (r.get('Type') || 'scene').toLowerCase(),
        notes: r.get('Notes') || '',
        actorIds: [],
        characterIds: [],
      });
      added += 1;
    });
    return { acts: next, added };
  },
};

// --- Characters -------------------------------------------------------------
export const charactersSpec = {
  filename: 'characters',
  columns: [C('Character', true), C('Notes')],
  sample: { Character: 'Prospero', Notes: 'Exiled Duke of Milan' },
  build: (r) => ({ id: uid('ch'), name: r.get('Character'), notes: r.get('Notes') || '' }),
};

// --- People: Crew, Actors, Musicians, Staff ---------------------------------
// The four rosters differ only in what the role column is called and which
// taxonomy the category belongs to, so they share one builder.
function peopleSpec({ filename, roleLabel, roleField, categoryLabel, categoryMap, sample }) {
  return {
    filename,
    columns: [C('Name', true), C(roleLabel), C(categoryLabel), C('Phone'), C('Email')],
    sample,
    build: (r, ctx) => {
      const role = r.get(roleLabel);
      const catName = r.get(categoryLabel);
      const catKey = Object.keys(categoryMap(ctx) || {}).find(
        (k) => String((categoryMap(ctx)[k] || {}).label || '').toLowerCase() === catName.toLowerCase()
      );
      const person = {
        id: uid('p'),
        name: r.get('Name'),
        phone: r.get('Phone') || '',
        email: r.get('Email') || '',
        assignments: [],
      };
      // A role only means something against a production, so it is only
      // attached when one is open.
      if (role && ctx.show) {
        person.assignments.push({
          id: uid('asn'),
          showId: ctx.show.id,
          [roleField]: role,
          [roleField === 'role' ? 'dept' : 'category']: catKey || Object.keys(categoryMap(ctx) || {})[0],
        });
      }
      return person;
    },
  };
}

export const crewSpec = peopleSpec({
  filename: 'crew', roleLabel: 'Position', roleField: 'role',
  categoryLabel: 'Department', categoryMap: (ctx) => ctx.departments,
  sample: { Name: 'Sam Rivera', Position: 'Board Op', Department: 'Electrics', Phone: '555-0100', Email: 'sam@example.com' },
});

export const actorsSpec = peopleSpec({
  filename: 'actors', roleLabel: 'Character', roleField: 'roleTitle',
  categoryLabel: 'Cast type', categoryMap: (ctx) => ctx.castTypes,
  sample: { Name: 'Jordan Blake', Character: 'Prospero', 'Cast type': 'Lead', Phone: '555-0101', Email: 'jordan@example.com' },
});

export const musiciansSpec = peopleSpec({
  filename: 'musicians', roleLabel: 'Instrument', roleField: 'roleTitle',
  categoryLabel: 'Section', categoryMap: (ctx) => ctx.musicSections,
  sample: { Name: 'Alex Chen', Instrument: 'Reed 1', Section: 'Winds/Brass', Phone: '555-0102', Email: 'alex@example.com' },
});

export const staffSpec = peopleSpec({
  filename: 'staff', roleLabel: 'Position', roleField: 'roleTitle',
  categoryLabel: 'Area', categoryMap: (ctx) => ctx.staffAreas,
  sample: { Name: 'Robin Hale', Position: 'Stage Manager', Area: 'Directing', Phone: '555-0103', Email: 'robin@example.com' },
});

// --- Costumes ---------------------------------------------------------------
export const costumesSpec = {
  filename: 'costumes',
  columns: [C('Description', true), C('Character'), C('Scene'), C('Source'), C('Acquired'), C('Location'), C('Cost'), C('Notes')],
  sample: { Description: "Prospero's Robe", Character: 'Prospero', Scene: 'The Storm', Source: 'bring_in', Acquired: 'yes', Location: 'Costume Shop', Cost: '0', Notes: 'Borrowed from stock' },
  build: (r, ctx) => {
    const character = byName(ctx.show?.characters || [], r.get('Character'));
    const scene = byName(allScenes(ctx.show || {}), r.get('Scene'));
    return {
      id: uid('co'),
      description: r.get('Description'),
      characterId: character ? character.id : null,
      actorId: null,
      sceneId: scene ? scene.id : null,
      source: (r.get('Source') || 'bring_in').toLowerCase().replace(/\s+/g, '_'),
      inventoryItemId: null,
      acquired: yes(r.get('Acquired')),
      location: r.get('Location') || '',
      cost: num(r.get('Cost')),
      notes: r.get('Notes') || '',
    };
  },
};

// --- Props ------------------------------------------------------------------
export const propsSpec = {
  filename: 'props',
  columns: [C('Description', true), C('Scene'), C('Character'), C('Source'), C('Acquired'), C('Consumable'), C('Location'), C('Cost'), C('Notes')],
  sample: { Description: "Prospero's Staff", Scene: 'The Storm', Character: 'Prospero', Source: 'build', Acquired: 'no', Consumable: 'no', Location: 'Props Storage', Cost: '0', Notes: 'LED tip' },
  build: (r, ctx) => {
    const scene = byName(allScenes(ctx.show || {}), r.get('Scene'));
    const character = byName(ctx.show?.characters || [], r.get('Character'));
    return {
      id: uid('pr'),
      description: r.get('Description'),
      sceneId: scene ? scene.id : null,
      characterId: character ? character.id : null,
      actorId: null,
      source: (r.get('Source') || 'build').toLowerCase().replace(/\s+/g, '_'),
      inventoryItemId: null,
      acquired: yes(r.get('Acquired')),
      consumable: yes(r.get('Consumable')),
      location: r.get('Location') || '',
      cost: num(r.get('Cost')),
      notes: r.get('Notes') || '',
    };
  },
};

// --- Set --------------------------------------------------------------------
export const setSpec = {
  filename: 'set-pieces',
  columns: [C('Name', true), C('Description'), C('Quantity'), C('Build status'), C('Notes')],
  sample: { Name: 'USR Platform Unit', Description: '8x8 platform, 24in high', Quantity: '1', 'Build status': 'to_build', Notes: 'Needs rail' },
  build: (r) => ({
    id: uid('sp'),
    name: r.get('Name'),
    description: r.get('Description') || '',
    quantity: num(r.get('Quantity'), 1),
    buildStatus: (r.get('Build status') || 'to_build').toLowerCase().replace(/\s+/g, '_'),
    notes: r.get('Notes') || '',
    components: [],
    sceneIds: [],
  }),
};

// --- Inventory --------------------------------------------------------------
export const inventorySpec = {
  filename: 'inventory',
  columns: [C('Name', true), C('Category'), C('Asset no'), C('Quantity'), C('Location'), C('Cost per unit'), C('Purchase date'), C('Source'), C('Notes')],
  sample: { Name: 'ETC Source Four 26°', Category: 'Electrics', 'Asset no': 'LX-0142', Quantity: '24', Location: 'Electrics Cage', 'Cost per unit': '495', 'Purchase date': '2026-01-15', Source: 'BMI Supply', Notes: 'Rep plot' },
  build: (r, ctx) => {
    const catName = r.get('Category');
    const catKey = Object.keys(ctx.inventoryCategories || {}).find(
      (k) => String((ctx.inventoryCategories[k] || {}).label || '').toLowerCase() === catName.toLowerCase()
    );
    const qty = num(r.get('Quantity'), 1);
    return {
      id: uid('i'),
      name: r.get('Name'),
      category: catKey || Object.keys(ctx.inventoryCategories || {})[0],
      assetNo: r.get('Asset no') || '',
      totalQty: qty,
      location: r.get('Location') || '',
      costPerUnit: num(r.get('Cost per unit')),
      purchaseDate: r.get('Purchase date') || null,
      purchaseSource: r.get('Source') || '',
      purchaseNotes: r.get('Notes') || '',
      // Every unit starts good. Damage is recorded as it happens, not imported.
      units: Array.from({ length: Math.max(0, qty) }, (_, i) => ({ id: uid(`u${i}`), status: 'ok', note: '', date: null })),
      assignments: [],
    };
  },
};

// --- Run of Show (cues) -----------------------------------------------------
export const cuesSpec = {
  filename: 'run-of-show',
  columns: [C('Department', true), C('Number', true), C('Description', true)],
  sample: { Department: 'LX', Number: '1', Description: 'House to half' },
  build: (r, ctx) => {
    const deptName = r.get('Department');
    const deptKey = Object.keys(ctx.cueDepts || {}).find(
      (k) => String((ctx.cueDepts[k] || {}).label || '').toLowerCase() === deptName.toLowerCase() || k.toLowerCase() === deptName.toLowerCase()
    );
    return {
      id: uid('q'),
      num: num(r.get('Number'), 1),
      dept: deptKey || Object.keys(ctx.cueDepts || {})[0],
      desc: r.get('Description'),
      fired: false,
    };
  },
};
