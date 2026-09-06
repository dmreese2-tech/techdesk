import React, { useMemo, useState } from 'react';
import { AlertTriangle, LayoutGrid, Mail, MailWarning, Mic, Pencil, Phone, Plus, Settings, Table2, Trash2, UserMinus, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { ImportCsvButton } from './csvImport.jsx';
import { actorsSpec, musiciansSpec, staffSpec } from './importSpecs.jsx';
import { assignmentFor, assignmentsFor } from './shared.jsx';
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
// ---------------------------------------------------------------------------
// ROLE ROWS — up to three {roleTitle, category} pairs on one person, for
// actors playing more than one part in the same show (a swing, a double
// cast, a small role stacked on a lead). Understudies don't need this: two
// different people can already claim the same character with different
// categories, which the grouped roster already handles.
// ---------------------------------------------------------------------------
const MAX_ROLE_ROWS = 3;
function RoleRows({ rows, setRows, roleLabel, rolePlaceholder, roleOptions, categoryMap, categoryOrder, inputStyle, labelStyle }) {
  function updateRow(i, field, value) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((prev) => (prev.length >= MAX_ROLE_ROWS ? prev : [...prev, { roleTitle: '', category: categoryOrder[0] }]));
  }
  function removeRow(i) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  return (
    <div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: rows.length > 1 ? '1.3fr 1fr auto' : '1.3fr 1fr', gap: 10, marginBottom: 8, alignItems: 'end' }}>
          <div>
            <label className="td-mono" style={labelStyle}>
              {roleLabel}{rows.length > 1 ? ` — ROLE ${i + 1}` : ''}
            </label>
            {roleOptions ? (
              <select className="td-focusable" style={inputStyle} value={row.roleTitle} onChange={(e) => updateRow(i, 'roleTitle', e.target.value)}>
                <option value="">Choose...</option>
                {roleOptions.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
                {row.roleTitle && !roleOptions.includes(row.roleTitle) && (
                  <option value={row.roleTitle}>{row.roleTitle} (not in list)</option>
                )}
              </select>
            ) : (
              <input className="td-focusable" style={inputStyle} value={row.roleTitle} onChange={(e) => updateRow(i, 'roleTitle', e.target.value)} placeholder={rolePlaceholder} />
            )}
          </div>
          <div>
            <label className="td-mono" style={labelStyle}>CATEGORY</label>
            <select className="td-focusable" style={inputStyle} value={row.category} onChange={(e) => updateRow(i, 'category', e.target.value)}>
              {categoryOrder.map((c) => (
                <option key={c} value={c}>{categoryMap[c]?.label || c}</option>
              ))}
              {row.category && !categoryOrder.includes(row.category) && (
                <option value={row.category}>{row.category} (not a department)</option>
              )}
            </select>
          </div>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="td-focusable"
              aria-label={`Remove role ${i + 1}`}
              style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', padding: '7px 2px' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      {rows.length < MAX_ROLE_ROWS && (
        <button
          type="button"
          onClick={addRow}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: COLOR.amber, cursor: 'pointer', fontSize: 11, padding: '2px 0', marginBottom: 4 }}
        >
          <Plus size={12} /> Add another role
        </button>
      )}
    </div>
  );
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
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
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
                  <option key={c} value={c}>{categoryMap[c]?.label || c}</option>
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
// PERSON EDIT FORM — the contact + role editor. Pulled out of PeopleRosterRow
// so the table view's rows can drop into the exact same editing UI instead of
// carrying a second copy that could drift from it.
// ---------------------------------------------------------------------------
function PersonEditForm({ person, assignment, show, shows, categoryMap, categoryOrder, roleLabel, roleOptions, audioOptions, setPeople, onDone }) {
  const allAssignments = show ? assignmentsFor(person, show.id) : [];
  const history = show ? (person.assignments || []).filter((a) => a.showId !== show.id) : (person.assignments || []);
  const rolesOrBlank = () => (allAssignments.length ? allAssignments.map((a) => ({ roleTitle: a.roleTitle, category: a.category })) : [{ roleTitle: '', category: categoryOrder[0] }]);
  const [draft, setDraft] = useState({
    name: person.name,
    phone: person.phone || '',
    email: person.email || '',
    roleRows: rolesOrBlank(),
    miced: assignment?.miced || false,
    micType: assignment?.micType || '',
    electric: assignment?.electric || false,
    monitorMix: assignment?.monitorMix || false,
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

  function save() {
    setPeople((prev) =>
      prev.map((p) => {
        if (p.id !== person.id) return p;
        const contact = { name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim() };
        if (!show) return { ...p, ...contact };
        const others = (p.assignments || []).filter((a) => a.showId !== show.id);
        const existingForShow = assignmentsFor(p, show.id);
        // Audio fields (mic'd, electric, monitor mix) are asked once per
        // person, not once per role, and are copied onto every assignment so
        // any consumer that reads the first match still sees them correctly
        // regardless of which of the person's roles it happens to find.
        const newAssignments = draft.roleRows
          .filter((r) => r.roleTitle.trim())
          .map((r, i) => ({
            id: existingForShow[i]?.id || `asn-${p.id}-${show.id}-${i}`,
            showId: show.id,
            roleTitle: r.roleTitle.trim(),
            category: r.category,
            miced: draft.miced,
            micType: draft.micType,
            electric: draft.electric,
            monitorMix: draft.monitorMix,
          }));
        return { ...p, ...contact, assignments: [...others, ...newAssignments] };
      })
    );
    onDone();
  }

  return (
    <div>
      {show && (
        <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.blueprint, letterSpacing: '0.04em', marginBottom: 8 }}>
          {roleLabel} & CATEGORY ARE SPECIFIC TO {show.title.toUpperCase()}
        </div>
      )}
      <div style={{ marginBottom: 8, maxWidth: show ? 320 : undefined }}>
        <label className="td-mono" style={labelStyle}>NAME</label>
        <input className="td-focusable" style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      {show && (
        <RoleRows
          rows={draft.roleRows}
          setRows={(updater) => setDraft((d) => ({ ...d, roleRows: typeof updater === 'function' ? updater(d.roleRows) : updater }))}
          roleLabel={roleLabel}
          roleOptions={roleOptions}
          categoryMap={categoryMap}
          categoryOrder={categoryOrder}
          inputStyle={inputStyle}
          labelStyle={labelStyle}
        />
      )}

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
          disabled={!draft.name.trim() || (!!show && !draft.roleRows.some((r) => r.roleTitle.trim()))}
          className="td-focusable"
          style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
        >
          Save
        </button>
        <button
          onClick={onDone}
          className="td-focusable"
          style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 14px', fontSize: 11.5, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// PEOPLE ROSTER ROW + GROUPED LIST
// ---------------------------------------------------------------------------
export function PeopleRosterRow({ person, assignment: assignmentProp, show, shows, categoryMap, categoryOrder, roleLabel, roleOptions, audioOptions, setPeople }) {
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // All of this person's roles on this show. A caller inside the grouped
  // view passes the one specific assignment this row is standing in for
  // (so a double-cast actor's two rows each show their own role); a caller
  // outside a group context (rest-of-company list) leaves it unset and gets
  // the first one, same as before.
  const allAssignments = show ? assignmentsFor(person, show.id) : [];
  const assignment = assignmentProp !== undefined ? assignmentProp : (allAssignments[0] || null);
  const history = show ? (person.assignments || []).filter((a) => a.showId !== show.id) : (person.assignments || []);
  const Icon = assignment ? categoryMap[assignment.category]?.icon : null;

  function startEdit() {
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

  if (editing) {
    return (
      <div style={{ padding: '12px 4px', borderBottom: `1px solid ${COLOR.line}`, background: COLOR.panel }}>
        <PersonEditForm
          person={person}
          assignment={assignment}
          show={show}
          shows={shows}
          categoryMap={categoryMap}
          categoryOrder={categoryOrder}
          roleLabel={roleLabel}
          roleOptions={roleOptions}
          audioOptions={audioOptions}
          setPeople={setPeople}
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }

  // A name that is too long ellipsises rather than widening the row. The row
  // lives in a grid column next to another department's roster, and anything
  // that cannot shrink here gets painted over that neighbour.
  const truncate = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

  return (
    <div style={{ padding: '10px 4px', borderBottom: `1px solid ${COLOR.line}`, minWidth: 0 }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0, flex: '0 1 auto' }}>
        <div className="td-body" style={{ fontSize: 13.5, color: COLOR.textPrimary, fontWeight: 500, ...truncate }}>{person.name}</div>
        {show && (
          <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 2, fontStyle: assignment ? 'normal' : 'italic', ...truncate }}>
            {assignment ? assignment.roleTitle : `Not on ${show.title}`}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
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
          <button
            onClick={() => { setConfirmingRemove((v) => !v); setConfirmingDelete(false); }}
            className="td-focusable"
            title={`Take ${person.name} off ${show.title}. They stay on the company roster.`}
            aria-label={`Take ${person.name} off ${show.title}`}
            style={{ background: 'none', border: 'none', color: confirmingRemove ? COLOR.amber : COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
          >
            <UserMinus size={13} strokeWidth={1.75} />
          </button>
        )}
        <button
          onClick={() => { setConfirmingDelete((v) => !v); setConfirmingRemove(false); }}
          className="td-focusable"
          title={`Remove ${person.name} from the company roster entirely — every production, not just this one.`}
          aria-label={`Remove ${person.name} from the company`}
          style={{ background: 'none', border: 'none', color: confirmingDelete ? COLOR.amber : COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
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

    {/* Confirmations get their own line rather than being squeezed into the
        icon strip. Squeezed into a row that could not shrink, the Delete
        button rendered on top of the NEXT DEPARTMENT'S roster — an
        irreversible control sitting over a different person's name. */}
    {(confirmingRemove || confirmingDelete) && (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginTop: 8,
          padding: '8px 10px',
          background: COLOR.void,
          border: `1px solid ${COLOR.amberDim}`,
          borderRadius: 3,
        }}
      >
        <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, flex: 1, minWidth: 120, lineHeight: 1.5 }}>
          {confirmingDelete ? (
            <>
              DELETE {person.name.toUpperCase()} FROM THE COMPANY?
              {(person.assignments || []).length ? ` ON ${(person.assignments || []).length} SHOW${(person.assignments || []).length === 1 ? '' : 'S'}` : ''}
              {person.userId ? ' — AN ACCOUNT IS LINKED TO THEM' : ''}
            </>
          ) : (
            <>TAKE {person.name.toUpperCase()} OFF {(show?.title || 'THIS SHOW').toUpperCase()}?</>
          )}
        </span>
        <button
          onClick={confirmingDelete ? deleteFromCompany : takeOffShow}
          className="td-focusable"
          style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '4px 11px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}
        >
          {confirmingDelete ? 'Delete' : 'Remove'}
        </button>
        <button
          onClick={() => { setConfirmingDelete(false); setConfirmingRemove(false); }}
          className="td-focusable"
          style={{ background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '4px 11px', fontSize: 10.5, cursor: 'pointer' }}
        >
          {confirmingDelete ? 'Cancel' : 'Keep'}
        </button>
      </div>
    )}
    </div>
  );
}
export function PeopleRosterGroups({ people, show, shows, categoryMap, categoryOrder, roleLabel, roleOptions, audioOptions, setPeople }) {
  const onShow = show ? people.filter((p) => assignmentFor(p, show.id)) : [];
  const notOnShow = show ? people.filter((p) => !assignmentFor(p, show.id)) : people;

  // Grouped by assignment, not by person: someone playing a Lead and a
  // Featured role in the same show has two assignments and shows up once in
  // each group, the same way the LEAD / FEATURED counts read on a program.
  const grouped = useMemo(() => {
    if (!show) return {};
    const g = {};
    categoryOrder.forEach((c) => (g[c] = []));
    onShow.forEach((p) => {
      assignmentsFor(p, show.id).forEach((a) => {
        if (!g[a.category]) g[a.category] = [];
        g[a.category].push({ person: p, assignment: a });
      });
    });
    return g;
  }, [onShow, show, categoryOrder]);

  // Anyone filed under a department that isn't in the order — deleted, renamed,
  // or written before the department merge — gets a group of their own at the
  // end. Dropping them from the roster silently is how somebody misses a call.
  const orphanKeys = useMemo(
    () => Object.keys(grouped).filter((c) => !categoryOrder.includes(c) && grouped[c].length > 0),
    [grouped, categoryOrder]
  );
  const groupKeys = [...categoryOrder.filter((c) => grouped[c] && grouped[c].length > 0), ...orphanKeys];

  return (
    <div>
      {show && onShow.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 26 }}>
          {groupKeys.map((c) => {
            const entry = categoryMap[c];
            const Icon = entry?.icon || AlertTriangle;
            return (
              <div key={c} style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <Icon size={14} color={entry ? COLOR.textMuted : COLOR.amber} strokeWidth={1.75} />
                  <span className="td-display" style={{ fontSize: 13, color: entry ? COLOR.textMuted : COLOR.amber, letterSpacing: '0.05em' }} title={entry ? undefined : `${c} is not a department any more — re-file these people`}>
                    {entry?.label || c} — {grouped[c].length}
                  </span>
                </div>
                <div>
                  {grouped[c].map(({ person: p, assignment: a }) => (
                    <PeopleRosterRow key={a.id} person={p} assignment={a} show={show} shows={shows} categoryMap={categoryMap} categoryOrder={categoryOrder} roleLabel={roleLabel} roleOptions={roleOptions} audioOptions={audioOptions} setPeople={setPeople} />
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
// PEOPLE TABLE — one line per person: contact details plus whatever they're
// playing on this show, for scanning or printing a callsheet-style list
// instead of paging through the grouped cards. Editing drops the row into
// the same PersonEditForm used by the card view, so the two stay in sync.
// ---------------------------------------------------------------------------
function PeopleTableRow({ person, assignment: assignmentProp, show, shows, categoryMap, categoryOrder, roleLabel, roleOptions, audioOptions, setPeople, colCount, showAudioCol }) {
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const allAssignments = show ? assignmentsFor(person, show.id) : [];
  const assignment = assignmentProp !== undefined ? assignmentProp : (allAssignments[0] || null);
  const history = show ? (person.assignments || []).filter((a) => a.showId !== show.id) : (person.assignments || []);
  const roleText = allAssignments.map((a) => a.roleTitle).filter(Boolean).join('; ');
  const categoryText = allAssignments.map((a) => categoryMap[a.category]?.label || a.category).filter(Boolean).join('; ');

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

  function deleteFromCompany() {
    setPeople((prev) => prev.filter((p) => p.id !== person.id));
    setConfirmingDelete(false);
  }

  const cellStyle = { padding: '9px 8px', borderBottom: `1px solid ${COLOR.line}`, verticalAlign: 'top' };
  const truncate = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 };

  if (editing) {
    return (
      <tr>
        <td colSpan={colCount} style={{ padding: '12px 8px', borderBottom: `1px solid ${COLOR.line}`, background: COLOR.panel }}>
          <PersonEditForm
            person={person}
            assignment={assignment}
            show={show}
            shows={shows}
            categoryMap={categoryMap}
            categoryOrder={categoryOrder}
            roleLabel={roleLabel}
            roleOptions={roleOptions}
            audioOptions={audioOptions}
            setPeople={setPeople}
            onDone={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr>
        <td style={cellStyle}>
          <div className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, fontWeight: 500, ...truncate }}>{person.name}</div>
        </td>
        {show && (
          <td style={cellStyle}>
            <span className="td-mono" style={{ fontSize: 11.5, color: assignment ? COLOR.textMuted : COLOR.textFaint, fontStyle: assignment ? 'normal' : 'italic' }}>
              {roleText || `Not on ${show.title}`}
            </span>
          </td>
        )}
        {show && (
          <td style={cellStyle}>
            <span className="td-mono" style={{ fontSize: 11.5, color: COLOR.textMuted }}>{categoryText || '—'}</span>
          </td>
        )}
        <td style={cellStyle}>
          {person.phone ? (
            <a href={`tel:${person.phone}`} className="td-focusable td-mono" style={{ color: COLOR.textMuted, fontSize: 11.5, textDecoration: 'none' }}>
              {person.phone}
            </a>
          ) : (
            <span className="td-mono" style={{ fontSize: 11.5, color: COLOR.textFaint }}>—</span>
          )}
        </td>
        <td style={cellStyle}>
          {person.email ? (
            <a href={`mailto:${person.email}`} className="td-focusable td-mono" style={{ color: COLOR.textMuted, fontSize: 11.5, textDecoration: 'none' }}>
              {person.email}
            </a>
          ) : (
            <span title={`No email for ${person.name}. Without one they can't link their account to this roster entry.`} style={{ color: COLOR.amberDim, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <MailWarning size={12} strokeWidth={1.75} />
              <span className="td-mono" style={{ fontSize: 11 }}>Missing</span>
            </span>
          )}
        </td>
        {showAudioCol && (
          <td style={cellStyle}>
            {audioOptions === 'mic' && assignment?.miced && (
              <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                MIC'D{assignment.micType ? ` · ${assignment.micType}` : ''}
              </span>
            )}
            {audioOptions === 'electric' && assignment?.electric && (
              <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                ELECTRIC{assignment.monitorMix ? ' · OWN MIX' : ''}
              </span>
            )}
          </td>
        )}
        {!show && (
          <td style={cellStyle}>
            <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint }}>
              {history.length ? `${history.length} show${history.length === 1 ? '' : 's'}` : '—'}
            </span>
          </td>
        )}
        <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {show && assignment && (
              <button
                onClick={() => { setConfirmingRemove((v) => !v); setConfirmingDelete(false); }}
                className="td-focusable"
                title={`Take ${person.name} off ${show.title}. They stay on the company roster.`}
                aria-label={`Take ${person.name} off ${show.title}`}
                style={{ background: 'none', border: 'none', color: confirmingRemove ? COLOR.amber : COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
              >
                <UserMinus size={13} strokeWidth={1.75} />
              </button>
            )}
            <button
              onClick={() => { setConfirmingDelete((v) => !v); setConfirmingRemove(false); }}
              className="td-focusable"
              title={`Remove ${person.name} from the company roster entirely — every production, not just this one.`}
              aria-label={`Remove ${person.name} from the company`}
              style={{ background: 'none', border: 'none', color: confirmingDelete ? COLOR.amber : COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
            {!show || assignment ? (
              <button onClick={() => setEditing(true)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }} aria-label={`Edit ${person.name}`}>
                <Pencil size={13} strokeWidth={1.75} />
              </button>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="td-focusable"
                style={{ background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amberDim}`, borderRadius: 3, padding: '3px 9px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
              >
                Add to show
              </button>
            )}
          </div>
        </td>
      </tr>
      {(confirmingRemove || confirmingDelete) && (
        <tr>
          <td colSpan={colCount} style={{ padding: '8px 10px', borderBottom: `1px solid ${COLOR.amberDim}`, background: COLOR.void }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="td-mono" style={{ fontSize: 9.5, color: COLOR.amber, flex: 1, minWidth: 120, lineHeight: 1.5 }}>
                {confirmingDelete ? (
                  <>
                    DELETE {person.name.toUpperCase()} FROM THE COMPANY?
                    {(person.assignments || []).length ? ` ON ${(person.assignments || []).length} SHOW${(person.assignments || []).length === 1 ? '' : 'S'}` : ''}
                    {person.userId ? ' — AN ACCOUNT IS LINKED TO THEM' : ''}
                  </>
                ) : (
                  <>TAKE {person.name.toUpperCase()} OFF {(show?.title || 'THIS SHOW').toUpperCase()}?</>
                )}
              </span>
              <button
                onClick={confirmingDelete ? deleteFromCompany : takeOffShow}
                className="td-focusable"
                style={{ background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '4px 11px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}
              >
                {confirmingDelete ? 'Delete' : 'Remove'}
              </button>
              <button
                onClick={() => { setConfirmingDelete(false); setConfirmingRemove(false); }}
                className="td-focusable"
                style={{ background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '4px 11px', fontSize: 10.5, cursor: 'pointer' }}
              >
                {confirmingDelete ? 'Cancel' : 'Keep'}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
export function PeopleTable({ people, show, shows, categoryMap, categoryOrder, roleLabel, roleOptions, audioOptions, setPeople }) {
  const onShow = show ? people.filter((p) => assignmentFor(p, show.id)) : [];
  const notOnShow = show ? people.filter((p) => !assignmentFor(p, show.id)) : people;

  const showAudioCol = !!(show && audioOptions);
  // NAME, [ROLE, CATEGORY if show], PHONE, EMAIL, [AUDIO if applicable],
  // [SHOWS if no show selected], plus the trailing actions column.
  const colCount = (show ? 5 : 4) + (showAudioCol ? 1 : 0) + 1;

  const th = {
    textAlign: 'left',
    padding: '7px 8px',
    fontSize: 9.5,
    letterSpacing: '0.06em',
    color: COLOR.textFaint,
    borderBottom: `1px solid ${COLOR.lineBright}`,
    whiteSpace: 'nowrap',
  };

  function Section({ title, list }) {
    if (!list.length) return null;
    return (
      <div style={{ marginBottom: 22 }}>
        {title && (
          <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 8 }}>
            {title}
          </div>
        )}
        <div style={{ overflowX: 'auto', border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>NAME</th>
                {show && <th style={th}>{roleLabel}</th>}
                {show && <th style={th}>CATEGORY</th>}
                <th style={th}>PHONE</th>
                <th style={th}>EMAIL</th>
                {showAudioCol && <th style={th}>AUDIO</th>}
                {!show && <th style={th}>SHOWS</th>}
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <PeopleTableRow
                  key={p.id}
                  person={p}
                  show={show}
                  shows={shows}
                  categoryMap={categoryMap}
                  categoryOrder={categoryOrder}
                  roleLabel={roleLabel}
                  roleOptions={roleOptions}
                  audioOptions={audioOptions}
                  setPeople={setPeople}
                  colCount={colCount}
                  showAudioCol={showAudioCol}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      {show && onShow.length > 0 && <Section title={`ON ${show.title.toUpperCase()} — ${onShow.length}`} list={onShow} />}
      {show && onShow.length === 0 && (
        <div style={{ marginBottom: 26 }}>
          <StubPanel label={`No one is on ${show.title} yet`} hint="Add people to the company roster first, then assign them to this show and pick what they play. Cast pick from the character list under Characters; band and staff pick from the position lists in Settings." />
        </div>
      )}
      {notOnShow.length > 0 && <Section title={show ? `REST OF THE COMPANY — ${notOnShow.length}` : null} list={notOnShow} />}
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
  const [roleRows, setRoleRows] = useState([{ roleTitle: '', category: categoryOrder[0] }]);
  const [audioFields, setAudioFields] = useState({ miced: false, micType: '', electric: false, monitorMix: false });
  const hasRole = roleRows.some((r) => r.roleTitle.trim());

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
      <div style={{ marginBottom: show ? 4 : 0 }}>
        <label className="td-mono" style={labelStyle}>NAME</label>
        <input className="td-focusable" style={{ ...inputStyle, maxWidth: show ? 320 : undefined }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
      </div>
      {show && (
        <div style={{ marginTop: 12 }}>
          <RoleRows
            rows={roleRows}
            setRows={setRoleRows}
            roleLabel={`${roleLabel} (THIS SHOW)`}
            rolePlaceholder={rolePlaceholder}
            roleOptions={roleOptions}
            categoryMap={categoryMap}
            categoryOrder={categoryOrder}
            inputStyle={inputStyle}
            labelStyle={labelStyle}
          />
        </div>
      )}

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
        disabled={!name.trim() || (!!show && !hasRole)}
        onClick={() =>
          onAdd({
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            roles: roleRows
              .filter((r) => r.roleTitle.trim())
              .map((r) => ({ roleTitle: r.roleTitle.trim(), category: r.category })),
            ...audioFields,
          })
        }
        style={{
          marginTop: 14,
          background: name.trim() && (!show || hasRole) ? COLOR.amber : COLOR.slateDim,
          color: name.trim() && (!show || hasRole) ? COLOR.void : COLOR.textFaint,
          border: 'none',
          borderRadius: 3,
          padding: '9px 16px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: name.trim() && (!show || hasRole) ? 'pointer' : 'not-allowed',
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
  // 'grouped' is the existing card layout, organized by department. 'table'
  // is the new flat, line-per-person view for scanning contact details.
  const [view, setView] = useState('grouped');

  function handleManualAdd({ name, phone, email, roles, ...audioFields }) {
    const existing = people.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (show) {
      const personId = existing ? existing.id : `p${Date.now()}`;
      // Same audio fields on every role — see the note in PeopleRosterRow.save.
      const newAssignments = (roles || []).map((r, i) => ({
        id: `asn-${personId}-${show.id}-${i}`,
        showId: show.id,
        roleTitle: r.roleTitle,
        category: r.category,
        ...audioFields,
      }));
      if (existing) {
        setPeople((prev) => prev.map((p) => (p.id === existing.id ? { ...p, phone: phone || p.phone, email: email || p.email, assignments: [...(p.assignments || []).filter((a) => a.showId !== show.id), ...newAssignments] } : p)));
      } else {
        setPeople((prev) => [...prev, { id: personId, name, phone, email, assignments: newAssignments }]);
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
              const items = rows.map((r) => importSpec.build(r, { show, castTypes: categoryMap, departments: categoryMap }));
              setPeople((prev) => [...prev, ...items]);
              return items.length;
            }}
          />
        )}
        <ExportCsvButton
          filename={`${show ? show.title : 'company'}-${personLabel}`}
          rows={() =>
            people.map((p) => {
              const asns = show ? assignmentsFor(p, show.id) : [];
              return {
                Name: p.name,
                'On this show': asns.length ? 'yes' : 'no',
                Role: asns.map((a) => a.roleTitle || '').filter(Boolean).join('; '),
                Category: asns.map((a) => (categoryMap[a.category] || {}).label || a.category || '').filter(Boolean).join('; '),
                Mic: (asns.find((a) => a.micChannel) || {}).micChannel || '',
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em' }}>
          {people.length} ON THE {personLabel.toUpperCase()} LIST
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* View toggle: grouped cards (default, organized by department) vs
              a flat table — one line per person with contact details laid out
              in columns, for scanning or printing a callsheet-style list. */}
          <div className="td-view-control" style={{ display: 'flex', border: `1px solid ${COLOR.line}`, borderRadius: 3, overflow: 'hidden' }}>
            <button
              onClick={() => setView('grouped')}
              className="td-focusable td-view-control"
              title="Grouped view"
              aria-label="Grouped view"
              aria-pressed={view === 'grouped'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: view === 'grouped' ? COLOR.cardHover : 'transparent',
                color: view === 'grouped' ? COLOR.amber : COLOR.textFaint,
                border: 'none',
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <LayoutGrid size={13} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => setView('table')}
              className="td-focusable td-view-control"
              title="Table view"
              aria-label="Table view"
              aria-pressed={view === 'table'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: view === 'table' ? COLOR.cardHover : 'transparent',
                color: view === 'table' ? COLOR.amber : COLOR.textFaint,
                border: 'none',
                borderLeft: `1px solid ${COLOR.line}`,
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Table2 size={13} strokeWidth={1.75} />
            </button>
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
        view === 'table' ? (
          <PeopleTable people={people} show={show} shows={shows} categoryMap={categoryMap} categoryOrder={categoryOrder} roleLabel={roleLabel} roleOptions={roleOptions} audioOptions={audioOptions} setPeople={setPeople} />
        ) : (
          <PeopleRosterGroups people={people} show={show} shows={shows} categoryMap={categoryMap} categoryOrder={categoryOrder} roleLabel={roleLabel} roleOptions={roleOptions} audioOptions={audioOptions} setPeople={setPeople} />
        )
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
