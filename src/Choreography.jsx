import React, { useState } from 'react';
import { Footprints, Pencil, Plus, Video, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { SCENE_TYPES, allScenes, assignmentFor, sceneById } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// CHOREOGRAPHY — blocking notes, reference video, and click-to-place stage
// diagrams, all tied to a scene.

// ---------------------------------------------------------------------------
// STAGE DIAGRAM — an actual interactive aerial view, not a fake upload.
// Click the floor to drop a numbered position marker; click a marker to
// remove it.
// ---------------------------------------------------------------------------
export function StageDiagram({ markers, onChange, editable }) {
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
export function ChoreographyEntryForm({ show, actors, initial, onSave, onCancel }) {
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
export function PositionKeyTable({ positions, actors }) {
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
export function ChoreographyEntryCard({ entry, show, actors, onEdit, onRemove }) {
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
export function ChoreographyModule({ show, actors, setShows }) {
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
        <StubPanel label={`No blocking logged for ${show.title} yet`} hint="Build the scene list under Scenes first, then log blocking against a scene here, with notes, reference video links, and click to place stage diagrams." />
      )}
    </div>
  );
}
