import React, { useMemo, useState } from 'react';
import { Pencil, Plus, UserCheck, UserX, Users, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { PERSON_TYPES, PERSON_TYPE_ORDER, TODAY, TODAY_STR, assignmentFor, defaultAssignmentFields, formatShortDate, formatTime12h, parseTime12hTo24h, rosterForType, sceneById, setterForType } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// CALLS — the callboard: who is called when, which scenes are being worked,
// what gear comes out, and who actually turned up.

// ---------------------------------------------------------------------------
// CALL SHEET CARD — one production's call for today, posted the way it would
// be on an actual callboard: time first, largest, in mono.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// SLOT ROLE — what a call slot is asking for. Picks from the same lists the
// rosters cast against: characters for actors, position lists for everyone
// else, so a slot and an assignment can't drift apart in wording. Falls back
// to free text for a person type whose list hasn't been set up yet.
// ---------------------------------------------------------------------------
export function SlotRoleField({ personType, value, onChange, slotOptions, style, placeholder }) {
  const options = (slotOptions && slotOptions[personType]) || [];
  if (!options.length) {
    return <input className="td-focusable" style={style} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
  }
  return (
    <select className="td-focusable" style={style} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose...</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
      {value && !options.includes(value) && <option value={value}>{value}</option>}
    </select>
  );
}
export function CallCard({ call, show, rosters, currentIds, inventory, onSignUp, onWithdraw, onAddSlot, onSetAttendance, onEdit, showDate, slotOptions }) {
  const [addingSlot, setAddingSlot] = useState(false);
  const [newSlotType, setNewSlotType] = useState('crew');
  const [newSlotRole, setNewSlotRole] = useState('');
  const filledCount = call.slots.filter((s) => s.filledBy).length;
  const linkedGear = inventory.filter((i) => (i.assignments || []).some((a) => a.callId === call.id));
  const scenes = (call.sceneIds || []).map((id) => sceneById(show, id)).filter(Boolean);

  return (
    <div style={{ display: 'flex', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, overflow: 'hidden' }}>
      <div
        style={{
          width: 92,
          flexShrink: 0,
          background: COLOR.panel,
          borderRight: `1px solid ${COLOR.line}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 6px',
        }}
      >
        {showDate && (
          <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.04em', marginBottom: 2 }}>
            {formatShortDate(call.date).toUpperCase()}
          </span>
        )}
        <span className="td-mono" style={{ fontSize: 15, color: COLOR.amber, textAlign: 'center', lineHeight: 1.3 }}>
          {call.time}
        </span>
      </div>
      <div style={{ flex: 1, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
          <div className="td-display" style={{ fontSize: 15, color: COLOR.textPrimary, letterSpacing: '0.02em' }}>
            {call.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>{filledCount}/{call.slots.length} FILLED</span>
            <span className="td-mono" style={{ fontSize: 10, color: COLOR.blueprint, letterSpacing: '0.05em' }}>{call.location.toUpperCase()}</span>
            <button onClick={onEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Edit call">
              <Pencil size={12} />
            </button>
          </div>
        </div>

        {scenes.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
            {scenes.map((sc) => (
              <span key={sc.id} className="td-mono" style={{ fontSize: 9.5, color: COLOR.blueprint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '2px 7px' }}>
                {sc.actName} — {sc.number}. {sc.name}
              </span>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
          {call.slots.map((slot) => {
            const roster = rosterForType(slot.personType, rosters);
            const person = slot.filledBy ? roster.find((p) => p.id === slot.filledBy) : null;
            const myId = currentIds[slot.personType];
            const isMe = slot.filledBy && slot.filledBy === myId;
            const TypeIcon = PERSON_TYPES[slot.personType].icon;
            const attendance = slot.attendance || 'pending';
            return (
              <div
                key={slot.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 0',
                  borderTop: `1px solid ${COLOR.line}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: 62, flexShrink: 0 }}>
                  <TypeIcon size={11} color={COLOR.textFaint} strokeWidth={1.75} />
                  <span className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.03em' }}>
                    {PERSON_TYPES[slot.personType].label.toUpperCase()}
                  </span>
                </div>
                <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, flex: 1 }}>{slot.role}</span>
                {person ? (
                  <span className="td-mono" style={{ fontSize: 11, color: isMe ? COLOR.amber : COLOR.textPrimary, flexShrink: 0 }}>
                    {person.name}{isMe ? ' · you' : ''}
                  </span>
                ) : (
                  <span className="td-mono" style={{ fontSize: 10, color: COLOR.green, flexShrink: 0 }}>OPEN</span>
                )}
                {person && (
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button
                      onClick={() => onSetAttendance(call.id, slot.id, attendance === 'present' ? 'pending' : 'present')}
                      className="td-focusable"
                      style={{ background: 'none', border: 'none', color: attendance === 'present' ? COLOR.green : COLOR.textFaint, cursor: 'pointer', display: 'flex', padding: 2 }}
                      aria-label={`Mark ${person.name} present`}
                      title="Mark present"
                    >
                      <UserCheck size={13} />
                    </button>
                    <button
                      onClick={() => onSetAttendance(call.id, slot.id, attendance === 'absent' ? 'pending' : 'absent')}
                      className="td-focusable"
                      style={{ background: 'none', border: 'none', color: attendance === 'absent' ? COLOR.slate : COLOR.textFaint, cursor: 'pointer', display: 'flex', padding: 2 }}
                      aria-label={`Mark ${person.name} absent`}
                      title="Mark absent"
                    >
                      <UserX size={13} />
                    </button>
                  </div>
                )}
                <div style={{ width: 84, flexShrink: 0, textAlign: 'right' }}>
                  {isMe ? (
                    <button
                      onClick={() => onWithdraw(call.id, slot.id)}
                      className="td-focusable"
                      style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 10.5, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Cancel
                    </button>
                  ) : !person && myId ? (
                    <button
                      onClick={() => onSignUp(call.id, slot.id)}
                      className="td-focusable"
                      style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '3px 10px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Sign up
                    </button>
                  ) : !person ? (
                    <span className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint }}>
                      Sign in as {PERSON_TYPES[slot.personType].label.toLowerCase()}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {linkedGear.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLOR.line}` }}>
            <div className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.04em', marginBottom: 6 }}>GEAR PULLED</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {linkedGear.map((item) => (
                <span
                  key={item.id}
                  className="td-mono"
                  style={{ fontSize: 10, color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '3px 8px' }}
                >
                  {item.assetNo} · {item.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {addingSlot ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLOR.line}`, flexWrap: 'wrap' }}>
            <select
              className="td-focusable"
              value={newSlotType}
              onChange={(e) => setNewSlotType(e.target.value)}
              style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 8px', color: COLOR.textPrimary, fontSize: 11.5 }}
            >
              {PERSON_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>{PERSON_TYPES[t].label}</option>
              ))}
            </select>
            <SlotRoleField
              personType={newSlotType}
              value={newSlotRole}
              onChange={setNewSlotRole}
              slotOptions={slotOptions}
              placeholder="Role, e.g. General Hand"
              style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 8px', color: COLOR.textPrimary, fontSize: 11.5, flex: 1, minWidth: 140 }}
            />
            <button
              onClick={() => {
                if (!newSlotRole.trim()) return;
                onAddSlot(call.id, newSlotType, newSlotRole.trim());
                setNewSlotRole('');
                setAddingSlot(false);
              }}
              disabled={!newSlotRole.trim()}
              className="td-focusable"
              style={{ background: newSlotRole.trim() ? COLOR.amber : COLOR.slateDim, color: newSlotRole.trim() ? COLOR.void : COLOR.textFaint, border: 'none', borderRadius: 3, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: newSlotRole.trim() ? 'pointer' : 'not-allowed' }}
            >
              Add
            </button>
            <button
              onClick={() => setAddingSlot(false)}
              className="td-focusable"
              style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingSlot(true)}
            className="td-focusable"
            style={{ background: 'none', border: 'none', color: COLOR.blueprint, fontSize: 11, cursor: 'pointer', marginTop: 10, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Plus size={12} /> Add a slot
          </button>
        )}
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// CALL FORM — create or edit a call sheet: core details, every slot, and
// the gear pulled for it. A stable id is generated up front so gear can be
// linked to a brand-new call before it's even saved.
// ---------------------------------------------------------------------------
export function CallForm({ show, venues, rosters, inventory, setInventory, initial, onSave, onCancel, slotOptions }) {
  const [callId] = useState(initial?.id || `call-${Date.now()}`);
  const [date, setDate] = useState(initial?.date || TODAY_STR);
  const [time, setTime] = useState(parseTime12hTo24h(initial?.time) || '09:00');
  const [label, setLabel] = useState(initial?.label || '');
  const [location, setLocation] = useState(initial?.location || show.venue);
  const [slots, setSlots] = useState(initial?.slots || []);
  const [sceneIds, setSceneIds] = useState(initial?.sceneIds || []);

  const [addingGear, setAddingGear] = useState(false);
  const [newGearItemId, setNewGearItemId] = useState(inventory[0]?.id || '');
  const [newGearQty, setNewGearQty] = useState(1);

  const [addingGroup, setAddingGroup] = useState(false);
  const [groupPersonType, setGroupPersonType] = useState('actor');
  const [groupId, setGroupId] = useState('');

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
  const linkedGear = inventory.filter((i) => (i.assignments || []).some((a) => a.callId === callId));

  function addSlotRow() {
    setSlots((prev) => [...prev, { id: `slot-${Date.now()}`, personType: 'crew', role: '', filledBy: null, attendance: 'pending' }]);
  }
  function updateSlotRow(id, field, value) {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (field === 'personType') return { ...s, personType: value, filledBy: null, attendance: 'pending' };
        return { ...s, [field]: value };
      })
    );
  }
  function removeSlotRow(id) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  function toggleScene(sceneId) {
    setSceneIds((prev) => (prev.includes(sceneId) ? prev.filter((id) => id !== sceneId) : [...prev, sceneId]));
  }

  function assignPerson(slotId, personId) {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, filledBy: personId || null, attendance: 'pending' } : s)));
    if (personId) {
      const setRoster = setterForType(slot.personType, rosters);
      if (setRoster) {
        setRoster((prev) =>
          prev.map((p) => {
            if (p.id !== personId || assignmentFor(p, show.id)) return p;
            const newAssignment = { id: `asn-${p.id}-${show.id}`, showId: show.id, ...defaultAssignmentFields(slot.personType, slot.role) };
            return { ...p, assignments: [...(p.assignments || []), newAssignment] };
          })
        );
      }
    }
  }

  function addGroupSlots() {
    const group = (show.groups || []).find((g) => g.id === groupId);
    if (!group || group.memberIds.length === 0) return;
    const newSlots = group.memberIds.map((personId, i) => ({
      id: `slot-${Date.now()}-${i}`,
      personType: group.personType,
      role: group.name,
      filledBy: personId,
      attendance: 'pending',
    }));
    setSlots((prev) => [...prev, ...newSlots]);
    const setRoster = setterForType(group.personType, rosters);
    if (setRoster) {
      setRoster((prev) =>
        prev.map((p) => {
          if (!group.memberIds.includes(p.id) || assignmentFor(p, show.id)) return p;
          const newAssignment = { id: `asn-${p.id}-${show.id}`, showId: show.id, ...defaultAssignmentFields(group.personType, group.name) };
          return { ...p, assignments: [...(p.assignments || []), newAssignment] };
        })
      );
    }
    setAddingGroup(false);
    setGroupId('');
  }

  function addGear() {
    if (!newGearItemId) return;
    const qty = Math.max(1, Number(newGearQty) || 1);
    setInventory((prev) =>
      prev.map((i) => {
        if (i.id !== newGearItemId) return i;
        const existing = (i.assignments || []).find((a) => a.callId === callId);
        if (existing) {
          return { ...i, assignments: i.assignments.map((a) => (a.callId === callId ? { ...a, qty } : a)) };
        }
        return { ...i, assignments: [...(i.assignments || []), { id: `ia-${callId}-${i.id}`, showId: show.id, callId, qty }] };
      })
    );
    setAddingGear(false);
    setNewGearQty(1);
  }
  function removeGear(itemId) {
    setInventory((prev) => prev.map((i) => (i.id === itemId ? { ...i, assignments: (i.assignments || []).filter((a) => a.callId !== callId) } : i)));
  }

  function handleSave() {
    if (!label.trim() || !date) return;
    onSave({
      id: callId,
      showId: show.id,
      date,
      time: formatTime12h(time),
      label: label.trim(),
      location,
      slots,
      sceneIds,
    });
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {initial ? 'Edit call' : 'Add call'}
        </div>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 0.8fr 0.8fr 1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>LABEL</label>
          <input className="td-focusable" style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Put-in Rehearsal" />
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
          <label className="td-mono" style={labelStyle}>LOCATION</label>
          <select className="td-focusable" style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)}>
            {venues.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
            {!venues.includes(location) && location && <option value={location}>{location} (not in list)</option>}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="td-mono" style={{ ...labelStyle, marginBottom: 0 }}>SLOTS</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setAddingGroup((v) => !v); setGroupId(''); }}
              disabled={!(show.groups || []).length}
              className="td-focusable"
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: (show.groups || []).length ? COLOR.amber : COLOR.textFaint, border: `1px solid ${(show.groups || []).length ? COLOR.amber : COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: (show.groups || []).length ? 'pointer' : 'not-allowed' }}
            >
              <Users size={12} /> Add group
            </button>
            <button onClick={addSlotRow} className="td-focusable" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>
              <Plus size={12} /> Add slot
            </button>
          </div>
        </div>

        {addingGroup && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, padding: 10, background: COLOR.panel, borderRadius: 4 }}>
            <select className="td-focusable" value={groupPersonType} onChange={(e) => { setGroupPersonType(e.target.value); setGroupId(''); }} style={inputStyle}>
              {PERSON_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>{PERSON_TYPES[t].label}</option>
              ))}
            </select>
            <select className="td-focusable" value={groupId} onChange={(e) => setGroupId(e.target.value)} style={inputStyle}>
              <option value="">Choose a group...</option>
              {(show.groups || []).filter((g) => g.personType === groupPersonType).map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.memberIds.length})</option>
              ))}
            </select>
            <button onClick={addGroupSlots} disabled={!groupId} className="td-focusable" style={{ background: groupId ? COLOR.amber : COLOR.slateDim, color: groupId ? COLOR.void : COLOR.textFaint, border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: groupId ? 'pointer' : 'not-allowed' }}>
              Add group's slots
            </button>
            <button onClick={() => setAddingGroup(false)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}
        {slots.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slots.map((s) => {
              const roster = rosterForType(s.personType, rosters);
              const onShow = roster.filter((p) => assignmentFor(p, show.id));
              const restOfCompany = roster.filter((p) => !assignmentFor(p, show.id));
              return (
                <div key={s.id} style={{ border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8, alignItems: 'center' }}>
                    <select className="td-focusable" style={inputStyle} value={s.personType} onChange={(e) => updateSlotRow(s.id, 'personType', e.target.value)}>
                      {PERSON_TYPE_ORDER.map((t) => (
                        <option key={t} value={t}>{PERSON_TYPES[t].label}</option>
                      ))}
                    </select>
                    <SlotRoleField personType={s.personType} value={s.role} onChange={(v) => updateSlotRow(s.id, 'role', v)} slotOptions={slotOptions} style={inputStyle} placeholder="Role, e.g. Board Op" />
                    <button onClick={() => removeSlotRow(s.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove slot">
                      <X size={14} />
                    </button>
                  </div>
                  <div>
                    <label className="td-mono" style={labelStyle}>ASSIGNED TO</label>
                    <select className="td-focusable" style={inputStyle} value={s.filledBy || ''} onChange={(e) => assignPerson(s.id, e.target.value || null)}>
                      <option value="">— Open —</option>
                      {onShow.length > 0 && (
                        <optgroup label={`On ${show.title}`}>
                          {onShow.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {restOfCompany.length > 0 && (
                        <optgroup label="Rest of the company">
                          {restOfCompany.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {slots.length === 0 && <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>No slots yet — add who needs to be there.</div>}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <label className="td-mono" style={{ ...labelStyle, marginBottom: 8 }}>SCENES BEING REHEARSED</label>
        {(show.acts || []).length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {show.acts.map((act) => (
              <div key={act.id}>
                <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.04em', marginBottom: 5 }}>{act.name.toUpperCase()}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(act.scenes || []).length === 0 && <span className="td-body" style={{ fontSize: 11, color: COLOR.textFaint }}>No scenes in this act yet.</span>}
                  {(act.scenes || []).map((sc, i) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => toggleScene(sc.id)}
                      className="td-focusable"
                      style={{
                        background: sceneIds.includes(sc.id) ? COLOR.amber : 'transparent',
                        color: sceneIds.includes(sc.id) ? COLOR.void : COLOR.textMuted,
                        border: `1px solid ${sceneIds.includes(sc.id) ? COLOR.amber : COLOR.line}`,
                        borderRadius: 20,
                        padding: '4px 12px',
                        fontSize: 11.5,
                        fontFamily: "'Inter', sans-serif",
                        cursor: 'pointer',
                      }}
                    >
                      {i + 1}. {sc.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>No scenes set up for {show.title} yet — add Acts and Scenes on the Scenes page.</div>
        )}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="td-mono" style={{ ...labelStyle, marginBottom: 0 }}>GEAR PULLED</label>
          <button
            onClick={() => setAddingGear((v) => !v)}
            disabled={inventory.length === 0}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 10px', fontSize: 11, cursor: inventory.length ? 'pointer' : 'not-allowed' }}
          >
            <Plus size={12} /> Pull gear
          </button>
        </div>
        {linkedGear.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: addingGear ? 8 : 0 }}>
            {linkedGear.map((item) => {
              const a = (item.assignments || []).find((x) => x.callId === callId);
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: COLOR.panel, borderRadius: 3 }}>
                  <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, flex: 1 }}>{item.assetNo} — {item.name}</span>
                  <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>×{a?.qty || 1}</span>
                  <button onClick={() => removeGear(item.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label="Remove gear">
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {linkedGear.length === 0 && !addingGear && <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>No gear pulled for this call yet.</div>}
        {addingGear && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="td-focusable" value={newGearItemId} onChange={(e) => setNewGearItemId(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 180 }}>
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>{item.assetNo} — {item.name}</option>
              ))}
            </select>
            <input className="td-focusable" type="number" min="1" value={newGearQty} onChange={(e) => setNewGearQty(e.target.value)} style={{ ...inputStyle, width: 60 }} />
            <button onClick={addGear} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Add</button>
            <button onClick={() => setAddingGear(false)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer' }}>Cancel</button>
          </div>
        )}
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
          {initial ? 'Save changes' : 'Add call'}
        </button>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '9px 16px', fontSize: 12, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// GROUPS PANEL — reusable named groups per person type (Leads, Ensemble 1,
// Electrics...) that a call can pull in all at once instead of filling
// slots one person at a time.
// ---------------------------------------------------------------------------
export function GroupsPanel({ show, rosters, setShows }) {
  const [personType, setPersonType] = useState('actor');
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingNameId, setEditingNameId] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const groups = (show.groups || []).filter((g) => g.personType === personType);
  const roster = rosterForType(personType, rosters);
  const showPeople = roster.filter((p) => assignmentFor(p, show.id));

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '7px 9px',
    color: COLOR.textPrimary,
    fontSize: 12.5,
  };

  function addGroup() {
    if (!newGroupName.trim()) return;
    setShows((prev) =>
      prev.map((s) => (s.id === show.id ? { ...s, groups: [...(s.groups || []), { id: `grp-${Date.now()}`, personType, name: newGroupName.trim(), memberIds: [] }] } : s))
    );
    setNewGroupName('');
    setAddingGroup(false);
  }
  function renameGroup(groupId, name) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, groups: (s.groups || []).map((g) => (g.id === groupId ? { ...g, name } : g)) } : s)));
  }
  function removeGroup(groupId) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, groups: (s.groups || []).filter((g) => g.id !== groupId) } : s)));
  }
  function toggleMember(groupId, personId) {
    setShows((prev) =>
      prev.map((s) =>
        s.id === show.id
          ? { ...s, groups: (s.groups || []).map((g) => (g.id === groupId ? { ...g, memberIds: g.memberIds.includes(personId) ? g.memberIds.filter((x) => x !== personId) : [...g.memberIds, personId] } : g)) }
          : s
      )
    );
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERSON_TYPE_ORDER.map((t) => (
            <button
              key={t}
              onClick={() => setPersonType(t)}
              className="td-focusable"
              style={{
                background: personType === t ? COLOR.amber : 'transparent',
                color: personType === t ? COLOR.void : COLOR.textMuted,
                border: `1px solid ${personType === t ? COLOR.amber : COLOR.line}`,
                borderRadius: 20,
                padding: '5px 14px',
                fontSize: 12,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {PERSON_TYPES[t].label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAddingGroup((v) => !v)}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '6px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={13} /> Add group
        </button>
      </div>

      {addingGroup && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            className="td-focusable"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addGroup()}
            placeholder={`e.g. Leads, or ${PERSON_TYPES[personType].label} Ensemble 1`}
            style={{ ...inputStyle, flex: 1, maxWidth: 260 }}
          />
          <button onClick={addGroup} disabled={!newGroupName.trim()} className="td-focusable" style={{ background: newGroupName.trim() ? COLOR.amber : COLOR.slateDim, color: newGroupName.trim() ? COLOR.void : COLOR.textFaint, border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: newGroupName.trim() ? 'pointer' : 'not-allowed' }}>
            Add
          </button>
          <button onClick={() => setAddingGroup(false)} className="td-focusable" style={{ background: 'none', border: `1px solid ${COLOR.line}`, color: COLOR.textFaint, borderRadius: 3, padding: '7px 14px', fontSize: 11.5, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {groups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((g) => (
            <div key={g.id} style={{ background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {editingNameId === g.id ? (
                  <>
                    <input
                      className="td-focusable"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (renameGroup(g.id, nameDraft.trim() || g.name), setEditingNameId(null))}
                      style={inputStyle}
                    />
                    <button onClick={() => { renameGroup(g.id, nameDraft.trim() || g.name); setEditingNameId(null); }} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                  </>
                ) : (
                  <>
                    <span className="td-body" style={{ fontSize: 13.5, color: COLOR.textPrimary, fontWeight: 500, flex: 1 }}>{g.name}</span>
                    <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}>{g.memberIds.length} {g.memberIds.length === 1 ? 'member' : 'members'}</span>
                    <button onClick={() => { setEditingNameId(g.id); setNameDraft(g.name); }} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Rename ${g.name}`}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => removeGroup(g.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove ${g.name}`}>
                      <X size={13} />
                    </button>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {showPeople.length === 0 && <span className="td-body" style={{ fontSize: 11, color: COLOR.textFaint }}>No one on {show.title} yet for this roster.</span>}
                {showPeople.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleMember(g.id, p.id)}
                    className="td-focusable"
                    style={{
                      background: g.memberIds.includes(p.id) ? COLOR.amber : 'transparent',
                      color: g.memberIds.includes(p.id) ? COLOR.void : COLOR.textMuted,
                      border: `1px solid ${g.memberIds.includes(p.id) ? COLOR.amber : COLOR.line}`,
                      borderRadius: 20,
                      padding: '3px 10px',
                      fontSize: 11,
                      fontFamily: "'Inter', sans-serif",
                      cursor: 'pointer',
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>No {PERSON_TYPES[personType].label.toLowerCase()} groups yet.</div>
      )}
    </div>
  );
}
// ---------------------------------------------------------------------------
// CALLS MODULE — the callboard. A call's slots can be filled from any
// roster (Crew, Cast, Band, Staff), not just Crew, so this now lives
// separately from crew identity/roster management.
// ---------------------------------------------------------------------------
export function CallsModule({ show, venues, calls, setCalls, rosters, currentIds, inventory, setInventory, setShows, slotOptions }) {
  const showCalls = useMemo(() => calls.filter((c) => c.showId === show.id), [calls, show.id]);
  const todayCalls = useMemo(() => showCalls.filter((c) => c.date === TODAY_STR), [showCalls]);
  const upcomingCalls = useMemo(
    () =>
      showCalls
        .filter((c) => c.date > TODAY_STR)
        .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date))),
    [showCalls]
  );

  const [editingCallId, setEditingCallId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showingGroups, setShowingGroups] = useState(false);

  function signUp(callId, slotId) {
    const call = calls.find((c) => c.id === callId);
    if (!call) return;
    const slot = call.slots.find((s) => s.id === slotId);
    if (!slot) return;
    const myId = currentIds[slot.personType];
    if (!myId) return;
    setCalls((prev) =>
      prev.map((c) => (c.id !== callId ? c : { ...c, slots: c.slots.map((s) => (s.id === slotId ? { ...s, filledBy: myId } : s)) }))
    );
    const setRoster = setterForType(slot.personType, rosters);
    if (setRoster) {
      setRoster((prev) =>
        prev.map((p) => {
          if (p.id !== myId || assignmentFor(p, call.showId)) return p;
          const newAssignment = { id: `asn-${p.id}-${call.showId}`, showId: call.showId, ...defaultAssignmentFields(slot.personType, slot.role) };
          return { ...p, assignments: [...(p.assignments || []), newAssignment] };
        })
      );
    }
  }

  function withdraw(callId, slotId) {
    setCalls((prev) =>
      prev.map((c) => {
        if (c.id !== callId) return c;
        return {
          ...c,
          slots: c.slots.map((s) => {
            if (s.id !== slotId) return s;
            const myId = currentIds[s.personType];
            return s.filledBy === myId ? { ...s, filledBy: null, attendance: 'pending' } : s;
          }),
        };
      })
    );
  }

  function setAttendance(callId, slotId, status) {
    setCalls((prev) =>
      prev.map((c) => (c.id !== callId ? c : { ...c, slots: c.slots.map((s) => (s.id === slotId ? { ...s, attendance: status } : s)) }))
    );
  }

  function addCall(call) {
    setCalls((prev) => [...prev, call]);
    setAdding(false);
  }
  function saveCall(call) {
    setCalls((prev) => prev.map((c) => (c.id === call.id ? call : c)));
    setEditingCallId(null);
  }
  function removeCall(callId) {
    setCalls((prev) => prev.filter((c) => c.id !== callId));
    setInventory((prev) => prev.map((i) => ({ ...i, assignments: (i.assignments || []).filter((a) => a.callId !== callId) })));
    if (editingCallId === callId) setEditingCallId(null);
  }

  function addSlot(callId, personType, role) {
    setCalls((prev) =>
      prev.map((c) => (c.id !== callId ? c : { ...c, slots: [...c.slots, { id: `slot-${Date.now()}`, personType, role, filledBy: null, attendance: 'pending' }] }))
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <ExportCsvButton
          filename={`${show.title}-calls`}
          rows={() =>
            showCalls.flatMap((call) =>
              (call.slots || []).map((s) => ({
                Date: call.date || '',
                Time: call.time ? formatTime12h(call.time) : '',
                Call: call.label || '',
                Location: call.location || '',
                Type: (PERSON_TYPES[s.personType] || {}).label || s.personType || '',
                Role: s.role || '',
                'Filled by': s.filledBy ? (rosterForType(s.personType, rosters).find((p) => p.id === s.filledBy) || {}).name || '' : '',
                Attendance: s.attendance || '',
              }))
            )
          }
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        {PERSON_TYPE_ORDER.map((t) => {
          const roster = rosterForType(t, rosters);
          const person = roster.find((p) => p.id === currentIds[t]);
          const TypeIcon = PERSON_TYPES[t].icon;
          return (
            <div
              key={t}
              className="td-mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10.5,
                color: person ? COLOR.textPrimary : COLOR.textFaint,
                border: `1px solid ${person ? COLOR.lineBright : COLOR.line}`,
                borderRadius: 20,
                padding: '4px 10px',
              }}
            >
              <TypeIcon size={11} strokeWidth={1.75} />
              {PERSON_TYPES[t].label}: {person ? person.name : 'not signed in'}
            </div>
          );
        })}
      </div>
      <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginBottom: 20 }}>
        Sign in on the Crew, Actors, Staff, or Musicians page to claim a slot below.
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setShowingGroups((v) => !v)}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: showingGroups ? COLOR.card : 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.lineBright}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Users size={14} /> {showingGroups ? 'Hide groups' : 'Manage groups'}
        </button>
        <button
          onClick={() => { setAdding((v) => !v); setEditingCallId(null); }}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add call
        </button>
      </div>
      {showingGroups && <GroupsPanel show={show} rosters={rosters} setShows={setShows} />}
      {adding && (
        <CallForm show={show} venues={venues} rosters={rosters} inventory={inventory} setInventory={setInventory} slotOptions={slotOptions} onSave={addCall} onCancel={() => setAdding(false)} />
      )}

      <div>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10 }}>
          TODAY'S CALLS — {show.title.toUpperCase()}
        </div>
        {todayCalls.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {todayCalls
              .slice()
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((call) =>
                editingCallId === call.id ? (
                  <CallForm key={call.id} show={show} venues={venues} rosters={rosters} inventory={inventory} setInventory={setInventory} slotOptions={slotOptions} initial={call} onSave={saveCall} onCancel={() => setEditingCallId(null)} />
                ) : (
                  <CallCard
                    key={call.id}
                    call={call}
                    show={show}
                    rosters={rosters}
                    currentIds={currentIds}
                    inventory={inventory}
                    onSignUp={signUp}
                    onWithdraw={withdraw}
                    onAddSlot={addSlot}
                    onSetAttendance={setAttendance}
                    onEdit={() => { setEditingCallId(call.id); setAdding(false); }}
                  />
                )
              )}
          </div>
        ) : (
          <div style={{ marginBottom: 24 }}>
            <StubPanel label="No calls posted for today" hint="Calls are built from the schedule. Add rehearsals, tech and performances under Schedule first, then post a call here and fill its slots from your rosters." />
          </div>
        )}
      </div>

      {upcomingCalls.length > 0 && (
        <div>
          <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10 }}>
            UPCOMING — FROM THE SCHEDULE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 30 }}>
            {upcomingCalls.map((call) =>
              editingCallId === call.id ? (
                <CallForm key={call.id} show={show} venues={venues} rosters={rosters} inventory={inventory} setInventory={setInventory} slotOptions={slotOptions} initial={call} onSave={saveCall} onCancel={() => setEditingCallId(null)} />
              ) : (
                <CallCard
                  key={call.id}
                  call={call}
                  show={show}
                  rosters={rosters}
                  currentIds={currentIds}
                  inventory={inventory}
                  onSignUp={signUp}
                  onWithdraw={withdraw}
                  onAddSlot={addSlot}
                  onSetAttendance={setAttendance}
                  onEdit={() => { setEditingCallId(call.id); setAdding(false); }}
                  showDate
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
