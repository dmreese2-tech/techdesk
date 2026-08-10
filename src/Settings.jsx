import React, { useEffect, useState } from 'react';
import { Building2, Check, Image as ImageIcon, Layers, MapPin, Pencil, Plus, RotateCcw, Star, Upload, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { supabase } from './supabaseClient.js';
import { MembersPanel } from './Shell.jsx';
import { PositionsPanel } from './Positions.jsx';
import { PositionPermissionsPanel } from './PositionPermissions.jsx';
import { stockDepartments } from './shared.jsx';

// SETTINGS — venues, storage locations, positions, and the two taxonomies that
// feed the pickers elsewhere: departments and cast types.

// ---------------------------------------------------------------------------
// SETTINGS MODULE
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// TAXONOMY EDITOR — a single editable category list. Departments have their own
// editor below, with the extra fields they carry; this one is for cast types.
// Existing entries keep their original icon; new entries get a shared
// fallback icon since there's no icon picker here.
// ---------------------------------------------------------------------------
export function TaxonomyEditor({ title, note, map, order, setMap, setOrder, defaultIcon, colors = false }) {
  const [newLabel, setNewLabel] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [labelDraft, setLabelDraft] = useState('');

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '5px 8px',
    color: COLOR.textPrimary,
    fontSize: 12,
  };

  function slugify(label) {
    const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
    let key = base;
    let n = 1;
    while (map[key]) key = `${base}_${++n}`;
    return key;
  }
  function addEntry() {
    if (!newLabel.trim()) return;
    const key = slugify(newLabel);
    setMap((prev) => ({ ...prev, [key]: { label: newLabel.trim(), icon: defaultIcon } }));
    setOrder((prev) => [...prev, key]);
    setNewLabel('');
  }
  function saveLabel(key) {
    const label = labelDraft.trim();
    if (!label) return;
    setMap((prev) => ({ ...prev, [key]: { ...prev[key], label } }));
    setEditingKey(null);
  }
  function removeEntry(key) {
    setMap((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setOrder((prev) => prev.filter((k) => k !== key));
  }

  return (
    <div style={{ border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '12px 14px' }}>
      <div className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em', marginBottom: note ? 4 : 10 }}>
        {title.toUpperCase()}
      </div>
      {note && <div className="td-body" style={{ fontSize: 10.5, color: COLOR.textFaint, marginBottom: 10, lineHeight: 1.4 }}>{note}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {order.filter((key) => map[key]).map((key) => {
          const entry = map[key];
          const Icon = entry.icon || defaultIcon;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {colors ? (
                // The swatch is the control. A native colour input is ugly but
                // it is also the one every OS already knows how to drive, and
                // this is a setting people touch once a season.
                <label
                  title={`Colour for ${entry.label} on the script`}
                  style={{ position: 'relative', width: 14, height: 14, borderRadius: 3, flexShrink: 0, cursor: 'pointer', background: entry.color || COLOR.slateDim, border: `1px solid ${COLOR.line}` }}
                >
                  <input
                    type="color"
                    value={entry.color || '#E8A33D'}
                    onChange={(e) => setMap((prev) => ({ ...prev, [key]: { ...prev[key], color: e.target.value } }))}
                    style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                  />
                </label>
              ) : (
                <Icon size={12.5} color={COLOR.textMuted} strokeWidth={1.75} />
              )}
              {editingKey === key ? (
                <>
                  <input
                    className="td-focusable"
                    autoFocus
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveLabel(key)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={() => saveLabel(key)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.amber, cursor: 'pointer', display: 'flex' }} aria-label="Save">
                    <Check size={13} />
                  </button>
                </>
              ) : (
                <>
                  <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, flex: 1 }}>{entry.label}</span>
                  <button
                    onClick={() => { setEditingKey(key); setLabelDraft(entry.label); }}
                    className="td-focusable"
                    style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
                    aria-label={`Rename ${entry.label}`}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => removeEntry(key)}
                    className="td-focusable"
                    style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
                    aria-label={`Remove ${entry.label}`}
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          );
        })}
        {order.filter((key) => map[key]).length === 0 && (
          <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>Nothing here yet.</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="td-focusable"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEntry()}
          placeholder="Add new..."
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={addEntry}
          disabled={!newLabel.trim()}
          className="td-focusable"
          style={{
            background: 'none',
            border: `1px solid ${newLabel.trim() ? COLOR.amber : COLOR.line}`,
            color: newLabel.trim() ? COLOR.amber : COLOR.textFaint,
            borderRadius: 3,
            padding: '5px 9px',
            cursor: newLabel.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
          }}
          aria-label={`Add to ${title}`}
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// DEPARTMENTS EDITOR — the one list that replaced four.
//
// Crew rosters, staff areas, inventory categories and cue departments were four
// editors describing the same departments, and keeping them in step was a
// clerical job nobody signed up for. This is the single list, with the two
// things that used to be implied by *which* list you were in now stated
// explicitly on the department itself:
//
//   CUE    — the prefix its cues carry. Blank means it doesn't call cues, and
//            it stays out of every cue picker. This is what used to be
//            "is it in the cue departments list".
//   STOCK  — whether it keeps inventory. This is what used to be "is it in the
//            inventory categories list".
//
// The colour is the department's, not the cue's — it was only ever on cue
// departments because they were the only ones that drew anything, and a
// department that starts calling cues next season shouldn't need one picked in
// a hurry.
// ---------------------------------------------------------------------------
export function DepartmentsEditor({ map, order, setMap, setOrder, defaultIcon }) {
  const [newLabel, setNewLabel] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [labelDraft, setLabelDraft] = useState('');

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '5px 8px',
    color: COLOR.textPrimary,
    fontSize: 12,
  };

  function slugify(label) {
    const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'department';
    let key = base;
    let n = 1;
    while (map[key]) key = `${base}_${++n}`;
    return key;
  }
  function addEntry() {
    if (!newLabel.trim()) return;
    const key = slugify(newLabel);
    // New departments start calling nothing and keeping nothing. Both are one
    // click away, and both are answers only the company can give.
    setMap((prev) => ({ ...prev, [key]: { label: newLabel.trim(), icon: defaultIcon, color: '#9AA5B1', stock: false } }));
    setOrder((prev) => [...prev, key]);
    setNewLabel('');
  }
  function patch(key, fields) {
    setMap((prev) => ({ ...prev, [key]: { ...prev[key], ...fields } }));
  }
  function saveLabel(key) {
    const label = labelDraft.trim();
    if (!label) return;
    patch(key, { label });
    setEditingKey(null);
  }
  function setCue(key, raw) {
    const cue = raw.trim().toUpperCase();
    setMap((prev) => {
      const next = { ...prev[key] };
      // Deleted rather than blanked: `cue` present is what makes a department
      // call cues, so an empty string would leave it in the picker under a
      // nameless prefix.
      if (cue) next.cue = cue;
      else delete next.cue;
      return { ...prev, [key]: next };
    });
  }
  function removeEntry(key) {
    setMap((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setOrder((prev) => prev.filter((k) => k !== key));
  }

  const visible = order.filter((key) => map[key]);
  const headerCell = { fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.08em' };
  const GRID = '14px 1fr 62px 58px 22px';

  return (
    <div style={{ border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '12px 14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <span />
        <span className="td-mono" style={headerCell}>DEPARTMENT</span>
        <span className="td-mono" style={headerCell} title="The prefix this department's cues carry. Blank if it doesn't call cues.">CUE</span>
        <span className="td-mono" style={headerCell} title="Whether this department keeps stock in the inventory.">STOCK</span>
        <span />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
        {visible.map((key) => {
          const entry = map[key];
          const Icon = entry.icon || defaultIcon;
          return (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center' }}>
              {/* The swatch is the control. A native colour input is ugly but it
                  is also the one every OS already knows how to drive, and this
                  is a setting people touch once a season. */}
              <label
                title={`Colour for ${entry.label} on the script`}
                style={{ position: 'relative', width: 14, height: 14, borderRadius: 3, cursor: 'pointer', background: entry.color || COLOR.slateDim, border: `1px solid ${COLOR.line}` }}
              >
                <input
                  type="color"
                  value={entry.color || '#9AA5B1'}
                  onChange={(e) => patch(key, { color: e.target.value })}
                  style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                />
              </label>

              {editingKey === key ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    className="td-focusable"
                    autoFocus
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveLabel(key)}
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  />
                  <button onClick={() => saveLabel(key)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.amber, cursor: 'pointer', display: 'flex' }} aria-label="Save">
                    <Check size={13} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingKey(key); setLabelDraft(entry.label); }}
                  className="td-focusable"
                  title={`Rename ${entry.label}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', minWidth: 0 }}
                >
                  <Icon size={12.5} color={COLOR.textMuted} strokeWidth={1.75} />
                  <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.label}</span>
                  <Pencil size={10} color={COLOR.textFaint} />
                </button>
              )}

              <input
                className="td-focusable td-mono"
                value={entry.cue || ''}
                onChange={(e) => setCue(key, e.target.value)}
                placeholder="—"
                maxLength={6}
                aria-label={`Cue prefix for ${entry.label}`}
                title={entry.cue ? `Cues read "${entry.cue} 12"` : `${entry.label} doesn't call cues`}
                style={{ ...inputStyle, width: '100%', textAlign: 'center', letterSpacing: '0.06em', color: entry.cue ? COLOR.textPrimary : COLOR.textFaint }}
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: COLOR.textFaint, cursor: 'pointer' }} title={`Does ${entry.label} keep stock?`}>
                <input
                  type="checkbox"
                  checked={!!entry.stock}
                  onChange={(e) => patch(key, { stock: e.target.checked })}
                  aria-label={`${entry.label} keeps stock`}
                />
                {entry.stock ? 'Yes' : 'No'}
              </label>

              <button
                onClick={() => removeEntry(key)}
                className="td-focusable"
                style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
                aria-label={`Remove ${entry.label}`}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>No departments yet.</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="td-focusable"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEntry()}
          placeholder="Add a department..."
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={addEntry}
          disabled={!newLabel.trim()}
          className="td-focusable"
          style={{
            background: 'none',
            border: `1px solid ${newLabel.trim() ? COLOR.amber : COLOR.line}`,
            color: newLabel.trim() ? COLOR.amber : COLOR.textFaint,
            borderRadius: 3,
            padding: '5px 9px',
            cursor: newLabel.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
          }}
          aria-label="Add department"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMPANY LOGO
//
// Stored as a small data URL on org_settings, not in a storage bucket: it's one
// tiny image per company, everyone who can read the settings can already see
// the company name, and this way it arrives with the rest of the settings in
// the same round trip the app already makes.
//
// Whatever gets picked is redrawn onto a canvas at bar size before it's saved,
// so a 4 MB photo from someone's phone becomes a few kilobytes and the row
// stays small enough to sync without anyone noticing.
// ---------------------------------------------------------------------------
const LOGO_MAX_H = 64;   // twice the 22px it renders at, for sharp screens
const LOGO_MAX_W = 260;
const LOGO_MAX_BYTES = 160 * 1024;

function shrinkToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like an image file."));
      img.onload = () => {
        const scale = Math.min(LOGO_MAX_H / img.height, LOGO_MAX_W / img.width, 1);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // PNG first so a logo with a transparent background stays transparent;
        // fall back to JPEG on white only if the PNG is too heavy to store.
        let url = canvas.toDataURL('image/png');
        if (url.length > LOGO_MAX_BYTES) {
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          url = canvas.toDataURL('image/jpeg', 0.85);
        }
        if (url.length > LOGO_MAX_BYTES) {
          reject(new Error('That image is too detailed to store. Try a simpler or smaller one.'));
          return;
        }
        resolve(url);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// `heading` off renders just the control, for embedding as a card inside the
// Company section — which is where a logo belongs, being company identity
// rather than a setting in its own right.
export function CompanyLogoPanel({ orgLogo, setOrgLogo, sectionTitle, sectionNote, heading = true, canEdit = true }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = React.useRef(null);

  async function onPick(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';   // so picking the same file twice still fires
    if (!file) return;
    setError('');
    if (!/^image\//.test(file.type)) {
      setError("That doesn't look like an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('That file is over 8 MB. Pick something smaller.');
      return;
    }
    setBusy(true);
    try {
      setOrgLogo(await shrinkToDataUrl(file));
    } catch (e) {
      setError(e.message || "That image couldn't be used.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {heading && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <ImageIcon size={14} color={COLOR.textMuted} strokeWidth={1.75} />
            <span className="td-display" style={sectionTitle}>Company Logo</span>
          </div>
          <div className="td-body" style={sectionNote}>
            Appears in the top bar just before the company name, next to the Tech Desk mark — it sits alongside the app logo rather than replacing it. A wide image with a transparent background reads best.
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 132,
            height: 52,
            padding: '0 12px',
            background: COLOR.void,
            border: `1px solid ${COLOR.line}`,
            borderRadius: 4,
          }}
        >
          {orgLogo ? (
            <img src={orgLogo} alt="Company logo" style={{ maxHeight: 36, maxWidth: 180, width: 'auto', display: 'block' }} />
          ) : (
            <span className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, letterSpacing: '0.08em' }}>NO LOGO</span>
          )}
        </div>

        <input ref={inputRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
        {canEdit && <button
          onClick={() => inputRef.current && inputRef.current.click()}
          disabled={busy}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.textPrimary, border: `1px solid ${COLOR.lineBright}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          <Upload size={13} /> {busy ? 'Working…' : orgLogo ? 'Replace logo' : 'Upload logo'}
        </button>}
        {canEdit && orgLogo && (
          <button
            onClick={() => { setOrgLogo(''); setError(''); }}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
          >
            <X size={13} /> Remove
          </button>
        )}
      </div>

      {error && (
        <div className="td-body" style={{ fontSize: 12, color: COLOR.amber, marginTop: 10 }}>{error}</div>
      )}
    </div>
  );
}

// A labelled card. Company is three of these side by side.
function SettingCard({ label, children }) {
  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '11px 13px' }}>
      <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.08em', marginBottom: 8 }}>
        {label.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

// A list of removable chips with an add field. Venues and locations were two
// copies of this markup distinguished only by their notes, which is what made
// them look like two subjects instead of one.
function ChipEditor({ label, note, items, onRemove, value, setValue, onAdd, placeholder }) {
  return (
    <div>
      <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.08em', marginBottom: 3 }}>
        {label.toUpperCase()}
      </div>
      <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginBottom: 9 }}>{note}</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {items.length === 0 && (
          <span className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>None yet.</span>
        )}
        {items.map((item) => (
          <span
            key={item}
            className="td-mono"
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: COLOR.textPrimary, border: `1px solid ${COLOR.line}`, borderRadius: 20, padding: '5px 8px 5px 12px' }}
          >
            {item}
            <button
              onClick={() => onRemove(item)}
              className="td-focusable"
              style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
              aria-label={`Remove ${item}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="td-focusable"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          placeholder={placeholder}
          style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '8px 10px', color: COLOR.textPrimary, fontSize: 13, flex: 1, maxWidth: 280 }}
        />
        <button
          onClick={onAdd}
          disabled={!value.trim()}
          className="td-focusable"
          style={{ background: value.trim() ? COLOR.amber : COLOR.slateDim, color: value.trim() ? COLOR.void : COLOR.textFaint, border: 'none', borderRadius: 3, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: value.trim() ? 'pointer' : 'not-allowed' }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

export function SettingsModule({
  positions,
  setPositions,
  orgLogo, setOrgLogo,
  venues, setVenues, locations, setLocations,
  DEPARTMENTS, setDEPARTMENTS, DEPARTMENT_ORDER, setDEPARTMENT_ORDER,
  CAST_TYPES, setCAST_TYPES, CAST_TYPE_ORDER, setCAST_TYPE_ORDER,
  orgId, onSignOut, isAdmin,
}) {
  const [newVenue, setNewVenue] = useState('');
  const [newLocation, setNewLocation] = useState('');

  const [orgName, setOrgName] = useState('your company');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteTier, setInviteTier] = useState('cast');
  const [rotating, setRotating] = useState(false);

  async function rotateCode() {
    setRotating(true);
    const { data } = await supabase.rpc('rotate_invite_code', { check_org_id: orgId });
    setRotating(false);
    if (data) setInviteCode(data);
  }

  async function saveInviteTier(tier) {
    setInviteTier(tier);
    await supabase.from('orgs').update({ invite_tier: tier }).eq('id', orgId);
  }

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('orgs')
      .select('name, invite_code, invite_tier')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setOrgName(data.name);
        setInviteCode(data.invite_code || '');
        setInviteTier(data.invite_tier || 'cast');
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  function addVenue() {
    const v = newVenue.trim();
    if (!v || venues.includes(v)) return;
    setVenues((prev) => [...prev, v]);
    setNewVenue('');
  }
  function removeVenue(v) {
    setVenues((prev) => prev.filter((x) => x !== v));
  }

  function addLocation() {
    const l = newLocation.trim();
    if (!l || locations.includes(l)) return;
    setLocations((prev) => [...prev, l]);
    setNewLocation('');
  }
  function removeLocation(l) {
    setLocations((prev) => prev.filter((x) => x !== l));
  }

  const sectionTitle = { fontSize: 13, color: COLOR.textMuted, letterSpacing: '0.05em', marginBottom: 4 };
  const sectionNote = { fontSize: 12.5, color: COLOR.textFaint, marginBottom: 14 };

  const sectionHeader = (Icon, title, note) => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon size={14} color={COLOR.textMuted} strokeWidth={1.75} />
        <span className="td-display" style={sectionTitle}>{title}</span>
      </div>
      <div className="td-body" style={sectionNote}>{note}</div>
    </>
  );

  // Read-only is applied per section rather than as one wrapper around the
  // middle of the page, so Company can sit at the top and People can sit
  // between two admin-only sections without either being greyed out.
  const adminOnly = isAdmin === false ? { pointerEvents: 'none', opacity: 0.6 } : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 640 }}>
      {isAdmin === false && (
        <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted, background: COLOR.card, border: `1px solid ${COLOR.line}`, borderLeft: `3px solid ${COLOR.blueprint}`, borderRadius: 4, padding: '10px 14px' }}>
          You can link accounts to the roster below. The company's vocabulary — departments, places, positions and what each one may edit — is admin-only, so the rest of this page is read-only for you.
        </div>
      )}

      {/* COMPANY — first, because the invite code is the thing you hand to a new
          person, and it used to be the last item on a long page. The logo lives
          here too: it is company identity, not a setting of its own. */}
      <div>
        {sectionHeader(Building2, 'Company', 'Who you are and how people get in.')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(196px, 1fr))', gap: 12, marginBottom: 14 }}>
          <SettingCard label="Logo">
            <div style={adminOnly}>
              <CompanyLogoPanel orgLogo={orgLogo} setOrgLogo={setOrgLogo} heading={false} canEdit={isAdmin !== false} />
            </div>
            <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textPrimary, marginTop: 9 }}>{orgName}</div>
          </SettingCard>

          <SettingCard label="Invite code">
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <code style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 10px', color: COLOR.textPrimary, fontSize: 12.5, letterSpacing: '0.08em', fontFamily: "'IBM Plex Mono', monospace" }}>
                {inviteCode || '————'}
              </code>
              <button
                onClick={() => navigator.clipboard && inviteCode && navigator.clipboard.writeText(inviteCode)}
                className="td-focusable"
                title="Copy the code"
                style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '5px 9px', fontSize: 11, cursor: 'pointer' }}
              >
                Copy
              </button>
              {isAdmin !== false && (
                <button
                  onClick={rotateCode}
                  disabled={rotating}
                  className="td-focusable"
                  title="Issue a new code. Anyone still holding the old one can no longer join."
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.lineBright}`, borderRadius: 3, padding: '5px 9px', fontSize: 11, cursor: rotating ? 'default' : 'pointer' }}
                >
                  <RotateCcw size={12} /> {rotating ? 'Rotating…' : 'Rotate'}
                </button>
              )}
            </div>
          </SettingCard>

          <SettingCard label="Joins as">
            {isAdmin === false ? (
              <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted }}>
                {inviteTier === 'staff' ? 'Staff' : 'Cast'}
              </div>
            ) : (
              <select
                className="td-focusable"
                value={inviteTier}
                onChange={(e) => saveInviteTier(e.target.value)}
                style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textPrimary, fontSize: 12, padding: '5px 8px', width: '100%' }}
              >
                <option value="cast">Cast — reads only what concerns them</option>
                <option value="staff">Staff — reads the whole company</option>
              </select>
            )}
          </SettingCard>
        </div>

        <div className="td-body" style={{ fontSize: 12, color: COLOR.textFaint, marginBottom: 14 }}>
          Give the code to teammates so they can join <strong>{orgName}</strong> from the "Join existing" option. Rotate it whenever you like — the old one stops working immediately, which is the point of having one.
        </div>

        <button
          onClick={onSignOut}
          className="td-focusable"
          style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>

      {/* DEPARTMENTS — no longer inside a "Categories & taxonomies" wrapper.
          That heading was a home for four lists that kept drifting apart; with
          departments as the spine it would be a category of one. */}
      <div style={adminOnly}>
        {sectionHeader(Layers, 'Departments', "One list, four jobs. A department decides who's on the roster, whether it calls cues, and whether it keeps stock.")}
        <DepartmentsEditor
          map={DEPARTMENTS}
          order={DEPARTMENT_ORDER}
          setMap={setDEPARTMENTS}
          setOrder={setDEPARTMENT_ORDER}
          defaultIcon={Layers}
        />
      </div>

      {/* POSITIONS — a job title, the department it sits in, and what it may
          edit. The same subject three ways, so it is one panel. */}
      <div style={adminOnly}>
        <PositionsPanel
          positions={positions}
          setPositions={setPositions}
          departments={DEPARTMENTS}
          departmentOrder={DEPARTMENT_ORDER}
        >
          <PositionPermissionsPanel
            orgId={orgId}
            positions={positions}
            inventoryCategories={stockDepartments(DEPARTMENTS)}
            departments={DEPARTMENTS}
            sectionTitle={sectionTitle}
            sectionNote={sectionNote}
          />
        </PositionsPanel>
      </div>

      {/* PEOPLE and PLACES — People stays outside the read-only treatment,
          because linking an account to a roster person is not admin-only. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
        <MembersPanel orgId={orgId} sectionTitle={sectionTitle} sectionNote={sectionNote} />

        <div style={adminOnly}>
          {sectionHeader(MapPin, 'Places', 'Venues you perform in, locations you store in.')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <ChipEditor
              label="Venues"
              note="Offered when a production is added to the board."
              items={venues}
              onRemove={removeVenue}
              value={newVenue}
              setValue={setNewVenue}
              onAdd={addVenue}
              placeholder="e.g. Courtyard Stage"
            />
            <ChipEditor
              label="Locations"
              note="Where things are kept — inventory and set pieces pick from this."
              items={locations}
              onRemove={removeLocation}
              value={newLocation}
              setValue={setNewLocation}
              onAdd={addLocation}
              placeholder="e.g. Paint Loft"
            />
          </div>
        </div>
      </div>

      {/* CAST TYPES — its own list, because a cast type isn't a department. */}
      <div style={adminOnly}>
        {sectionHeader(Star, 'Cast types', "Its own list, because a cast type isn't a department.")}
        <TaxonomyEditor
          title="Cast types"
          note="How actors are grouped — lead, ensemble, understudy..."
          map={CAST_TYPES}
          order={CAST_TYPE_ORDER}
          setMap={setCAST_TYPES}
          setOrder={setCAST_TYPE_ORDER}
          defaultIcon={Star}
        />
      </div>
    </div>
  );
}
