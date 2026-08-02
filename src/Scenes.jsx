import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Footprints, Pencil, Plus, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { SCENE_TYPES, SCENE_TYPE_ORDER, assignmentFor } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// SCENES — the canonical act and scene list, including musical numbers.
// Choreography, costumes, props and cue placements all reference it.

// ---------------------------------------------------------------------------
// SCENE FORM — a single scene or musical number within an act, with the
// cast that appears in it.
// ---------------------------------------------------------------------------
export function SceneForm({ showActors, initial, onSave, onCancel }) {
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
export function SceneCard({ scene, number, showActors, onEdit, onRemove, onMove, isFirst, isLast }) {
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
export function ActRow({ act, showActors, onRenameAct, onRemoveAct, onAddScene, onSaveScene, onRemoveScene, onMoveScene }) {
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
export function ScenesModule({ show, actors, setShows }) {
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <ExportCsvButton
          filename={`${show.title}-scenes`}
          rows={() =>
            (show.acts || []).flatMap((act) =>
              (act.scenes || []).map((sc, i) => ({
                Act: act.name || '',
                '#': i + 1,
                Scene: sc.name || '',
                Type: (SCENE_TYPES[sc.type] || {}).label || sc.type || '',
                Cast: (sc.actorIds || []).map((id) => (actors.find((a) => a.id === id) || {}).name).filter(Boolean).join('; '),
                Notes: sc.notes || '',
              }))
            )
          }
        />
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
        <StubPanel label={`No acts set up for ${show.title} yet`} hint="Add an act, then the scenes and musical numbers inside it, with the cast in each. Choreography, costumes, props and cue placements all point back at this list, so entering it early saves relinking later." />
      )}
    </div>
  );
}
