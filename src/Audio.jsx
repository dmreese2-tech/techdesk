import React, { useMemo, useState } from 'react';
import { Mic, Pencil, Plus, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { buildAudioPlot, OUTPUT_PORTS } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// AUDIO — the mic, DI and playback plot, generated from cast and band
// assignments, the sound effect log the caller works from, and the bus /
// matrix / output patch that gets every one of those signals somewhere.

// ---------------------------------------------------------------------------
// CHANNEL ROW — one line of the mic/channel plot, styled like the cue and
// call rows elsewhere: channel number big and mono, type tagged, detail
// muted to the right.
// ---------------------------------------------------------------------------
export function ChannelRow({ row }) {
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
export function AudioSectionHeader({ label }) {
  return (
    <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10, marginTop: 26 }}>
      {label}
    </div>
  );
}
// ---------------------------------------------------------------------------
// SOUND EFFECT ROW — inline-editable, like the other roster rows. Each effect
// can be routed through one of the show's mix buses, same as any other input.
// ---------------------------------------------------------------------------
export function SoundEffectRow({ effect, mixBuses, onSave, onRemove }) {
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
  const bus = mixBuses.find((b) => b.id === effect.busId);

  if (editing) {
    return (
      <div style={{ padding: '12px 14px', border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, background: COLOR.panel }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.6fr 1.4fr 2fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>EFFECT</label>
            <input className="td-focusable" style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>PAGE</label>
            <input className="td-focusable" style={inputStyle} value={draft.page} onChange={(e) => setDraft({ ...draft, page: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>MIX BUS</label>
            <select className="td-focusable" style={inputStyle} value={draft.busId || ''} onChange={(e) => setDraft({ ...draft, busId: e.target.value || null })}>
              <option value="">Not assigned</option>
              {mixBuses.map((b) => (
                <option key={b.id} value={b.id}>Bus {b.number} — {b.name}</option>
              ))}
            </select>
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
      <span
        className="td-mono"
        style={{ fontSize: 9.5, color: bus ? COLOR.amber : COLOR.textFaint, border: `1px solid ${bus ? COLOR.amber : COLOR.line}`, borderRadius: 3, padding: '2px 7px', width: 108, textAlign: 'center', flexShrink: 0 }}
      >
        {bus ? `BUS ${bus.number}` : 'NO BUS'}
      </span>
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
export function NewSoundEffectForm({ mixBuses, onAdd, onClose }) {
  const [name, setName] = useState('');
  const [page, setPage] = useState('');
  const [busId, setBusId] = useState('');
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
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.6fr 1.4fr 2fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>EFFECT</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Doorbell" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>PAGE</label>
          <input className="td-focusable" style={inputStyle} value={page} onChange={(e) => setPage(e.target.value)} placeholder="12" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>MIX BUS</label>
          <select className="td-focusable" style={inputStyle} value={busId} onChange={(e) => setBusId(e.target.value)}>
            <option value="">Not assigned</option>
            {mixBuses.map((b) => (
              <option key={b.id} value={b.id}>Bus {b.number} — {b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>COMMENTS</label>
          <input className="td-focusable" style={inputStyle} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Timing, level, notes" />
        </div>
      </div>
      <button
        className="td-focusable"
        disabled={!name.trim()}
        onClick={() => onAdd({ id: `sfx${Date.now()}`, name: name.trim(), page: page.trim(), busId: busId || null, comments: comments.trim() })}
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
// MIX BUS — a bus the board owner sets up by hand rather than one derived
// from cast/band assignments, because a bus exists for what it's routed to,
// not who's plugged into it. Every bus goes one of three places: straight to
// a physical output, into the L/R main mix, or into a matrix for further
// blending downstream.
// ---------------------------------------------------------------------------
// A bus's matrix routing predates multi-matrix support and stored one
// `matrixId`; reading it this way means old data keeps working without a
// migration, while every save from here on writes the plural `matrixIds`.
export function busMatrixIds(bus) {
  if (Array.isArray(bus.matrixIds)) return bus.matrixIds;
  return bus.matrixId ? [bus.matrixId] : [];
}

function describeMatrixList(ids, matrices) {
  if (!ids.length) return 'Matrix (not set)';
  const names = ids.map((id) => matrices.find((m) => m.id === id)).filter(Boolean).map((m) => `Matrix ${m.number}`);
  return names.length ? names.join(', ') : 'Matrix (not set)';
}

export function describeBusDestination(bus, matrices) {
  if (bus.destination === 'lr') return 'L/R Main';
  if (bus.destination === 'matrix') return describeMatrixList(busMatrixIds(bus), matrices);
  return 'Direct Out';
}

export function describeLrMainDestination(lrMain, matrices) {
  if (!lrMain || lrMain.destination !== 'matrix') return 'Direct Out';
  return describeMatrixList(Array.isArray(lrMain.matrixIds) ? lrMain.matrixIds : [], matrices);
}

// Shared by the bus form/row and the L/R Main routing panel: a set of
// checkboxes rather than a single select, since a bus (or L/R Main) can feed
// more than one matrix at once.
function MatrixChecklist({ selectedIds, matrices, active, onToggle }) {
  if (matrices.length === 0) {
    return <span className="td-mono" style={{ fontSize: 11, color: COLOR.textFaint }}>No matrices yet</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', opacity: active ? 1 : 0.4, pointerEvents: active ? 'auto' : 'none' }}>
      {matrices.map((m) => (
        <label key={m.id} className="td-mono" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: COLOR.textPrimary, cursor: 'pointer' }}>
          <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => onToggle(m.id)} />
          Matrix {m.number}
        </label>
      ))}
    </div>
  );
}

function BusDestinationFields({ draft, setDraft, matrices, inputStyle, labelStyle }) {
  const selectedIds = busMatrixIds(draft);
  function toggleMatrix(id) {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    setDraft({ ...draft, matrixIds: next, matrixId: null });
  }
  return (
    <>
      <div>
        <label className="td-mono" style={labelStyle}>ROUTES TO</label>
        <select
          className="td-focusable"
          style={inputStyle}
          value={draft.destination}
          onChange={(e) => setDraft({ ...draft, destination: e.target.value, matrixIds: e.target.value === 'matrix' ? selectedIds : [], matrixId: null })}
        >
          <option value="direct">Direct Out</option>
          <option value="lr">L/R Main</option>
          <option value="matrix">Matrix</option>
        </select>
      </div>
      <div>
        <label className="td-mono" style={labelStyle}>MATRIX{selectedIds.length > 1 ? 'ES' : ''}</label>
        <MatrixChecklist selectedIds={selectedIds} matrices={matrices} active={draft.destination === 'matrix'} onToggle={toggleMatrix} />
      </div>
    </>
  );
}

export function MixBusRow({ bus, matrices, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bus);

  const inputStyle = { background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 9px', color: COLOR.textPrimary, fontSize: 12.5, width: '100%' };
  const labelStyle = { fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  if (editing) {
    return (
      <div style={{ padding: '12px 14px', border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, background: COLOR.panel }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 2fr 1.3fr 1.3fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>BUS #</label>
            <input className="td-focusable" type="number" min="1" style={inputStyle} value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>NAME</label>
            <input className="td-focusable" style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <BusDestinationFields draft={draft} setDraft={setDraft} matrices={matrices} inputStyle={inputStyle} labelStyle={labelStyle} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onSave({ ...draft, number: Number(draft.number) || bus.number }); setEditing(false); }}
            disabled={!draft.name.trim()}
            className="td-focusable"
            style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Save
          </button>
          <button onClick={() => setEditing(false)} className="td-focusable" style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 14px', fontSize: 11.5, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 14px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
      <span className="td-mono" style={{ fontSize: 13, color: COLOR.amber, width: 56, flexShrink: 0 }}>BUS {bus.number}</span>
      <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, flex: 1 }}>{bus.name}</span>
      <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.textMuted }}>{describeBusDestination(bus, matrices)}</span>
      <button onClick={() => { setDraft(bus); setEditing(true); }} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit bus ${bus.number}`}>
        <Pencil size={13} strokeWidth={1.75} />
      </button>
      <button onClick={() => onRemove(bus.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove bus ${bus.number}`}>
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function NewMixBusForm({ nextNumber, matrices, onAdd, onClose }) {
  const [number, setNumber] = useState(nextNumber);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState({ destination: 'direct', matrixIds: [] });

  const inputStyle = { background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '8px 10px', color: COLOR.textPrimary, fontSize: 13, width: '100%' };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>Add mix bus</div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 2fr 1.3fr 1.3fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>BUS #</label>
          <input className="td-focusable" type="number" min="1" style={inputStyle} value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>NAME</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SFX Bus" />
        </div>
        <BusDestinationFields draft={draft} setDraft={setDraft} matrices={matrices} inputStyle={inputStyle} labelStyle={labelStyle} />
      </div>
      <button
        className="td-focusable"
        disabled={!name.trim()}
        onClick={() =>
          onAdd({
            id: `bus${Date.now()}`,
            kind: 'bus',
            number: Number(number) || nextNumber,
            name: name.trim(),
            destination: draft.destination,
            matrixIds: draft.destination === 'matrix' ? busMatrixIds(draft) : [],
          })
        }
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
        Add mix bus
      </button>
    </div>
  );
}
// ---------------------------------------------------------------------------
// MATRIX — a downstream blend of buses and the main mix, routed to its own
// physical output: a lobby feed, a recording split, an assisted-listening
// system. Buses point at a matrix by name; the matrix itself only needs a
// number and a name here — where it comes out is set in the output patch.
// ---------------------------------------------------------------------------
export function MatrixRow({ matrix, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(matrix);
  const inputStyle = { background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 9px', color: COLOR.textPrimary, fontSize: 12.5, width: '100%' };
  const labelStyle = { fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  if (editing) {
    return (
      <div style={{ padding: '12px 14px', border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, background: COLOR.panel }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 2fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>MATRIX #</label>
            <input className="td-focusable" type="number" min="1" style={inputStyle} value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>NAME</label>
            <input className="td-focusable" style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onSave({ ...draft, number: Number(draft.number) || matrix.number }); setEditing(false); }}
            disabled={!draft.name.trim()}
            className="td-focusable"
            style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Save
          </button>
          <button onClick={() => setEditing(false)} className="td-focusable" style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 14px', fontSize: 11.5, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 14px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
      <span className="td-mono" style={{ fontSize: 13, color: COLOR.amber, width: 84, flexShrink: 0 }}>MATRIX {matrix.number}</span>
      <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, flex: 1 }}>{matrix.name}</span>
      <button onClick={() => { setDraft(matrix); setEditing(true); }} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit matrix ${matrix.number}`}>
        <Pencil size={13} strokeWidth={1.75} />
      </button>
      <button onClick={() => onRemove(matrix.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove matrix ${matrix.number}`}>
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L/R MAIN ROUTING — the main mix has always come straight out through the
// output patch. Now it can instead feed into one or more matrices, the same
// as a bus, so it shows up here as its own single, always-present row rather
// than a list the user adds to.
// ---------------------------------------------------------------------------
export function LrMainRoutingPanel({ lrMain, matrices, onChange }) {
  const selectedIds = Array.isArray(lrMain.matrixIds) ? lrMain.matrixIds : [];
  const labelStyle = { fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 4, display: 'block' };
  function toggleMatrix(id) {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    onChange({ ...lrMain, matrixIds: next });
  }
  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap', padding: '12px 14px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
      <div>
        <label className="td-mono" style={labelStyle}>L/R MAIN ROUTES TO</label>
        <select
          className="td-focusable"
          style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 9px', color: COLOR.textPrimary, fontSize: 12.5, minWidth: 140 }}
          value={lrMain.destination === 'matrix' ? 'matrix' : 'direct'}
          onChange={(e) => onChange({ ...lrMain, destination: e.target.value, matrixIds: e.target.value === 'matrix' ? selectedIds : [] })}
        >
          <option value="direct">Direct Out</option>
          <option value="matrix">Matrix</option>
        </select>
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <label className="td-mono" style={labelStyle}>MATRIX{selectedIds.length > 1 ? 'ES' : ''}</label>
        <MatrixChecklist selectedIds={selectedIds} matrices={matrices} active={lrMain.destination === 'matrix'} onToggle={toggleMatrix} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CHANNEL DESTINATION — every mic, DI and playback channel feeds either the
// L/R Mix or one of the show's mix buses. Defaults to L/R Mix, same as an
// analog board's default bus assign, until someone routes it elsewhere.
// ---------------------------------------------------------------------------
export function ChannelDestinationSelect({ value, mixBuses, onChange }) {
  return (
    <select
      className="td-focusable"
      style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 8px', color: COLOR.textPrimary, fontSize: 11, width: 168, flexShrink: 0 }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="lr">L/R Mix</option>
      {mixBuses.map((b) => (
        <option key={b.id} value={`bus:${b.id}`}>Bus {b.number} — {b.name}</option>
      ))}
    </select>
  );
}

export function NewMatrixForm({ nextNumber, onAdd, onClose }) {
  const [number, setNumber] = useState(nextNumber);
  const [name, setName] = useState('');
  const inputStyle = { background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '8px 10px', color: COLOR.textPrimary, fontSize: 13, width: '100%' };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>Add matrix</div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 2fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>MATRIX #</label>
          <input className="td-focusable" type="number" min="1" style={inputStyle} value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>NAME</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Broadcast Feed" />
        </div>
      </div>
      <button
        className="td-focusable"
        disabled={!name.trim()}
        onClick={() => onAdd({ id: `mtx${Date.now()}`, kind: 'matrix', number: Number(number) || nextNumber, name: name.trim() })}
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
        Add matrix
      </button>
    </div>
  );
}
// ---------------------------------------------------------------------------
// OUTPUT PATCH — the last step for every bus, matrix and L/R Main channel:
// which of the 16 physical ports it actually comes out of. A bus routed to
// L/R Main or a matrix has nothing to patch here itself — it's already
// feeding one of these outputs, not standing in for it.
// ---------------------------------------------------------------------------
export function sourceKeyFor(assignment) {
  if (!assignment) return '';
  if (assignment.sourceType === 'lr') return `lr:${assignment.side}`;
  return `${assignment.sourceType}:${assignment.sourceId}`;
}

export function OutputPortRow({ port, assignment, directBuses, matrices, includeLr = true, duplicateCount, onChange }) {
  const inputStyle = { background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 9px', color: COLOR.textPrimary, fontSize: 12, width: '100%' };
  const value = sourceKeyFor(assignment);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="td-mono" style={{ fontSize: 11.5, color: COLOR.textMuted, width: 92, flexShrink: 0 }}>{port.label}</span>
      <select className="td-focusable" style={inputStyle} value={value} onChange={(e) => onChange(port.id, e.target.value)}>
        <option value="">— Unassigned —</option>
        {directBuses.map((b) => (
          <option key={`bus-${b.id}`} value={`bus:${b.id}`}>Bus {b.number} — {b.name}</option>
        ))}
        {matrices.map((m) => (
          <option key={`matrix-${m.id}`} value={`matrix:${m.id}`}>Matrix {m.number} — {m.name}</option>
        ))}
        {includeLr && <option value="lr:L">L/R Main — Left</option>}
        {includeLr && <option value="lr:R">L/R Main — Right</option>}
      </select>
      {duplicateCount > 1 && (
        <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, whiteSpace: 'nowrap' }} title="This source is also patched to another output port">
          on {duplicateCount} ports
        </span>
      )}
    </div>
  );
}
// ---------------------------------------------------------------------------
// AUDIO MODULE — the show's audio profile: mic plot, channel plot, monitor
// mixes, mix buses, matrices, the output patch, and the sound effects log.
// The mic/channel/monitor plot is derived live from cast and band
// assignments; buses, matrices, the patch, and effects are set up by hand.
// ---------------------------------------------------------------------------
export function AudioModule({ show, actors, musicians, setShows, CAST_TYPE_ORDER, MUSIC_SECTIONS }) {
  const [showEffectForm, setShowEffectForm] = useState(false);
  const [showBusForm, setShowBusForm] = useState(false);
  const [showMatrixForm, setShowMatrixForm] = useState(false);
  const plot = useMemo(() => buildAudioPlot(show, actors, musicians, CAST_TYPE_ORDER, MUSIC_SECTIONS), [show, actors, musicians, CAST_TYPE_ORDER, MUSIC_SECTIONS]);
  const effects = show.soundEffects || [];
  const routing = show.audioRouting || [];

  const mixBuses = useMemo(() => routing.filter((r) => r.kind === 'bus').sort((a, b) => a.number - b.number), [routing]);
  const matrices = useMemo(() => routing.filter((r) => r.kind === 'matrix').sort((a, b) => a.number - b.number), [routing]);
  const lrMain = useMemo(() => routing.find((r) => r.kind === 'lrMain') || { id: 'lrMain', kind: 'lrMain', destination: 'direct', matrixIds: [] }, [routing]);
  const portAssignments = useMemo(() => {
    const map = {};
    routing.filter((r) => r.kind === 'port').forEach((r) => { map[r.portId] = r; });
    return map;
  }, [routing]);
  const channelDestinations = useMemo(() => {
    const map = {};
    routing.filter((r) => r.kind === 'channelDest').forEach((r) => { map[r.routingKey] = r; });
    return map;
  }, [routing]);
  function describeChannelDestination(routingKey) {
    const entry = channelDestinations[routingKey];
    if (!entry || entry.destination !== 'bus') return 'L/R Mix';
    const bus = mixBuses.find((b) => b.id === entry.busId);
    return bus ? `Bus ${bus.number} — ${bus.name}` : 'L/R Mix';
  }
  // Only a Direct Out bus has its own physical output to patch — one routed
  // to L/R Main or a matrix is already feeding one of those instead.
  const directBuses = useMemo(() => mixBuses.filter((b) => b.destination === 'direct'), [mixBuses]);
  // L/R Main only shows up as an output-patch source while it comes straight
  // out — once it's routed into a matrix, that matrix's own output carries it.
  const lrIsDirect = lrMain.destination !== 'matrix';
  // How many ports each source is currently patched to, so the same bus,
  // matrix or L/R channel wired to two outputs gets flagged rather than
  // silently allowed — printed gear can only physically come out of one.
  const sourceUseCounts = useMemo(() => {
    const counts = {};
    Object.values(portAssignments).forEach((a) => {
      const key = sourceKeyFor(a);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [portAssignments]);
  const boardPorts = useMemo(() => OUTPUT_PORTS.filter((p) => p.group === 'Board'), []);
  const stagePorts = useMemo(() => OUTPUT_PORTS.filter((p) => p.group === 'Stage box'), []);

  function updateRouting(updater) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, audioRouting: updater(s.audioRouting || []) } : s)));
  }

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

  function addBus(bus) {
    updateRouting((r) => [...r, bus]);
    setShowBusForm(false);
  }
  function saveBus(updated) {
    updateRouting((r) => r.map((item) => (item.id === updated.id ? updated : item)));
  }
  function removeBus(id) {
    // Clear the port this bus fed directly and any channel plot row routed to
    // it, and unassign it from any sound effect that was routed through it —
    // a stale busId would silently point at a bus that no longer exists.
    updateRouting((r) =>
      r
        .filter((item) => item.id !== id)
        .filter((item) => !(item.kind === 'port' && item.sourceType === 'bus' && item.sourceId === id))
        .filter((item) => !(item.kind === 'channelDest' && item.destination === 'bus' && item.busId === id))
    );
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, soundEffects: (s.soundEffects || []).map((e) => (e.busId === id ? { ...e, busId: null } : e)) } : s)));
  }

  function addMatrix(matrix) {
    updateRouting((r) => [...r, matrix]);
    setShowMatrixForm(false);
  }
  function saveMatrix(updated) {
    updateRouting((r) => r.map((item) => (item.id === updated.id ? updated : item)));
  }
  function removeMatrix(id) {
    // A bus (or L/R Main) that fed this matrix drops it from its list, falling
    // back to Direct Out if that was its only matrix — silently pointing it
    // at a matrix that no longer exists would drop its signal with no sign
    // anything changed — and the port this matrix fed is cleared too.
    updateRouting((r) =>
      r
        .filter((item) => item.id !== id)
        .filter((item) => !(item.kind === 'port' && item.sourceType === 'matrix' && item.sourceId === id))
        .map((item) => {
          if (item.kind === 'bus' && item.destination === 'matrix') {
            const ids = busMatrixIds(item).filter((x) => x !== id);
            return ids.length ? { ...item, matrixIds: ids, matrixId: null } : { ...item, destination: 'direct', matrixIds: [], matrixId: null };
          }
          if (item.kind === 'lrMain' && item.destination === 'matrix') {
            const ids = (item.matrixIds || []).filter((x) => x !== id);
            return ids.length ? { ...item, matrixIds: ids } : { ...item, destination: 'direct', matrixIds: [] };
          }
          return item;
        })
    );
  }

  function saveLrMain(updated) {
    updateRouting((r) => {
      const withoutLr = r.filter((item) => item.kind !== 'lrMain');
      // Switching L/R Main into a matrix means it no longer comes straight
      // out of a physical port, so any output patch pointed at it is stale.
      const cleaned = updated.destination === 'matrix'
        ? withoutLr.filter((item) => !(item.kind === 'port' && item.sourceType === 'lr'))
        : withoutLr;
      return [...cleaned, { id: 'lrMain', kind: 'lrMain', destination: updated.destination, matrixIds: updated.destination === 'matrix' ? (updated.matrixIds || []) : [] }];
    });
  }

  function setChannelDestination(routingKey, value) {
    updateRouting((r) => {
      const without = r.filter((item) => !(item.kind === 'channelDest' && item.routingKey === routingKey));
      if (!value || value === 'lr') {
        if (!value) return without;
        return [...without, { id: `chandest-${routingKey}`, kind: 'channelDest', routingKey, destination: 'lr', busId: null }];
      }
      const busId = value.slice(value.indexOf(':') + 1);
      return [...without, { id: `chandest-${routingKey}`, kind: 'channelDest', routingKey, destination: 'bus', busId }];
    });
  }

  function setPortSource(portId, value) {
    updateRouting((r) => {
      const withoutPort = r.filter((item) => !(item.kind === 'port' && item.portId === portId));
      if (!value) return withoutPort;
      const sep = value.indexOf(':');
      const sourceType = value.slice(0, sep);
      const rest = value.slice(sep + 1);
      const entry =
        sourceType === 'lr'
          ? { id: `port-${portId}`, kind: 'port', portId, sourceType: 'lr', sourceId: null, side: rest }
          : { id: `port-${portId}`, kind: 'port', portId, sourceType, sourceId: rest, side: null };
      return [...withoutPort, entry];
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <ExportCsvButton
          filename={`${show.title}-audio-plot`}
          rows={() => [
            ...(plot.micChannels || []).map((r) => ({ Type: 'Mic', Channel: r.channel || '', Name: r.name || '', Role: r.role || '', Group: describeChannelDestination(r.routingKey) })),
            ...(plot.diChannels || []).map((r) => ({ Type: 'DI', Channel: r.channel || '', Name: r.name || '', Role: r.role || '', Group: describeChannelDestination(r.routingKey) })),
            ...(plot.playbackChannels || []).map((r) => ({ Type: 'Playback', Channel: r.channel || '', Name: r.name || '', Role: r.detail || '', Group: describeChannelDestination(r.routingKey) })),
            ...(plot.monitorMixes || []).map((r) => ({ Type: 'Monitor mix', Channel: r.mix || r.channel || '', Name: r.name || '', Role: r.role || '', Group: r.group || '' })),
            { Type: 'L/R Main', Channel: '', Name: 'L/R Main', Role: describeLrMainDestination(lrMain, matrices), Group: '' },
            ...mixBuses.map((b) => ({ Type: 'Mix bus', Channel: b.number, Name: b.name, Role: describeBusDestination(b, matrices), Group: '' })),
            ...matrices.map((m) => ({ Type: 'Matrix', Channel: m.number, Name: m.name, Role: '', Group: '' })),
            ...OUTPUT_PORTS.filter((p) => portAssignments[p.id]).map((p) => {
              const a = portAssignments[p.id];
              const bus = a.sourceType === 'bus' ? mixBuses.find((b) => b.id === a.sourceId) : null;
              const matrix = a.sourceType === 'matrix' ? matrices.find((m) => m.id === a.sourceId) : null;
              const label =
                a.sourceType === 'bus' ? `Bus ${bus?.number ?? '?'} — ${bus?.name ?? ''}` :
                a.sourceType === 'matrix' ? `Matrix ${matrix?.number ?? '?'} — ${matrix?.name ?? ''}` :
                `L/R Main — ${a.side === 'L' ? 'Left' : 'Right'}`;
              return { Type: 'Output port', Channel: p.label, Name: label, Role: '', Group: p.group };
            }),
            ...effects.map((e) => {
              const bus = mixBuses.find((b) => b.id === e.busId);
              return { Type: 'Sound effect', Channel: '', Name: e.label || e.name || '', Role: e.comments || '', Group: bus ? `Bus ${bus.number}` : '' };
            }),
          ]}
        />
      </div>
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
          <strong style={{ color: COLOR.amber }}>{mixBuses.length}</strong> mix buses
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{matrices.length}</strong> matrices
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
        <StubPanel label="No one on the cast is mic'd yet" hint="Mic assignments come from the cast. Assign actors to this show under Actors and give each one a mic channel, and this plot fills itself in." />
      )}

      <AudioSectionHeader label="AUDIO CHANNEL PLOT" />
      {plot.all.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plot.all.map((row) => {
            const dest = channelDestinations[row.routingKey];
            const destValue = dest && dest.destination === 'bus' ? `bus:${dest.busId}` : 'lr';
            return (
              <div key={`${row.type}-${row.channel}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ChannelRow row={row} />
                </div>
                <ChannelDestinationSelect value={destValue} mixBuses={mixBuses} onChange={(v) => setChannelDestination(row.routingKey, v)} />
              </div>
            );
          })}
        </div>
      ) : (
        <StubPanel label="No channels assigned yet" hint="Channels are generated from cast and band assignments. Assign your actors and musicians to this show first, then set each one's mic, DI or playback channel." />
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
        <StubPanel label="No one needs their own monitor mix yet" hint="Flag a performer as needing their own monitor mix on their show assignment and they will appear here with that mix." />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 10 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em' }}>MIX BUSES</div>
        <button
          onClick={() => setShowBusForm((v) => !v)}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add mix bus
        </button>
      </div>

      {showBusForm && (
        <NewMixBusForm
          nextNumber={mixBuses.length ? mixBuses[mixBuses.length - 1].number + 1 : 1}
          matrices={matrices}
          onAdd={addBus}
          onClose={() => setShowBusForm(false)}
        />
      )}

      {mixBuses.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mixBuses.map((bus) => (
            <MixBusRow key={bus.id} bus={bus} matrices={matrices} onSave={saveBus} onRemove={removeBus} />
          ))}
        </div>
      ) : (
        <StubPanel label="No mix buses set up yet" hint="Add a bus for anything that needs its own send — sound effects, a broadcast feed, an assisted-listening system — then route it Direct Out, to L/R Main, or into a matrix." />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 10 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em' }}>MATRICES</div>
        <button
          onClick={() => setShowMatrixForm((v) => !v)}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add matrix
        </button>
      </div>

      {showMatrixForm && (
        <NewMatrixForm nextNumber={matrices.length ? matrices[matrices.length - 1].number + 1 : 1} onAdd={addMatrix} onClose={() => setShowMatrixForm(false)} />
      )}

      {matrices.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {matrices.map((m) => (
            <MatrixRow key={m.id} matrix={m} onSave={saveMatrix} onRemove={removeMatrix} />
          ))}
        </div>
      ) : (
        <StubPanel label="No matrices set up yet" hint="A matrix takes a blend of buses and the main mix and sends it somewhere of its own — a lobby feed, a recording split, a hearing-assist system. Add one here, then give a mix bus that destination above." />
      )}

      <AudioSectionHeader label="L/R MAIN" />
      <LrMainRoutingPanel lrMain={lrMain} matrices={matrices} onChange={saveLrMain} />

      <AudioSectionHeader label="OUTPUT PATCH" />
      <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginBottom: 12, maxWidth: 640 }}>
        Where every Direct Out bus, matrix and L/R Main channel actually comes out — 8 ports on the board, 8 more on the stage box.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: 14 }}>
          <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 10 }}>BOARD OUTPUTS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {boardPorts.map((port) => {
              const assignment = portAssignments[port.id];
              return (
                <OutputPortRow
                  key={port.id}
                  port={port}
                  assignment={assignment}
                  directBuses={directBuses}
                  matrices={matrices}
                  includeLr={lrIsDirect}
                  duplicateCount={sourceUseCounts[sourceKeyFor(assignment)] || 0}
                  onChange={setPortSource}
                />
              );
            })}
          </div>
        </div>
        <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: 14 }}>
          <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 10 }}>STAGE BOX OUTPUTS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stagePorts.map((port) => {
              const assignment = portAssignments[port.id];
              return (
                <OutputPortRow
                  key={port.id}
                  port={port}
                  assignment={assignment}
                  directBuses={directBuses}
                  matrices={matrices}
                  includeLr={lrIsDirect}
                  duplicateCount={sourceUseCounts[sourceKeyFor(assignment)] || 0}
                  onChange={setPortSource}
                />
              );
            })}
          </div>
        </div>
      </div>
      {!lrIsDirect && (
        <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginTop: 8 }}>
          L/R Main is routed into {describeLrMainDestination(lrMain, matrices)} above, so it no longer appears as its own output-patch source.
        </div>
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

      {showEffectForm && <NewSoundEffectForm mixBuses={mixBuses} onAdd={addEffect} onClose={() => setShowEffectForm(false)} />}

      {effects.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {effects.map((e) => (
            <SoundEffectRow key={e.id} effect={e} mixBuses={mixBuses} onSave={saveEffect} onRemove={removeEffect} />
          ))}
        </div>
      ) : (
        <StubPanel label="No sound effects logged for this production yet" hint="Log sound effects here, then place them as SND cues on the Run of Show so the caller has them in running order." />
      )}
    </div>
  );
}
