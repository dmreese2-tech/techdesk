import React, { useMemo, useState } from 'react';
import { Mail, MailWarning, Mic, Pencil, Phone, Plus, Settings, Trash2, UserMinus, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { ImportCsvButton } from './csvImport.jsx';
import { actorsSpec, musiciansSpec, staffSpec } from './importSpecs.jsx';
import { assignmentFor } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// PEOPLE — the shared roster module behind Actors, Musicians and Staff. Cast
// pick from the show character list; band and staff from company positions.

// ---------------------------------------------------------------------------
// PEOPLE SIGN-IN — the same self-service pattern as Crew's identity flow,
// generalized so Actors, Staff, and Musicians each get their own roster
// and their own vocabulary for what a "role" means.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// AUDIO OPTIONS — the mic'd toggle for actors, and the electric/monitor-mix
// toggles for musicians. Feeds the mic plot and channel plot directly.
// ---------------------------------------------------------------------------
export function AudioOptionsFields({ audioOptions, value, onChange }) {
  if (!audioOptions) return null;
  const rowStyle = { display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' };
  const checkboxLabel = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' };
  const smallInput = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '5px 8px',
    color: COLOR.textPrimary,
    fontSize: 12,
    width: 150,
  };

  if (audioOptions === 'mic') {
    return (
      <div style={rowStyle}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!value.miced}
            onChange={(e) => onChange({ ...value, miced: e.target.checked, micType: e.target.checked ? value.micType || 'Wireless Lav' : '' })}
          />
          <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>Mic'd for this show</span>
        </label>
        {value.miced && (
          <input
            className="td-focusable"
            style={smallInput}
            value={value.micType || ''}
            onChange={(e) => onChange({ ...value, micType: e.target.value })}
            placeholder="Mic type"
          />
        )}
      </div>
    );
  }

  if (audioOptions === 'electric') {
    return (
      <div style={rowStyle}>
        <label style={checkboxLabel}>
          <input type="checkbox" checked={!!value.electric} onChange={(e) => onChange({ ...value, electric: e.target.checked })} />
          <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>Plays electric</span>
        </label>
        <label style={checkboxLabel}>
          <input type="checkbox" checked={!!value.monitorMix} onChange={(e) => onChange({ ...value, monitorMix: e.target.checked })} />
          <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>Needs own monitor mix</span>
        </label>
      </div>
    );
  }

  return null;
}
export function PeopleSignIn({ personLabel, roleLabel, rolePlaceholder, roleOptions, categoryMap, categoryOrder, audioOptions, show, people, setPeople, currentUserId, setCurrentUserId }) {
  const currentUser = people.find((p) => p.id === currentUserId);
  const currentAssignment = currentUser ? assignmentFor(currentUser, show.id) : null;
  const [name, setName] = useState('');
  const [step, setStep] = useState('name');
  const [matchedPerson, setMatchedPerson] = useState(null);
  const [roleTitle, setRoleTitle] = useState('');
  const [category, setCategory] = useState(categoryOrder[0]);
  const [audioFields, setAudioFields] = useState({ miced: false, micType: '', electric: false, monitorMix: false });

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 13,
  };
  const labelStyle = { fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  if (currentUser && currentAssignment) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: COLOR.card,
          border: `1px solid ${COLOR.lineBright}`,
          borderRadius: 4,
          padding: '10px 16px',
          marginBottom: 20,
        }}
      >
        <span className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary }}>
          Signed in as <strong>{currentUser.name}</strong>
          <span className="td-mono" style={{ fontSize: 11, color: COLOR.textFaint, marginLeft: 8 }}>
            {currentAssignment.roleTitle} · {categoryMap[currentAssignment.category]?.label} · {show.title}
          </span>
        </span>
        <button
          onClick={() => setCurrentUserId(null)}
          className="td-focusable"
          style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}
        >
          Not you? Sign out
        </button>
      </div>
    );
  }

  function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = people.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (existing && assignmentFor(existing, show.id)) {
      setCurrentUserId(existing.id);
    } else if (existing) {
      setMatchedPerson(existing);
      setStep('link');
    } else {
      setMatchedPerson(null);
      setStep('new');
    }
  }

  function handleJoin() {
    if (!roleTitle.trim()) return;
    if (matchedPerson) {
      const newAssignment = { id: `asn-${matchedPerson.id}-${show.id}`, showId: show.id, roleTitle: roleTitle.trim(), category, ...audioFields };
      setPeople((prev) => prev.map((p) => (p.id === matchedPerson.id ? { ...p, assignments: [...(p.assignments || []), newAssignment] } : p)));
      setCurrentUserId(matchedPerson.id);
    } else {
      const newId = `p${Date.now()}`;
      const newAssignment = { id: `asn-${newId}-${show.id}`, showId: show.id, roleTitle: roleTitle.trim(), category, ...audioFields };
      setPeople((prev) => [...prev, { id: newId, name: name.trim(), assignments: [newAssignment] }]);
      setCurrentUserId(newId);
    }
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 16, marginBottom: 20 }}>
      {step === 'name' ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ flex: 1, maxWidth: 260 }}>
            <label className="td-mono" style={labelStyle}>WHO'S SIGNING ON?</label>
            <input
              className="td-focusable"
              style={{ ...inputStyle, width: '100%' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
              placeholder="Type your name"
            />
          </div>
          <button
            onClick={handleContinue}
            disabled={!name.trim()}
            className="td-focusable"
            style={{
              background: name.trim() ? COLOR.amber : COLOR.slateDim,
              color: name.trim() ? COLOR.void : COLOR.textFaint,
              border: 'none',
              borderRadius: 3,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: name.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Continue
          </button>
        </div>
      ) : (
        <div>
          <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, marginBottom: 12 }}>
            {step === 'link'
              ? `${matchedPerson.name} is on the ${personLabel} list but not linked to ${show.title} yet — what's your role here?`
              : `${name} isn't on the ${personLabel} list yet — finish your profile to join.`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="td-mono" style={labelStyle}>{roleLabel} ON {show.title.toUpperCase()}</label>
              {roleOptions ? (
                <select className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)}>
                  <option value="">Choose...</option>
                  {roleOptions.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder={rolePlaceholder} />
              )}
            </div>
            <div>
              <label className="td-mono" style={labelStyle}>CATEGORY</label>
              <select className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categoryOrder.map((c) => (
                  <option key={c} value={c}>{categoryMap[c].label}</option>
                ))}
              </select>
            </div>
          </div>
          <AudioOptionsFields audioOptions={audioOptions} value={audioFields} onChange={setAudioFields} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={handleJoin}
              disabled={!roleTitle.trim()}
              className="td-focusable"
              style={{
                background: roleTitle.trim() ? COLOR.amber : COLOR.slateDim,
                color: roleTitle.trim() ? COLOR.void : COLOR.textFaint,
                border: 'none',
                borderRadius: 3,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: roleTitle.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {step === 'link' ? `Join ${show.title}` : 'Join'}
            </button>
            <button
              onClick={() => setStep('name')}
              className="td-focusable"
              style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// ---------------------------------------------------------------------------
// PEOPLE ROSTER ROW + GROUPED LIST
// ---------------------------------------------------------------------------
export function PeopleRosterRow({ person, show, shows, categoryMap, categoryOrder, roleLabel, roleOptions, audioOptions, setPeople }) {
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const assignment = show ? assignmentFor(person, show.id) : null;
  const history = show ? (person.assignments || []).filter((a) => a.showId !== show.id) : (person.assignments || []);
  const [draft, setDraft] = useState({
    name: person.name,
    phone: person.phone || '',
    email: person.email || '',
    roleTitle: assignment?.roleTitle || '',
    category: assignment?.category || categoryOrder[0],
    miced: assignment?.miced || false,
    micType: assignment?.micType || '',
    electric: assignment?.electric || false,
    monitorMix: assignment?.monitorMix || false,
  });
  const Icon = assignment ? categoryMap[assignment.category]?.icon : null;

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

  function startEdit() {
    setDraft({
      name: person.name,
      phone: person.phone || '',
      email: person.email || '',
      roleTitle: assignment?.roleTitle || '',
      category: assignment?.category || categoryOrder[0],
      miced: assignment?.miced || false,
      micType: assignment?.micType || '',
      electric: assignment?.electric || false,
      monitorMix: assignment?.monitorMix || false,
    });
    setEditing(true);
  }
  // Off this production, not out of the company. Their history stays and they
  // reappear under "not on this show", one click from being cast again.
  function takeOffShow() {
    setPeople((prev) =>
      prev.map((p) =>
        p.id === person.id
          ? { ...p, assignments: (p.assignments || []).filter((a) => a.showId !== show.id) }
          : p
      )
    );
    setConfirmingRemove(false);
  }

  // Out of the company entirely — every show, every history.
  function deleteFromCompany() {
    setPeople((prev) => prev.filter((p) => p.id !== person.id));
    setConfirmingDelete(false);
  }

  function save() {
    setPeople((prev) =>
      prev.map((p) => {
        if (p.id !== person.id) return p;
        const contact = { name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim() };
        if (!show) return { ...p, ...contact };
        const others = (p.assignments || []).filter((a) => a.showId !== show.id);
        const newAssignment = {
          id: assignment?.id || `asn-${p.id}-${show.id}`,
          showId: show.id,
          roleTitle: draft.roleTitle.trim(),
          category: draft.category,
          miced: draft.miced,
          micType: draft.micType,
          electric: draft.electric,
          monitorMix: draft.monitorMix,
        };
        return { ...p, ...contact, assignments: [...others, newAssignment] };
      })
    );
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ padding: '12px 4px', borderBottom: `1px solid ${COLOR.line}`, background: COLOR.panel }}>
        {show && (
          <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.blueprint, letterSpacing: '0.04em', marginBottom: 8 }}>
            {roleLabel} & CATEGORY ARE SPECIFIC TO {show.title.toUpperCase()}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: show ? '1.2fr 1.2fr 1fr' : '1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>NAME</label>
            <input className="td-focusable" style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          {show && (
            <>
              <div>
                <label className="td-mono" style={labelStyle}>{roleLabel}</label>
                {roleOptions ? (
                  <select className="td-focusable" style={inputStyle} value={draft.roleTitle} onChange={(e) => setDraft({ ...draft, roleTitle: e.target.value })}>
                    <option value="">Choose...</option>
                    {roleOptions.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                    {draft.roleTitle && !roleOptions.includes(draft.roleTitle) && (
                      <option value={draft.roleTitle}>{draft.roleTitle} (not in list)</option>
                    )}
                  </select>
                ) : (
                  <input className="td-focusable" style={inputStyle} value={draft.roleTitle} onChange={(e) => setDraft({ ...draft, roleTitle: e.target.value })} />
                )}
              </div>
              <div>
                <label className="td-mono" style={labelStyle}>CATEGORY</label>
                <select className="td-focusable" style={inputStyle} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {categoryOrder.map((c) => (
                    <option key={c} value={c}>{categoryMap[c].label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Contact details. The email is not decoration: it is what the claim
            flow matches on when this person signs in, and without it their
            account can never be linked to this roster entry. Cast can't read
            anyone's but their own — see 09-contact-privacy.sql. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>PHONE</label>
            <input className="td-focusable" style={inputStyle} value={draft.phone} placeholder="Optional" onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>EMAIL</label>
            <input
              className="td-focusable"
              style={inputStyle}
              type="email"
              value={draft.email}
              placeholder="Matches their sign-in to this roster entry"
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </div>
        </div>
        {show && <AudioOptionsFields audioOptions={audioOptions} value={draft} onChange={setDraft} />}
        {history.length > 0 && (
          <div style={{ marginBottom: 10, marginTop: 10 }}>
            <label className="td-mono" style={labelStyle}>{show ? 'HISTORY (OTHER SHOWS)' : 'SHOW HISTORY'}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {history.map((a) => {
                const s = shows.find((sh) => sh.id === a.showId);
                return (
                  <span key={a.id} className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '3px 8px' }}>
                    {s ? s.title : a.showId} — {a.roleTitle}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={save}
            disabled={!draft.name.trim() || (!!show && !draft.roleTitle.trim())}
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 4px',
        borderBottom: `1px solid ${COLOR.line}`,
        gap: 12,
      }}
    >
      <div style={{ minWidth: 160 }}>
        <div className="td-body" style={{ fontSize: 13.5, color: COLOR.textPrimary, fontWeight: 500 }}>{person.name}</div>
        {show && (
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 2, fontStyle: assignment ? 'normal' : 'italic' }}>
            {assignment ? assignment.roleTitle : `Not on ${show.title}`}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
        {history.map((a) => {
          const s = shows.find((sh) => sh.id === a.showId);
          return (
            <span key={a.id} className="td-mono" style={{ fontSize: 9.5, color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '2px 6px' }}>
              {s ? s.title : a.showId} — {a.roleTitle}
            </span>
          );
        })}
        {audioOptions === 'mic' && assignment?.miced && (
          <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '2px 6px' }}>
            MIC'D · {assignment.micType || 'Wireless Lav'}
          </span>
        )}
        {audioOptions === 'electric' && assignment?.electric && (
          <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '2px 6px' }}>
            ELECTRIC{assignment.monitorMix ? ' · OWN MIX' : ''}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {person.phone && (
          <a href={`tel:${person.phone}`} className="td-focusable" style={{ color: COLOR.textFaint }} aria-label={`Call ${person.name}`}>
            <Phone size={13} strokeWidth={1.75} />
          </a>
        )}
        {person.email ? (
          <a href={`mailto:${person.email}`} className="td-focusable" style={{ color: COLOR.textFaint }} aria-label={`Email ${person.name}`}>
            <Mail size={13} strokeWidth={1.75} />
          </a>
        ) : (
          // No email means this person can never claim their account: the sign-in
          // address has nothing to match against. Worth seeing at a glance.
          <span
            title={`No email for ${person.name}. Without one they can't link their account to this roster entry.`}
            style={{ color: COLOR.amberDim, display: 'flex' }}
          >
            <MailWarning size={13} strokeWidth={1.75} />
          </span>
        )}
        {Icon && <Icon size={13} color={COLOR.textFaint} strokeWidth={1.75} />}
        {show && assignment && (
          confirmingRemove ? (
            <>
              <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber }}>OFF {show.title.toUpperCase()}?</span>
              <button onClick={takeOffShow} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '3px 9px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}>
                Remove
              </button>
              <button onClick={() => setConfirmingRemove(false)} className="td-focusable" style={{ background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '3px 9px', fontSize: 10.5, cursor: 'pointer' }}>
                Keep
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingRemove(true)}
              className="td-focusable"
              title={`Take ${person.name} off ${show.title}. They stay on the company roster.`}
              aria-label={`Take ${person.name} off ${show.title}`}
              style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
            >
              <UserMinus size={13} strokeWidth={1.75} />
            </button>
          )
        )}
        {confirmingDelete ? (
          <>
            <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, textAlign: 'right' }}>
              DELETE FROM COMPANY?{(person.assignments || []).length ? ` ON ${(person.assignments || []).length} SHOW${(person.assignments || []).length === 1 ? '' : 'S'}` : ''}
              {person.userId ? ' — an account is linked to them' : ''}
            </span>
            <button onClick={deleteFromCompany} className="td-focusable" style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '3px 9px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}>
              Delete
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="td-focusable" style={{ background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '3px 9px', fontSize: 10.5, cursor: 'pointer' }}>
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => { setConfirmingDelete(true); setConfirmingRemove(false); }}
            className="td-focusable"
            title={`Remove ${person.name} from the company roster entirely — every production, not just this one.`}
            aria-label={`Remove ${person.name} from the company`}
            style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
          >
            <Trash2 size={13} strokeWidth={1.75} />
          </button>
        )}
        {!show || assignment ? (
          <button onClick={startEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${person.name}`}>
            <Pencil size={13} strokeWidth={1.75} />
          </button>
        ) : (
          <button
            onClick={startEdit}
            className="td-focusable"
            style={{ background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '3px 9px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}
          >
            Add to show
          </button>
        )}
      </div>
    </div>
  );
}
export function PeopleRosterGroups({ people, show, shows, categoryMap, categoryOrder, roleLabel, roleOptions, audioOptions, setPeople }) {
  const onShow = show ? people.filter((p) => assignmentFor(p, show.id)) : [];
  const notOnShow = show ? people.filter((p) => !assignmentFor(p, show.id)) : people;

  const grouped = useMemo(() => {
    if (!show) return {};
    const g = {};
    categoryOrder.forEach((c) => (g[c] = []));
    onShow.forEach((p) => {
      const a = assignmentFor(p, show.id);
      if (!g[a.category]) g[a.category] = [];
      g[a.category].push(p);
    });
    return g;
  }, [onShow, show, categoryOrder]);

  return (
    <div>
      {show && onShow.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 26 }}>
          {categoryOrder.filter((c) => grouped[c] && grouped[c].length > 0).map((c) => {
            const Icon = categoryMap[c].icon;
            return (
              <div key={c}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <Icon size={14} color={COLOR.textMuted} strokeWidth={1.75} />
                  <span className="td-display" style={{ fontSize: 13, color: COLOR.textMuted, letterSpacing: '0.05em' }}>
                    {categoryMap[c].label} — {grouped[c].length}
                  </span>
                </div>
                <div>
                  {grouped[c].map((p) => (
                    <PeopleRosterRow key={p.id} person={p} show={show} shows={shows} categoryMap={categoryMap} categoryOrder={categoryOrder} roleLabel={roleLabel} roleOptions={roleOptions} audioOptions={audioOptions} setPeople={setPeople} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {show && onShow.length === 0 && (
        <div style={{ marginBottom: 26 }}>
          <StubPanel label={`No one is on ${show.title} yet`} hint="Add people to the company roster first, then assign them to this show and pick what they play. Cast pick from the character list under Characters; band and staff pick from the position lists in Settings." />
        </div>
      )}

      {notOnShow.length > 0 && (
        <div>
          {show && (
            <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10 }}>
              REST OF THE COMPANY — {notOnShow.length}
            </div>
          )}
          <div>
            {notOnShow.map((p) => (
              <PeopleRosterRow key={p.id} person={p} show={show} shows={shows} categoryMap={categoryMap} categoryOrder={categoryOrder} roleLabel={roleLabel} roleOptions={roleOptions} audioOptions={audioOptions} setPeople={setPeople} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// ---------------------------------------------------------------------------
// NEW PERSON FORM (manual add, for whoever isn't signing themselves up)
// ---------------------------------------------------------------------------
export function NewPersonForm({ show, personLabel, roleLabel, rolePlaceholder, roleOptions, categoryMap, categoryOrder, audioOptions, onAdd, onClose }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [category, setCategory] = useState(categoryOrder[0]);
  const [audioFields, setAudioFields] = useState({ miced: false, micType: '', electric: false, monitorMix: false });

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
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 14, color: COLOR.textPrimary, letterSpacing: '0.05em' }}>
          {show ? `Add to ${show.title}` : `Add to ${personLabel} list`}
        </div>
        <button onClick={onClose} className="td-focusable" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textFaint }} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: show ? '1.4fr 1.4fr 1fr' : '1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>NAME</label>
          <input className="td-focusable" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        {show && (
          <>
            <div>
              <label className="td-mono" style={labelStyle}>{roleLabel} (THIS SHOW)</label>
              {roleOptions ? (
                <select className="td-focusable" style={inputStyle} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)}>
                  <option value="">Choose...</option>
                  {roleOptions.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input className="td-focusable" style={inputStyle} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder={rolePlaceholder} />
              )}
            </div>
            <div>
              <label className="td-mono" style={labelStyle}>CATEGORY</label>
              <select className="td-focusable" style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categoryOrder.map((c) => (
                  <option key={c} value={c}>{categoryMap[c].label}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>PHONE</label>
          <input className="td-focusable" style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>EMAIL</label>
          <input className="td-focusable" style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="The address they'll sign in with" />
        </div>
      </div>

      {show && <AudioOptionsFields audioOptions={audioOptions} value={audioFields} onChange={setAudioFields} />}

      <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginTop: 12 }}>
        {show
          ? `If this name matches someone already on the ${personLabel} list, this just adds them to ${show.title} — it won't create a duplicate person.`
          : 'Adds a baseline entry with no show assigned yet. Pick a show later to give them a role.'}
      </div>

      <button
        className="td-focusable"
        disabled={!name.trim() || (!!show && !roleTitle.trim())}
        onClick={() =>
          onAdd({
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            roleTitle: roleTitle.trim(),
            category,
            ...audioFields,
          })
        }
        style={{
          marginTop: 14,
          background: name.trim() && (!show || roleTitle.trim()) ? COLOR.amber : COLOR.slateDim,
          color: name.trim() && (!show || roleTitle.trim()) ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: name.trim() && (!show || roleTitle.trim()) ? 'pointer' : 'not-allowed',
        }}
      >
        Add to roster
      </button>
    </div>
  );
}
// ---------------------------------------------------------------------------
// SHARED MODULE SHELL for Actors / Staff / Musicians
// ---------------------------------------------------------------------------
export function PeopleModule({ show, shows, people, setPeople, currentUserId, setCurrentUserId, personLabel, roleLabel, rolePlaceholder, roleOptions, categoryMap, categoryOrder, audioOptions, importSpec }) {
  const [showForm, setShowForm] = useState(false);

  function handleManualAdd({ name, phone, email, roleTitle, category, ...audioFields }) {
    const existing = people.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (show) {
      if (existing) {
        const newAssignment = { id: `asn-${existing.id}-${show.id}`, showId: show.id, roleTitle, category, ...audioFields };
        setPeople((prev) => prev.map((p) => (p.id === existing.id ? { ...p, phone: phone || p.phone, email: email || p.email, assignments: [...(p.assignments || []).filter((a) => a.showId !== show.id), newAssignment] } : p)));
      } else {
        const newId = `p${Date.now()}`;
        const newAssignment = { id: `asn-${newId}-${show.id}`, showId: show.id, roleTitle, category, ...audioFields };
        setPeople((prev) => [...prev, { id: newId, name, phone, email, assignments: [newAssignment] }]);
      }
    } else if (!existing) {
      const newId = `p${Date.now()}`;
      setPeople((prev) => [...prev, { id: newId, name, phone, email, assignments: [] }]);
    }
    setShowForm(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {importSpec && (
          <ImportCsvButton
            filename={importSpec.filename}
            columns={importSpec.columns}
            sample={importSpec.sample}
            onImport={(rows) => {
              const items = rows.map((r) => importSpec.build(r, { show, castTypes: categoryMap, musicSections: categoryMap, staffAreas: categoryMap }));
              setPeople((prev) => [...prev, ...items]);
              return items.length;
            }}
          />
        )}
        <ExportCsvButton
          filename={`${show ? show.title : 'company'}-${personLabel}`}
          rows={() =>
            people.map((p) => {
              const a = show ? assignmentFor(p, show.id) : null;
              return {
                Name: p.name,
                'On this show': a ? 'yes' : 'no',
                Role: a ? a.roleTitle || '' : '',
                Category: a ? (categoryMap[a.category] || {}).label || a.category || '' : '',
                Mic: a ? a.micChannel || '' : '',
                Phone: p.phone || '',
                Email: p.email || '',
              };
            })
          }
        />
      </div>
      {show ? (
        <PeopleSignIn
          personLabel={personLabel}
          roleLabel={roleLabel}
          rolePlaceholder={rolePlaceholder}
          roleOptions={roleOptions}
          categoryMap={categoryMap}
          categoryOrder={categoryOrder}
          audioOptions={audioOptions}
          show={show}
          people={people}
          setPeople={setPeople}
          currentUserId={currentUserId}
          setCurrentUserId={setCurrentUserId}
        />
      ) : (
        <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginBottom: 16 }}>
          No show selected — showing the full {personLabel} list. Pick a show from the sidebar to sign in or assign roles here.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em' }}>
          {people.length} ON THE {personLabel.toUpperCase()} LIST
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="td-focusable"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            color: COLOR.amber,
            border: `1px solid ${COLOR.amber}`,
            borderRadius: 3,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Add manually
        </button>
      </div>

      {showForm && (
        <NewPersonForm
          show={show}
          personLabel={personLabel}
          roleLabel={roleLabel}
          rolePlaceholder={rolePlaceholder}
          roleOptions={roleOptions}
          categoryMap={categoryMap}
          categoryOrder={categoryOrder}
          audioOptions={audioOptions}
          onAdd={handleManualAdd}
          onClose={() => setShowForm(false)}
        />
      )}

      {people.length > 0 ? (
        <PeopleRosterGroups people={people} show={show} shows={shows} categoryMap={categoryMap} categoryOrder={categoryOrder} roleLabel={roleLabel} roleOptions={roleOptions} audioOptions={audioOptions} setPeople={setPeople} />
      ) : (
        <StubPanel label={`No one on the ${personLabel} list yet`} hint="This is the company-wide roster, not a single show. Add people once here, then assign them to individual productions. Removing someone here removes them from every show." />
      )}
    </div>
  );
}
export function ActorsModule({ show, shows, actors, setActors, currentUserId, setCurrentUserId, CAST_TYPES, CAST_TYPE_ORDER, characters }) {
  // Cast into the show's character list once it exists. Until someone builds
  // that list, fall back to free text so a new production isn't a dead end.
  const characterNames = (characters || []).map((c) => c.name).filter(Boolean);
  return (
    <PeopleModule
      show={show}
      shows={shows}
      people={actors}
      setPeople={setActors}
      currentUserId={currentUserId}
      setCurrentUserId={setCurrentUserId}
      personLabel="cast"
      roleLabel="CHARACTER"
      rolePlaceholder="e.g. Prospero, or Ensemble"
      roleOptions={characterNames.length ? characterNames : undefined}
      categoryMap={CAST_TYPES}
      categoryOrder={CAST_TYPE_ORDER}
      audioOptions="mic"
      importSpec={actorsSpec}
    />
  );
}
export function StaffModule({ show, shows, staff, setStaff, currentUserId, setCurrentUserId, STAFF_AREAS, STAFF_AREA_ORDER, positions }) {
  return (
    <PeopleModule
      show={show}
      shows={shows}
      people={staff}
      setPeople={setStaff}
      currentUserId={currentUserId}
      setCurrentUserId={setCurrentUserId}
      personLabel="staff"
      roleLabel="POSITION"
      rolePlaceholder="e.g. Director, Producer"
      roleOptions={positions && positions.length ? positions : undefined}
      categoryMap={STAFF_AREAS}
      categoryOrder={STAFF_AREA_ORDER}
      importSpec={staffSpec}
    />
  );
}
export function MusiciansModule({ show, shows, musicians, setMusicians, currentUserId, setCurrentUserId, MUSIC_SECTIONS, MUSIC_SECTION_ORDER, positions }) {
  // Band positions are the chairs (Reed 1, Keys 2). If none are set up yet the
  // picker falls back to the instrument list, which is what it used before.
  // Band positions are the chairs (Reed 1, Keys 2). With none set up the
  // picker falls back to free text rather than to a second list that meant
  // almost the same thing.
  const chairOptions = positions && positions.length ? positions : undefined;
  return (
    <PeopleModule
      show={show}
      shows={shows}
      people={musicians}
      setPeople={setMusicians}
      currentUserId={currentUserId}
      setCurrentUserId={setCurrentUserId}
      personLabel="band"
      roleLabel="INSTRUMENT"
      rolePlaceholder="e.g. Violin, Piano 1"
      roleOptions={chairOptions}
      categoryMap={MUSIC_SECTIONS}
      categoryOrder={MUSIC_SECTION_ORDER}
      audioOptions="electric"
      importSpec={musiciansSpec}
    />
  );
}
