import React from 'react';
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
