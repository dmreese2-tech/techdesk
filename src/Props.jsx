import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Pencil, Plus, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { PROP_SOURCES, PROP_SOURCE_ORDER, allScenes, assignmentFor, sceneLabel } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// PROPS — every hand prop and set dressing, against the scene it appears in and
// the character who handles it.

// ---------------------------------------------------------------------------
// PROP FORM
// ---------------------------------------------------------------------------
export function PropForm({ show, showActors, inventory, locations, characters, initial, onSave, onCancel }) {
  const [sceneId, setSceneId] = useState(initial?.sceneId || '');
  const [characterId, setCharacterId] = useState(initial?.characterId || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [actorId, setActorId] = useState(initial?.actorId || '');
  const [source, setSource] = useState(initial?.source || 'inventory');
  const [inventoryItemId, setInventoryItemId] = useState(initial?.inventoryItemId || inventory[0]?.id || '');
  const [acquired, setAcquired] = useState(initial?.acquired || false);
  const [consumable, setConsumable] = useState(initial?.consumable || false);
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
    if (!description.trim()) return;
    onSave({
      id: initial?.id || `pr${Date.now()}`,
      sceneId: sceneId || null,
      characterId: characterId || null,
      description: description.trim(),
      actorId: actorId || null,
      source,
      inventoryItemId: source === 'inventory' ? inventoryItemId : null,
      acquired,
      consumable,
      location,
      cost: Number(cost) || 0,
      notes: notes.trim(),
    });
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {initial ? 'Edit prop need' : 'Add prop need'}
        </div>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.3fr', gap: 12 }}>
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
          <input className="td-focusable" style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is the prop" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>CHARACTER (OPTIONAL)</label>
          <select
            className="td-focusable"
            style={inputStyle}
            value={characterId}
            onChange={(e) => {
              const next = e.target.value;
              setCharacterId(next);
              // Tie the prop to the character, then follow through to whoever
              // is cast in it, so a recast doesn't orphan the handoff.
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
          <label className="td-mono" style={labelStyle}>USED BY (OPTIONAL)</label>
          <select className="td-focusable" style={inputStyle} value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">— Set prop, no one specific —</option>
            {showActors.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {a.roleTitle}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1.4fr 0.8fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>SOURCE</label>
          <select className="td-focusable" style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)}>
            {PROP_SOURCE_ORDER.map((s) => (
              <option key={s} value={s}>{PROP_SOURCES[s].label}</option>
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

      <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
          <input type="checkbox" checked={acquired} onChange={(e) => setAcquired(e.target.checked)} />
          <span className="td-mono" style={{ fontSize: 11, color: acquired ? COLOR.green : COLOR.textMuted }}>Acquired</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
          <input type="checkbox" checked={consumable} onChange={(e) => setConsumable(e.target.checked)} />
          <span className="td-mono" style={{ fontSize: 11, color: consumable ? COLOR.amber : COLOR.textMuted }}>Consumable — restock each performance</span>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="td-mono" style={labelStyle}>NOTES</label>
        <textarea
          className="td-focusable"
          style={{ ...inputStyle, minHeight: 56, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Build notes, safety notes, vendor, deadlines..."
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={!description.trim()}
          className="td-focusable"
          style={{
            background: description.trim() ? COLOR.amber : COLOR.slateDim,
            color: description.trim() ? COLOR.void : COLOR.textFaint,
            border: 'none',
            borderRadius: 3,
            padding: '9px 16px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.03em',
            cursor: description.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          {initial ? 'Save changes' : 'Add prop need'}
        </button>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '9px 16px', fontSize: 12, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// PROP CARD
// ---------------------------------------------------------------------------
export function PropCard({ prop, show, showActors, inventory, onEdit, onRemove }) {
  const sourceMeta = PROP_SOURCES[prop.source] || PROP_SOURCES.buy;
  const SourceIcon = sourceMeta.icon;
  const linkedItem = prop.inventoryItemId ? inventory.find((i) => i.id === prop.inventoryItemId) : null;
  const usedBy = prop.actorId ? showActors.find((a) => a.id === prop.actorId) : null;

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, fontWeight: 500 }}>{prop.description}</div>
          <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, marginTop: 3 }}>
            {usedBy ? `Used by ${usedBy.name}` : 'Set prop'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Edit prop need">
            <Pencil size={12} />
          </button>
          <button onClick={onRemove} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove prop need">
            <X size={13} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <span
          className="td-mono"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: prop.acquired ? COLOR.green : COLOR.amber, border: `1px solid ${prop.acquired ? COLOR.green : COLOR.amberDim}`, borderRadius: 3, padding: '2px 7px' }}
        >
          {prop.acquired ? <Check size={10} /> : <AlertTriangle size={10} />}
          {prop.acquired ? 'ACQUIRED' : 'STILL NEEDED'}
        </span>
        <span className="td-mono" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: COLOR.textFaint }}>
          <SourceIcon size={10} /> {sourceMeta.label.toUpperCase()}
        </span>
        {prop.consumable && (
          <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '2px 7px' }}>
            CONSUMABLE
          </span>
        )}
        {prop.location && <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint }}>· {prop.location}</span>}
        {prop.cost > 0 && <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint }}>· ${prop.cost}</span>}
      </div>

      {linkedItem && (
        <div className="td-mono" style={{ fontSize: 10, color: COLOR.amber, marginTop: 6 }}>
          {linkedItem.assetNo} — {linkedItem.name}
        </div>
      )}

      {prop.notes && <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginTop: 6, lineHeight: 1.4 }}>{prop.notes}</div>}
    </div>
  );
}
// ---------------------------------------------------------------------------
// PROPS MODULE — grouped by scene, since most props belong to a moment in
// the show more than to a single actor.
// ---------------------------------------------------------------------------
export function PropsModule({ show, actors, inventory, locations, setShows, characters }) {
  const [filter, setFilter] = useState('all');
  const [consumableOnly, setConsumableOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const props_ = show.props || [];

  const showActors = actors
    .filter((a) => assignmentFor(a, show.id))
    .map((a) => ({ id: a.id, name: a.name, roleTitle: assignmentFor(a, show.id).roleTitle }));

  const filtered = props_
    .filter((p) => (filter === 'all' ? true : filter === 'acquired' ? p.acquired : !p.acquired))
    .filter((p) => (consumableOnly ? p.consumable : true));

  const scenes = useMemo(() => {
    const order = [];
    filtered.forEach((p) => {
      if (!order.includes(p.sceneId)) order.push(p.sceneId);
    });
    return order;
  }, [filtered]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((p) => {
      if (!g[p.sceneId]) g[p.sceneId] = [];
      g[p.sceneId].push(p);
    });
    return g;
  }, [filtered]);

  const hasScenes = allScenes(show).length > 0;

  function addProp(p) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, props: [...(s.props || []), p] } : s)));
    setAdding(false);
  }
  function saveProp(p) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, props: (s.props || []).map((x) => (x.id === p.id ? p : x)) } : s)));
    setEditingId(null);
  }
  function removeProp(id) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, props: (s.props || []).filter((x) => x.id !== id) } : s)));
  }

  const acquiredCount = props_.filter((p) => p.acquired).length;
  const neededCount = props_.length - acquiredCount;
  const consumableCount = props_.filter((p) => p.consumable).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{props_.length}</strong> prop needs
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.green }}>{acquiredCount}</strong> acquired
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{neededCount}</strong> still needed
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{consumableCount}</strong> consumable
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
          <button
            onClick={() => setConsumableOnly((v) => !v)}
            className="td-focusable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: consumableOnly ? COLOR.amberDim : 'transparent',
              color: COLOR.amber,
              border: `1px solid ${COLOR.amber}`,
              borderRadius: 20,
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Consumables{consumableCount > 0 ? ` (${consumableCount})` : ''}
          </button>
        </div>
        <button
          onClick={() => { setAdding((v) => !v); setEditingId(null); }}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add prop need
        </button>
      </div>

      {!hasScenes && (
        <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginBottom: 16 }}>
          No scenes set up yet — add Acts and Scenes on the Scenes page to tag props to a specific moment, or log them as "Throughout" for now.
        </div>
      )}

      {adding && <PropForm show={show} showActors={showActors} inventory={inventory} locations={locations} characters={characters} onSave={addProp} onCancel={() => setAdding(false)} />}

      {scenes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {scenes.map((sceneId) => (
            <div key={sceneId || 'throughout'}>
              <div className="td-display" style={{ fontSize: 14, color: COLOR.textMuted, letterSpacing: '0.03em', marginBottom: 8 }}>
                {sceneLabel(show, sceneId)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {grouped[sceneId].map((p) =>
                  editingId === p.id ? (
                    <div key={p.id} style={{ gridColumn: '1 / -1' }}>
                      <PropForm show={show} showActors={showActors} inventory={inventory} locations={locations} characters={characters} initial={p} onSave={saveProp} onCancel={() => setEditingId(null)} />
                    </div>
                  ) : (
                    <PropCard
                      key={p.id}
                      prop={p}
                      show={show}
                      showActors={showActors}
                      inventory={inventory}
                      onEdit={() => { setEditingId(p.id); setAdding(false); }}
                      onRemove={() => removeProp(p.id)}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <StubPanel label={props_.length === 0 ? `No prop needs logged for ${show.title} yet` : 'Nothing matches this filter'} hint="Enter the scene list and cast the show first, then log each prop against the scene it appears in and the actor who handles it. Props can come from inventory, be bought, or be built." />
      )}
    </div>
  );
}
