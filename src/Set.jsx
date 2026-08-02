import React, { useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { BUILD_STATUSES, BUILD_STATUS_ORDER } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// SET — the build list, with pieces composed of inventory components.

// ---------------------------------------------------------------------------
// SET PIECE FORM — the build list entry. Components link straight to
// inventory (e.g. a platform unit made of platform tops + legs).
// ---------------------------------------------------------------------------
export function SetPieceForm({ show, inventory, setInventory, locations, initial, onSave, onCancel, INVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [buildStatus, setBuildStatus] = useState(initial?.buildStatus || 'not_started');
  const [components, setComponents] = useState(initial?.components || []);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [creatingItemFor, setCreatingItemFor] = useState(null);
  const [newItem, setNewItem] = useState({ name: '', category: 'scenic', totalQty: 1, location: locations[0] || '' });

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

  function addComponent() {
    setComponents((prev) => [...prev, { id: `spc${Date.now()}`, inventoryItemId: inventory[0]?.id || '', qtyPerUnit: 1 }]);
  }
  function updateComponent(id, field, value) {
    setComponents((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }
  function removeComponent(id) {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }

  function startCreateItem(componentId) {
    setNewItem({ name: '', category: 'scenic', totalQty: components.find((c) => c.id === componentId)?.qtyPerUnit || 1, location: locations[0] || '' });
    setCreatingItemFor(componentId);
  }
  function createAndLinkItem() {
    if (!newItem.name.trim() || !newItem.location.trim()) return;
    const id = `i${Date.now()}`;
    const qty = Math.max(1, Number(newItem.totalQty) || 1);
    const item = {
      id,
      assetNo: `NEW-${String(Math.floor(Math.random() * 900) + 100)}`,
      name: newItem.name.trim(),
      category: newItem.category,
      totalQty: qty,
      location: newItem.location.trim(),
      units: [],
      costPerUnit: 0,
      purchaseDate: '',
      purchaseSource: '',
      purchaseNotes: '',
      assignments: show ? [{ id: `ia-${id}`, showId: show.id, callId: null, qty }] : [],
    };
    setInventory((prev) => [item, ...prev]);
    updateComponent(creatingItemFor, 'inventoryItemId', id);
    setCreatingItemFor(null);
  }

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      id: initial?.id || `sp${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      quantity: Math.max(1, Number(quantity) || 1),
      buildStatus,
      components,
      notes: notes.trim(),
    });
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {initial ? 'Edit set piece' : 'Add set piece'}
        </div>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>NAME</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. USR Platform Unit" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>QTY NEEDED</label>
          <input className="td-focusable" type="number" min="1" style={inputStyle} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>BUILD STATUS</label>
          <select className="td-focusable" style={inputStyle} value={buildStatus} onChange={(e) => setBuildStatus(e.target.value)}>
            {BUILD_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{BUILD_STATUSES[s].label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="td-mono" style={labelStyle}>DESCRIPTION</label>
        <input className="td-focusable" style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it, where does it live onstage" />
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="td-mono" style={{ ...labelStyle, marginBottom: 0 }}>COMPONENTS (FROM INVENTORY)</label>
          <button
            onClick={addComponent}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}
          >
            <Plus size={12} /> Add component
          </button>
        </div>
        <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginBottom: 10 }}>
          Qty is per unit — with {quantity > 1 ? `${quantity} needed, ` : ''}totals are shown once saved. Building something new? Add it to inventory right from here so it's tracked after the show.
        </div>
        {components.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {components.map((c) =>
              creatingItemFor === c.id ? (
                <div key={c.id} style={{ background: COLOR.panel, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 12 }}>
                  <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.blueprint, letterSpacing: '0.04em', marginBottom: 8 }}>NEW INVENTORY ITEM</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.7fr 1fr', gap: 8, marginBottom: 8 }}>
                    <input className="td-focusable" style={inputStyle} value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="e.g. Stair Unit, 3-step" />
                    <select className="td-focusable" style={inputStyle} value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}>
                      {INVENTORY_CATEGORY_ORDER.map((cat) => (
                        <option key={cat} value={cat}>{INVENTORY_CATEGORIES[cat].label}</option>
                      ))}
                    </select>
                    <input className="td-focusable" type="number" min="1" style={inputStyle} value={newItem.totalQty} onChange={(e) => setNewItem({ ...newItem, totalQty: e.target.value })} />
                    <select className="td-focusable" style={inputStyle} value={newItem.location} onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}>
                      {locations.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={createAndLinkItem}
                      disabled={!newItem.name.trim() || !newItem.location.trim()}
                      className="td-focusable"
                      style={{ background: newItem.name.trim() && newItem.location.trim() ? COLOR.amber : COLOR.slateDim, color: newItem.name.trim() && newItem.location.trim() ? COLOR.void : COLOR.textFaint, border: 'none', borderRadius: 3, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Create & link
                    </button>
                    <button onClick={() => setCreatingItemFor(null)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2.4fr 0.8fr auto auto', gap: 8, alignItems: 'center' }}>
                  <select className="td-focusable" style={inputStyle} value={c.inventoryItemId} onChange={(e) => updateComponent(c.id, 'inventoryItemId', e.target.value)}>
                    {inventory.map((item) => (
                      <option key={item.id} value={item.id}>{item.assetNo} — {item.name}</option>
                    ))}
                  </select>
                  <input className="td-focusable" type="number" min="1" style={inputStyle} value={c.qtyPerUnit} onChange={(e) => updateComponent(c.id, 'qtyPerUnit', e.target.value)} />
                  <button
                    onClick={() => startCreateItem(c.id)}
                    className="td-focusable"
                    style={{ background: 'none', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, padding: '6px 8px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                    aria-label="Create a new inventory item for this component"
                    title="Create a new inventory item"
                  >
                    <Plus size={13} />
                  </button>
                  <button onClick={() => removeComponent(c.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove component">
                    <X size={14} />
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <label className="td-mono" style={labelStyle}>NOTES</label>
        <textarea
          className="td-focusable"
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Build notes, bracing, finish, deadlines..."
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="td-focusable"
          style={{
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
          {initial ? 'Save changes' : 'Add to build list'}
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
// SET PIECE CARD
// ---------------------------------------------------------------------------
export function SetPieceCard({ piece, inventory, onEdit, onRemove, onStatusChange }) {
  const statusMeta = BUILD_STATUSES[piece.buildStatus] || BUILD_STATUSES.not_started;

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div className="td-display" style={{ fontSize: 16, color: COLOR.textPrimary, letterSpacing: '0.02em' }}>
            {piece.name}{piece.quantity > 1 ? <span className="td-mono" style={{ fontSize: 12, color: COLOR.textFaint, marginLeft: 6 }}>× {piece.quantity}</span> : null}
          </div>
          {piece.description && <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, marginTop: 4 }}>{piece.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${piece.name}`}>
            <Pencil size={13} />
          </button>
          <button onClick={onRemove} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove ${piece.name}`}>
            <X size={13} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <select
          value={piece.buildStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className="td-focusable"
          style={{
            background: COLOR.panel,
            border: `1px solid ${statusMeta.color}`,
            color: statusMeta.color,
            borderRadius: 20,
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.04em',
            cursor: 'pointer',
          }}
        >
          {BUILD_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{BUILD_STATUSES[s].label.toUpperCase()}</option>
          ))}
        </select>
      </div>

      {piece.components && piece.components.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {piece.components.map((c) => {
            const item = inventory.find((i) => i.id === c.inventoryItemId);
            const total = c.qtyPerUnit * piece.quantity;
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.blueprint, flex: 1 }}>
                  {item ? `${item.assetNo} — ${item.name}` : 'Unknown item'}
                </span>
                <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>
                  {c.qtyPerUnit}{piece.quantity > 1 ? ` × ${piece.quantity} = ${total}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {piece.notes && <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginTop: 10, lineHeight: 1.5 }}>{piece.notes}</div>}
    </div>
  );
}
// ---------------------------------------------------------------------------
// SET MODULE
// ---------------------------------------------------------------------------
export function SetModule({ show, inventory, setInventory, locations, setShows, INVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER }) {
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const pieces = show.setPieces || [];
  const filtered = filter === 'all' ? pieces : pieces.filter((p) => p.buildStatus === filter);

  function addPiece(piece) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, setPieces: [...(s.setPieces || []), piece] } : s)));
    setAdding(false);
  }
  function savePiece(piece) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, setPieces: (s.setPieces || []).map((p) => (p.id === piece.id ? piece : p)) } : s)));
    setEditingId(null);
  }
  function removePiece(id) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, setPieces: (s.setPieces || []).filter((p) => p.id !== id) } : s)));
  }
  function changeStatus(id, buildStatus) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, setPieces: (s.setPieces || []).map((p) => (p.id === id ? { ...p, buildStatus } : p)) } : s)));
  }

  const counts = BUILD_STATUS_ORDER.reduce((acc, s) => {
    acc[s] = pieces.filter((p) => p.buildStatus === s).length;
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <ExportCsvButton
          filename={`${show.title}-set`}
          rows={() =>
            (show.setPieces || []).map((p) => ({
              Piece: p.name || '',
              Status: (BUILD_STATUSES[p.status] || {}).label || p.status || '',
              Components: (p.components || []).map((c) => `${c.qty} x ${(inventory.find((i) => i.id === c.itemId) || {}).name || 'item'}`).join('; '),
              Location: p.location || '',
              Notes: p.notes || '',
            }))
          }
        />
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{pieces.length}</strong> pieces on the build list
        </span>
        {BUILD_STATUS_ORDER.map((s) => (
          <span key={s} className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
            <strong style={{ color: BUILD_STATUSES[s].color }}>{counts[s]}</strong> {BUILD_STATUSES[s].label.toLowerCase()}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ id: 'all', label: 'All' }, ...BUILD_STATUS_ORDER.map((s) => ({ id: s, label: BUILD_STATUSES[s].label }))].map((f) => (
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
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add set piece
        </button>
      </div>

      {adding && <SetPieceForm show={show} inventory={inventory} setInventory={setInventory} locations={locations} onSave={addPiece} onCancel={() => setAdding(false)} INVENTORY_CATEGORIES={INVENTORY_CATEGORIES} INVENTORY_CATEGORY_ORDER={INVENTORY_CATEGORY_ORDER} />}

      {filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtered.map((piece) =>
            editingId === piece.id ? (
              <div key={piece.id} style={{ gridColumn: '1 / -1' }}>
                <SetPieceForm show={show} inventory={inventory} setInventory={setInventory} locations={locations} initial={piece} onSave={savePiece} onCancel={() => setEditingId(null)} INVENTORY_CATEGORIES={INVENTORY_CATEGORIES} INVENTORY_CATEGORY_ORDER={INVENTORY_CATEGORY_ORDER} />
              </div>
            ) : (
              <SetPieceCard
                key={piece.id}
                piece={piece}
                inventory={inventory}
                onEdit={() => { setEditingId(piece.id); setAdding(false); }}
                onRemove={() => removePiece(piece.id)}
                onStatusChange={(status) => changeStatus(piece.id, status)}
              />
            )
          )}
        </div>
      ) : (
        <StubPanel label={pieces.length === 0 ? `No set pieces on the build list for ${show.title} yet` : 'Nothing matches this filter'} hint="Enter the scene list first so pieces can be tied to where they are used, then add a piece and compose it from inventory components such as platform tops and legs." />
      )}
    </div>
  );
}
