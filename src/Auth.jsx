import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient.js';

const COLOR = {
  void: '#0B0E11', panel: '#12161B', card: '#181D24', line: '#2A323C', lineBright: '#3C4A58',
  textPrimary: '#EDEFF2', textMuted: '#8A94A3', textFaint: '#5B6472', amber: '#E8A33D', red: '#C4553E',
};

const inputStyle = { background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '10px 12px', color: COLOR.textPrimary, fontSize: 14, width: '100%' };
const buttonStyle = { background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%' };

/**
 * Gates the whole app: renders sign-in/sign-up until there's a session,
 * then (still inside this gate) makes sure that user belongs to at least
 * one org before handing control to the real app. Calls onReady(orgId)
 * once both are true.
 */
export default function Auth({ onReady, forcePicker = false }) {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [orgs, setOrgs] = useState(null); // null = loading, [] = none yet
  const [orgMode, setOrgMode] = useState('create'); // 'create' | 'join'
  const [newOrgName, setNewOrgName] = useState('');
  const [joinOrgId, setJoinOrgId] = useState('');
  // Set when you're adding a company from the picker rather than because you
  // don't belong to one yet — it swaps the picker for the create/join forms.
  const [addMode, setAddMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from('org_members')
        .select('org_id, role, orgs(name)')
        .eq('user_id', session.user.id);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        return;
      }
      const list = (data || []).map((row) => ({ id: row.org_id, name: row.orgs?.name || 'Untitled company', role: row.role }));
      setOrgs(list);
      if (list.length === 1 && !forcePicker) onReady(list[0].id);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function handleAuth(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateOrg(e) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setError('');
    setBusy(true);
    try {
      // getSession() only reads what's cached locally and can look valid
      // even when Supabase's server would reject it. getUser() actually
      // round-trips to confirm the session is still genuinely good right
      // now, immediately before the write that depends on it.
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        throw new Error('Your session isn\u2019t valid anymore — sign out and sign back in, then try again.');
      }
      // One call to a SECURITY DEFINER function that creates the org and the
      // admin membership together — see supabase/schema.sql. This can't be two
      // client-side inserts: `.select()` on the org insert makes Postgres apply
      // the table's SELECT policy (is_org_member) to the brand-new row, and you
      // aren't a member yet at that instant, so RLS rejects it with a message
      // that blames the INSERT policy. Doing both writes server-side also means
      // a company can never end up existing with nobody able to see it.
      const { data, error: orgErr } = await supabase.rpc('create_org', { org_name: newOrgName.trim() });
      if (orgErr) throw orgErr;
      const org = Array.isArray(data) ? data[0] : data;
      if (!org?.id) throw new Error('Company was not created — please try again.');
      onReady(org.id);
    } catch (err) {
      setError(err.message || 'Could not create the company.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinOrg(e) {
    e.preventDefault();
    if (!joinOrgId.trim()) return;
    setError('');
    setBusy(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        throw new Error('Your session isn\u2019t valid anymore — sign out and sign back in, then try again.');
      }
      const { error: memErr } = await supabase.from('org_members').insert({ org_id: joinOrgId.trim(), user_id: userData.user.id, role: 'member' });
      if (memErr) throw memErr;
      onReady(joinOrgId.trim());
    } catch (err) {
      setError(err.message && err.message.includes('valid') ? err.message : 'Could not join — check the company ID with your TD.');
    } finally {
      setBusy(false);
    }
  }

  const wrap = (children) => (
    <div style={{ minHeight: '100vh', background: COLOR.void, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ fontSize: 11, color: COLOR.amber, letterSpacing: '0.1em', textAlign: 'center', marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>TECH DESK</div>
        {children}
        {error && <div style={{ color: COLOR.red, fontSize: 12.5, marginTop: 12, textAlign: 'center' }}>{error}</div>}
      </div>
    </div>
  );

  if (session === undefined) return wrap(<div style={{ color: COLOR.textFaint, textAlign: 'center', fontSize: 12 }}>Loading…</div>);

  if (!session) {
    return wrap(
      <form onSubmit={handleAuth} style={{ background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: 6, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <button type="button" onClick={() => setMode('signin')} style={{ flex: 1, background: mode === 'signin' ? COLOR.card : 'transparent', color: mode === 'signin' ? COLOR.textPrimary : COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 0', fontSize: 12.5, cursor: 'pointer' }}>Sign in</button>
          <button type="button" onClick={() => setMode('signup')} style={{ flex: 1, background: mode === 'signup' ? COLOR.card : 'transparent', color: mode === 'signup' ? COLOR.textPrimary : COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 0', fontSize: 12.5, cursor: 'pointer' }}>Create account</button>
        </div>
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        {mode === 'signup' && (
          <div style={{ color: COLOR.textFaint, fontSize: 11, textAlign: 'center' }}>
            Depending on your project's auth settings, you may need to confirm your email before signing in.
          </div>
        )}
      </form>
    );
  }

  if (orgs === null) return wrap(<div style={{ color: COLOR.textFaint, textAlign: 'center', fontSize: 12 }}>Loading your companies…</div>);

  if (orgs.length === 0 || addMode) {
    return wrap(
      <div style={{ background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: 6, padding: 24 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => setOrgMode('create')} style={{ flex: 1, background: orgMode === 'create' ? COLOR.card : 'transparent', color: orgMode === 'create' ? COLOR.textPrimary : COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 0', fontSize: 12.5, cursor: 'pointer' }}>New company</button>
          <button type="button" onClick={() => setOrgMode('join')} style={{ flex: 1, background: orgMode === 'join' ? COLOR.card : 'transparent', color: orgMode === 'join' ? COLOR.textPrimary : COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 0', fontSize: 12.5, cursor: 'pointer' }}>Join existing</button>
        </div>
        {orgMode === 'create' ? (
          <form onSubmit={handleCreateOrg} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ color: COLOR.textFaint, fontSize: 12 }}>Name your company or venue. You'll be its first admin.</div>
            <input required placeholder="e.g. Riverside Community Theatre" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} style={inputStyle} />
            <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>{busy ? 'Creating…' : 'Create company'}</button>
          </form>
        ) : (
          <form onSubmit={handleJoinOrg} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ color: COLOR.textFaint, fontSize: 12 }}>Ask your TD or another admin for your company's ID (Settings → Company) and paste it here.</div>
            <input required placeholder="Company ID" value={joinOrgId} onChange={(e) => setJoinOrgId(e.target.value)} style={inputStyle} />
            <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>{busy ? 'Joining…' : 'Join company'}</button>
          </form>
        )}
        {addMode && (
          <button
            type="button"
            onClick={() => setAddMode(false)}
            style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, marginTop: 16, cursor: 'pointer', textDecoration: 'underline', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
          >
            Back to your companies
          </button>
        )}
        <button type="button" onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, marginTop: 16, cursor: 'pointer', textDecoration: 'underline', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
          Sign out
        </button>
      </div>
    );
  }

  // Two or more companies — or you arrived here from "Change company" — so
  // pick one, or go add another.
  return wrap(
    <div style={{ background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: 6, padding: 24 }}>
      <div style={{ color: COLOR.textFaint, fontSize: 12, marginBottom: 14 }}>Which company are you working with?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {orgs.map((org) => (
          <button key={org.id} onClick={() => onReady(org.id)} style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '10px 14px', color: COLOR.textPrimary, fontSize: 13, textAlign: 'left', cursor: 'pointer' }}>
            {org.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => { setOrgMode('create'); setAddMode(true); }}
        style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, marginTop: 16, cursor: 'pointer', textDecoration: 'underline', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
      >
        Join or start another company
      </button>
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, marginTop: 10, cursor: 'pointer', textDecoration: 'underline', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
      >
        Sign out
      </button>
    </div>
  );
}
