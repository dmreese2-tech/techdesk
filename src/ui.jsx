import React from 'react';
import { ChevronRight } from 'lucide-react';
import { COLOR } from './theme.jsx';

// ---------------------------------------------------------------------------
// EMPTY PANEL — what a section shows before anything has been entered into it.
// Every module here is built and talking to Supabase, so "empty" means nobody
// has added a row yet. Say that, and say how to add one, rather than implying
// the feature is missing.
// ---------------------------------------------------------------------------
export const EMPTY_HINT =
  'Nothing here yet. Use the add button at the top right of this section to create the first entry — or open Get started on the Dashboard, which lays out the order a show gets built in so nothing has to be redone.';

export function StubPanel({ label, hint }) {
  const guidance = hint || EMPTY_HINT;
  return (
    <div
      title={guidance}
      style={{
        border: `1px dashed ${COLOR.line}`,
        borderRadius: 4,
        padding: '52px 24px',
        textAlign: 'center',
      }}
    >
      <div className="td-display" style={{ color: COLOR.textFaint, fontSize: 22, letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div
        className="td-body"
        style={{ color: COLOR.textMuted, fontSize: 13, marginTop: 10, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}
      >
        {guidance}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// COLLAPSIBLE SECTION — the header/chevron/note chrome shared by every
// top-level block in Settings, so a page that used to be one long scroll can
// be folded down to just the section names. Open/closed is the caller's
// state (usually persisted to localStorage) — this component only draws it.
//
// A section whose own panel already draws a title — Positions, My account,
// People — passes `hideHeader` to that panel so the title isn't drawn twice;
// this component becomes the one and only header for it.
// ---------------------------------------------------------------------------
export function CollapsibleSection({ icon: Icon, title, note, open, onToggle, proseWidth = 720, children }) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="td-focusable"
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <ChevronRight
          size={13}
          color={COLOR.textFaint}
          strokeWidth={2.25}
          style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' }}
        />
        {Icon && <Icon size={14} color={COLOR.textMuted} strokeWidth={1.75} style={{ flexShrink: 0 }} />}
        <span className="td-display" style={{ fontSize: 13, color: COLOR.textMuted, letterSpacing: '0.05em' }}>{title}</span>
      </button>
      {note && (
        <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textFaint, marginTop: 5, marginBottom: open ? 14 : 0, maxWidth: proseWidth, marginLeft: 20 }}>
          {note}
        </div>
      )}
      {open && children}
    </div>
  );
}
