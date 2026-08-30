import React, { useMemo, useState } from 'react';
import { Briefcase, Music, Pencil, Plus, Star, UserCheck, Users, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { ImportCsvButton } from './csvImport.jsx';
import { scheduleSpec } from './importSpecs.jsx';
import { MILESTONE_PRESETS, TODAY, addMinutesToTime, assignmentsFor, byName, formatDuration, formatShortDate, formatTime12h } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// SCHEDULE — load-in, rehearsals, tech week and strike. The callboard builds
// its calls from these dates.

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
export function attendanceCount(entry) {
  const a = entry.attendance || {};
  return (a.crew || []).length + (a.actors || []).length + (a.musicians || []).length + (a.staff || []).length;
}

// ---------------------------------------------------------------------------
// THE FOUR ATTENDANCE COLUMNS, described once.
//
// `attendance` is keyed crew / actors / musicians / staff, and each roster
// names the thing it groups by differently: crew assignments carry `dept`,
// everyone else carries `category`. Cast group by cast position (Settings →
// Cast positions); crew, band and staff group by department. Both the picker
// and the roll-up read this list, so a fifth roster is one entry here rather
// than four edits that have to agree.
// ---------------------------------------------------------------------------
export const ATTENDANCE_COLUMNS = [
  { type: 'crew', label: 'Crew', icon: Users, keyField: 'dept', taxonomy: 'departments' },
  { type: 'actors', label: 'Cast', icon: Star, keyField: 'category', taxonomy: 'castTypes' },
  { type: 'musicians', label: 'Band', icon: Music, keyField: 'category', taxonomy: 'departments' },
  { type: 'staff', label: 'Staff', icon: Briefcase, keyField: 'category', taxonomy: 'departments' },
];

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

// ---------------------------------------------------------------------------
// ATTENDANCE SUMMARY — who is actually called, said in the fewest words that
// are still true.
//
// Per roster: if every eligible person is called and they span more than one
// group, that is "All Crew". Otherwise any group whose whole membership is
// called collapses to "All <group>", and whoever is left over is named.
// Someone called who is no longer on the show is reported rather than dropped —
// a stale tick is a person who thinks they have a call.
// ---------------------------------------------------------------------------
export function summarizeAttendance(entry, rosters, show, taxonomies) {
  const showId = show.id;
  const t = taxonomies || {};
  return ATTENDANCE_COLUMNS.map((col) => {
    const roster = rosterFor(rosters, col.type);
    const calledIds = new Set((entry.attendance || {})[col.type] || []);
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
      const extras = [...total.keys()].filter((k) => !known.includes(k)).sort((a, b) => byName(map[a]?.label || a, map[b]?.label || b));
      [...known, ...extras].forEach((key) => {
        const tot = total.get(key);
        const cal = called.get(key) || new Set();
        if (tot.size >= MIN_ROLLUP && cal.size === tot.size) {
          chips.push({ key, label: `All ${map[key]?.label || key}` });
          cal.forEach((id) => covered.add(id));
        }
      });
    }

    const names = calledEligible
      .filter((p) => !covered.has(p.id))
      .map((p) => p.name)
      .sort(byName);

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
  ATTENDANCE_COLUMNS.forEach((col) => {
    const calledIds = new Set((entry.attendance || {})[col.type] || []);
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
  return ATTENDANCE_COLUMNS.some((col) =>
    ((entry.attendance || {})[col.type] || []).some((id) => myPersonIds.has(id))
  );
}

// Roster records linked to the signed-in account. Read off the rosters rather
// than a single people_view lookup, because someone can be linked as crew and
// as cast at once and both records get called separately.
export function myPersonIdsFor(rosters, userId) {
  const ids = new Set();
  if (!userId) return ids;
  ATTENDANCE_COLUMNS.forEach((col) => {
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
// ATTENDANCE PICKER — one column per roster, scoped to people already
// linked to this show.
// ---------------------------------------------------------------------------
export function AttendancePicker({ rosters, show, attendance, onToggle }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      {ATTENDANCE_COLUMNS.map((col) => {
        const Icon = col.icon;
        const people = eligibleFor(rosters, col.type, show.id);
        return (
          <div key={col.type}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <Icon size={12} color={COLOR.textFaint} strokeWidth={1.75} />
              <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.04em' }}>
                {col.label.toUpperCase()} — {(attendance[col.type] || []).length}
              </span>
            </div>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 8px' }} className="td-scrollbar">
              {people.length > 0 ? (
                people.map((p) => (
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
export function ScheduleEntryForm({ show, rosters, initial, onSave, onCancel }) {
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
      [type]: (prev[type] || []).includes(personId) ? (prev[type] || []).filter((x) => x !== personId) : [...(prev[type] || []), personId],
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
// WHO IS CALLED — the named roll-up that replaced the four counts.
// ---------------------------------------------------------------------------
function AttendanceNames({ entry, rosters, show, taxonomies }) {
  const [expanded, setExpanded] = useState(false);
  const columns = useMemo(
    () => summarizeAttendance(entry, rosters, show, taxonomies),
    [entry, rosters, show, taxonomies]
  );
  const live = columns.filter((c) => c.count > 0);

  if (live.length === 0) {
    return (
      <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, marginTop: 8 }}>
        Attendance not set — nobody has been ticked for this call
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
                <span
                  key={chip.key}
                  className="td-mono"
                  style={{ fontSize: 10, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '1px 6px', whiteSpace: 'nowrap' }}
                >
                  {chip.label}
                </span>
              ))}
              {shown.length > 0 && (
                <span className="td-body" style={{ fontSize: 12, color: COLOR.textMuted, lineHeight: 1.5 }}>
                  {shown.join(' · ')}
                </span>
              )}
              {overflow > 0 && !expanded && (
                <button
                  onClick={() => setExpanded(true)}
                  className="td-focusable"
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
// SCHEDULE ENTRY CARD (list view + calendar detail + my calls)
//
// onEdit / onRemove are optional: My Calls is a reading view and shows neither.
// ---------------------------------------------------------------------------
export function ScheduleEntryCard({ entry, show, rosters, taxonomies, youAre, onEdit, onRemove }) {
  const isPast = new Date(entry.date + 'T00:00:00') < TODAY;
  const breaksTotal = (entry.breaks || []).reduce((s, b) => s + (Number(b.durationMinutes) || 0), 0);
  const endTime = entry.time ? formatTime12h(addMinutesToTime(entry.time, (entry.durationMinutes || 0) + breaksTotal)) : '';

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

        {youAre && youAre.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <UserCheck size={12} color={COLOR.amber} strokeWidth={2} />
            <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, letterSpacing: '0.03em' }}>
              YOU ARE CALLED AS {youAre.join(' · ').toUpperCase()}
            </span>
          </div>
        )}

        {entry.notes && <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, marginTop: 8 }}>{entry.notes}</div>}

        <AttendanceNames entry={entry} rosters={rosters} show={show} taxonomies={taxonomies} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MY CALLS — the schedule filtered to the person reading it.
//
// Three bands, in the order they matter: calls still to come, calls where
// nobody has set attendance at all (which is not the same as "you are not
// called", and saying so is the difference between someone turning up and
// someone not), and calls already past, folded away.
// ---------------------------------------------------------------------------
function MyCallsView({ show, rosters, taxonomies, sorted, myPersonIds, myUserId }) {
  const [showPast, setShowPast] = useState(false);

  if (!myUserId || myPersonIds.size === 0) {
    return (
      <StubPanel
        label="This account isn't linked to anyone on the roster"
        hint="My Calls works off the roster record attached to your sign-in. Ask an admin to link your account to your name in Settings → Members, and every call you are ticked for will show up here."
      />
    );
  }

  const mine = [];
  const unset = [];
  sorted.forEach((entry) => {
    if (isCalled(entry, myPersonIds)) mine.push(entry);
    else if (attendanceCount(entry) === 0) unset.push(entry);
  });
  const isPast = (entry) => new Date(entry.date + 'T00:00:00') < TODAY;
  const upcoming = mine.filter((e) => !isPast(e));
  const past = mine.filter(isPast);

  const cardFor = (entry) => (
    <ScheduleEntryCard
      key={entry.id}
      entry={entry}
      show={show}
      rosters={rosters}
      taxonomies={taxonomies}
      youAre={myRolesForEntry(entry, rosters, show, myPersonIds)}
    />
  );

  const bandLabel = (text) => (
    <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.08em', marginBottom: 8 }}>
      {text}
    </div>
  );

  if (mine.length === 0 && unset.length === 0) {
    return (
      <StubPanel
        label={`You have no calls on ${show.title}`}
        hint="Nothing on this production's schedule has you ticked. If you were expecting a call, whoever runs the schedule can add you to it — attendance is set per entry."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        {bandLabel(`YOUR CALLS — ${upcoming.length} UPCOMING`)}
        {upcoming.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{upcoming.map(cardFor)}</div>
        ) : (
          <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textFaint }}>
            Nothing coming up that you are ticked for.
          </div>
        )}
      </div>

      {unset.length > 0 && (
        <div>
          {bandLabel(`ATTENDANCE NOT SET — ${unset.length}`)}
          <div className="td-body" style={{ fontSize: 12, color: COLOR.textMuted, marginBottom: 10, lineHeight: 1.55, maxWidth: 640 }}>
            Nobody has been ticked for these yet, so they are neither yours nor not yours. Check with whoever
            runs the schedule before assuming you are free.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{unset.map(cardFor)}</div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <button
            onClick={() => setShowPast((v) => !v)}
            className="td-focusable"
            style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, fontSize: 11.5, fontFamily: "'Inter', sans-serif", padding: '6px 12px', cursor: 'pointer', marginBottom: showPast ? 12 : 0 }}
          >
            {showPast ? 'Hide' : 'Show'} {past.length} past {past.length === 1 ? 'call' : 'calls'}
          </button>
          {showPast && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{past.map(cardFor)}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCHEDULE MODULE — list, calendar and my-calls views over one show's schedule.
//
// `view` and `setView` are owned by the shell so the switch can render outside
// the read-only gate. Everything else stays here.
// ---------------------------------------------------------------------------
export function ScheduleModule({
  show,
  rosters,
  onScheduleChange,
  view = 'list',
  myUserId,
  CAST_TYPES,
  CAST_TYPE_ORDER,
  DEPARTMENTS,
  DEPARTMENT_ORDER,
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [calendarDate, setCalendarDate] = useState(TODAY);

  const schedule = show.schedule || [];
  const sorted = schedule.slice().sort((a, b) => (a.date === b.date ? (a.time || '').localeCompare(b.time || '') : a.date.localeCompare(b.date)));

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
  const mineView = view === 'mine';

  const exportRows = () =>
    (mineView ? sorted.filter((e) => isCalled(e, myPersonIds)) : sorted).map((e) => ({
      Date: e.date || '',
      Time: e.time ? formatTime12h(e.time) : '',
      Entry: e.label || '',
      Location: e.location || '',
      Duration: e.durationMinutes ? formatDuration(e.durationMinutes) : '',
      Notes: e.notes || '',
    }));

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
              onScheduleChange(show.id, [...schedule, ...items]);
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

      {adding && !mineView && (
        <ScheduleEntryForm show={show} rosters={rosters} onSave={addEntry} onCancel={() => setAdding(false)} />
      )}

      {mineView ? (
        <MyCallsView
          show={show}
          rosters={rosters}
          taxonomies={taxonomies}
          sorted={sorted}
          myPersonIds={myPersonIds}
          myUserId={myUserId}
        />
      ) : view === 'list' ? (
        sorted.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map((entry) =>
              editingId === entry.id ? (
                <ScheduleEntryForm key={entry.id} show={show} rosters={rosters} initial={entry} onSave={saveEntry} onCancel={() => setEditingId(null)} />
              ) : (
                <ScheduleEntryCard
                  key={entry.id}
                  entry={entry}
                  show={show}
                  rosters={rosters}
                  taxonomies={taxonomies}
                  onEdit={() => { setEditingId(entry.id); setAdding(false); }}
                  onRemove={() => removeEntry(entry.id)}
                />
              )
            )}
          </div>
        ) : (
          <StubPanel label={`No schedule entries for ${show.title} yet`} hint="Use Add schedule entry, top right, to log load-in, rehearsals, tech week and strike. The callboard builds its calls from these dates, so the schedule comes before Calls." />
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
                  show={show}
                  rosters={rosters}
                  taxonomies={taxonomies}
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
