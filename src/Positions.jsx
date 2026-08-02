import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// POSITIONS — company-level job titles for crew, band and staff, so the same
// position reads the same way on every production instead of being retyped per
// assignment. Lives in Settings, next to the other company vocabularies.
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

export function PositionsPanel({ positions, setPositions }) {
  const [drafts, setDrafts] = useState({ crew: '', musician: '', staff: '' });

  const list = (key) => (positions && positions[key]) || [];

  const add = (key) => {
    const trimmed = (drafts[key] || '').trim();
    if (!trimmed) return;
    if (list(key).some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      setDrafts((d) => ({ ...d, [key]: '' }));
      return;
    }
    setPositions({ ...positions, [key]: [...list(key), trimmed] });
    setDrafts((d) => ({ ...d, [key]: '' }));
  };

  const remove = (key, value) => {
    setPositions({ ...positions, [key]: list(key).filter((p) => p !== value) });
  };

  return (
    <div>
      <div className="td-display" style={sectionTitle}>Positions</div>
      <div className="td-body" style={sectionNote}>
        The job titles you pick from when putting someone on a show. Keeping them here means the same position reads the
        same way on every production, which is what makes the callboard and the audio plot group correctly.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {POSITION_KINDS.map(({ key, label, note, placeholder }) => (
          <div key={key} style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: 14 }}>
            <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em' }}>
              {label.toUpperCase()}
            </div>
            <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, margin: '4px 0 10px' }}>{note}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {list(key).length === 0 ? (
                <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint }}>None yet.</div>
              ) : (
                list(key).map((position) => (
                  <div key={position} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textPrimary }}>{position}</span>
                    <button
                      className="td-focusable"
                      onClick={() => remove(key, position)}
                      aria-label={`Remove ${position}`}
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
    </div>
  );
}
