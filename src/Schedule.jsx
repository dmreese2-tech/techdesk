import React, { useState } from 'react';
import { Briefcase, Music, Pencil, Plus, Star, Users, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { MILESTONE_PRESETS, TODAY, addMinutesToTime, assignmentFor, formatDuration, formatShortDate, formatTime12h } from './shared.jsx';
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
// ATTENDANCE PICKER — one column per roster, scoped to people already
// linked to this show.
// ---------------------------------------------------------------------------
export function AttendancePicker({ rosters, show, attendance, onToggle }) {
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
export function ScheduleEntryCard({ entry, onEdit, onRemove }) {
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
export function ScheduleModule({ show, rosters, onScheduleChange }) {
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <ExportCsvButton
          filename={`${show.title}-schedule`}
          rows={() =>
            (show.schedule || []).slice().sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((e) => ({
              Date: e.date || '',
              Time: e.time ? formatTime12h(e.time) : '',
              Entry: e.label || '',
              Location: e.location || '',
              Duration: e.durationMinutes ? formatDuration(e.durationMinutes) : '',
              Notes: e.notes || '',
            }))
          }
        />
      </div>
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
