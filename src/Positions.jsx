import React, { useState } from 'react';
import { positionList } from './shared.jsx';

// ---------------------------------------------------------------------------
// POSITIONS — company-level job titles for crew, band and staff, so the same
// position reads the same way on every production instead of being retyped per
// assignment. Lives in Settings, next to the other company vocabularies.
//
// Each position now names the department it belongs to. That is what makes
// Reed 1 a Band chair and Deck Head a Stage management one without anybody
// restating it on every show — and it is the field the band sections used to
// be standing in for, before they were folded into positions under Band.
// ---------------------------------------------------------------------------

const COLOR = {
  void: '#0B0E11',
  panel: '#12161B',
  card: '#181D24',
  line: '#2A323C',
  lineBright: '#3C4A58',
  textPrimary: '#EDEFF2',
  textMuted: '#8A94A3',
  textFaint: '#5B6472',
  amber: '#E8A33D',
  green: '#4CAF60',
};

const inputStyle = {
  background: COLOR.void,
  border: `1px solid ${COLOR.line}`,
  borderRadius: 3,
  padding: '7px 9px',
  color: COLOR.textPrimary,
  fontSize: 13,
  width: '100%',
};

const sectionTitle = { fontSize: 13, color: COLOR.textPrimary, letterSpacing: '0.05em' };
const sectionNote = { fontSize: 11.5, color: COLOR.textFaint, marginTop: 4, marginBottom: 12 };

function smallButton(enabled) {
  return {
    background: enabled ? COLOR.amber : 'transparent',
    color: enabled ? COLOR.void : COLOR.textFaint,
    border: enabled ? 'none' : `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
    whiteSpace: 'nowrap',
  };
}

// ---------------------------------------------------------------------------
// POSITIONS — company-level job titles for crew, musicians and staff, so the
// same wording gets used on every show instead of being retyped per assignment.
// ---------------------------------------------------------------------------
const POSITION_KINDS = [
  { key: 'crew', label: 'Crew positions', note: 'Deck and booth jobs: Board Op, Deck Head, Fly, Spot, Wardrobe Run.', placeholder: 'e.g. Board Op' },
  { key: 'musician', label: 'Band positions', note: 'Chairs in the pit: Reed 1, Keys 2, Drums. Instruments stay in their own list.', placeholder: 'e.g. Reed 1' },
  { key: 'staff', label: 'Staff positions', note: 'Production and front-of-house roles: Stage Manager, Producer, House Manager.', placeholder: 'e.g. Stage Manager' },
];

// The department a new position is assumed to be in, when the company has one
// by that key. A band chair is in the Band; a staff role usually isn't in any
// one department until somebody says so.
const DEFAULT_DEPT_FOR_KIND = { musician: 'band' };

export function PositionsPanel({ positions, setPositions, departments = {}, departmentOrder = [], children }) {
  const [drafts, setDrafts] = useState({ crew: '', musician: '', staff: '' });

  // Always the normalised shape, whatever is actually stored.
  const list = (key) => positionList(positions && positions[key]);
  const deptKeys = departmentOrder.filter((d) => departments[d]);

  const write = (key, next) => setPositions({ ...positions, [key]: next });

  const add = (key) => {
    const trimmed = (drafts[key] || '').trim();
    if (!trimmed) return;
    if (list(key).some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setDrafts((d) => ({ ...d, [key]: '' }));
      return;
    }
    const dept = departments[DEFAULT_DEPT_FOR_KIND[key]] ? DEFAULT_DEPT_FOR_KIND[key] : '';
    write(key, [...list(key), { name: trimmed, dept }]);
    setDrafts((d) => ({ ...d, [key]: '' }));
  };

  const setDept = (key, name, dept) => {
    write(key, list(key).map((p) => (p.name === name ? { ...p, dept } : p)));
  };

  const remove = (key, name) => {
    write(key, list(key).filter((p) => p.name !== name));
  };

  return (
    <div>
      <div className="td-display" style={sectionTitle}>Positions</div>
      <div className="td-body" style={sectionNote}>
        The job titles you pick from when putting someone on a show, and the department each one belongs to. Keeping them
        here means the same position reads the same way on every production, which is what makes the callboard and the
        audio plot group correctly.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        {POSITION_KINDS.map(({ key, label, note, placeholder }) => (
          <div key={key} style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: 14 }}>
            <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em' }}>
              {label.toUpperCase()}
            </div>
            <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, margin: '4px 0 10px' }}>{note}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {list(key).length === 0 ? (
                <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint }}>None yet.</div>
              ) : (
                list(key).map((position) => (
                  <div key={position.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {position.name}
                    </span>
                    <select
                      className="td-focusable"
                      value={departments[position.dept] ? position.dept : ''}
                      onChange={(e) => setDept(key, position.name, e.target.value)}
                      aria-label={`Department for ${position.name}`}
                      title={`Which department ${position.name} belongs to`}
                      style={{
                        background: COLOR.void,
                        border: `1px solid ${COLOR.line}`,
                        borderRadius: 3,
                        color: position.dept && departments[position.dept] ? COLOR.textMuted : COLOR.textFaint,
                        fontSize: 11.5,
                        padding: '4px 6px',
                        maxWidth: 132,
                      }}
                    >
                      <option value="">No department</option>
                      {deptKeys.map((d) => (
                        <option key={d} value={d}>{departments[d].label}</option>
                      ))}
                    </select>
                    <button
                      className="td-focusable"
                      onClick={() => remove(key, position.name)}
                      aria-label={`Remove ${position.name}`}
                      style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 13, cursor: 'pointer', padding: '0 4px' }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="td-focusable"
                style={inputStyle}
                value={drafts[key]}
                placeholder={placeholder}
                onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') add(key);
                }}
              />
              <button className="td-focusable" onClick={() => add(key)} style={smallButton(!!(drafts[key] || '').trim())} disabled={!(drafts[key] || '').trim()}>
                Add
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* What each position can edit lives inside Positions, because it is the
          same subject: the job title is what grants the access. */}
      {children && <div style={{ marginTop: 26 }}>{children}</div>}
    </div>
  );
}
