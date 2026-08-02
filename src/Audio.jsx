import React, { useMemo, useState } from 'react';
import { Mic, Pencil, Plus, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { buildAudioPlot } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// AUDIO — the mic, DI and playback plot, generated from cast and band
// assignments, plus the sound effect log the caller works from.

// ---------------------------------------------------------------------------
// CHANNEL ROW — one line of the mic/channel plot, styled like the cue and
// call rows elsewhere: channel number big and mono, type tagged, detail
// muted to the right.
// ---------------------------------------------------------------------------
export function ChannelRow({ row }) {
  const typeColor = row.type === 'Mic' ? COLOR.green : row.type === 'DI' ? COLOR.amber : COLOR.blueprint;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
      <span className="td-mono" style={{ fontSize: 14, color: COLOR.amber, width: 26, flexShrink: 0 }}>{String(row.channel).padStart(2, '0')}</span>
      <span
        className="td-mono"
        style={{ fontSize: 9, color: typeColor, border: `1px solid ${typeColor}`, borderRadius: 3, padding: '2px 7px', width: 60, textAlign: 'center', flexShrink: 0, letterSpacing: '0.03em' }}
      >
        {row.type.toUpperCase()}
      </span>
      <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, flex: 1 }}>{row.name}</span>
      <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>{row.detail}</span>
      <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, width: 90, textAlign: 'right', flexShrink: 0 }}>{row.subtype}</span>
    </div>
  );
}
export function AudioSectionHeader({ label }) {
  return (
    <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10, marginTop: 26 }}>
      {label}
    </div>
  );
}
// ---------------------------------------------------------------------------
// SOUND EFFECT ROW — inline-editable, like the other roster rows.
// ---------------------------------------------------------------------------
export function SoundEffectRow({ effect, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(effect);

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
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.6fr 2fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>EFFECT</label>
            <input className="td-focusable" style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>PAGE</label>
            <input className="td-focusable" style={inputStyle} value={draft.page} onChange={(e) => setDraft({ ...draft, page: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>COMMENTS</label>
            <input className="td-focusable" style={inputStyle} value={draft.comments} onChange={(e) => setDraft({ ...draft, comments: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onSave(draft); setEditing(false); }}
            disabled={!draft.name.trim()}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 14px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
      <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.blueprint, width: 44, flexShrink: 0 }}>PG {effect.page || '—'}</span>
      <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, width: 200, flexShrink: 0 }}>{effect.name}</span>
      <span className="td-body" style={{ fontSize: 12, color: COLOR.textMuted, flex: 1 }}>{effect.comments}</span>
      <button onClick={() => { setDraft(effect); setEditing(true); }} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${effect.name}`}>
        <Pencil size={13} strokeWidth={1.75} />
      </button>
      <button onClick={() => onRemove(effect.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Remove ${effect.name}`}>
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}
export function NewSoundEffectForm({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const [page, setPage] = useState('');
  const [comments, setComments] = useState('');
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

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>Add sound effect</div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.6fr 2fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>EFFECT</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Doorbell" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>PAGE</label>
          <input className="td-focusable" style={inputStyle} value={page} onChange={(e) => setPage(e.target.value)} placeholder="12" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>COMMENTS</label>
          <input className="td-focusable" style={inputStyle} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Timing, level, notes" />
        </div>
      </div>
      <button
        className="td-focusable"
        disabled={!name.trim()}
        onClick={() => onAdd({ id: `sfx${Date.now()}`, name: name.trim(), page: page.trim(), comments: comments.trim() })}
        style={{
          marginTop: 14,
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
        Add effect
      </button>
    </div>
  );
}
// ---------------------------------------------------------------------------
// AUDIO MODULE — the show's audio profile: mic plot, channel plot, monitor
// mixes, and the sound effects log. Everything above the effects log is
// derived live from the Actors and Musicians rosters.
// ---------------------------------------------------------------------------
export function AudioModule({ show, actors, musicians, setShows, CAST_TYPE_ORDER, MUSIC_SECTIONS }) {
  const [showEffectForm, setShowEffectForm] = useState(false);
  const plot = useMemo(() => buildAudioPlot(show, actors, musicians, CAST_TYPE_ORDER, MUSIC_SECTIONS), [show, actors, musicians, CAST_TYPE_ORDER, MUSIC_SECTIONS]);
  const effects = show.soundEffects || [];

  function addEffect(effect) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, soundEffects: [...(s.soundEffects || []), effect] } : s)));
    setShowEffectForm(false);
  }
  function saveEffect(updated) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, soundEffects: (s.soundEffects || []).map((e) => (e.id === updated.id ? updated : e)) } : s)));
  }
  function removeEffect(id) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, soundEffects: (s.soundEffects || []).filter((e) => e.id !== id) } : s)));
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{plot.micChannels.length}</strong> mic'd
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{plot.diChannels.length}</strong> DI / electric
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{plot.monitorMixes.length}</strong> monitor mixes
        </span>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{effects.length}</strong> sound effects
        </span>
      </div>

      <AudioSectionHeader label="MIC PLOT" />
      {plot.micChannels.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plot.micChannels.map((row) => (
            <ChannelRow key={row.channel} row={row} />
          ))}
        </div>
      ) : (
        <StubPanel label="No one on the cast is mic'd yet" hint="Mic assignments come from the cast. Assign actors to this show under Actors and give each one a mic channel, and this plot fills itself in." />
      )}

      <AudioSectionHeader label="AUDIO CHANNEL PLOT" />
      {plot.all.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plot.all.map((row) => (
            <ChannelRow key={`${row.type}-${row.channel}`} row={row} />
          ))}
        </div>
      ) : (
        <StubPanel label="No channels assigned yet" hint="Channels are generated from cast and band assignments. Assign your actors and musicians to this show first, then set each one's mic, DI or playback channel." />
      )}

      <AudioSectionHeader label="MONITOR MIXES" />
      {plot.monitorMixes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plot.monitorMixes.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
              <span className="td-mono" style={{ fontSize: 13, color: COLOR.amber, width: 60 }}>MIX {i + 1}</span>
              <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, flex: 1 }}>{m.name}</span>
              <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>{m.roleTitle}</span>
            </div>
          ))}
        </div>
      ) : (
        <StubPanel label="No one needs their own monitor mix yet" hint="Flag a performer as needing their own monitor mix on their show assignment and they will appear here with that mix." />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 10 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em' }}>SOUND EFFECTS</div>
        <button
          onClick={() => setShowEffectForm((v) => !v)}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add effect
        </button>
      </div>

      {showEffectForm && <NewSoundEffectForm onAdd={addEffect} onClose={() => setShowEffectForm(false)} />}

      {effects.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {effects.map((e) => (
            <SoundEffectRow key={e.id} effect={e} onSave={saveEffect} onRemove={removeEffect} />
          ))}
        </div>
      ) : (
        <StubPanel label="No sound effects logged for this production yet" hint="Log sound effects here, then place them as SND cues on the Run of Show so the caller has them in running order." />
      )}
    </div>
  );
}
