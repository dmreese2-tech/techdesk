import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// CHARACTERS AND POSITIONS
//
// Two lists that everything else casts against:
//
//   Characters — per production. Hamlet exists in Hamlet, not in the company.
//                Scenes reference characters by id, so "who is in this scene"
//                and "who wears this costume" point at the same record instead
//                of at two independently typed strings.
//
//   Positions  — per company. A Deck Head is a Deck Head on every show, and
//                retyping the title per production is exactly how you end up
//                with "Deck Head", "deck head" and "Deck head" in one season.
//
// This lives in its own file rather than in TechDeskDashboard.jsx because that
// file is 9,700 lines and every edit to it is a risk. Both components take
// their data down and hand changes back up; they own no persistence.
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
// CHARACTERS — the dramatis personae for one production, and which scenes each
// one appears in. Scene membership is stored on the scene (characterIds) rather
// than on the character, so deleting a character can't leave a scene pointing
// at nothing without us noticing.
// ---------------------------------------------------------------------------
export function CharactersPanel({ show, setShows }) {
  const [name, setName] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  if (!show) return null;

  const characters = show.characters || [];
  const acts = show.acts || [];

  const patchShow = (patch) => {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, ...patch } : s)));
  };

  const addCharacter = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const exists = characters.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setName('');
      return;
    }
    patchShow({
      characters: [...characters, { id: `ch${Date.now()}`, name: trimmed, notes: '' }],
    });
    setName('');
  };

  const renameCharacter = (id, next) => {
    patchShow({ characters: characters.map((c) => (c.id === id ? { ...c, name: next } : c)) });
  };

  // Removing a character also strips it out of every scene, so no scene is left
  // referencing an id that no longer resolves to anything.
  const removeCharacter = (id) => {
    patchShow({
      characters: characters.filter((c) => c.id !== id),
      acts: acts.map((act) => ({
        ...act,
        scenes: (act.scenes || []).map((scene) => ({
          ...scene,
          characterIds: (scene.characterIds || []).filter((cid) => cid !== id),
        })),
      })),
    });
  };

  const toggleInScene = (actId, sceneId, characterId) => {
    patchShow({
      acts: acts.map((act) => {
        if (act.id !== actId) return act;
        return {
          ...act,
          scenes: (act.scenes || []).map((scene) => {
            if (scene.id !== sceneId) return scene;
            const current = scene.characterIds || [];
            return {
              ...scene,
              characterIds: current.includes(characterId)
                ? current.filter((cid) => cid !== characterId)
                : [...current, characterId],
            };
          }),
        };
      }),
    });
  };

  const sceneLabel = (scene, index) => scene.title || scene.name || scene.label || `Scene ${index + 1}`;
  const actLabel = (act, index) => act.title || act.name || act.label || `Act ${index + 1}`;

  const scenesFor = (characterId) => {
    const out = [];
    acts.forEach((act, ai) => {
      (act.scenes || []).forEach((scene, si) => {
        if ((scene.characterIds || []).includes(characterId)) {
          out.push(`${actLabel(act, ai)} · ${sceneLabel(scene, si)}`);
        }
      });
    });
    return out;
  };

  const totalScenes = acts.reduce((n, act) => n + (act.scenes || []).length, 0);

  return (
    <div style={{ background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '16px 18px', marginBottom: 20 }}>
      <div className="td-display" style={sectionTitle}>Characters</div>
      <div className="td-body" style={sectionNote}>
        The roles in {show.title}. Cast actors into these under Actors, and hang costumes and props off them
        instead of retyping names. Tick the scenes each character appears in and the rest of the app knows who is on stage when.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, maxWidth: 520 }}>
        <input
          className="td-focusable"
          style={inputStyle}
          value={name}
          placeholder="Character name, e.g. Lady Macbeth"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addCharacter();
          }}
        />
        <button className="td-focusable" onClick={addCharacter} style={smallButton(!!name.trim())} disabled={!name.trim()}>
          Add character
        </button>
      </div>

      {characters.length === 0 ? (
        <div
          title="Add the character list before casting. Actors get cast into characters, and costumes and props attach to them, so entering the list first saves relinking later."
          style={{ border: `1px dashed ${COLOR.line}`, borderRadius: 4, padding: '28px 20px', textAlign: 'center' }}
        >
          <div className="td-display" style={{ color: COLOR.textFaint, fontSize: 16, letterSpacing: '0.05em' }}>
            No characters yet
          </div>
          <div className="td-body" style={{ color: COLOR.textMuted, fontSize: 12.5, marginTop: 8, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
            Add them from the script before you cast. Actors are cast into characters, and costumes and props attach to a
            character, so the list wants to exist first.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {characters.map((character) => {
            const inScenes = scenesFor(character.id);
            const open = expandedId === character.id;
            return (
              <div key={character.id} style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    className="td-focusable"
                    style={{ ...inputStyle, flex: 1, background: 'transparent', border: 'none', padding: '2px 0' }}
                    value={character.name}
                    onChange={(e) => renameCharacter(character.id, e.target.value)}
                  />
                  <span className="td-mono" style={{ fontSize: 10, color: inScenes.length ? COLOR.textMuted : COLOR.textFaint, whiteSpace: 'nowrap' }}>
                    {inScenes.length} / {totalScenes} SCENES
                  </span>
                  <button
                    className="td-focusable"
                    onClick={() => setExpandedId(open ? null : character.id)}
                    style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}
                  >
                    {open ? 'Done' : 'Scenes'}
                  </button>
                  <button
                    className="td-focusable"
                    onClick={() => removeCharacter(character.id)}
                    style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textFaint, fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </div>

                {open && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLOR.line}` }}>
                    {totalScenes === 0 ? (
                      <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint }}>
                        No scenes to tick yet. Build the act and scene list first, then come back and mark where this character appears.
                      </div>
                    ) : (
                      acts.map((act, ai) => (
                        <div key={act.id || ai} style={{ marginBottom: 8 }}>
                          <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, marginBottom: 4 }}>
                            {actLabel(act, ai).toUpperCase()}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {(act.scenes || []).map((scene, si) => {
                              const on = (scene.characterIds || []).includes(character.id);
                              return (
                                <button
                                  key={scene.id || si}
                                  className="td-focusable"
                                  onClick={() => toggleInScene(act.id, scene.id, character.id)}
                                  style={{
                                    background: on ? COLOR.amber : 'transparent',
                                    color: on ? COLOR.void : COLOR.textMuted,
                                    border: `1px solid ${on ? COLOR.amber : COLOR.line}`,
                                    borderRadius: 3,
                                    padding: '4px 9px',
                                    fontSize: 11.5,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {sceneLabel(scene, si)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {!open && inScenes.length > 0 && (
                  <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginTop: 4 }}>
                    {inScenes.join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
