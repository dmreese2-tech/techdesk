import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Pencil, Plus, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { ImportCsvButton } from './csvImport.jsx';
import { cuesSpec } from './importSpecs.jsx';
import { cueCode, isDuplicateCue, nextCueNumber } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// RUN OF SHOW — the calling script, cue by cue, numbered per department.

// ---------------------------------------------------------------------------
// CUE ROW — cues call in order, the way a stage manager actually runs a
// show: only the next cue in the stack is live for a GO.
// ---------------------------------------------------------------------------
export function CueRow({ cue, cues, isNext, onFire, onSave, onRemove, onMove, isFirst, isLast, CUE_DEPTS }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cue);
  const dept = CUE_DEPTS[cue.dept];
  const Icon = dept.icon;
  const duplicate = editing && draft.num !== '' && isDuplicateCue(cues, draft.dept, draft.num, cue.id);

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

  if (editing) {
    return (
      <div style={{ padding: '12px 14px', border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, background: COLOR.panel }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1fr 2.5fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>CUE #</label>
            <input className="td-focusable" type="number" min="1" style={inputStyle} value={draft.num} onChange={(e) => setDraft({ ...draft, num: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>DEPARTMENT</label>
            <select className="td-focusable" style={inputStyle} value={draft.dept} onChange={(e) => setDraft({ ...draft, dept: e.target.value })}>
              {Object.keys(CUE_DEPTS).map((d) => (
                <option key={d} value={d}>{CUE_DEPTS[d].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>DESCRIPTION</label>
            <input className="td-focusable" style={inputStyle} value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} />
          </div>
        </div>
        {duplicate && (
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, marginBottom: 8 }}>
            {CUE_DEPTS[draft.dept]?.label} {draft.num} already exists on this cue sheet.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onSave(draft); setEditing(false); }}
            disabled={!String(draft.num).trim() || !draft.desc.trim() || duplicate}
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: cue.fired ? COLOR.panel : COLOR.card,
        border: `1px solid ${isNext ? COLOR.amber : COLOR.line}`,
        borderRadius: 4,
        padding: '10px 14px',
        opacity: cue.fired ? 0.55 : 1,
      }}
    >
      <span
        className={isNext ? 'cue-light-standby' : ''}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          flexShrink: 0,
          background: cue.fired ? COLOR.green : isNext ? COLOR.amber : COLOR.slate,
        }}
      />
      <div style={{ width: 62, flexShrink: 0 }}>
        <span className="td-mono" style={{ fontSize: 13, color: cue.fired ? COLOR.textFaint : COLOR.textPrimary }}>{cueCode(cue, CUE_DEPTS)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: 76, flexShrink: 0 }}>
        <Icon size={12} color={COLOR.textFaint} strokeWidth={1.75} />
        <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.04em' }}>{dept.label}</span>
      </div>
      <div className="td-body" style={{ flex: 1, fontSize: 13, color: cue.fired ? COLOR.textFaint : COLOR.textMuted }}>
        {cue.desc}
      </div>
      {cue.fired ? (
        <span className="td-mono" style={{ fontSize: 10, color: COLOR.green, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Check size={12} strokeWidth={2.5} /> CALLED
        </span>
      ) : isNext ? (
        <button
          onClick={onFire}
          className="td-focusable"
          style={{
            background: COLOR.amber,
            color: COLOR.void,
            border: 'none',
            borderRadius: 3,
            padding: '6px 18px',
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          GO
        </button>
      ) : (
        <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, flexShrink: 0 }}>STANDBY</span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, marginLeft: 4 }}>
        <button onClick={() => onMove(-1)} disabled={isFirst} className="td-focusable" style={{ background: 'none', border: 'none', color: isFirst ? COLOR.slateDim : COLOR.textFaint, cursor: isFirst ? 'default' : 'pointer', display: 'flex', padding: 2 }} aria-label="Move up">
          <ChevronUp size={13} />
        </button>
        <button onClick={() => onMove(1)} disabled={isLast} className="td-focusable" style={{ background: 'none', border: 'none', color: isLast ? COLOR.slateDim : COLOR.textFaint, cursor: isLast ? 'default' : 'pointer', display: 'flex', padding: 2 }} aria-label="Move down">
          <ChevronDown size={13} />
        </button>
        <button onClick={() => { setDraft(cue); setEditing(true); }} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex', padding: 2 }} aria-label={`Edit cue ${cueCode(cue, CUE_DEPTS)}`}>
          <Pencil size={13} />
        </button>
        <button onClick={onRemove} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex', padding: 2 }} aria-label={`Remove cue ${cueCode(cue, CUE_DEPTS)}`}>
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
export function NewCueForm({ cues, onAdd, onClose, CUE_DEPTS }) {
  const [dept, setDept] = useState(Object.keys(CUE_DEPTS)[0]);
  const [num, setNum] = useState(nextCueNumber(cues, Object.keys(CUE_DEPTS)[0]));
  const [desc, setDesc] = useState('');
  const duplicate = num !== '' && isDuplicateCue(cues, dept, num);

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

  function handleDeptChange(d) {
    setDept(d);
    setNum(nextCueNumber(cues, d));
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>Add cue</div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 2.5fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>DEPARTMENT</label>
          <select className="td-focusable" style={inputStyle} value={dept} onChange={(e) => handleDeptChange(e.target.value)}>
            {Object.keys(CUE_DEPTS).map((d) => (
              <option key={d} value={d}>{CUE_DEPTS[d].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>CUE #</label>
          <input className="td-focusable" type="number" min="1" style={inputStyle} value={num} onChange={(e) => setNum(e.target.value)} />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>DESCRIPTION</label>
          <input className="td-focusable" style={inputStyle} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What happens on this cue" />
        </div>
      </div>
      {duplicate && (
        <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, marginTop: 8 }}>
          {CUE_DEPTS[dept].label} {num} already exists on this cue sheet.
        </div>
      )}
      <button
        className="td-focusable"
        disabled={!String(num).trim() || !desc.trim() || duplicate}
        onClick={() => onAdd({ id: `q${Date.now()}`, num: Number(num), dept, desc: desc.trim(), fired: false })}
        style={{
          marginTop: 14,
          background: String(num).trim() && desc.trim() && !duplicate ? COLOR.amber : COLOR.slateDim,
          color: String(num).trim() && desc.trim() && !duplicate ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: String(num).trim() && desc.trim() && !duplicate ? 'pointer' : 'not-allowed',
        }}
      >
        Add to cue sheet
      </button>
    </div>
  );
}
// ---------------------------------------------------------------------------
// RUN OF SHOW MODULE
// ---------------------------------------------------------------------------
export function RunOfShowModule({ show, cueSheets, setCueSheets, CUE_DEPTS }) {
  const [showCueForm, setShowCueForm] = useState(false);
  const cues = show ? cueSheets[show.id] || [] : [];
  const firedCount = cues.filter((c) => c.fired).length;
  const nextIndex = cues.findIndex((c) => !c.fired);

  function fireCue(id) {
    setCueSheets((prev) => ({
      ...prev,
      [show.id]: (prev[show.id] || []).map((c) => (c.id === id ? { ...c, fired: true } : c)),
    }));
  }
  function resetShow() {
    setCueSheets((prev) => ({
      ...prev,
      [show.id]: (prev[show.id] || []).map((c) => ({ ...c, fired: false })),
    }));
  }
  function addCue(cue) {
    setCueSheets((prev) => ({ ...prev, [show.id]: [...(prev[show.id] || []), cue] }));
    setShowCueForm(false);
  }
  function saveCue(id, draft) {
    setCueSheets((prev) => ({
      ...prev,
      [show.id]: (prev[show.id] || []).map((c) => (c.id === id ? { ...c, num: Number(draft.num), dept: draft.dept, desc: draft.desc } : c)),
    }));
  }
  function removeCue(id) {
    setCueSheets((prev) => ({ ...prev, [show.id]: (prev[show.id] || []).filter((c) => c.id !== id) }));
  }
  function moveCue(id, direction) {
    setCueSheets((prev) => {
      const list = [...(prev[show.id] || [])];
      const idx = list.findIndex((c) => c.id === id);
      const newIdx = idx + direction;
      if (idx < 0 || newIdx < 0 || newIdx >= list.length) return prev;
      [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
      return { ...prev, [show.id]: list };
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <ImportCsvButton
          filename={`${show.title}-run-of-show`}
          columns={cuesSpec.columns}
          sample={cuesSpec.sample}
          onImport={(rows) => {
            const items = rows.map((r) => cuesSpec.build(r, { cueDepts: CUE_DEPTS }));
            setCueSheets((prev) => ({ ...prev, [show.id]: [...(prev[show.id] || []), ...items] }));
            return items.length;
          }}
        />
        <ExportCsvButton
          filename={`${show.title}-run-of-show`}
          rows={() =>
            cues.map((c) => ({
              Cue: cueCode(c, CUE_DEPTS),
              Department: (CUE_DEPTS[c.dept] || {}).label || c.dept || '',
              Number: c.num,
              Description: c.desc || '',
              Fired: c.fired ? 'yes' : 'no',
            }))
          }
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ height: 6, background: COLOR.line, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${cues.length ? (firedCount / cues.length) * 100 : 0}%`, height: '100%', background: COLOR.green, transition: 'width 0.2s ease' }} />
          </div>
          <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, marginTop: 6, letterSpacing: '0.03em' }}>
            {firedCount} OF {cues.length} CUES CALLED
          </div>
        </div>
        <button
          onClick={() => setShowCueForm((v) => !v)}
          className="td-focusable"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            color: COLOR.amber,
            border: `1px solid ${COLOR.amber}`,
            borderRadius: 3,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Plus size={14} /> Add cue
        </button>
        <button
          onClick={resetShow}
          disabled={cues.length === 0}
          className="td-focusable"
          style={{
            background: 'transparent',
            color: cues.length === 0 ? COLOR.slateDim : COLOR.textMuted,
            border: `1px solid ${COLOR.line}`,
            borderRadius: 3,
            padding: '7px 14px',
            fontSize: 11.5,
            fontWeight: 500,
            cursor: cues.length === 0 ? 'default' : 'pointer',
            flexShrink: 0,
          }}
        >
          Reset to top of show
        </button>
      </div>

      {showCueForm && <NewCueForm cues={cues} onAdd={addCue} onClose={() => setShowCueForm(false)} CUE_DEPTS={CUE_DEPTS} />}

      {cues.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cues.map((cue, i) => (
            <CueRow
              key={cue.id}
              cue={cue}
              cues={cues}
              isNext={i === nextIndex}
              onFire={() => fireCue(cue.id)}
              onSave={(draft) => saveCue(cue.id, draft)}
              onRemove={() => removeCue(cue.id)}
              onMove={(dir) => moveCue(cue.id, dir)}
              isFirst={i === 0}
              isLast={i === cues.length - 1}
              CUE_DEPTS={CUE_DEPTS}
            />
          ))}
        </div>
      ) : (
        <StubPanel label={`No cue sheet posted for ${show.title} yet — add the first cue above`} hint="Build the calling script cue by cue. Numbering is per department, so LX 1 and SND 1 run independently. Once cues exist you can place them on the page under Script." />
      )}
    </div>
  );
}
