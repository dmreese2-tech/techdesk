import React from 'react';
import { CalendarOff, LogOut } from 'lucide-react';
import { COLOR, FONTS } from './theme.jsx';

// ---------------------------------------------------------------------------
// NO PRODUCTIONS
//
// What you see when you've been taken off every show. Your account still
// works — you sign in, you're still a member of the company — but there is
// nothing you're assigned to, so there is nothing to show you.
//
// This replaces the whole app rather than sitting inside it. A sidebar full of
// sections that are all empty invites you to click seventeen times looking for
// your call time; one page that says why is kinder and shorter.
//
// It is deliberately narrow. Only someone linked to a roster entry with no
// assignments sees it. An admin never does, and neither does anyone whose
// account isn't linked to a person yet — locking those people out would be
// this screen doing far more than it was asked to.
// ---------------------------------------------------------------------------

export function NoProductions({ personName, orgName, onSignOut }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLOR.void,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {FONTS}
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 46,
            height: 46,
            borderRadius: 4,
            border: `1px solid ${COLOR.line}`,
            marginBottom: 18,
          }}
        >
          <CalendarOff size={20} color={COLOR.textMuted} strokeWidth={1.5} />
        </div>

        <h1 className="td-display" style={{ fontSize: 22, color: COLOR.textPrimary, letterSpacing: '0.04em', margin: '0 0 12px' }}>
          NO PRODUCTIONS RIGHT NOW
        </h1>

        <p className="td-body" style={{ fontSize: 13.5, color: COLOR.textMuted, lineHeight: 1.6, margin: '0 0 10px' }}>
          {personName ? <>You're still on the {orgName || 'company'} roster as <strong style={{ color: COLOR.textPrimary }}>{personName}</strong>, but</> : <>You're still a member of {orgName || 'this company'}, but</>}
          {' '}you aren't assigned to any show at the moment, so there's nothing here to show you.
        </p>

        <p className="td-body" style={{ fontSize: 13, color: COLOR.textFaint, lineHeight: 1.6, margin: '0 0 26px' }}>
          When you're cast or crewed on the next production, this fills itself in — your calls,
          your scenes and the schedule, all waiting when you sign in. Nothing to do until then.
        </p>

        <button
          onClick={onSignOut}
          className="td-focusable"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            background: 'transparent',
            color: COLOR.textMuted,
            border: `1px solid ${COLOR.line}`,
            borderRadius: 3,
            padding: '8px 16px',
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </div>
  );
}
