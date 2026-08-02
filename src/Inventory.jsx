import React, { useMemo, useState } from 'react';
import { AlertTriangle, DollarSign, Maximize2, Pencil, Plus, Wrench, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { AudioSectionHeader } from './Audio.jsx';
import { TODAY_STR, conditionForItem, formatShortDate, itemCheckedOut, itemConflicts, itemOutOfService } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// INVENTORY — the stock room: what the shop owns, per-unit condition, what it
// cost, and which production currently has it out.

// ---------------------------------------------------------------------------
// STOCK BAR — a fader-level readout: available / checked out / out of
// service, in the same green/amber/slate language as the cue lights.
// ---------------------------------------------------------------------------
export function StockBar({ item }) {
  const checkedOut = itemCheckedOut(item);
  const outOfService = itemOutOfService(item);
  const available = item.totalQty - checkedOut - outOfService;
  const seg = (n) => (item.totalQty > 0 ? (Math.max(0, n) / item.totalQty) * 100 : 0);
  return (
    <div>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: COLOR.line }}>
        <div style={{ width: `${seg(available)}%`, background: COLOR.green }} />
        <div style={{ width: `${seg(checkedOut)}%`, background: COLOR.amber }} />
        <div style={{ width: `${seg(outOfService)}%`, background: COLOR.slate }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span className="td-mono" style={{ fontSize: 9.5, color: available < 0 ? COLOR.amber : COLOR.green }}>{available} AVAIL</span>
        <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber }}>{checkedOut} OUT</span>
        {outOfService > 0 && <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.slate }}>{outOfService} OOS</span>}
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// ASSET CARD — styled like an equipment tag: asset number up top, the way
// it'd read printed on the DYMO label taped to the case.
// ---------------------------------------------------------------------------
export function ItemCard({ item, shows, calls, onOpen, INVENTORY_CATEGORIES }) {
  const Icon = INVENTORY_CATEGORIES[item.category].icon;
  const condition = conditionForItem(item);
  const conflicts = itemConflicts(item, shows);
  const hasConflict = conflicts.length > 0;
  const outOfService = itemOutOfService(item);
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      style={{
        background: hover ? COLOR.cardHover : COLOR.card,
        border: `1px solid ${hasConflict ? COLOR.amber : condition === 'attention' ? COLOR.amberDim : COLOR.line}`,
        borderRadius: 4,
        padding: '14px 16px 16px',
        transition: 'background 0.15s ease',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.blueprint, letterSpacing: '0.06em' }}>{item.assetNo}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon size={12.5} color={COLOR.textFaint} strokeWidth={1.75} />
            <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.05em' }}>
              {INVENTORY_CATEGORIES[item.category].label.toUpperCase()}
            </span>
          </div>
          <Maximize2 size={12} color={COLOR.textFaint} strokeWidth={1.75} />
        </div>
      </div>

      <div className="td-body" style={{ fontSize: 14, color: COLOR.textPrimary, fontWeight: 500, marginTop: 7, lineHeight: 1.3 }}>
        {item.name}
      </div>

      <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 6 }}>
        {item.location}
      </div>

      {hasConflict && (
        <div style={{ marginTop: 10, padding: '7px 9px', background: COLOR.amberDim, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {conflicts.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
              <AlertTriangle size={11} color={COLOR.amber} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, lineHeight: 1.4 }}>
                CONFLICT — {c.a.show.title} & {c.b.show.title} tech weeks overlap, need {c.a.qty + c.b.qty}, only {item.totalQty - outOfService} in stock
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {(item.assignments || []).length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {item.assignments.map((a) => {
              const s = shows.find((sh) => sh.id === a.showId);
              return (
                <span key={a.id} className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '2px 6px' }}>
                  {s ? s.title : a.showId} ×{a.qty}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint }}>General stock — not assigned to a show</div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <StockBar item={item} />
      </div>

      {condition === 'attention' && !hasConflict && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10 }}>
          <AlertTriangle size={11} color={COLOR.amber} strokeWidth={2} />
          <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, letterSpacing: '0.03em' }}>
            {outOfService > 0 ? 'Some units out of service' : 'None available'}
          </span>
        </div>
      )}
    </div>
  );
}
export function ItemDetailPanel({ item, shows, calls, locations, setInventory, onBack, INVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER }) {
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoDraft, setInfoDraft] = useState({ name: item.name, location: item.location, totalQty: item.totalQty });

  const [addingUnit, setAddingUnit] = useState(false);
  const [unitStatus, setUnitStatus] = useState('broken');
  const [unitNote, setUnitNote] = useState('');

  const [assigning, setAssigning] = useState(false);
  const [newShowId, setNewShowId] = useState(shows[0]?.id || '');
  const [newCallId, setNewCallId] = useState('');
  const [newQty, setNewQty] = useState(1);

  const [editingCost, setEditingCost] = useState(false);
  const [costDraft, setCostDraft] = useState({
    costPerUnit: item.costPerUnit || 0,
    purchaseDate: item.purchaseDate || '',
    purchaseSource: item.purchaseSource || '',
    purchaseNotes: item.purchaseNotes || '',
  });

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '7px 9px',
    color: COLOR.textPrimary,
    fontSize: 12.5,
  };
  const labelStyle = { fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  const checkedOut = itemCheckedOut(item);
  const outOfService = itemOutOfService(item);
  const available = item.totalQty - checkedOut - outOfService;
  const conflicts = itemConflicts(item, shows);
  const showCallsForNew = calls.filter((c) => c.showId === newShowId);
  const Icon = INVENTORY_CATEGORIES[item.category].icon;

  function saveInfo() {
    setInventory((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, name: infoDraft.name.trim(), location: infoDraft.location.trim(), totalQty: Math.max(0, Number(infoDraft.totalQty) || 0) } : i))
    );
    setEditingInfo(false);
  }

  function addUnit() {
    const unit = { id: `u-${item.id}-${Date.now()}`, status: unitStatus, note: unitNote.trim(), date: TODAY_STR };
    setInventory((prev) => prev.map((i) => (i.id === item.id ? { ...i, units: [...(i.units || []), unit] } : i)));
    setAddingUnit(false);
    setUnitNote('');
  }
  function removeUnit(unitId) {
    setInventory((prev) => prev.map((i) => (i.id === item.id ? { ...i, units: (i.units || []).filter((u) => u.id !== unitId) } : i)));
  }

  function addAssignment() {
    if (!newShowId) return;
    const assignment = { id: `ia-${item.id}-${Date.now()}`, showId: newShowId, callId: newCallId || null, qty: Math.max(1, Number(newQty) || 1) };
    setInventory((prev) => prev.map((i) => (i.id === item.id ? { ...i, assignments: [...(i.assignments || []), assignment] } : i)));
    setAssigning(false);
    setNewCallId('');
    setNewQty(1);
  }
  function removeAssignment(assignmentId) {
    setInventory((prev) => prev.map((i) => (i.id === item.id ? { ...i, assignments: (i.assignments || []).filter((a) => a.id !== assignmentId) } : i)));
  }

  function saveCost() {
    setInventory((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, costPerUnit: Number(costDraft.costPerUnit) || 0, purchaseDate: costDraft.purchaseDate, purchaseSource: costDraft.purchaseSource.trim(), purchaseNotes: costDraft.purchaseNotes.trim() }
          : i
      )
    );
    setEditingCost(false);
  }

  const totalInvestment = (item.costPerUnit || 0) * item.totalQty;

  return (
    <div>
      <button
        onClick={onBack}
        className="td-focusable"
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: COLOR.blueprint, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 18 }}
      >
        ← Back to inventory
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="td-mono" style={{ fontSize: 12, color: COLOR.blueprint, letterSpacing: '0.06em' }}>{item.assetNo}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon size={13} color={COLOR.textFaint} strokeWidth={1.75} />
            <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em' }}>
              {INVENTORY_CATEGORIES[item.category].label.toUpperCase()}
            </span>
          </div>
        </div>
        <button
          onClick={() => (editingInfo ? saveInfo() : (setInfoDraft({ name: item.name, location: item.location, totalQty: item.totalQty }), setEditingInfo(true)))}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, fontSize: 11, padding: '5px 10px', cursor: 'pointer' }}
        >
          <Pencil size={12} /> {editingInfo ? 'Save' : 'Edit'}
        </button>
      </div>

      {editingInfo ? (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 0.8fr', gap: 10, marginTop: 12, maxWidth: 560 }}>
          <div>
            <label className="td-mono" style={labelStyle}>NAME</label>
            <input className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={infoDraft.name} onChange={(e) => setInfoDraft({ ...infoDraft, name: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>LOCATION</label>
            <select className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={infoDraft.location} onChange={(e) => setInfoDraft({ ...infoDraft, location: e.target.value })}>
              {locations.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
              {!locations.includes(infoDraft.location) && infoDraft.location && (
                <option value={infoDraft.location}>{infoDraft.location} (not in list)</option>
              )}
            </select>
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>TOTAL QTY</label>
            <input className="td-focusable" type="number" min="0" style={{ ...inputStyle, width: '100%' }} value={infoDraft.totalQty} onChange={(e) => setInfoDraft({ ...infoDraft, totalQty: e.target.value })} />
          </div>
        </div>
      ) : (
        <>
          <h2 className="td-display" style={{ fontSize: 22, color: COLOR.textPrimary, letterSpacing: '0.02em', margin: '10px 0 4px' }}>{item.name}</h2>
          <div className="td-mono" style={{ fontSize: 11.5, color: COLOR.textFaint }}>{item.location}</div>
        </>
      )}

      {conflicts.length > 0 && (
        <div style={{ marginTop: 14, padding: '9px 12px', background: COLOR.amberDim, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {conflicts.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertTriangle size={13} color={COLOR.amber} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, lineHeight: 1.5 }}>
                CONFLICT — {c.a.show.title} & {c.b.show.title} tech weeks overlap ({c.a.range.start} to {c.a.range.end} vs {c.b.range.start} to {c.b.range.end}), need {c.a.qty + c.b.qty}, only {item.totalQty - outOfService} in stock
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, maxWidth: 420 }}>
        <StockBar item={item} />
      </div>

      <AudioSectionHeader label="ASSIGNED TO" />
      {(item.assignments || []).length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {item.assignments.map((a) => {
            const s = shows.find((sh) => sh.id === a.showId);
            const c = a.callId ? calls.find((cc) => cc.id === a.callId) : null;
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
                <span className="td-mono" style={{ fontSize: 12, color: COLOR.amber, flex: 1 }}>
                  {s ? s.title : a.showId}{c ? ` · ${c.label} · ${formatShortDate(c.date)}` : ' · whole run'}
                </span>
                <span className="td-mono" style={{ fontSize: 11, color: COLOR.textFaint }}>×{a.qty}</span>
                <button onClick={() => removeAssignment(a.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove assignment">
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <StubPanel label="General stock — not assigned to a show" hint="Items start as general stock. Open an item and assign it to a production to pull it for a show, and any tech week overlap with another show gets flagged." />
        </div>
      )}
      {assigning ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="td-focusable" value={newShowId} onChange={(e) => { setNewShowId(e.target.value); setNewCallId(''); }} style={inputStyle}>
            {shows.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <select className="td-focusable" value={newCallId} onChange={(e) => setNewCallId(e.target.value)} style={inputStyle}>
            <option value="">Whole run</option>
            {showCallsForNew.map((c) => (
              <option key={c.id} value={c.id}>{c.label} · {formatShortDate(c.date)}</option>
            ))}
          </select>
          <input className="td-focusable" type="number" min="1" value={newQty} onChange={(e) => setNewQty(e.target.value)} style={{ ...inputStyle, width: 56 }} />
          <button onClick={addAssignment} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Add</button>
          <button onClick={() => setAssigning(false)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        shows.length > 0 && (
          <button onClick={() => setAssigning(true)} className="td-focusable" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={13} /> Assign to show
          </button>
        )
      )}

      <AudioSectionHeader label="UNIT STATUS" />
      {(item.units || []).length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {item.units.map((u) => {
            const meta = UNIT_STATUS_META[u.status];
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
                <span className="td-mono" style={{ fontSize: 10.5, color: meta.color, border: `1px solid ${meta.color}`, borderRadius: 3, padding: '2px 7px', flexShrink: 0 }}>
                  {meta.label.toUpperCase()}
                </span>
                <span className="td-body" style={{ fontSize: 12, color: COLOR.textMuted, flex: 1 }}>{u.note || '—'}</span>
                <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>{formatShortDate(u.date)}</span>
                <button onClick={() => removeUnit(u.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove unit record">
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <StubPanel label="No unit issues logged — everything's presumed good" hint="An empty log means every unit is presumed good. Mark a unit broken, repaired or retired from the item's unit list and its history builds up here." />
        </div>
      )}
      {addingUnit ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="td-focusable" value={unitStatus} onChange={(e) => setUnitStatus(e.target.value)} style={inputStyle}>
            {Object.keys(UNIT_STATUS_META).map((s) => (
              <option key={s} value={s}>{UNIT_STATUS_META[s].label}</option>
            ))}
          </select>
          <input className="td-focusable" value={unitNote} onChange={(e) => setUnitNote(e.target.value)} placeholder="What happened?" style={{ ...inputStyle, minWidth: 200 }} />
          <button onClick={addUnit} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Log it</button>
          <button onClick={() => setAddingUnit(false)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAddingUnit(true)} className="td-focusable" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Wrench size={13} /> Log a broken, repaired, or retired unit
        </button>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em' }}>COST & PURCHASE</div>
        <button
          onClick={() => (editingCost ? saveCost() : (setCostDraft({ costPerUnit: item.costPerUnit || 0, purchaseDate: item.purchaseDate || '', purchaseSource: item.purchaseSource || '', purchaseNotes: item.purchaseNotes || '' }), setEditingCost(true)))}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, fontSize: 11, padding: '5px 10px', cursor: 'pointer' }}
        >
          <Pencil size={12} /> {editingCost ? 'Save' : 'Edit'}
        </button>
      </div>

      {editingCost ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10, maxWidth: 480 }}>
          <div>
            <label className="td-mono" style={labelStyle}>COST PER UNIT ($)</label>
            <input className="td-focusable" type="number" min="0" style={{ ...inputStyle, width: '100%' }} value={costDraft.costPerUnit} onChange={(e) => setCostDraft({ ...costDraft, costPerUnit: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>PURCHASE DATE</label>
            <input className="td-focusable" type="date" style={{ ...inputStyle, width: '100%' }} value={costDraft.purchaseDate} onChange={(e) => setCostDraft({ ...costDraft, purchaseDate: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>PURCHASED FROM</label>
            <input className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={costDraft.purchaseSource} onChange={(e) => setCostDraft({ ...costDraft, purchaseSource: e.target.value })} placeholder="Vendor" />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>NOTES</label>
            <input className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={costDraft.purchaseNotes} onChange={(e) => setCostDraft({ ...costDraft, purchaseNotes: e.target.value })} />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarSign size={13} color={COLOR.textFaint} />
            <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted }}>
              {item.costPerUnit ? `$${item.costPerUnit.toLocaleString()} / unit` : 'No cost on file'}
              {item.costPerUnit ? ` · $${totalInvestment.toLocaleString()} total` : ''}
            </span>
          </div>
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint }}>
            {item.purchaseDate ? `Purchased ${formatShortDate(item.purchaseDate)}` : 'No purchase date on file'}
            {item.purchaseSource ? ` from ${item.purchaseSource}` : ''}
          </div>
          {item.purchaseNotes && <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginTop: 2 }}>{item.purchaseNotes}</div>}
        </div>
      )}
    </div>
  );
}
export function NewItemForm({ show, calls, locations, onAdd, onClose, INVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('electrics');
  const [totalQty, setTotalQty] = useState(1);
  const [location, setLocation] = useState(locations[0] || '');
  const [pullFor, setPullFor] = useState('none');
  const [pullQty, setPullQty] = useState(1);

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
  const sortedCalls = calls.slice().sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>Add inventory item</div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.7fr 1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>NAME</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shure SM58" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>CATEGORY</label>
          <select className="td-focusable" style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
            {INVENTORY_CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{INVENTORY_CATEGORIES[c].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>QTY</label>
          <input
            className="td-focusable"
            type="number"
            min="1"
            style={inputStyle}
            value={totalQty}
            onChange={(e) => setTotalQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>LOCATION</label>
          <select className="td-focusable" style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)}>
            {locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {show && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '2.4fr 1fr', gap: 12 }}>
          <div>
            <label className="td-mono" style={labelStyle}>PULL FOR</label>
            <select className="td-focusable" style={inputStyle} value={pullFor} onChange={(e) => setPullFor(e.target.value)}>
              <option value="none">General stock (not tied to a show)</option>
              <option value="show">{show.title} — whole run</option>
              {sortedCalls.map((c) => (
                <option key={c.id} value={c.id}>{show.title} — {c.label} · {formatShortDate(c.date)}</option>
              ))}
            </select>
          </div>
          {pullFor !== 'none' && (
            <div>
              <label className="td-mono" style={labelStyle}>QTY PULLED</label>
              <input
                className="td-focusable"
                type="number"
                min="1"
                style={inputStyle}
                value={pullQty}
                onChange={(e) => setPullQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>
          )}
        </div>
      )}

      <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginTop: 10 }}>
        Gear can be assigned to more than one show later — this just sets its first assignment.
      </div>

      <button
        className="td-focusable"
        disabled={!name.trim() || !location.trim()}
        onClick={() =>
          onAdd({
            id: `i${Date.now()}`,
            assetNo: `NEW-${String(Math.floor(Math.random() * 900) + 100)}`,
            name: name.trim(),
            category,
            totalQty,
            location: location.trim(),
            units: [],
            costPerUnit: 0,
            purchaseDate: '',
            purchaseSource: '',
            purchaseNotes: '',
            assignments:
              show && pullFor !== 'none'
                ? [{ id: `ia-new-${Date.now()}`, showId: show.id, callId: pullFor === 'show' ? null : pullFor, qty: pullQty }]
                : [],
          })
        }
        style={{
          marginTop: 14,
          background: name.trim() && location.trim() ? COLOR.amber : COLOR.slateDim,
          color: name.trim() && location.trim() ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: name.trim() && location.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        Add to inventory
      </button>
    </div>
  );
}
// ---------------------------------------------------------------------------
// INVENTORY MODULE
// ---------------------------------------------------------------------------
export function InventoryModule({ show, shows, calls, inventory, setInventory, locations, INVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER }) {
  const [category, setCategory] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [thisShowOnly, setThisShowOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [openItemId, setOpenItemId] = useState(null);

  const filtered = useMemo(() => {
    let list = inventory;
    if (category !== 'all') list = list.filter((i) => i.category === category);
    if (attentionOnly) list = list.filter((i) => conditionForItem(i) === 'attention');
    if (conflictsOnly) list = list.filter((i) => itemConflicts(i, shows).length > 0);
    if (thisShowOnly && show) list = list.filter((i) => (i.assignments || []).some((a) => a.showId === show.id));
    return list;
  }, [inventory, category, attentionOnly, conflictsOnly, thisShowOnly, show, shows]);

  const attentionCount = inventory.filter((i) => conditionForItem(i) === 'attention').length;
  const conflictCount = inventory.filter((i) => itemConflicts(i, shows).length > 0).length;
  const thisShowCount = show ? inventory.filter((i) => (i.assignments || []).some((a) => a.showId === show.id)).length : 0;
  const categoryFilters = [{ id: 'all', label: 'All' }, ...INVENTORY_CATEGORY_ORDER.map((c) => ({ id: c, label: INVENTORY_CATEGORIES[c].label }))];
  const openItem = openItemId ? inventory.find((i) => i.id === openItemId) : null;

  if (openItem) {
    return <ItemDetailPanel item={openItem} shows={shows} calls={calls} locations={locations} setInventory={setInventory} onBack={() => setOpenItemId(null)} INVENTORY_CATEGORIES={INVENTORY_CATEGORIES} INVENTORY_CATEGORY_ORDER={INVENTORY_CATEGORY_ORDER} />;
  }

  return (
    <div>
      {!show && (
        <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginBottom: 16 }}>
          No show selected — adding general shop stock. Pick a show from the sidebar to pull gear for a specific production or call.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categoryFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setCategory(f.id)}
              className="td-focusable"
              style={{
                background: category === f.id ? COLOR.amber : 'transparent',
                color: category === f.id ? COLOR.void : COLOR.textMuted,
                border: `1px solid ${category === f.id ? COLOR.amber : COLOR.line}`,
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {show && (
            <button
              onClick={() => setThisShowOnly((v) => !v)}
              className="td-focusable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: thisShowOnly ? COLOR.card : 'transparent',
                color: COLOR.textMuted,
                border: `1px solid ${thisShowOnly ? COLOR.lineBright : COLOR.line}`,
                borderRadius: 3,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Pulled for {show.title}{thisShowCount > 0 ? ` (${thisShowCount})` : ''}
            </button>
          )}
          <button
            onClick={() => setConflictsOnly((v) => !v)}
            disabled={conflictCount === 0}
            className="td-focusable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: conflictsOnly ? COLOR.amberDim : 'transparent',
              color: conflictCount > 0 ? COLOR.amber : COLOR.textFaint,
              border: `1px solid ${conflictCount > 0 ? COLOR.amber : COLOR.line}`,
              borderRadius: 3,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: conflictCount > 0 ? 'pointer' : 'default',
            }}
          >
            <AlertTriangle size={13} /> Conflicts{conflictCount > 0 ? ` (${conflictCount})` : ''}
          </button>
          <button
            onClick={() => setAttentionOnly((v) => !v)}
            className="td-focusable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: attentionOnly ? COLOR.amberDim : 'transparent',
              color: COLOR.amber,
              border: `1px solid ${COLOR.amber}`,
              borderRadius: 3,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <AlertTriangle size={13} /> Needs attention{attentionCount > 0 ? ` (${attentionCount})` : ''}
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="td-focusable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              color: COLOR.textPrimary,
              border: `1px solid ${COLOR.lineBright}`,
              borderRadius: 3,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Add item
          </button>
        </div>
      </div>

      {showForm && (
        <NewItemForm
          show={show}
          calls={show ? calls.filter((c) => c.showId === show.id) : []}
          locations={locations}
          onAdd={(item) => {
            setInventory((prev) => [item, ...prev]);
            setShowForm(false);
          }}
          onClose={() => setShowForm(false)}
          INVENTORY_CATEGORIES={INVENTORY_CATEGORIES}
          INVENTORY_CATEGORY_ORDER={INVENTORY_CATEGORY_ORDER}
        />
      )}

      {filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              shows={shows}
              calls={calls}
              onOpen={() => setOpenItemId(item.id)}
              INVENTORY_CATEGORIES={INVENTORY_CATEGORIES}
            />
          ))}
        </div>
      ) : (
        <StubPanel label="Nothing matches this filter" hint="Nothing matches the current filter. Clear or widen it above. If the list is empty under every filter, add the first entry with the button at the top right." />
      )}
    </div>
  );
}
