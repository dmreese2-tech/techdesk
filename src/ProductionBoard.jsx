import React, { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { PHASES, PHASE_LABELS, STATUS_META, TODAY, daysUntil, formatShortDate, nextMilestone } from './shared.jsx';

// PRODUCTION BOARD — the dashboard cards, the add and edit production forms,
// and the Get started checklist.

// ---------------------------------------------------------------------------
// PHASE RULE — a tick-strip like a stage-measure, not decoration: it encodes
// where each production actually sits in the build calendar.
// ---------------------------------------------------------------------------
export function PhaseRule({ phase }) {
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
export function ShowCard({ show, isCurrent, onSetCurrent, onEdit }) {
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
// GET STARTED — the order a show actually gets built in. Each step leans on
// the ones above it: scenes before anything that references a scene, schedule
// before calls, cast before the audio plot. Steps tick themselves off from
// real data rather than from a checkbox someone has to remember to tick.
// ---------------------------------------------------------------------------
export function GetStarted({ steps, onGo, hasShow }) {
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
export function EditShowForm({ show, venues, onSave, onClose }) {
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
export function NewShowForm({ venues, onAdd, onClose }) {
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
