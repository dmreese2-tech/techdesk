import React from 'react';
import { Eye, Lock } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { MODULE_LABELS } from './permissions.js';

// ---------------------------------------------------------------------------
// READ-ONLY GATE
//
// The database already refuses writes you aren't entitled to. This is the part
// that stops you finding out the hard way — by typing for ten minutes into a
// form that was never going to save.
//
// It hides nothing. Everyone on staff reads the whole company, and a props
// master who can see the schedule without editing it is better off than one
// who can't see it at all. What it does is take away the controls and say why.
//
// Export stays live on purpose: reading a section and taking a copy of it to
// the shop are the same permission, and refusing the second would be theatre.
// ---------------------------------------------------------------------------

// Which permission each section of the app answers to. Sections not listed
// here are either always readable (the dashboard) or gated elsewhere
// (settings, which is admin-only and checked separately).
export const SECTION_MODULE = {
  schedule: 'schedule',
  scenes: 'scenes',
  characters: 'characters',
  crew: 'crew',
  actors: 'actors',
  musicians: 'musicians',
  staff: 'staff',
  choreography: 'choreography',
  costumes: 'costumes',
  props: 'props',
  calls: 'calls',
  audio: 'audio',
  set: 'set',
  runofshow: 'runofshow',
  script: 'script',
};

// Why you can't edit this, in the words of the thing that decided.
function reasonFor(module) {
  const label = MODULE_LABELS[module] || module;
  return `${label} is granted by position. Whoever runs ${label.toLowerCase()} on this production can edit it — ask an admin to assign you, or to grant it to you directly in Settings.`;
}

export function ReadOnlyBanner({ module, admin }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: COLOR.card,
        border: `1px solid ${COLOR.line}`,
        borderLeft: `3px solid ${COLOR.blueprint}`,
        borderRadius: 4,
        padding: '10px 14px',
        marginBottom: 16,
      }}
    >
      <Eye size={15} color={COLOR.blueprint} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.blueprint, letterSpacing: '0.08em', marginBottom: 3 }}>
          READ ONLY
        </div>
        <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, lineHeight: 1.55 }}>
          {admin ? 'Settings are admin-only.' : reasonFor(module)}
        </div>
      </div>
    </div>
  );
}

// Everything inside stops responding to the mouse, and looks like it.
//
// A disabled <fieldset> would be the stronger tool — it takes the controls out
// of the keyboard's reach too — but it disables *every* descendant, and that
// includes the export button. Reading a section and handing a copy to the shop
// are the same permission; refusing the second while allowing the first would
// be theatre. So: pointer-events, with links and export explicitly let back
// through.
//
// The gap this leaves is a keyboard user tabbing into a field they can't save.
// It is a real gap and it is the safe kind: the database still refuses, and the
// toast now says so out loud instead of swallowing it.
export function ReadOnlyGate({ writable, module, admin, children }) {
  if (writable) return children;

  return (
    <>
      <style>{'.td-readonly a, .td-readonly .td-export { pointer-events: auto; }'}</style>
      <ReadOnlyBanner module={module} admin={admin} />
      <div className="td-readonly" style={{ pointerEvents: 'none', opacity: 0.78 }}>
        {children}
      </div>
    </>
  );
}

// A write the database refused. The debounced save has no idea which control
// the person was touching by the time it fails, so this says what it can:
// which section, and that it wasn't their mistake.
export function PermissionDeniedToast({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: COLOR.panel,
        border: `1px solid ${COLOR.amber}`,
        borderRadius: 4,
        padding: '10px 16px',
        zIndex: 90,
        maxWidth: 520,
      }}
    >
      <Lock size={14} color={COLOR.amber} style={{ flexShrink: 0 }} />
      <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textPrimary }}>{message}</span>
      <button
        onClick={onDismiss}
        className="td-focusable"
        style={{ background: 'transparent', border: 'none', color: COLOR.textFaint, cursor: 'pointer', fontSize: 12 }}
      >
        Dismiss
      </button>
    </div>
  );
}
