import React, { useEffect, useState } from 'react';
import { ExternalLink, HelpCircle, MessageSquare, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { supabase } from './supabaseClient.js';
import appMark from './assets/upstage-mark.png';

// ---------------------------------------------------------------------------
// TOP BAR
//
// The band above everything: who you are (app + company), the way back out to
// the rest of upstage.systems, and the two things people reach for when the
// app doesn't explain itself — Help, and a way to tell us it's wrong.
//
// Feedback opens the user's mail client rather than posting anywhere. That
// keeps it honest: there's no inbox in this app, so a form that looked like it
// filed a ticket would be lying about where the message went.
// ---------------------------------------------------------------------------

const FEEDBACK_TO = 'dmreese2@live.com';
const PORTAL_URL = 'https://apps.upstage.systems';

const linkStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: 'transparent',
  border: 'none',
  color: COLOR.textMuted,
  fontSize: 12,
  cursor: 'pointer',
  padding: '6px 8px',
  borderRadius: 3,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

function Panel({ title, onClose, children }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 80, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="td-scrollbar"
        style={{ background: COLOR.panel, border: `1px solid ${COLOR.lineBright}`, borderRadius: 6, padding: 22, width: '100%', maxWidth: 680, maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="td-display" style={{ fontSize: 16, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>{title}</div>
          <button onClick={onClose} className="td-focusable" aria-label="Close" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const HELP_SECTIONS = [
  {
    heading: 'The order a show gets built',
    body: 'Get started on the Dashboard lists it, and each step links to the section that does it. The order matters: scenes and characters come before anything that references them, the schedule comes before calls, and casting comes before the audio plot.',
  },
  {
    heading: 'Company lists versus show lists',
    body: 'Crew, Actors, Musicians and Staff are company-wide — add a person once and assign them to whichever productions they work on. Characters belong to a single production. Positions (Settings) are company-wide job titles, so the same wording is used on every show.',
  },
  {
    heading: 'Everything is shared',
    body: 'All production data lives in your company database and syncs to everyone signed in. The only things kept per device are which show you are looking at and which identity you signed in as at the callboard.',
  },
  {
    heading: 'Exporting',
    body: 'Every section has an Export CSV button that downloads exactly what you are looking at, ready for a spreadsheet, a producer, or a shop.',
  },
  {
    heading: 'On a phone',
    body: 'The menu collapses behind the button next to the section title. On a desktop you can shrink it to icons with the arrow beside the Tech Desk wordmark.',
  },
];

export function TopBar({ orgId, section, orgLogo }) {
  const [orgName, setOrgName] = useState('');
  const [help, setHelp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!orgId) return undefined;
    supabase
      .from('orgs')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setOrgName(data.name || '');
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Prefill what we already know, so a reply doesn't start with "which show?"
  const feedbackHref = `mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(
    `Tech Desk feedback${orgName ? ` — ${orgName}` : ''}`
  )}&body=${encodeURIComponent(
    `\n\n---\nCompany: ${orgName || orgId || 'unknown'}\nSection: ${section || 'unknown'}\nPage: ${typeof window !== 'undefined' ? window.location.href : ''}\n`
  )}`;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '0 14px',
          height: 44,
          background: COLOR.panel,
          borderBottom: `1px solid ${COLOR.line}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <img
            src={appMark}
            alt="upstage.systems"
            width={24}
            height={24}
            style={{ width: 24, height: 24, borderRadius: 4, flexShrink: 0, display: 'block' }}
          />
          <span className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.08em' }}>Tech Desk</span>
          {(orgName || orgLogo) && (
            <>
              <span style={{ color: COLOR.line }}>|</span>
              {/* The company's own mark, if they've uploaded one. It sits beside
                  the app mark rather than replacing it — this is Tech Desk, run
                  by them, and the bar should say both. */}
              {orgLogo && (
                <img
                  src={orgLogo}
                  alt={orgName ? `${orgName} logo` : 'Company logo'}
                  style={{ height: 22, maxWidth: 96, width: 'auto', objectFit: 'contain', flexShrink: 0, display: 'block', borderRadius: 3 }}
                />
              )}
              {orgName && (
                <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orgName}</span>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button onClick={() => setHelp(true)} className="td-focusable" style={linkStyle} title="How this app is meant to be used">
            <HelpCircle size={14} />
            <span>Help</span>
          </button>
          <a href={feedbackHref} className="td-focusable" style={linkStyle} title={`Email ${FEEDBACK_TO}`}>
            <MessageSquare size={14} />
            <span>Questions &amp; Feedback</span>
          </a>
          <a href={PORTAL_URL} className="td-focusable" style={linkStyle} title="Back to apps.upstage.systems">
            <ExternalLink size={14} />
            <span>All apps</span>
          </a>
        </div>
      </div>

      {help && (
        <Panel title="Help" onClose={() => setHelp(false)}>
          {HELP_SECTIONS.map((s) => (
            <div key={s.heading} style={{ marginBottom: 16 }}>
              <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.blueprint, letterSpacing: '0.08em', marginBottom: 5 }}>{s.heading.toUpperCase()}</div>
              <div className="td-body" style={{ fontSize: 13, color: COLOR.textMuted, lineHeight: 1.55 }}>{s.body}</div>
            </div>
          ))}
          <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, borderTop: `1px solid ${COLOR.line}`, paddingTop: 12 }}>
            Still stuck, or something here is wrong? Use Questions &amp; Feedback in the bar above — it opens an email with the company and section already filled in.
          </div>
        </Panel>
      )}
    </>
  );
}
