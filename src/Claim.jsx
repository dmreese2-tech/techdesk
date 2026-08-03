import React, { useEffect, useState } from 'react';
import { UserCheck, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { supabase } from './supabaseClient.js';

// ---------------------------------------------------------------------------
// IDENTITY CLAIM
//
// An account and a person on the company roster are two different things. This
// is how they become one: if you signed up with an address that matches
// somebody nobody has claimed yet, the app asks whether that's you, and an
// admin confirms it before anything is attached.
//
// The confirmation isn't ceremony. Once positions grant edit access, a link
// made on an unverified claim is a permission handed to whoever typed the
// address into the roster.
// ---------------------------------------------------------------------------

const DISMISS_KEY = 'td-claim-dismissed';

function wasDismissed(orgId) {
  try {
    return window.localStorage.getItem(`${DISMISS_KEY}-${orgId}`) === '1';
  } catch {
    return false;
  }
}

export function ClaimBanner({ orgId }) {
  // 'checking' | 'none' | 'offer' | 'pending'
  const [state, setState] = useState('checking');
  const [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!orgId) return undefined;

    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const me = userData?.user?.id;
      if (!me) return;

      // Already on the roster? Then there's nothing to ask.
      const { data: linked } = await supabase
        .from('people')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', me)
        .maybeSingle();
      if (cancelled) return;
      if (linked) {
        setState('none');
        return;
      }

      const { data: open } = await supabase
        .from('person_claims')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', me)
        .eq('status', 'pending');
      if (cancelled) return;
      if (open && open.length > 0) {
        setState('pending');
        return;
      }

      if (wasDismissed(orgId)) {
        setState('none');
        return;
      }

      // rpc fails harmlessly if 04-accounts-and-identity.sql hasn't run yet.
      const { data: found } = await supabase.rpc('my_claim_candidates', { check_org_id: orgId });
      if (cancelled) return;
      if (found && found.length > 0) {
        setCandidates(found);
        setState('offer');
      } else {
        setState('none');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const claim = async (person) => {
    setBusy(true);
    setError('');
    const { data: userData } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('person_claims').insert({
      org_id: orgId,
      person_id: person.id,
      user_id: userData?.user?.id,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setState('pending');
  };

  const dismiss = () => {
    try {
      window.localStorage.setItem(`${DISMISS_KEY}-${orgId}`, '1');
    } catch {
      /* a browser that won't remember is not worth failing over */
    }
    setState('none');
  };

  if (state === 'checking' || state === 'none') return null;

  const bar = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '9px 14px',
    background: COLOR.card,
    borderBottom: `1px solid ${state === 'pending' ? COLOR.line : COLOR.amber}`,
    flexWrap: 'wrap',
  };

  if (state === 'pending') {
    return (
      <div style={bar}>
        <UserCheck size={14} color={COLOR.textMuted} />
        <span className="td-body" style={{ flex: 1, fontSize: 12.5, color: COLOR.textMuted, minWidth: 200 }}>
          Waiting for an admin to confirm who you are on the company roster. Nothing changes for you until they do.
        </span>
      </div>
    );
  }

  return (
    <div style={bar}>
      <UserCheck size={14} color={COLOR.amber} />
      <span className="td-body" style={{ flex: 1, fontSize: 12.5, color: COLOR.textPrimary, minWidth: 220 }}>
        {candidates.length === 1 ? (
          <>You appear on the company roster as <strong>{candidates[0].name}</strong>. Is that you?</>
        ) : (
          <>Someone on the company roster shares your email address. Which one are you?</>
        )}
      </span>
      {candidates.map((p) => (
        <button
          key={p.id}
          onClick={() => claim(p)}
          disabled={busy}
          className="td-focusable"
          style={{ background: COLOR.amber, border: 'none', borderRadius: 3, color: COLOR.void, fontSize: 11.5, padding: '5px 12px', cursor: busy ? 'default' : 'pointer' }}
        >
          {candidates.length === 1 ? "Yes, that's me" : p.name}
        </button>
      ))}
      <button
        onClick={dismiss}
        className="td-focusable"
        title="Not me — don't ask again"
        style={{ background: 'transparent', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
      >
        <X size={14} />
      </button>
      {error && (
        <span className="td-body" style={{ fontSize: 12, color: COLOR.amber, width: '100%' }}>{error}</span>
      )}
    </div>
  );
}
