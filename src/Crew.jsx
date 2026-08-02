import React, { useMemo, useState } from 'react';
import { Mail, Pencil, Phone, Plus, Settings, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { assignmentFor } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// CREW — the deck and booth roster, with per-show positions and the
// self-service sign-in used at the callboard.

// ---------------------------------------------------------------------------
// ROSTER ROW
// ---------------------------------------------------------------------------
export function RosterRow({ member, show, shows, setCrew, DEPARTMENTS, DEPARTMENT_ORDER }) {
  const [editing, setEditing] = useState(false);
  const assignment = show ? assignmentFor(member, show.id) : null;
  const history = show ? (member.assignments || []).filter((a) => a.showId !== show.id) : (member.assignments || []);
  const [draft, setDraft] = useState({
    name: member.name,
    phone: member.phone,
    email: member.email,
    role: assignment?.role || '',
    dept: assignment?.dept || DEPARTMENT_ORDER[0],
  });

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
      name: member.name,
      phone: member.phone,
      email: member.email,
      role: assignment?.role || '',
      dept: assignment?.dept || DEPARTMENT_ORDER[0],
    });
    setEditing(true);
  }
  function save() {
    setCrew((prev) =>
      prev.map((m) => {
        if (m.id !== member.id) return m;
        if (!show) return { ...m, name: draft.name.trim(), phone: draft.phone, email: draft.email };
        const others = (m.assignments || []).filter((a) => a.showId !== show.id);
        const newAssignment = { id: assignment?.id || `asn-${m.id}-${show.id}`, showId: show.id, role: draft.role.trim(), dept: draft.dept };
        return { ...m, name: draft.name.trim(), phone: draft.phone, email: draft.email, assignments: [...others, newAssignment] };
      })
    );
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ padding: '12px 4px', borderBottom: `1px solid ${COLOR.line}`, background: COLOR.panel }}>
        {show && (
          <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.blueprint, letterSpacing: '0.04em', marginBottom: 8 }}>
            ROLE & DEPARTMENT ARE SPECIFIC TO {show.title.toUpperCase()}
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
                <label className="td-mono" style={labelStyle}>ROLE (THIS SHOW)</label>
                <input className="td-focusable" style={inputStyle} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
              </div>
              <div>
                <label className="td-mono" style={labelStyle}>DEPARTMENT (THIS SHOW)</label>
                <select className="td-focusable" style={inputStyle} value={draft.dept} onChange={(e) => setDraft({ ...draft, dept: e.target.value })}>
                  {DEPARTMENT_ORDER.map((d) => (
                    <option key={d} value={d}>{DEPARTMENTS[d].label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="td-mono" style={labelStyle}>PHONE</label>
            <input className="td-focusable" style={inputStyle} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>EMAIL</label>
            <input className="td-focusable" style={inputStyle} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </div>
        </div>
        {history.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <label className="td-mono" style={labelStyle}>{show ? 'HISTORY (OTHER SHOWS)' : 'SHOW HISTORY'}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {history.map((a) => {
                const s = shows.find((sh) => sh.id === a.showId);
                return (
                  <span key={a.id} className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '3px 8px' }}>
                    {s ? s.title : a.showId} — {a.role}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={save}
            disabled={!draft.name.trim() || (!!show && !draft.role.trim())}
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
        <div className="td-body" style={{ fontSize: 13.5, color: COLOR.textPrimary, fontWeight: 500 }}>{member.name}</div>
        {show && (
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 2, fontStyle: assignment ? 'normal' : 'italic' }}>
            {assignment ? assignment.role : `Not on ${show.title}`}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
        {history.map((a) => {
          const s = shows.find((sh) => sh.id === a.showId);
          return (
            <span
              key={a.id}
              className="td-mono"
              style={{ fontSize: 9.5, color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '2px 6px' }}
            >
              {s ? s.title : a.showId} — {a.role}
            </span>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
        <a href={`tel:${member.phone}`} className="td-focusable" style={{ color: COLOR.textFaint }} aria-label={`Call ${member.name}`}>
          <Phone size={13} strokeWidth={1.75} />
        </a>
        <a href={`mailto:${member.email}`} className="td-focusable" style={{ color: COLOR.textFaint }} aria-label={`Email ${member.name}`}>
          <Mail size={13} strokeWidth={1.75} />
        </a>
        {!show || assignment ? (
          <button onClick={startEdit} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${member.name}`}>
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
// ---------------------------------------------------------------------------
// NEW CREW MEMBER FORM
// ---------------------------------------------------------------------------
export function NewCrewForm({ show, onAdd, onClose, DEPARTMENTS, DEPARTMENT_ORDER, positions }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('electrics');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

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
          {show ? `Add to ${show.title}` : 'Add to company roster'}
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
              <label className="td-mono" style={labelStyle}>ROLE (THIS SHOW)</label>
              {positions && positions.length ? (
                <select className="td-focusable" style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="">Choose...</option>
                  {positions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <input className="td-focusable" style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Board Op" />
              )}
            </div>
            <div>
              <label className="td-mono" style={labelStyle}>DEPARTMENT</label>
              <select className="td-focusable" style={inputStyle} value={dept} onChange={(e) => setDept(e.target.value)}>
                {DEPARTMENT_ORDER.map((d) => (
                  <option key={d} value={d}>{DEPARTMENTS[d].label}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label className="td-mono" style={labelStyle}>PHONE (IF NEW)</label>
          <input className="td-focusable" style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-0100" />
        </div>
        <div>
          <label className="td-mono" style={labelStyle}>EMAIL (IF NEW)</label>
          <input className="td-focusable" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@venue.org" />
        </div>
      </div>
      <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, marginTop: 10 }}>
        {show
          ? `If this name matches someone already on the roster, this just adds them to ${show.title} — it won't create a duplicate person.`
          : "Adds a baseline company member with no show assigned yet. Pick a show later to give them a role."}
      </div>
      <button
        className="td-focusable"
        disabled={!name.trim() || (!!show && !role.trim())}
        onClick={() => onAdd({ name: name.trim(), role: role.trim(), dept, phone: phone.trim() || '—', email: email.trim() || '—' })}
        style={{
          marginTop: 14,
          background: name.trim() && (!show || role.trim()) ? COLOR.amber : COLOR.slateDim,
          color: name.trim() && (!show || role.trim()) ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: name.trim() && (!show || role.trim()) ? 'pointer' : 'not-allowed',
        }}
      >
        Add to roster
      </button>
    </div>
  );
}
// ---------------------------------------------------------------------------
// IDENTITY — lightweight self-service sign-in, scoped to the show currently
// selected. Matches an existing platform person by name; if they're not yet
// linked to this show, prompts only for the show-specific role.
// ---------------------------------------------------------------------------
export function IdentitySignIn({ show, crew, setCrew, currentUserId, setCurrentUserId, DEPARTMENTS, DEPARTMENT_ORDER, positions }) {
  const currentUser = crew.find((c) => c.id === currentUserId);
  const currentAssignment = currentUser ? assignmentFor(currentUser, show.id) : null;
  const [name, setName] = useState('');
  const [step, setStep] = useState('name');
  const [matchedPerson, setMatchedPerson] = useState(null);
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('general');

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
            {currentAssignment.role} · {DEPARTMENTS[currentAssignment.dept]?.label} · {show.title}
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
    const existing = crew.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
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
    if (!role.trim()) return;
    if (matchedPerson) {
      const newAssignment = { id: `asn-${matchedPerson.id}-${show.id}`, showId: show.id, role: role.trim(), dept };
      setCrew((prev) => prev.map((c) => (c.id === matchedPerson.id ? { ...c, assignments: [...(c.assignments || []), newAssignment] } : c)));
      setCurrentUserId(matchedPerson.id);
    } else {
      const newId = `c${Date.now()}`;
      const newAssignment = { id: `asn-${newId}-${show.id}`, showId: show.id, role: role.trim(), dept };
      setCrew((prev) => [...prev, { id: newId, name: name.trim(), phone: '—', email: '—', assignments: [newAssignment] }]);
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
              ? `${matchedPerson.name} is on the company roster but not yet linked to ${show.title} — what's your role here?`
              : `${name} isn't on the roster yet — finish your profile to sign up for calls.`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="td-mono" style={labelStyle}>ROLE ON {show.title.toUpperCase()}</label>
              {positions && positions.length ? (
                <select className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="">Choose...</option>
                  {positions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <input className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Electrician, or just Flex" />
              )}
            </div>
            <div>
              <label className="td-mono" style={labelStyle}>DEPARTMENT</label>
              <select className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={dept} onChange={(e) => setDept(e.target.value)}>
                {DEPARTMENT_ORDER.map((d) => (
                  <option key={d} value={d}>{DEPARTMENTS[d].label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleJoin}
              disabled={!role.trim()}
              className="td-focusable"
              style={{
                background: role.trim() ? COLOR.amber : COLOR.slateDim,
                color: role.trim() ? COLOR.void : COLOR.textFaint,
                border: 'none',
                borderRadius: 3,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: role.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {step === 'link' ? `Join ${show.title}` : 'Join the crew'}
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
export function CrewModule({ show, shows, crew, setCrew, currentUserId, setCurrentUserId, DEPARTMENTS, DEPARTMENT_ORDER, positions }) {
  const [showForm, setShowForm] = useState(false);
  const onShow = show ? crew.filter((m) => assignmentFor(m, show.id)) : [];
  const notOnShow = show ? crew.filter((m) => !assignmentFor(m, show.id)) : crew;

  const byDept = useMemo(() => {
    if (!show) return {};
    const grouped = {};
    DEPARTMENT_ORDER.forEach((d) => (grouped[d] = []));
    onShow.forEach((m) => {
      const a = assignmentFor(m, show.id);
      if (!grouped[a.dept]) grouped[a.dept] = [];
      grouped[a.dept].push(m);
    });
    return grouped;
  }, [onShow, show]);

  function handleManualAdd({ name, role, dept, phone, email }) {
    const existing = crew.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (show) {
      if (existing) {
        const newAssignment = { id: `asn-${existing.id}-${show.id}`, showId: show.id, role, dept };
        setCrew((prev) => prev.map((c) => (c.id === existing.id ? { ...c, assignments: [...(c.assignments || []).filter((a) => a.showId !== show.id), newAssignment] } : c)));
      } else {
        const newId = `c${Date.now()}`;
        const newAssignment = { id: `asn-${newId}-${show.id}`, showId: show.id, role, dept };
        setCrew((prev) => [...prev, { id: newId, name, phone, email, assignments: [newAssignment] }]);
      }
    } else if (!existing) {
      const newId = `c${Date.now()}`;
      setCrew((prev) => [...prev, { id: newId, name, phone, email, assignments: [] }]);
    }
    setShowForm(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <ExportCsvButton
          filename={`${show ? show.title : 'company'}-crew`}
          rows={() =>
            crew.map((m) => {
              const a = show ? assignmentFor(m, show.id) : null;
              return {
                Name: m.name,
                'On this show': a ? 'yes' : 'no',
                Position: a ? a.role || '' : '',
                Department: a ? (DEPARTMENTS[a.dept] || {}).label || a.dept || '' : '',
                Phone: m.phone || '',
                Email: m.email || '',
              };
            })
          }
        />
      </div>
      {show && <IdentitySignIn show={show} crew={crew} setCrew={setCrew} currentUserId={currentUserId} setCurrentUserId={setCurrentUserId} DEPARTMENTS={DEPARTMENTS} DEPARTMENT_ORDER={DEPARTMENT_ORDER} positions={positions} />}

      {!show && (
        <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginBottom: 16 }}>
          No show selected — showing the full company roster. Pick a show from the sidebar to assign roles and departments here.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em' }}>
          {show ? `ON ${show.title.toUpperCase()} — ${onShow.length} CREW` : `COMPANY ROSTER — ${crew.length} CREW`}
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

      {showForm && <NewCrewForm show={show} onAdd={handleManualAdd} onClose={() => setShowForm(false)} DEPARTMENTS={DEPARTMENTS} DEPARTMENT_ORDER={DEPARTMENT_ORDER} positions={positions} />}

      {show && onShow.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 26 }}>
          {DEPARTMENT_ORDER.filter((d) => byDept[d] && byDept[d].length > 0).map((d) => {
            const Icon = DEPARTMENTS[d].icon;
            return (
              <div key={d}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <Icon size={14} color={COLOR.textMuted} strokeWidth={1.75} />
                  <span className="td-display" style={{ fontSize: 13, color: COLOR.textMuted, letterSpacing: '0.05em' }}>
                    {DEPARTMENTS[d].label} — {byDept[d].length}
                  </span>
                </div>
                <div>
                  {byDept[d].map((m) => (
                    <RosterRow key={m.id} member={m} show={show} shows={shows} setCrew={setCrew} DEPARTMENTS={DEPARTMENTS} DEPARTMENT_ORDER={DEPARTMENT_ORDER} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {show && onShow.length === 0 && (
        <div style={{ marginBottom: 26 }}>
          <StubPanel label={`No one is on ${show.title} yet`} hint="Add crew to the company roster first, then assign them to this show and pick their position. Positions come from Settings, so Board Op reads the same on every production - add them there first if the list is empty." />
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
            {notOnShow.map((m) => (
              <RosterRow key={m.id} member={m} show={show} shows={shows} setCrew={setCrew} DEPARTMENTS={DEPARTMENTS} DEPARTMENT_ORDER={DEPARTMENT_ORDER} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
