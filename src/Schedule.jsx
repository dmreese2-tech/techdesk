import React, { useMemo, useState } from 'react';
import { Briefcase, MapPin, Music, Package, Pencil, Plus, Star, UserCheck, Users, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { ImportCsvButton } from './csvImport.jsx';
import { scheduleSpec } from './importSpecs.jsx';
import {
  MILESTONE_PRESETS, PERSON_TYPES, PERSON_TYPE_ORDER, ROLL_STATUS, ROLL_STATUS_ORDER, TODAY,
  addMinutesToTime, assignmentFor, assignmentsFor, byName, emptyCalled,
  formatDuration, formatShortDate, formatTime12h, fromMinutes, hasAddress, isFullyCovered,
  milestoneSlotsFor, normalizeEntry, rosterForType, sceneById, slotCoverage,
  slotShortfall, venueAddressLine, venueByName, venueList, venueMapsUrl,
} from './shared.jsx';
import { StubPanel } from './ui.jsx';

// SCHEDULE — load-in, rehearsals, tech week, performances and strike, and the
// callboard that used to be a second module describing the same events.
//
// Calls and Schedule were two records of one thing, kept loosely in sync by a
// label match. A schedule entry now carries everything a call sheet carried:
// where it is, which scenes are worked, what gear comes out, who is called,
// who signed themselves up, and who actually turned up.
//
// Three words that used to overlap are now distinct:
//   called  — roster ids the stage manager ticked. You are required.
//   signups — people who claimed an open position, each with the stretch of
//             the call they can actually cover.
//   roll    — present / late / absent on the day, keyed by person.

// ---------------------------------------------------------------------------
// SCHEDULE HELPERS
// ---------------------------------------------------------------------------
export function buildMonthGrid(year, month) {
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
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function calledCount(entry) {
  const c = entry.called || {};
  return (c.crew || []).length + (c.actors || []).length + (c.musicians || []).length + (c.staff || []).length;
}

// ---------------------------------------------------------------------------
// THE FOUR CALLED COLUMNS, described once.
//
// `called` is keyed crew / actors / musicians / staff, and each roster names
// the thing it groups by differently: crew assignments carry `dept`, everyone
// else carries `category`. Cast group by cast position (Settings → Cast
// positions); crew, band and staff group by department. Both the picker and
// the roll-up read this list, so a fifth roster is one entry here rather than
// four edits that have to agree.
// ---------------------------------------------------------------------------
export const CALLED_COLUMNS = [
  { type: 'crew', label: 'Crew', icon: Users, keyField: 'dept', taxonomy: 'departments', personType: 'crew' },
  { type: 'actors', label: 'Cast', icon: Star, keyField: 'category', taxonomy: 'castTypes', personType: 'actor' },
  { type: 'musicians', label: 'Band', icon: Music, keyField: 'category', taxonomy: 'departments', personType: 'musician' },
  { type: 'staff', label: 'Staff', icon: Briefcase, keyField: 'category', taxonomy: 'departments', personType: 'staff' },
];

// personType (singular, from PERSON_TYPES) -> called-column key (plural).
const COLUMN_FOR_PERSON_TYPE = Object.fromEntries(CALLED_COLUMNS.map((c) => [c.personType, c.type]));

// A group of one is not a group. "All Ensemble" over a single ensemble member
// says less than her name does, so a roll-up needs at least two people behind
// it before it replaces them.
const MIN_ROLLUP = 2;
// Past this many loose names a card stops being readable at a glance.
const NAMES_BEFORE_FOLD = 12;

function rosterFor(rosters, type) {
  return (rosters && rosters[type]) || [];
}

// Everyone on this roster holding at least one assignment on this show.
// assignmentsFor, not assignmentFor: since multi-role casting landed an actor
// can be Lead *and* Ensemble, and a roll-up built on the first assignment alone
// would undercount every group but one and so never fire.
function eligibleFor(rosters, type, showId) {
  return rosterFor(rosters, type).filter((p) => assignmentsFor(p, showId).length > 0);
}

// Find a person across all four rosters — a sign-up is a person id and does
// not carry which roster it came from once it is on the entry.
function findPerson(rosters, personId) {
  for (const col of CALLED_COLUMNS) {
    const hit = rosterFor(rosters, col.type).find((p) => p.id === personId);
    if (hit) return hit;
  }
  return null;
}

function personName(rosters, personId) {
  const p = findPerson(rosters, personId);
  return p ? p.name : '';
}

// `addedBy` on a sign-up is an auth user id, not a roster id — the RPC records
// who was signed in when the sign-up was entered, and that account may be
// linked to several roster records. Any of them names the same human, so the
// first match is the answer.
function nameForUserId(rosters, userId) {
  if (!userId) return '';
  for (const col of CALLED_COLUMNS) {
    const hit = rosterFor(rosters, col.type).find((p) => p.userId === userId);
    if (hit) return hit.name;
  }
  return '';
}

// ---------------------------------------------------------------------------
// CALLED SUMMARY — who is required, said in the fewest words that are still
// true.
//
// Per roster: if every eligible person is called and they span more than one
// group, that is "All Crew". Otherwise any group whose whole membership is
// called collapses to "All <group>", and whoever is left over is named.
// Someone called who is no longer on the show is reported rather than dropped —
// a stale tick is a person who thinks they have a call.
// ---------------------------------------------------------------------------
export function summarizeCalled(entry, rosters, show, taxonomies) {
  const showId = show.id;
  const t = taxonomies || {};
  return CALLED_COLUMNS.map((col) => {
    const roster = rosterFor(rosters, col.type);
    const calledIds = new Set((entry.called || {})[col.type] || []);
    const eligible = eligibleFor(rosters, col.type, showId);
    const eligibleIds = new Set(eligible.map((p) => p.id));

    const map = (col.taxonomy === 'castTypes' ? t.castTypes : t.departments) || {};
    const order = (col.taxonomy === 'castTypes' ? t.castTypeOrder : t.departmentOrder) || [];

    // key -> everyone holding it, and key -> those of them who are called.
    const total = new Map();
    const called = new Map();
    eligible.forEach((person) => {
      assignmentsFor(person, showId).forEach((a) => {
        const key = a && a[col.keyField];
        if (!key) return;
        if (!total.has(key)) total.set(key, new Set());
        total.get(key).add(person.id);
        if (calledIds.has(person.id)) {
          if (!called.has(key)) called.set(key, new Set());
          called.get(key).add(person.id);
        }
      });
    });

    const calledEligible = eligible.filter((p) => calledIds.has(p.id));
    const chips = [];
    const covered = new Set();

    const wholeRoster =
      calledEligible.length === eligible.length && eligible.length >= MIN_ROLLUP && total.size > 1;

    if (wholeRoster) {
      chips.push({ key: `all-${col.type}`, label: `All ${col.label}` });
      calledEligible.forEach((p) => covered.add(p.id));
    } else {
      // Settings order first, then anything present but unordered — a group
      // added by hand to the JSON still has to appear somewhere.
      const known = order.filter((k) => total.has(k));
      const extras = [...total.keys()]
        .filter((k) => !known.includes(k))
        .sort((a, b) => byName(map[a]?.label || a, map[b]?.label || b));
      [...known, ...extras].forEach((key) => {
        const tot = total.get(key);
        const cal = called.get(key) || new Set();
        if (tot.size >= MIN_ROLLUP && cal.size === tot.size) {
          chips.push({ key, label: `All ${map[key]?.label || key}` });
          cal.forEach((id) => covered.add(id));
        }
      });
    }

    const names = calledEligible.filter((p) => !covered.has(p.id)).map((p) => p.name).sort(byName);

    // Ticked, but not on this show any more — or not on the roster at all.
    const strays = [...calledIds].filter((id) => !eligibleIds.has(id));
    const offShow = strays.map((id) => roster.find((p) => p.id === id)).filter(Boolean).map((p) => p.name).sort(byName);
    const missing = strays.length - offShow.length;

    return { ...col, count: calledIds.size, chips, names, offShow, missing };
  });
}

// Which of my roster records are ticked on this entry, and what I am called as.
export function myRolesForEntry(entry, rosters, show, myPersonIds) {
  const titles = [];
  CALLED_COLUMNS.forEach((col) => {
    const calledIds = new Set((entry.called || {})[col.type] || []);
    rosterFor(rosters, col.type).forEach((person) => {
      if (!myPersonIds.has(person.id) || !calledIds.has(person.id)) return;
      assignmentsFor(person, show.id).forEach((a) => {
        const title = a.role || a.roleTitle || '';
        if (title) titles.push(title);
      });
    });
  });
  return [...new Set(titles)];
}

export function isCalled(entry, myPersonIds) {
  return CALLED_COLUMNS.some((col) => ((entry.called || {})[col.type] || []).some((id) => myPersonIds.has(id)));
}

// Signed themselves up, as opposed to having been called.
export function mySignups(entry, myPersonIds) {
  const out = [];
  (entry.slots || []).forEach((slot) => {
    (slot.signups || []).forEach((s) => {
      if (myPersonIds.has(s.personId)) out.push({ slot, signup: s });
    });
  });
  return out;
}

// Roster records linked to the signed-in account. Read off the rosters rather
// than a single people_view lookup, because someone can be linked as crew and
// as cast at once and both records get called separately.
export function myPersonIdsFor(rosters, userId) {
  const ids = new Set();
  if (!userId) return ids;
  CALLED_COLUMNS.forEach((col) => {
    rosterFor(rosters, col.type).forEach((p) => {
      if (p.userId && p.userId === userId) ids.add(p.id);
    });
  });
  return ids;
}

// ---------------------------------------------------------------------------
// VIEW SWITCH — rendered by the shell ABOVE the read-only gate, not inside it.
//
// The gate stops pointer events on everything it wraps so nobody types into a
// form that was never going to save. Choosing which view to read is not an
// edit, and the people who most need "Show my calls" — cast, band, general
// hands — are exactly the people without a schedule grant. Inside the gate the
// pill would be visible and dead.
// ---------------------------------------------------------------------------
export const SCHEDULE_VIEWS = [
  { id: 'list', label: 'List' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'mine', label: 'Show My Calls' },
];

export function ScheduleViewSwitch({ view, setView }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
      {SCHEDULE_VIEWS.map((v) => (
        <button
          key={v.id}
          onClick={() => setView(v.id)}
          className="td-focusable"
          aria-pressed={view === v.id}
          style={{
            background: view === v.id ? COLOR.amber : 'transparent',
            color: view === v.id ? COLOR.void : COLOR.textMuted,
            border: `1px solid ${view === v.id ? COLOR.amber : COLOR.line}`,
            borderRadius: 20,
            padding: '5px 14px',
            fontSize: 12,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------
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

function Field({ label, children }) {
  return (
    <div>
      <label className="td-mono" style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SLOT ROLE — what a position is asking for. Picks from the same lists the
// rosters cast against: characters for actors, position lists for everyone
// else, so a position and an assignment can't drift apart in wording. Falls
// back to free text for a person type whose list hasn't been set up yet.
// ---------------------------------------------------------------------------
export function SlotRoleField({ personType, value, onChange, slotOptions, style, placeholder }) {
  const options = (slotOptions && slotOptions[personType]) || [];
  if (!options.length) {
    return <input className="td-focusable" style={style} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
  }
  return (
    <select className="td-focusable" style={style} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose...</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
      {value && !options.includes(value) && <option value={value}>{value}</option>}
    </select>
  );
}

// ---------------------------------------------------------------------------
// PLACE PICKER — and the address, shown where it is useful rather than filed
// away in Settings where nobody reads it at 7am on a load-in day.
// ---------------------------------------------------------------------------
function PlacePicker({ venues, value, onChange }) {
  const places = venueList(venues);
  const chosen = venueByName(venues, value);
  return (
    <div>
      <label className="td-mono" style={labelStyle}>PLACE</label>
      <select className="td-focusable" style={inputStyle} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Not set —</option>
        {places.map((v) => (
          <option key={v.name} value={v.name}>{v.name}</option>
        ))}
        {value && !chosen && <option value={value}>{value} (not in Settings)</option>}
      </select>
      {chosen && hasAddress(chosen) && (
        <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginTop: 5 }}>{venueAddressLine(chosen)}</div>
      )}
      {value && !chosen && (
        <div className="td-body" style={{ fontSize: 11, color: COLOR.amber, marginTop: 5 }}>
          Not one of the company's places — add it in Settings → Places to give it an address.
        </div>
      )}
      {places.length === 0 && (
        <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginTop: 5 }}>
          No places set up yet. Settings → Places.
        </div>
      )}
    </div>
  );
}

function PlaceLine({ venues, name }) {
  const venue = venueByName(venues, name);
  if (!name) return null;
  const url = venue ? venueMapsUrl(venue) : '';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      <MapPin size={11} color={COLOR.blueprint} strokeWidth={1.75} style={{ position: 'relative', top: 1, flexShrink: 0 }} />
      <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.blueprint, letterSpacing: '0.04em' }}>{name.toUpperCase()}</span>
      {venue && hasAddress(venue) && (
        <>
          <span className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>{venueAddressLine(venue)}</span>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="td-focusable" style={{ fontSize: 11, color: COLOR.blueprint, fontFamily: "'Inter', sans-serif" }}>
              Directions
            </a>
          )}
        </>
      )}
      {venue && venue.notes && (
        <span className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, fontStyle: 'italic' }}>{venue.notes}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COVERAGE BAR — a position's staffing across the call, drawn to scale.
//
// A count would say "8 signed up for 6". This says which four hours are short,
// which is the only version of that fact anyone can act on.
// ---------------------------------------------------------------------------
function CoverageBar({ entry, slot }) {
  const segments = slotCoverage(entry, slot);
  if (segments.length === 0) return null;
  const start = segments[0].from;
  const span = segments[segments.length - 1].to - start;
  if (span <= 0) return null;

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: COLOR.void }}>
        {segments.map((seg, i) => {
          const short = seg.have < seg.need;
          return (
            <div
              key={i}
              title={`${formatTime12h(fromMinutes(seg.from))}-${formatTime12h(fromMinutes(seg.to))} · ${seg.have} of ${seg.need}`}
              style={{
                width: `${((seg.to - seg.from) / span) * 100}%`,
                background: short ? (seg.have === 0 ? COLOR.slate : COLOR.amber) : COLOR.green,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        {segments.map((seg, i) => (
          <span key={i} className="td-mono" style={{ fontSize: 9, color: seg.have < seg.need ? COLOR.amber : COLOR.textFaint }}>
            {formatTime12h(fromMinutes(seg.from))}–{formatTime12h(fromMinutes(seg.to))} {seg.have}/{seg.need}
          </span>
        ))}
      </div>
    </div>
  );
}

function shortfallSummary(entry, slot) {
  const gaps = slotShortfall(entry, slot);
  if (gaps.length === 0) return null;
  return gaps
    .map((g) => `${formatTime12h(fromMinutes(g.from))}–${formatTime12h(fromMinutes(g.to))} short ${g.need - g.have}`)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// CALLED PICKER — one column per roster, scoped to people already linked to
// this show.
// ---------------------------------------------------------------------------
export function CalledPicker({ rosters, show, called, onToggle }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      {CALLED_COLUMNS.map((col) => {
        const Icon = col.icon;
        const people = eligibleFor(rosters, col.type, show.id);
        return (
          <div key={col.type}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <Icon size={12} color={COLOR.textFaint} strokeWidth={1.75} />
              <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.04em' }}>
                {col.label.toUpperCase()} — {(called[col.type] || []).length}
              </span>
            </div>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 8px' }} className="td-scrollbar">
              {people.length > 0 ? (
                people.map((p) => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={(called[col.type] || []).includes(p.id)} onChange={() => onToggle(col.type, p.id)} />
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
// POSITION EDITOR — the part of the call sheet that says what the day needs.
//
// `needed` is a count, not a row per body. "Six general hands" is one line, and
// nine people may sign up against it if they are each covering part of the day.
// ---------------------------------------------------------------------------
function SlotEditor({ entry, rosters, show, slots, setSlots, slotOptions, label }) {
  function addSlot() {
    setSlots((prev) => [...prev, { id: `slot-${Date.now()}-${prev.length}`, personType: 'crew', role: '', needed: 1, signups: [] }]);
  }
  function update(id, field, value) {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (field === 'personType') return { ...s, personType: value, role: '', signups: [] };
        if (field === 'needed') return { ...s, needed: Math.max(0, Number(value) || 0) };
        return { ...s, [field]: value };
      })
    );
  }
  function remove(id) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }
  function addSignup(slotId, personId) {
    if (!personId) return;
    setSlots((prev) =>
      prev.map((s) =>
        s.id !== slotId || (s.signups || []).some((x) => x.personId === personId)
          ? s
          : { ...s, signups: [...(s.signups || []), { id: `su-${Date.now()}`, personId, from: '', to: '' }] }
      )
    );
  }
  function updateSignup(slotId, signupId, field, value) {
    setSlots((prev) =>
      prev.map((s) => (s.id !== slotId ? s : { ...s, signups: s.signups.map((x) => (x.id === signupId ? { ...x, [field]: value } : x)) }))
    );
  }
  function removeSignup(slotId, signupId) {
    setSlots((prev) => prev.map((s) => (s.id !== slotId ? s : { ...s, signups: s.signups.filter((x) => x.id !== signupId) })));
  }

  const suggested = milestoneSlotsFor(label, entry.id);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <label className="td-mono" style={{ ...labelStyle, marginBottom: 0 }}>WHAT THIS CALL NEEDS</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {suggested.length > 0 && slots.length === 0 && (
            <button
              onClick={() => setSlots(suggested)}
              className="td-focusable"
              style={{ background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}
            >
              Use the usual {label} crew
            </button>
          )}
          <button
            onClick={addSlot}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}
          >
            <Plus size={12} /> Add a position
          </button>
        </div>
      </div>

      {slots.length === 0 && (
        <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginBottom: 4 }}>
          No positions yet. Ticking people under "Who is called" is enough for a rehearsal; positions are for calls
          where you need a number of bodies rather than named people.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {slots.map((slot) => {
          // Only people already on this production. Settled rule, and the
          // sign-up RPC enforces the same thing — a name here that the RPC
          // would refuse is a control that works for the stage manager and
          // fails for everyone else, which is worse than not offering it.
          // Somebody not on the show gets added on the People page first.
          const roster = rosterForType(slot.personType, rosters);
          const taken = new Set((slot.signups || []).map((s) => s.personId));
          const gaps = shortfallSummary(entry, slot);
          const freeOnShow = roster.filter((p) => assignmentFor(p, show.id) && !taken.has(p.id));
          return (
            <div key={slot.id} style={{ border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 118px auto', gap: 8, alignItems: 'center' }}>
                <select className="td-focusable" style={inputStyle} value={slot.personType} onChange={(e) => update(slot.id, 'personType', e.target.value)}>
                  {PERSON_TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>{PERSON_TYPES[t].label}</option>
                  ))}
                </select>
                <SlotRoleField
                  personType={slot.personType}
                  value={slot.role}
                  onChange={(v) => update(slot.id, 'role', v)}
                  slotOptions={slotOptions}
                  style={inputStyle}
                  placeholder="Role, e.g. General Hand"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input
                    className="td-focusable"
                    type="number"
                    min="0"
                    style={{ ...inputStyle, width: 56 }}
                    value={slot.needed}
                    onChange={(e) => update(slot.id, 'needed', e.target.value)}
                    aria-label="How many needed"
                  />
                  <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint }}>NEEDED</span>
                </div>
                <button onClick={() => remove(slot.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove position">
                  <X size={14} />
                </button>
              </div>

              <CoverageBar entry={entry} slot={slot} />
              {gaps && <div className="td-mono" style={{ fontSize: 10, color: COLOR.amber }}>{gaps}</div>}

              {(slot.signups || []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {slot.signups.map((su) => (
                    <div key={su.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px auto', gap: 8, alignItems: 'center' }}>
                      <span className="td-body" style={{ fontSize: 12, color: COLOR.textPrimary }}>
                        {personName(rosters, su.personId) || <em style={{ color: COLOR.textFaint }}>no longer on the roster</em>}
                      </span>
                      <input className="td-focusable" type="time" style={inputStyle} value={su.from} onChange={(e) => updateSignup(slot.id, su.id, 'from', e.target.value)} aria-label="Here from" />
                      <input className="td-focusable" type="time" style={inputStyle} value={su.to} onChange={(e) => updateSignup(slot.id, su.id, 'to', e.target.value)} aria-label="Here until" />
                      <button onClick={() => removeSignup(slot.id, su.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove sign-up">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <div className="td-body" style={{ fontSize: 10.5, color: COLOR.textFaint }}>Blank times mean the whole call.</div>
                </div>
              )}

              <select className="td-focusable" style={inputStyle} value="" onChange={(e) => addSignup(slot.id, e.target.value)} aria-label="Add someone to this position">
                <option value="">Add someone…</option>
                {freeOnShow.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCHEDULE ENTRY FORM — shared by add and edit. This is the old call sheet and
// the old schedule form, which were always describing the same event.
// ---------------------------------------------------------------------------
export function ScheduleEntryForm({ show, rosters, venues, inventory, setInventory, slotOptions, initial, onSave, onCancel }) {
  const [entryId] = useState(initial?.id || `sd${Date.now()}`);
  const [label, setLabel] = useState(initial?.label || '');
  const [date, setDate] = useState(initial?.date || '');
  const [time, setTime] = useState(initial?.time || '18:00');
  const [duration, setDuration] = useState(initial?.durationMinutes ?? 120);
  const [location, setLocation] = useState(initial?.location || show.venue || '');
  const [isTechWeek, setIsTechWeek] = useState(initial?.isTechWeek || false);
  const [openSignup, setOpenSignup] = useState(initial?.openSignup || false);
  const [breaks, setBreaks] = useState(initial?.breaks || []);
  const [called, setCalled] = useState(initial?.called || emptyCalled());
  const [slots, setSlots] = useState(initial?.slots || []);
  const [sceneIds, setSceneIds] = useState(initial?.sceneIds || []);
  const [notes, setNotes] = useState(initial?.notes || '');

  const [addingGear, setAddingGear] = useState(false);
  const [newGearItemId, setNewGearItemId] = useState((inventory && inventory[0] && inventory[0].id) || '');
  const [newGearQty, setNewGearQty] = useState(1);

  const breaksTotal = breaks.reduce((sum, b) => sum + (Number(b.durationMinutes) || 0), 0);
  const endTime = time ? formatTime12h(addMinutesToTime(time, (Number(duration) || 0) + breaksTotal)) : '';
  const linkedGear = (inventory || []).filter((i) => (i.assignments || []).some((a) => a.entryId === entryId));

  // The live entry, so coverage draws against the times currently in the form
  // rather than whatever was saved last.
  const draft = { id: entryId, time, durationMinutes: Number(duration) || 0, breaks };

  function addBreak() {
    setBreaks((prev) => [...prev, { id: `brk${Date.now()}`, label: 'Break', durationMinutes: 15 }]);
  }
  function updateBreak(id, field, value) {
    setBreaks((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  }
  function removeBreak(id) {
    setBreaks((prev) => prev.filter((b) => b.id !== id));
  }
  function toggleCalled(type, personId) {
    setCalled((prev) => ({
      ...prev,
      [type]: (prev[type] || []).includes(personId) ? (prev[type] || []).filter((x) => x !== personId) : [...(prev[type] || []), personId],
    }));
  }
  function toggleScene(sceneId) {
    setSceneIds((prev) => (prev.includes(sceneId) ? prev.filter((id) => id !== sceneId) : [...prev, sceneId]));
  }
  function addGear() {
    if (!newGearItemId || !setInventory) return;
    const qty = Math.max(1, Number(newGearQty) || 1);
    setInventory((prev) =>
      prev.map((i) => {
        if (i.id !== newGearItemId) return i;
        const existing = (i.assignments || []).find((a) => a.entryId === entryId);
        if (existing) return { ...i, assignments: i.assignments.map((a) => (a.entryId === entryId ? { ...a, qty } : a)) };
        return { ...i, assignments: [...(i.assignments || []), { id: `ia-${entryId}-${i.id}`, showId: show.id, entryId, qty }] };
      })
    );
    setAddingGear(false);
    setNewGearQty(1);
  }
  function removeGear(itemId) {
    if (!setInventory) return;
    setInventory((prev) => prev.map((i) => (i.id === itemId ? { ...i, assignments: (i.assignments || []).filter((a) => a.entryId !== entryId) } : i)));
  }

  function handleSave() {
    if (!label.trim() || !date) return;
    onSave({
      id: entryId,
      label: label.trim(),
      date,
      time,
      durationMinutes: Number(duration) || 0,
      location,
      isTechWeek,
      openSignup,
      breaks,
      called,
      slots,
      sceneIds,
      roll: (initial && initial.roll) || {},
      notes: notes.trim(),
    });
  }

  const sectionStyle = { marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` };
  const canSave = !!label.trim() && !!date;

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
        <Field label="LABEL">
          <input className="td-focusable" style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Tech Rehearsal" list="schedule-label-presets" />
          <datalist id="schedule-label-presets">
            {MILESTONE_PRESETS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="DATE">
          <input className="td-focusable" type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="TIME">
          <input className="td-focusable" type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="DURATION (MIN)">
          <input className="td-focusable" type="number" min="0" step="15" style={inputStyle} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
      </div>

      <div style={{ marginTop: 12, maxWidth: 340 }}>
        <PlacePicker venues={venues} value={location} onChange={setLocation} />
      </div>

      {time && (
        <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 8 }}>
          {formatTime12h(time)} – {endTime}
          {breaksTotal > 0 ? ` (includes ${formatDuration(breaksTotal)} of breaks)` : ''}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={isTechWeek} onChange={(e) => setIsTechWeek(e.target.checked)} />
        <span className="td-mono" style={{ fontSize: 11, color: isTechWeek ? COLOR.amber : COLOR.textMuted }}>Part of tech week</span>
        <span className="td-body" style={{ fontSize: 10.5, color: COLOR.textFaint }}>— used to catch gear double-booked across overlapping productions</span>
      </label>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={openSignup} onChange={(e) => setOpenSignup(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <span className="td-mono" style={{ fontSize: 11, color: openSignup ? COLOR.green : COLOR.textMuted }}>Open for sign-ups</span>
          <span className="td-body" style={{ fontSize: 10.5, color: COLOR.textFaint, display: 'block', marginTop: 2, maxWidth: 560, lineHeight: 1.5 }}>
            Anyone in the company can claim a position below, whether or not they were called, and say which stretch of
            the call they can cover. Leave this off and only the people you tick are on it.
          </span>
        </span>
      </label>

      <div style={sectionStyle}>
        <SlotEditor entry={draft} rosters={rosters} show={show} slots={slots} setSlots={setSlots} slotOptions={slotOptions} label={label.trim()} />
      </div>

      <div style={sectionStyle}>
        <label className="td-mono" style={labelStyle}>WHO IS CALLED</label>
        <CalledPicker rosters={rosters} show={show} called={called} onToggle={toggleCalled} />
      </div>

      <div style={sectionStyle}>
        <label className="td-mono" style={{ ...labelStyle, marginBottom: 8 }}>SCENES BEING WORKED</label>
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

      {setInventory && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label className="td-mono" style={{ ...labelStyle, marginBottom: 0 }}>GEAR PULLED</label>
            <button
              onClick={() => setAddingGear((v) => !v)}
              disabled={(inventory || []).length === 0}
              className="td-focusable"
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: (inventory || []).length ? 'pointer' : 'not-allowed' }}
            >
              <Plus size={12} /> Pull gear
            </button>
          </div>
          {linkedGear.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: addingGear ? 8 : 0 }}>
              {linkedGear.map((item) => {
                const a = (item.assignments || []).find((x) => x.entryId === entryId);
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: COLOR.panel, borderRadius: 3 }}>
                    <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, flex: 1 }}>{item.assetNo} — {item.name}</span>
                    <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>×{(a && a.qty) || 1}</span>
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
                {(inventory || []).map((item) => (
                  <option key={item.id} value={item.id}>{item.assetNo} — {item.name}</option>
                ))}
              </select>
              <input className="td-focusable" type="number" min="1" value={newGearQty} onChange={(e) => setNewGearQty(e.target.value)} style={{ ...inputStyle, width: 60 }} />
              <button onClick={addGear} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Add</button>
              <button onClick={() => setAddingGear(false)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
        </div>
      )}

      <div style={sectionStyle}>
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

      <div style={sectionStyle}>
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
          disabled={!canSave}
          className="td-focusable"
          style={{
            background: canSave ? COLOR.amber : COLOR.slateDim,
            color: canSave ? COLOR.void : COLOR.textFaint,
            border: 'none',
            borderRadius: 3,
            padding: '9px 16px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.03em',
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {initial ? 'Save changes' : 'Add to schedule'}
        </button>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '9px 16px', fontSize: 12, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WHO IS CALLED — the named roll-up that replaced the four counts.
// ---------------------------------------------------------------------------
function CalledNames({ entry, rosters, show, taxonomies }) {
  const [expanded, setExpanded] = useState(false);
  const columns = useMemo(() => summarizeCalled(entry, rosters, show, taxonomies), [entry, rosters, show, taxonomies]);
  const live = columns.filter((c) => c.count > 0);

  if (live.length === 0) {
    return (
      <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, marginTop: 8 }}>
        Nobody has been ticked as called for this entry
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {live.map((col) => {
        const Icon = col.icon;
        const overflow = col.names.length - NAMES_BEFORE_FOLD;
        const shown = expanded || overflow <= 0 ? col.names : col.names.slice(0, NAMES_BEFORE_FOLD);
        return (
          <div key={col.type} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <Icon size={11} color={COLOR.textFaint} strokeWidth={1.75} />
              <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.04em' }}>
                {col.label.toUpperCase()} {col.count}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
              {col.chips.map((chip) => (
                <span key={chip.key} className="td-mono" style={{ fontSize: 10, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                  {chip.label}
                </span>
              ))}
              {shown.length > 0 && (
                <span className="td-body" style={{ fontSize: 12, color: COLOR.textMuted, lineHeight: 1.5 }}>{shown.join(' · ')}</span>
              )}
              {overflow > 0 && !expanded && (
                <button
                  onClick={() => setExpanded(true)}
                  className="td-focusable td-view-control"
                  style={{ background: 'transparent', border: 'none', color: COLOR.blueprint, fontSize: 11.5, fontFamily: "'Inter', sans-serif", cursor: 'pointer', padding: 0 }}
                >
                  +{overflow} more
                </button>
              )}
              {col.offShow.length > 0 && (
                <span className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, fontStyle: 'italic' }}>
                  {col.offShow.join(' · ')} (no longer on this production)
                </span>
              )}
              {col.missing > 0 && (
                <span className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, fontStyle: 'italic' }}>
                  {col.missing} ticked {col.missing === 1 ? 'person is' : 'people are'} no longer on the roster
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SIGN-UP SHEET — the positions on an entry, as read by whoever is looking at
// it rather than by whoever wrote it.
// ---------------------------------------------------------------------------
function SignUpSheet({ entry, rosters, actingIds, actingName, canManage, canTakeRoll, onSignUp, onWithdraw, onSetRoll }) {
  const [openSlotId, setOpenSlotId] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const slots = entry.slots || [];
  if (slots.length === 0) return null;

  function begin(slotId) {
    setOpenSlotId(slotId === openSlotId ? null : slotId);
    setFrom('');
    setTo('');
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${COLOR.line}` }}>
      <div className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.04em', marginBottom: 8 }}>POSITIONS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {slots.map((slot) => {
          const covered = isFullyCovered(entry, slot);
          const gaps = shortfallSummary(entry, slot);
          const meta = PERSON_TYPES[slot.personType] || PERSON_TYPES.crew;
          const TypeIcon = meta.icon;
          const columnKey = COLUMN_FOR_PERSON_TYPE[slot.personType];
          // A sign-up has to come from the roster the position asks for: an
          // actor cannot claim a Board Op slot with her cast record.
          const myIdForSlot = [...actingIds].find((id) => rosterFor(rosters, columnKey).some((p) => p.id === id));
          const mine = (slot.signups || []).find((s) => actingIds.has(s.personId));

          return (
            <div key={slot.id} style={{ borderTop: `1px solid ${COLOR.line}`, paddingTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: 62, flexShrink: 0 }}>
                  <TypeIcon size={11} color={COLOR.textFaint} strokeWidth={1.75} />
                  <span className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.03em' }}>{meta.label.toUpperCase()}</span>
                </div>
                <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, flex: 1, minWidth: 120 }}>{slot.role || 'Unnamed position'}</span>
                <span className="td-mono" style={{ fontSize: 10, color: covered ? COLOR.green : COLOR.amber, flexShrink: 0 }}>
                  {covered ? 'COVERED' : `NEEDS ${slot.needed}`}
                </span>
                {/* Open to everyone when the entry says so; open to a schedule
                    editor regardless, which is what the RPC already permits.
                    Hiding it from them here made the client stricter than the
                    server for no reason and pushed a stage manager into the
                    full entry form to do one thing. */}
                {(entry.openSignup || canManage) && !mine && myIdForSlot && (
                  <button
                    onClick={() => begin(slot.id)}
                    className="td-focusable td-own-write"
                    style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '3px 10px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                  >
                    {actingName ? `Sign up ${actingName.split(' ')[0]}` : 'Sign up'}
                  </button>
                )}
                {!entry.openSignup && canManage && !mine && myIdForSlot && (
                  <span className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint, flexShrink: 0 }}>
                    NOT OPEN — YOU CAN ADD ANYWAY
                  </span>
                )}
                {mine && (
                  <button
                    onClick={() => onWithdraw(entry.id, slot.id, mine.id)}
                    className="td-focusable td-own-write"
                    style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 10.5, cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}
                  >
                    {actingName ? 'Remove' : 'Cancel mine'}
                  </button>
                )}
              </div>

              <CoverageBar entry={entry} slot={slot} />
              {gaps && <div className="td-mono" style={{ fontSize: 10, color: COLOR.amber, marginTop: 4 }}>{gaps}</div>}

              {openSlotId === slot.id && (
                <div className="td-own-write" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap', background: COLOR.panel, padding: 10, borderRadius: 4 }}>
                  <div style={{ width: 130 }}>
                    <label className="td-mono" style={labelStyle}>HERE FROM</label>
                    <input className="td-focusable" type="time" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} />
                  </div>
                  <div style={{ width: 130 }}>
                    <label className="td-mono" style={labelStyle}>UNTIL</label>
                    <input className="td-focusable" type="time" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                  <button
                    onClick={() => { onSignUp(entry.id, slot.id, myIdForSlot, from, to); setOpenSlotId(null); }}
                    className="td-focusable"
                    style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '8px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    I'm in
                  </button>
                  <button onClick={() => setOpenSlotId(null)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer', padding: '8px 4px' }}>
                    Cancel
                  </button>
                  <span className="td-body" style={{ fontSize: 10.5, color: COLOR.textFaint, flexBasis: '100%' }}>
                    Leave both blank if you can be there for the whole call.
                  </span>
                </div>
              )}

              {(slot.signups || []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {slot.signups.map((su) => {
                    const name = personName(rosters, su.personId);
                    const isMe = actingIds.has(su.personId);
                    const mark = (entry.roll && entry.roll[su.personId]) || 'pending';
                    return (
                      <div key={su.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="td-mono" style={{ fontSize: 11, color: isMe ? COLOR.amber : COLOR.textPrimary }}>
                          {name || 'Off the roster'}{isMe ? ' · you' : ''}
                        </span>
                        <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>
                          {su.from || su.to
                            ? `${su.from ? formatTime12h(su.from) : 'start'} – ${su.to ? formatTime12h(su.to) : 'end'}`
                            : 'whole call'}
                        </span>
                        {/* Who entered this. Absent when you signed yourself
                            up, which is the ordinary case and needs no
                            explanation. Present when somebody did it for you,
                            which is the case that gets argued about on a
                            Monday morning. */}
                        {su.addedBy && (
                          <span
                            className="td-mono"
                            title="This sign-up was entered on their behalf"
                            style={{ fontSize: 9, color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '0 5px' }}
                          >
                            ADDED BY {(nameForUserId(rosters, su.addedBy) || 'someone else').toUpperCase()}
                          </span>
                        )}
                        {canTakeRoll && (
                          <div style={{ display: 'flex', gap: 3 }}>
                            {ROLL_STATUS_ORDER.map((s) => (
                              <button
                                key={s}
                                onClick={() => onSetRoll(entry.id, su.personId, mark === s ? 'pending' : s)}
                                className="td-focusable"
                                title={ROLL_STATUS[s].label}
                                style={{
                                  background: mark === s ? ROLL_STATUS[s].color : 'transparent',
                                  color: mark === s ? COLOR.void : COLOR.textFaint,
                                  border: `1px solid ${mark === s ? ROLL_STATUS[s].color : COLOR.line}`,
                                  borderRadius: 3,
                                  padding: '0px 6px',
                                  fontSize: 9,
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  cursor: 'pointer',
                                }}
                              >
                                {ROLL_STATUS[s].label.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCHEDULE ENTRY CARD — list view, calendar detail and my-calls all read this.
//
// onEdit / onRemove are optional: My Calls is mostly a reading view.
// ---------------------------------------------------------------------------
export function ScheduleEntryCard({
  entry, show, rosters, venues, inventory, taxonomies, youAre, actingIds, actingName,
  canManage, canTakeRoll, onSignUp, onWithdraw, onSetRoll, onEdit, onRemove,
}) {
  const isPast = new Date(entry.date + 'T00:00:00') < TODAY;
  const breaksTotal = (entry.breaks || []).reduce((s, b) => s + (Number(b.durationMinutes) || 0), 0);
  const endTime = entry.time ? formatTime12h(addMinutesToTime(entry.time, (entry.durationMinutes || 0) + breaksTotal)) : '';
  const scenes = (entry.sceneIds || []).map((id) => sceneById(show, id)).filter(Boolean);
  const linkedGear = (inventory || []).filter((i) => (i.assignments || []).some((a) => a.entryId === entry.id));
  const shortSlots = (entry.slots || []).filter((s) => !isFullyCovered(entry, s));

  return (
    <div style={{ display: 'flex', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, overflow: 'hidden', opacity: isPast ? 0.6 : 1 }}>
      <div style={{ width: 92, flexShrink: 0, background: COLOR.panel, borderRight: `1px solid ${COLOR.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 6px' }}>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint }}>{formatShortDate(entry.date).toUpperCase()}</span>
        <span className="td-mono" style={{ fontSize: 13, color: COLOR.amber, marginTop: 2 }}>{formatTime12h(entry.time)}</span>
      </div>
      <div style={{ flex: 1, padding: '14px 16px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div className="td-display" style={{ fontSize: 15, color: COLOR.textPrimary, letterSpacing: '0.02em' }}>{entry.label}</div>
              {entry.isTechWeek && (
                <span className="td-mono" style={{ fontSize: 8.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '1px 6px', letterSpacing: '0.04em' }}>
                  TECH WEEK
                </span>
              )}
              {entry.openSignup && (
                <span className="td-mono" style={{ fontSize: 8.5, color: COLOR.green, border: `1px solid ${COLOR.green}`, borderRadius: 3, padding: '1px 6px', letterSpacing: '0.04em' }}>
                  OPEN FOR SIGN-UPS
                </span>
              )}
              {shortSlots.length > 0 && (
                <span className="td-mono" style={{ fontSize: 8.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '1px 6px', letterSpacing: '0.04em' }}>
                  {shortSlots.length} POSITION{shortSlots.length === 1 ? '' : 'S'} SHORT
                </span>
              )}
            </div>
            <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 3 }}>
              {formatTime12h(entry.time)} – {endTime} · {formatDuration(entry.durationMinutes)}
              {breaksTotal > 0 ? ` + ${formatDuration(breaksTotal)} break` : ''}
            </div>
          </div>
          {(onEdit || onRemove) && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {onEdit && (
                <button onClick={onEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${entry.label}`}>
                  <Pencil size={13} />
                </button>
              )}
              {onRemove && (
                <button onClick={onRemove} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove ${entry.label}`}>
                  <X size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        <PlaceLine venues={venues} name={entry.location} />

        {youAre && youAre.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <UserCheck size={12} color={COLOR.amber} strokeWidth={2} />
            <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, letterSpacing: '0.03em' }}>
              YOU ARE CALLED AS {youAre.join(' · ').toUpperCase()}
            </span>
          </div>
        )}

        {scenes.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
            {scenes.map((sc) => (
              <span key={sc.id} className="td-mono" style={{ fontSize: 9.5, color: COLOR.blueprint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '2px 7px' }}>
                {sc.actName} — {sc.number}. {sc.name}
              </span>
            ))}
          </div>
        )}

        {entry.notes && <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, marginTop: 8 }}>{entry.notes}</div>}

        <CalledNames entry={entry} rosters={rosters} show={show} taxonomies={taxonomies} />

        {onSignUp && (
          <SignUpSheet
            entry={entry}
            rosters={rosters}
            actingIds={actingIds || new Set()}
            actingName={actingName}
            canManage={canManage}
            canTakeRoll={canTakeRoll}
            onSignUp={onSignUp}
            onWithdraw={onWithdraw}
            onSetRoll={onSetRoll}
          />
        )}

        {linkedGear.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLOR.line}` }}>
            <div className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Package size={10} strokeWidth={1.75} /> GEAR PULLED
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {linkedGear.map((item) => (
                <span key={item.id} className="td-mono" style={{ fontSize: 10, color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '3px 8px' }}>
                  {item.assetNo} · {item.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MY CALLS — the schedule filtered to the person reading it.
//
// Four bands now, in the order they matter: calls you are ticked for, calls you
// signed yourself up for, calls open for sign-ups that you are not yet on, and
// entries where nothing has been set at all — which is not the same as "you are
// not called", and saying so is the difference between someone turning up and
// someone not.
// ---------------------------------------------------------------------------
function MyCallsView({ show, rosters, venues, inventory, taxonomies, sorted, myPersonIds, myUserId, actingIds, onSignUp, onWithdraw }) {
  const [showPast, setShowPast] = useState(false);

  if (!myUserId || myPersonIds.size === 0) {
    return (
      <StubPanel
        label="This account isn't linked to anyone on the roster"
        hint="My Calls works off the roster record attached to your sign-in. Ask an admin to link your account to your name in Settings → Members, and every call you are ticked for will show up here."
      />
    );
  }

  const isPast = (entry) => new Date(entry.date + 'T00:00:00') < TODAY;
  const mine = [];
  const signedUp = [];
  const open = [];
  const unset = [];

  sorted.forEach((entry) => {
    const called = isCalled(entry, myPersonIds);
    const claimed = mySignups(entry, myPersonIds).length > 0;
    if (called) mine.push(entry);
    else if (claimed) signedUp.push(entry);
    else if (entry.openSignup && !isPast(entry) && (entry.slots || []).some((s) => !isFullyCovered(entry, s))) open.push(entry);
    else if (calledCount(entry) === 0 && (entry.slots || []).length === 0) unset.push(entry);
  });

  const upcoming = mine.filter((e) => !isPast(e));
  const signedUpUpcoming = signedUp.filter((e) => !isPast(e));
  const past = [...mine, ...signedUp].filter(isPast);

  const cardFor = (entry, interactive) => (
    <ScheduleEntryCard
      key={entry.id}
      entry={entry}
      show={show}
      rosters={rosters}
      venues={venues}
      inventory={inventory}
      taxonomies={taxonomies}
      youAre={myRolesForEntry(entry, rosters, show, myPersonIds)}
      actingIds={actingIds}
      canManage={false}
      canTakeRoll={false}
      onSignUp={interactive ? onSignUp : undefined}
      onWithdraw={onWithdraw}
    />
  );

  const bandLabel = (text) => (
    <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.08em', marginBottom: 8 }}>{text}</div>
  );

  if (mine.length === 0 && signedUp.length === 0 && open.length === 0 && unset.length === 0) {
    return (
      <StubPanel
        label={`You have no calls on ${show.title}`}
        hint="Nothing on this production's schedule has you ticked, and nothing is open for sign-ups. If you were expecting a call, whoever runs the schedule can add you to it — attendance is set per entry."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        {bandLabel(`YOUR CALLS — ${upcoming.length} UPCOMING`)}
        {upcoming.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{upcoming.map((e) => cardFor(e, true))}</div>
        ) : (
          <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textFaint }}>Nothing coming up that you are ticked for.</div>
        )}
      </div>

      {signedUpUpcoming.length > 0 && (
        <div>
          {bandLabel(`YOU SIGNED UP FOR — ${signedUpUpcoming.length}`)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{signedUpUpcoming.map((e) => cardFor(e, true))}</div>
        </div>
      )}

      {open.length > 0 && (
        <div>
          {bandLabel(`OPEN FOR SIGN-UPS — ${open.length}`)}
          <div className="td-body" style={{ fontSize: 12, color: COLOR.textMuted, marginBottom: 10, lineHeight: 1.55, maxWidth: 640 }}>
            You are not called for these, but they are short-handed and anyone can claim a position. Say which stretch of
            the call you can cover — two half-days cover one body as well as one full day does.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{open.map((e) => cardFor(e, true))}</div>
        </div>
      )}

      {unset.length > 0 && (
        <div>
          {bandLabel(`NOTHING SET — ${unset.length}`)}
          <div className="td-body" style={{ fontSize: 12, color: COLOR.textMuted, marginBottom: 10, lineHeight: 1.55, maxWidth: 640 }}>
            Nobody has been ticked for these and no positions have been posted, so they are neither yours nor not yours.
            Check with whoever runs the schedule before assuming you are free.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{unset.map((e) => cardFor(e, false))}</div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <button
            onClick={() => setShowPast((v) => !v)}
            className="td-focusable td-view-control"
            style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, fontSize: 11.5, fontFamily: "'Inter', sans-serif", padding: '6px 12px', cursor: 'pointer', marginBottom: showPast ? 12 : 0 }}
          >
            {showPast ? 'Hide' : 'Show'} {past.length} past {past.length === 1 ? 'call' : 'calls'}
          </button>
          {showPast && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{past.map((e) => cardFor(e, false))}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ACTING-AS — sign-up and roll run off the roster records linked to the signed
// in account. Someone with a schedule grant can act for another person, because
// half of a stage manager's day is signing up people who phoned it in.
// ---------------------------------------------------------------------------
function ActingAsBar({ rosters, show, myPersonIds, actingId, setActingId }) {
  const everyone = CALLED_COLUMNS.flatMap((col) =>
    eligibleFor(rosters, col.type, show.id).map((p) => ({ id: p.id, name: p.name, columnLabel: col.label }))
  ).sort((a, b) => byName(a.name, b.name));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
      <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.05em' }}>SIGNING UP AS</span>
      <select
        className="td-focusable"
        value={actingId}
        onChange={(e) => setActingId(e.target.value)}
        style={{ ...inputStyle, width: 'auto', minWidth: 220, fontSize: 12 }}
      >
        <option value="">Me{myPersonIds.size === 0 ? ' (account not linked to a roster record)' : ''}</option>
        {everyone.map((p) => (
          <option key={p.id} value={p.id}>{p.name} — {p.columnLabel}</option>
        ))}
      </select>
      {actingId && <span className="td-mono" style={{ fontSize: 10, color: COLOR.amber }}>Acting on someone else's behalf</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCHEDULE MODULE — list, calendar and my-calls views over one show's
// schedule, which is now also its callboard.
//
// `view` and `setView` are owned by the shell so the switch can render outside
// the read-only gate. Everything else stays here.
// ---------------------------------------------------------------------------
export function ScheduleModule({
  show,
  rosters,
  venues,
  inventory,
  setInventory,
  slotOptions,
  onScheduleChange,
  onSignUpRequest,
  onWithdrawRequest,
  view = 'list',
  myUserId,
  canEdit = true,
  CAST_TYPES,
  CAST_TYPE_ORDER,
  DEPARTMENTS,
  DEPARTMENT_ORDER,
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [calendarDate, setCalendarDate] = useState(TODAY);
  const [actingId, setActingId] = useState('');

  // Read either shape. Entries written before the merge carry `attendance` and
  // legacy call slots; normalizeEntry is idempotent, so this is safe to run on
  // every render and on already-migrated data alike.
  const schedule = useMemo(() => (show.schedule || []).map(normalizeEntry).filter(Boolean), [show.schedule]);
  const sorted = useMemo(
    () =>
      schedule
        .slice()
        .sort((a, b) => (a.date === b.date ? String(a.time || '').localeCompare(String(b.time || '')) : String(a.date).localeCompare(String(b.date)))),
    [schedule]
  );

  const taxonomies = useMemo(
    () => ({
      castTypes: CAST_TYPES || {},
      castTypeOrder: CAST_TYPE_ORDER || [],
      departments: DEPARTMENTS || {},
      departmentOrder: DEPARTMENT_ORDER || [],
    }),
    [CAST_TYPES, CAST_TYPE_ORDER, DEPARTMENTS, DEPARTMENT_ORDER]
  );

  const myPersonIds = useMemo(() => myPersonIdsFor(rosters, myUserId), [rosters, myUserId]);
  // Who a sign-up is FOR. Normally the account's own roster records; a schedule
  // editor can act for someone else, which is the admin override.
  const actingIds = useMemo(() => (actingId ? new Set([actingId]) : myPersonIds), [actingId, myPersonIds]);
  // Non-empty only while acting on somebody else's behalf, so every label that
  // says "mine" can say whose instead.
  const actingName = actingId ? personName(rosters, actingId) : '';

  function commit(next) {
    onScheduleChange(show.id, next);
  }
  function addEntry(entry) {
    commit([...schedule, entry]);
    setAdding(false);
  }
  function saveEntry(entry) {
    commit(schedule.map((e) => (e.id === entry.id ? entry : e)));
    setEditingId(null);
  }
  function removeEntry(id) {
    commit(schedule.filter((e) => e.id !== id));
    // Gear pulled for an entry that no longer exists goes back on the shelf.
    // The old code tested `i.callId`, a field inventory items never had — the
    // assignment carries it — so nothing was ever actually released.
    if (setInventory) {
      setInventory((prev) => prev.map((i) => ({ ...i, assignments: (i.assignments || []).filter((a) => a.entryId !== id) })));
    }
    if (selectedId === id) setSelectedId(null);
  }

  // Sign-up and withdrawal do NOT go through `commit`. They are the one thing
  // on this page a person without a schedule grant is allowed to do, and the
  // ordinary show_items write is gated on exactly that grant. So they go to a
  // security definer RPC (migration 24) that owns the rules, and the dashboard
  // applies the returned entry through the remote-sync path — which is why
  // these are async and why failures surface rather than being swallowed by
  // the debounced autosave.
  const [signupError, setSignupError] = useState('');

  async function signUp(entryId, slotId, personId, from, to) {
    if (!personId || !onSignUpRequest) return;
    setSignupError('');
    try {
      await onSignUpRequest(show.id, entryId, slotId, personId, from, to);
    } catch (err) {
      setSignupError(err?.message || 'That sign-up could not be saved.');
    }
  }

  async function withdraw(entryId, slotId, signupId) {
    if (!onWithdrawRequest) return;
    setSignupError('');
    try {
      await onWithdrawRequest(show.id, entryId, slotId, signupId);
    } catch (err) {
      setSignupError(err?.message || 'That sign-up could not be withdrawn.');
    }
  }

  function setRoll(entryId, personId, status) {
    commit(
      schedule.map((e) => {
        if (e.id !== entryId) return e;
        const roll = { ...(e.roll || {}) };
        if (status === 'pending') delete roll[personId];
        else roll[personId] = status;
        return { ...e, roll };
      })
    );
  }

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const weeks = buildMonthGrid(year, month);
  const monthLabel = calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const selectedEntry = schedule.find((e) => e.id === selectedId);
  const mineView = view === 'mine';

  const exportRows = () => {
    const rows = [];
    const source = mineView ? sorted.filter((e) => isCalled(e, myPersonIds) || mySignups(e, myPersonIds).length > 0) : sorted;
    source.forEach((e) => {
      const venue = venueByName(venues, e.location);
      const base = {
        Date: e.date || '',
        Time: e.time ? formatTime12h(e.time) : '',
        Entry: e.label || '',
        Place: e.location || '',
        Address: venue ? venueAddressLine(venue) : '',
        Duration: e.durationMinutes ? formatDuration(e.durationMinutes) : '',
        Notes: e.notes || '',
      };
      if ((e.slots || []).length === 0) {
        rows.push({ ...base, Position: '', Needed: '', 'Signed up': '', From: '', Until: '', Roll: '' });
        return;
      }
      e.slots.forEach((slot) => {
        if ((slot.signups || []).length === 0) {
          rows.push({ ...base, Position: slot.role || '', Needed: slot.needed, 'Signed up': '', From: '', Until: '', Roll: '' });
          return;
        }
        slot.signups.forEach((su) => {
          rows.push({
            ...base,
            Position: slot.role || '',
            Needed: slot.needed,
            'Signed up': personName(rosters, su.personId),
            From: su.from ? formatTime12h(su.from) : '',
            Until: su.to ? formatTime12h(su.to) : '',
            Roll: (e.roll && e.roll[su.personId]) || '',
          });
        });
      });
    });
    return rows;
  };

  const cardProps = {
    show,
    rosters,
    venues,
    inventory,
    taxonomies,
    actingIds,
    actingName,
    canManage: canEdit,
    canTakeRoll: canEdit,
    onSignUp: signUp,
    onWithdraw: withdraw,
    onSetRoll: setRoll,
  };

  const formProps = { show, rosters, venues, inventory, setInventory, slotOptions };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {!mineView && (
          <ImportCsvButton
            filename={`${show.title}-schedule`}
            columns={scheduleSpec.columns}
            sample={scheduleSpec.sample}
            onImport={(rows) => {
              const items = rows.map((r) => scheduleSpec.build(r, { show }));
              commit([...schedule, ...items]);
              return items.length;
            }}
          />
        )}
        <ExportCsvButton
          filename={mineView ? `${show.title}-my-calls` : `${show.title}-schedule`}
          label={mineView ? 'Export my calls' : 'Export CSV'}
          rows={exportRows}
        />
        {!mineView && (
          <button
            onClick={() => { setAdding((v) => !v); setEditingId(null); }}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={14} /> Add schedule entry
          </button>
        )}
      </div>

      {signupError && (
        <div
          role="alert"
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: COLOR.card, border: `1px solid ${COLOR.amber}`, borderLeft: `3px solid ${COLOR.amber}`, borderRadius: 4, padding: '9px 13px', marginBottom: 14 }}
        >
          <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textPrimary, flex: 1 }}>{signupError}</span>
          <button onClick={() => setSignupError('')} className="td-focusable td-view-control" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', fontSize: 11.5 }}>
            Dismiss
          </button>
        </div>
      )}

      {canEdit && (
        <ActingAsBar rosters={rosters} show={show} myPersonIds={myPersonIds} actingId={actingId} setActingId={setActingId} />
      )}

      {adding && !mineView && <ScheduleEntryForm {...formProps} onSave={addEntry} onCancel={() => setAdding(false)} />}

      {mineView ? (
        <MyCallsView
          show={show}
          rosters={rosters}
          venues={venues}
          inventory={inventory}
          taxonomies={taxonomies}
          sorted={sorted}
          myPersonIds={myPersonIds}
          myUserId={myUserId}
          actingIds={actingIds}
          onSignUp={signUp}
          onWithdraw={withdraw}
        />
      ) : view === 'list' ? (
        sorted.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map((entry) =>
              editingId === entry.id ? (
                <ScheduleEntryForm key={entry.id} {...formProps} initial={entry} onSave={saveEntry} onCancel={() => setEditingId(null)} />
              ) : (
                <ScheduleEntryCard
                  key={entry.id}
                  entry={entry}
                  {...cardProps}
                  onEdit={() => { setEditingId(entry.id); setAdding(false); }}
                  onRemove={() => removeEntry(entry.id)}
                />
              )
            )}
          </div>
        ) : (
          <StubPanel
            label={`No schedule entries for ${show.title} yet`}
            hint="Use Add schedule entry, top right, to log load-in, rehearsals, tech week, performances and strike. Each entry is also its call sheet: where it is, who is called, which positions still need bodies, and what gear comes out."
          />
        )
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button onClick={() => setCalendarDate(new Date(year, month - 1, 1))} className="td-focusable td-view-control" style={{ background: 'none', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, padding: '5px 10px', cursor: 'pointer' }}>
              ‹
            </button>
            <span className="td-display" style={{ fontSize: 15, color: COLOR.textPrimary, letterSpacing: '0.02em' }}>{monthLabel}</span>
            <button onClick={() => setCalendarDate(new Date(year, month + 1, 1))} className="td-focusable td-view-control" style={{ background: 'none', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, padding: '5px 10px', cursor: 'pointer' }}>
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
                      {dayEntries.map((e) => {
                        const short = (e.slots || []).some((s) => !isFullyCovered(e, s));
                        return (
                          <button
                            key={e.id}
                            onClick={() => setSelectedId(e.id)}
                            className="td-focusable td-view-control"
                            title={short ? 'Positions still short' : undefined}
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
                            {short ? '• ' : ''}
                            {e.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {selectedEntry && (
            <div style={{ marginTop: 18 }}>
              {editingId === selectedEntry.id ? (
                <ScheduleEntryForm {...formProps} initial={selectedEntry} onSave={saveEntry} onCancel={() => setEditingId(null)} />
              ) : (
                <ScheduleEntryCard
                  entry={selectedEntry}
                  {...cardProps}
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
