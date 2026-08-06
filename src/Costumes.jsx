import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Pencil, Plus, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { ImportCsvButton } from './csvImport.jsx';
import { costumesSpec } from './importSpecs.jsx';
import { COSTUME_SOURCES, COSTUME_SOURCE_ORDER, assignmentFor, sceneLabel } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// COSTUMES — what each character wears in each scene, tracked from needs-to-buy
// or needs-to-build through to acquired, with where the piece actually lives.

// ---------------------------------------------------------------------------
// COSTUME FORM
// ---------------------------------------------------------------------------
export function CostumeForm({ show, showActors, inventory, locations, characters, initial, onSave, onCancel }) {
  const [actorId, setActorId] = useState(initial?.actorId || showActors[0]?.id || '');
  const [characterId, setCharacterId] = useState(initial?.characterId || '');
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
      characterId: characterId || null,
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
          <label className="td-mono" style={labelStyle}>CHARACTER</label>
          <select
            className="td-focusable"
            style={inputStyle}
            value={characterId}
            onChange={(e) => {
              const next = e.target.value;
              setCharacterId(next);
              // Jump the actor to whoever is currently cast in that character,
              // so a recast only has to be corrected in one place.
              const chosen = (characters || []).find((c) => c.id === next);
              if (chosen) {
                const cast = showActors.find((a) => a.roleTitle === chosen.name);
                if (cast) setActorId(cast.id);
              }
            }}
          >
            <option value="">{(characters || []).length ? 'Not tied to a character' : 'No characters yet - add them under Characters'}</option>
            {(characters || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
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
export function CostumeCard({ costume, show, inventory, onEdit, onRemove }) {
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
export function CostumesModule({ show, actors, inventory, locations, setShows, characters }) {
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <ImportCsvButton
          filename={`${show.title}-costumes`}
          columns={costumesSpec.columns}
          sample={costumesSpec.sample}
          onImport={(rows) => {
            const items = rows.map((r) => costumesSpec.build(r, { show: show }));
            setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, costumes: [...(s.costumes || []), ...items] } : s)));
            return items.length;
          }}
        />
        <ExportCsvButton
          filename={`${show.title}-costumes`}
          rows={() =>
            (show.costumes || []).map((c) => ({
              Character: ((characters || []).find((ch) => ch.id === c.characterId) || {}).name || '',
              Actor: (showActors.find((a) => a.id === c.actorId) || {}).name || '',
              Scene: sceneLabel(show, c.sceneId),
              Item: c.description || '',
              Source: (COSTUME_SOURCES[c.source] || {}).label || c.source || '',
              Acquired: c.acquired ? 'yes' : 'no',
              Location: c.location || '',
              Cost: c.cost ?? 0,
              Notes: c.notes || '',
            }))
          }
        />
      </div>
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

      {adding && <CostumeForm show={show} showActors={showActors} inventory={inventory} locations={locations} characters={characters} onSave={addCostume} onCancel={() => setAdding(false)} />}

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
                      <CostumeForm show={show} showActors={showActors} inventory={inventory} locations={locations} characters={characters} initial={c} onSave={saveCostume} onCancel={() => setEditingId(null)} />
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
        <StubPanel label={costumes.length === 0 ? `No costume needs logged for ${show.title} yet` : 'Nothing matches this filter'} hint="Cast the show first: a costume attaches to an actor and a scene. Track each look from needs to buy or needs to build through to acquired, along with where it lives." />
      )}
    </div>
  );
}
