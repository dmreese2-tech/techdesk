import React, { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Drama, Bell, Box, Boxes, Briefcase, Building2, CalendarDays, ChevronDown, Clapperboard, FileText, Footprints, LayoutGrid, ListChecks, LogOut, Music, Package, Radio, Settings, Shirt, Star, Users } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { supabase } from './supabaseClient.js';
import { STATUS_META, byName } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// SHELL — the frame around every section: sidebar rail, show switcher, house
// clock, the members panel in Settings, and the no-show-selected gate.

// Tiers decide what someone can see. What they can *edit* comes later, from
// the positions they hold — see docs/permissions.md.
const TIER_META = {
  admin: { label: 'Admin', note: 'Everything, plus the roster and Settings.' },
  staff: { label: 'Staff', note: 'Reads the whole company. Edits what their positions allow.' },
  cast: { label: 'Cast', note: 'Reads only what concerns them. Edits nothing.' },
};

export function MembersPanel({ orgId, sectionTitle, sectionNote }) {
  const [members, setMembers] = useState(null);
  const [claims, setClaims] = useState([]);
  const [unclaimed, setUnclaimed] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    const { data: userData } = await supabase.auth.getUser();
    setMe(userData?.user?.id || null);
    const { data, error: err } = await supabase.rpc('org_members_list', { check_org_id: orgId });
    if (err) {
      setError(err.message);
      return;
    }
    setError('');
    setMembers(data || []);
    // Admin-only, and it fails harmlessly for everyone else.
    const { data: claimData } = await supabase.rpc('org_pending_claims', { check_org_id: orgId });
    setClaims(claimData || []);
    const { data: freeData } = await supabase.rpc('org_unclaimed_people', { check_org_id: orgId });
    setUnclaimed(freeData || []);
    // Directors and producers manage the roster without being admins, so
    // linking is gated on this and tier changes are not.
    const { data: manage } = await supabase.rpc('can_manage_roster', { check_org_id: orgId });
    setCanManage(!!manage);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // `tier` arrives with 04-accounts-and-identity.sql; until that has run, fall
  // back to the old admin/member role so this panel still works.
  const tierOf = (m) => m.tier || (m.role === 'admin' ? 'admin' : 'staff');
  // Sorted by the name you would look someone up under, falling back to the
  // address for an account nobody has linked yet. The RPC returns them by join
  // date, which is the one order nobody scans a roster in.
  const sortedMembers = members && [...members].sort((a, b) => byName(a.person_name || a.email, b.person_name || b.email));
  const admins = (members || []).filter((m) => tierOf(m) === 'admin');
  const iAmAdmin = !!members && members.some((m) => m.user_id === me && tierOf(m) === 'admin');

  const changeTier = async (member, tier) => {
    setBusyId(member.user_id);
    const { error: err } = await supabase.from('org_members').update({ tier }).eq('org_id', orgId).eq('user_id', member.user_id);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  };

  const decideClaim = async (claim, approve) => {
    setBusyId(claim.id);
    const { error: err } = await supabase.rpc('decide_person_claim', { claim_id: claim.id, approve });
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  };

  // Waiting for someone to claim themselves is the right default for a cast of
  // forty. It is the wrong one for the four people sitting in the room with
  // you, so an admin can just say who is who.
  const linkTo = async (member, personId) => {
    if (!personId) return;
    setBusyId(member.user_id);
    const { error: err } = await supabase
      .from('people')
      .update({ user_id: member.user_id })
      .eq('org_id', orgId)
      .eq('id', personId);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  };

  const unlink = async (member) => {
    setBusyId(member.user_id);
    const { error: err } = await supabase.from('people').update({ user_id: null }).eq('org_id', orgId).eq('user_id', member.user_id);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  };

  const removeMember = async (member) => {
    setBusyId(member.user_id);
    const { error: err } = await supabase.from('org_members').delete().eq('org_id', orgId).eq('user_id', member.user_id);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Users size={14} color={COLOR.textMuted} strokeWidth={1.75} />
        <span className="td-display" style={sectionTitle}>People</span>
      </div>
      <div className="td-body" style={sectionNote}>
        Accounts, and which roster person each one is. The rosters under Crew, Actors, Musicians and Staff are a different list — those are people you schedule, not people who sign in.
      </div>

      {error && (
        <div className="td-body" style={{ ...sectionNote, color: COLOR.amber }}>{error}</div>
      )}

      {/* Claims waiting on an admin. Approving one is what actually attaches an
          account to a person on the roster, so it sits above the list. */}
      {canManage && claims.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.amber, letterSpacing: '0.08em', marginBottom: 6 }}>
            {claims.length} IDENTITY {claims.length === 1 ? 'CLAIM' : 'CLAIMS'} WAITING
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 720 }}>
            {claims.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: COLOR.card, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '8px 10px' }}>
                <span className="td-body" style={{ flex: 1, fontSize: 12.5, color: COLOR.textPrimary }}>
                  {c.email} says they are <strong>{c.person_name}</strong>
                  <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint }}> {String(c.person_kind || '').toUpperCase()}</span>
                </span>
                <button
                  className="td-focusable"
                  disabled={busyId === c.id}
                  onClick={() => decideClaim(c, true)}
                  style={{ background: COLOR.amber, border: 'none', borderRadius: 3, color: COLOR.void, fontSize: 11.5, padding: '5px 12px', cursor: 'pointer' }}
                >
                  Confirm
                </button>
                <button
                  className="td-focusable"
                  disabled={busyId === c.id}
                  onClick={() => decideClaim(c, false)}
                  style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, fontSize: 11.5, padding: '5px 12px', cursor: 'pointer' }}
                >
                  Reject
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {members === null ? (
        <div className="td-body" style={sectionNote}>Loading…</div>
      ) : members.length === 0 ? (
        <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textFaint }}>Nobody has an account yet.</div>
      ) : (
        // A table, because this is five facts about each of the same kind of
        // thing and the eye wants to read down a column — "who has not been
        // linked yet" is a glance, not a hunt through stacked cards.
        <div style={{ overflowX: 'auto', border: `1px solid ${COLOR.line}`, borderRadius: 4, maxWidth: 1040 }}>
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Email', 'Joined', 'Type', ''].map((h, i) => (
                  <th
                    key={h || `a${i}`}
                    className="td-mono"
                    style={{
                      textAlign: i === 4 ? 'right' : 'left',
                      fontSize: 9.5,
                      fontWeight: 400,
                      color: COLOR.textFaint,
                      letterSpacing: '0.08em',
                      padding: '9px 10px',
                      borderBottom: `1px solid ${COLOR.line}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((m, rowIndex) => {
                const isMe = m.user_id === me;
                const tier = tierOf(m);
                const lastAdmin = tier === 'admin' && admins.length === 1;
                const cell = {
                  padding: '9px 10px',
                  borderTop: rowIndex === 0 ? 'none' : `1px solid ${COLOR.line}`,
                  verticalAlign: 'middle',
                };
                return (
                  <tr key={m.user_id} style={{ opacity: busyId === m.user_id ? 0.55 : 1 }}>
                    <td style={{ ...cell, maxWidth: 132 }}>
                      {m.person_name ? (
                        <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textPrimary, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.person_name}>
                          {m.person_name}
                        </span>
                      ) : (
                        // Not an error — the claim flow needed an email field
                        // only Crew had, so whole rooms of people sat here.
                        // It is a row that wants an action, not a fault.
                        <span className="td-mono" style={{ fontSize: 10, color: COLOR.amberDim }} title="No roster person is attached to this account yet. Until one is, their positions grant nothing.">
                          NOT LINKED
                        </span>
                      )}
                      {isMe && <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint }}> YOU</span>}
                    </td>

                    <td style={{ ...cell, maxWidth: 176 }}>
                      <span className="td-body" style={{ fontSize: 12, color: COLOR.textMuted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.email}>
                        {m.email}
                      </span>
                    </td>

                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint }}>
                        {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
                      </span>
                    </td>

                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      {iAmAdmin ? (
                        <select
                          className="td-focusable"
                          value={tier}
                          disabled={busyId === m.user_id || lastAdmin}
                          onChange={(e) => changeTier(m, e.target.value)}
                          title={lastAdmin ? 'The last admin cannot be demoted — promote someone else first.' : TIER_META[tier]?.note}
                          aria-label={`Account type for ${m.email}`}
                          style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textPrimary, fontSize: 11.5, padding: '4px 6px' }}
                        >
                          <option value="admin">Admin</option>
                          <option value="staff">Staff</option>
                          <option value="cast">Cast</option>
                        </select>
                      ) : (
                        <span className="td-mono" style={{ fontSize: 10, color: COLOR.textMuted }}>
                          {TIER_META[tier]?.label.toUpperCase() || tier.toUpperCase()}
                        </span>
                      )}
                    </td>

                    <td style={{ ...cell, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {canManage && !m.person_id && (
                          <select
                            className="td-focusable"
                            value=""
                            disabled={busyId === m.user_id || unclaimed.length === 0}
                            onChange={(e) => linkTo(m, e.target.value)}
                            title="Attach this account to someone on the Crew, Actors, Musicians or Staff roster. Until then their positions grant nothing."
                            aria-label={`Link ${m.email} to a roster person`}
                            style={{ background: COLOR.void, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, color: COLOR.textMuted, fontSize: 11.5, padding: '4px 6px', maxWidth: 140 }}
                          >
                            <option value="">{unclaimed.length ? 'Link to roster…' : 'Nobody unlinked'}</option>
                            {unclaimed.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} — {p.kind}</option>
                            ))}
                          </select>
                        )}
                        {canManage && m.person_id && (
                          <button
                            className="td-focusable"
                            disabled={busyId === m.user_id}
                            onClick={() => unlink(m)}
                            title={`Detach this account from ${m.person_name}. They stay on the roster and keep their account.`}
                            style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textFaint, fontSize: 11, padding: '4px 9px', cursor: 'pointer' }}
                          >
                            Unlink
                          </button>
                        )}
                        {iAmAdmin && !isMe && (
                          <button
                            className="td-focusable"
                            disabled={busyId === m.user_id || lastAdmin}
                            onClick={() => removeMember(m)}
                            title={lastAdmin ? 'The last admin cannot be removed.' : `Remove ${m.email} from this company. Their roster entry stays.`}
                            style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textFaint, fontSize: 11, padding: '4px 9px', cursor: busyId === m.user_id || lastAdmin ? 'not-allowed' : 'pointer' }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {members !== null && admins.length === 1 && (
        <div className="td-body" style={{ ...sectionNote, color: COLOR.textFaint, marginTop: 12, maxWidth: 720 }}>
          The last admin can't be demoted or removed — promote someone else first.
        </div>
      )}
      <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginTop: 10, maxWidth: 720, lineHeight: 1.55 }}>
        <strong style={{ color: COLOR.textMuted }}>Admin</strong> {TIER_META.admin.note}{' '}
        <strong style={{ color: COLOR.textMuted }}>Staff</strong> {TIER_META.staff.note}{' '}
        <strong style={{ color: COLOR.textMuted }}>Cast</strong> {TIER_META.cast.note}
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// SIDEBAR
// ---------------------------------------------------------------------------
export function ShowSwitcher({ shows, currentShowId, setCurrentShowId }) {
  const [open, setOpen] = useState(false);
  const current = shows.find((s) => s.id === currentShowId);
  const meta = current ? STATUS_META[current.status] : null;

  return (
    <div style={{ position: 'relative', marginBottom: 16 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="td-focusable"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          background: COLOR.card,
          border: `1px solid ${COLOR.lineBright}`,
          borderRadius: 4,
          padding: '10px 10px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="td-mono" style={{ fontSize: 9, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 3 }}>WORKING ON</div>
          {current ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
              <span className="td-display" style={{ fontSize: 13, color: COLOR.textPrimary, letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {current.title}
              </span>
            </div>
          ) : (
            <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textFaint }}>None selected</span>
          )}
        </div>
        <ChevronDown size={14} color={COLOR.textFaint} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: COLOR.card,
            border: `1px solid ${COLOR.lineBright}`,
            borderRadius: 4,
            padding: 6,
            zIndex: 10,
            boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          }}
        >
          {shows.map((s) => {
            const m = STATUS_META[s.status];
            const isSel = s.id === currentShowId;
            return (
              <button
                key={s.id}
                onClick={() => { setCurrentShowId(s.id); setOpen(false); }}
                className="td-focusable"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: isSel ? COLOR.panel : 'transparent',
                  border: 'none',
                  borderRadius: 3,
                  padding: '8px 8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                <span className="td-body" style={{ fontSize: 12.5, color: isSel ? COLOR.amber : COLOR.textPrimary, flex: 1 }}>{s.title}</span>
                <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint }}>{s.venue}</span>
              </button>
            );
          })}
          <div style={{ borderTop: `1px solid ${COLOR.line}`, marginTop: 4, paddingTop: 4 }}>
            <button
              onClick={() => { setCurrentShowId(null); setOpen(false); }}
              className="td-focusable"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: !currentShowId ? COLOR.panel : 'transparent',
                border: 'none',
                borderRadius: 3,
                padding: '8px 8px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLOR.slate, flexShrink: 0 }} />
              <span className="td-body" style={{ fontSize: 12.5, color: !currentShowId ? COLOR.amber : COLOR.textMuted, flex: 1 }}>None — baseline / company-wide</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// ---------------------------------------------------------------------------
// NARROW VIEWPORT — phones and most tablets in portrait. Below this the rail
// stops being a permanent column and becomes a drawer over the content, since
// 200px of permanent navigation on a 390px screen leaves nothing for the work.
// ---------------------------------------------------------------------------
export const NARROW_BREAKPOINT = 900;

export function useIsNarrow() {
  const query = `(max-width: ${NARROW_BREAKPOINT}px)`;
  const [narrow, setNarrow] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return narrow;
}

export function Sidebar({ active, setActive, shows, currentShowId, setCurrentShowId, onSignOut, onChangeCompany, isNarrow, open, onClose, collapsed, onToggleCollapse }) {
  // Bottom-of-rail actions: leaving this company, and leaving the app entirely.
  const footerButton = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 3,
    border: 'none',
    background: 'transparent',
    color: COLOR.textMuted,
    cursor: 'pointer',
    textAlign: 'left',
    borderLeft: '2px solid transparent',
    width: '100%',
    overflow: 'hidden',
    justifyContent: collapsed && !isNarrow ? 'center' : 'flex-start',
  };
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'schedule', label: 'Schedule', icon: CalendarDays },
    { id: 'scenes', label: 'Scenes', icon: Clapperboard },
    { id: 'characters', label: 'Characters', icon: Drama },
    { id: 'crew', label: 'Crew', icon: Users },
    { id: 'actors', label: 'Actors', icon: Star },
    { id: 'musicians', label: 'Musicians', icon: Music },
    { id: 'staff', label: 'Staff', icon: Briefcase },
    { id: 'choreography', label: 'Choreography', icon: Footprints },
    { id: 'costumes', label: 'Costumes', icon: Shirt },
    { id: 'props', label: 'Props', icon: Package },
    { id: 'calls', label: 'Calls', icon: Bell },
    { id: 'audio', label: 'Audio', icon: Radio },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
    { id: 'set', label: 'Set', icon: Box },
    { id: 'runofshow', label: 'Run of Show', icon: ListChecks },
    { id: 'script', label: 'Script', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];
  return (
    <div
      style={{
        width: !isNarrow && collapsed ? 56 : 200,
        background: COLOR.panel,
        borderRight: `1px solid ${COLOR.line}`,
        padding: !isNarrow && collapsed ? '20px 6px' : '20px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        flexShrink: 0,
        ...(isNarrow
          ? {
              position: 'fixed',
              top: 44,
              bottom: 0,
              left: 0,
              zIndex: 60,
              overflowY: 'auto',
              transform: open ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.2s ease',
              boxShadow: open ? '0 0 24px rgba(0,0,0,0.5)' : 'none',
            }
          : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed && !isNarrow ? 'center' : 'space-between', padding: '0 6px 16px', gap: 6 }}>
        {(!collapsed || isNarrow) && (
          <div className="td-display" style={{ color: COLOR.textPrimary, fontSize: 16, letterSpacing: '0.08em', padding: '0 4px' }}>
            Tech Desk
          </div>
        )}
        {!isNarrow && (
          <button
            onClick={onToggleCollapse}
            className="td-focusable"
            title={collapsed ? 'Expand menu' : 'Collapse menu to icons'}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu to icons'}
            style={{ background: 'transparent', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex', padding: 4 }}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>
      {(!collapsed || isNarrow) && <ShowSwitcher shows={shows} currentShowId={currentShowId} setCurrentShowId={setCurrentShowId} />}
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => { setActive(item.id); if (onClose) onClose(); }}
            className="td-focusable"
            title={collapsed && !isNarrow ? item.label : undefined}
            aria-label={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed && !isNarrow ? 'center' : 'flex-start',
              gap: 10,
              overflow: 'hidden',
              padding: collapsed && !isNarrow ? '9px 0' : '9px 10px',
              borderRadius: 3,
              border: 'none',
              background: isActive ? COLOR.card : 'transparent',
              color: isActive ? COLOR.amber : COLOR.textMuted,
              cursor: 'pointer',
              textAlign: 'left',
              borderLeft: isActive ? `2px solid ${COLOR.amber}` : '2px solid transparent',
            }}
          >
            <Icon size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            {(!collapsed || isNarrow) && (
              <span className="td-body" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{item.label}</span>
            )}
          </button>
        );
        })}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 10, borderTop: `1px solid ${COLOR.line}` }}>
          <button onClick={() => { if (onClose) onClose(); onChangeCompany(); }} className="td-focusable" title={collapsed && !isNarrow ? 'Change company' : undefined} style={footerButton}>
            <Building2 size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            {(!collapsed || isNarrow) && <span className="td-body" style={{ fontSize: 13 }}>Change company</span>}
          </button>
          <button onClick={onSignOut} className="td-focusable" title={collapsed && !isNarrow ? 'Sign out' : undefined} style={footerButton}>
            <LogOut size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            {(!collapsed || isNarrow) && <span className="td-body" style={{ fontSize: 13 }}>Sign out</span>}
          </button>
        </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// CLOCK
// ---------------------------------------------------------------------------
export function HouseClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div style={{ textAlign: 'right' }}>
      <div className="td-mono" style={{ fontSize: 18, color: COLOR.textPrimary, letterSpacing: '0.03em' }}>{time}</div>
      <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em' }}>{date.toUpperCase()}</div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// SHOW GATE — the front door. Open the app, pick what you're working on,
// then every module downstream already knows.
// ---------------------------------------------------------------------------
export function NoShowSelected({ shows, setCurrentShowId, label }) {
  return (
    <div>
      <StubPanel label={`Select a show to view its ${label}`} hint="Pick a production from the switcher at the top of the sidebar, or create one on the Dashboard. Everything except the company rosters and Settings is scoped to one show." />
      {shows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, maxWidth: 420 }}>
          {shows.map((s) => {
            const meta = STATUS_META[s.status];
            return (
              <button
                key={s.id}
                onClick={() => setCurrentShowId(s.id)}
                className="td-focusable"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: COLOR.card,
                  border: `1px solid ${COLOR.line}`,
                  borderRadius: 4,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary }}>{s.title}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={meta.cls} style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
                  <span className="td-mono" style={{ fontSize: 9.5, color: meta.color }}>{meta.label.toUpperCase()}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
