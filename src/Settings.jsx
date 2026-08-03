import React, { useEffect, useState } from 'react';
import { Box, Boxes, Briefcase, Check, ClipboardList, Copy, Image as ImageIcon, Layers, MapPin, Music, Pencil, Plus, RotateCcw, Star, Upload, Users, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { supabase } from './supabaseClient.js';
import { MembersPanel } from './Shell.jsx';
import { PositionsPanel } from './Positions.jsx';
import { PositionPermissionsPanel } from './PositionPermissions.jsx';

// SETTINGS — venues, storage locations, instruments, positions and every
// category taxonomy that feeds the pickers elsewhere.

// ---------------------------------------------------------------------------
// SETTINGS MODULE
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// TAXONOMY EDITOR — a single editable category list (department, cast type,
// staff area, instrument section, inventory category, cue department).
// Existing entries keep their original icon; new entries get a shared
// fallback icon since there's no icon picker here.
// ---------------------------------------------------------------------------
export function TaxonomyEditor({ title, note, map, order, setMap, setOrder, defaultIcon }) {
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
              <Icon size={12.5} color={COLOR.textMuted} strokeWidth={1.75} />
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

export function CompanyLogoPanel({ orgLogo, setOrgLogo, sectionTitle, sectionNote }) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <ImageIcon size={14} color={COLOR.textMuted} strokeWidth={1.75} />
        <span className="td-display" style={sectionTitle}>Company Logo</span>
      </div>
      <div className="td-body" style={sectionNote}>
        Appears in the top bar just before the company name, next to the Tech Desk mark — it sits alongside the app logo rather than replacing it. A wide image with a transparent background reads best.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
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
        <button
          onClick={() => inputRef.current && inputRef.current.click()}
          disabled={busy}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.textPrimary, border: `1px solid ${COLOR.lineBright}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          <Upload size={13} /> {busy ? 'Working…' : orgLogo ? 'Replace logo' : 'Upload logo'}
        </button>
        {orgLogo && (
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

export function SettingsModule({
  positions,
  setPositions,
  orgLogo, setOrgLogo,
  venues, setVenues, locations, setLocations, instruments, setInstruments, onReset,
  DEPARTMENTS, setDEPARTMENTS, DEPARTMENT_ORDER, setDEPARTMENT_ORDER,
  CAST_TYPES, setCAST_TYPES, CAST_TYPE_ORDER, setCAST_TYPE_ORDER,
  STAFF_AREAS, setSTAFF_AREAS, STAFF_AREA_ORDER, setSTAFF_AREA_ORDER,
  MUSIC_SECTIONS, setMUSIC_SECTIONS, MUSIC_SECTION_ORDER, setMUSIC_SECTION_ORDER,
  INVENTORY_CATEGORIES, setINVENTORY_CATEGORIES, INVENTORY_CATEGORY_ORDER, setINVENTORY_CATEGORY_ORDER,
  CUE_DEPTS, setCUE_DEPTS, CUE_DEPT_ORDER, setCUE_DEPT_ORDER,
  lastSavedAt, persistenceError, orgId, onSignOut,
}) {
  const [newVenue, setNewVenue] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newInstrument, setNewInstrument] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [orgName, setOrgName] = useState('your company');

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('orgs')
      .select('name')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setOrgName(data.name);
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

  function addInstrument() {
    const i = newInstrument.trim();
    if (!i || instruments.includes(i)) return;
    setInstruments((prev) => [...prev, i]);
    setNewInstrument('');
  }
  function removeInstrument(i) {
    setInstruments((prev) => prev.filter((x) => x !== i));
  }

  const sectionTitle = { fontSize: 13, color: COLOR.textMuted, letterSpacing: '0.05em', marginBottom: 4 };
  const sectionNote = { fontSize: 12.5, color: COLOR.textFaint, marginBottom: 14 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 640 }}>
      {/* Company Logo */}
      <CompanyLogoPanel orgLogo={orgLogo} setOrgLogo={setOrgLogo} sectionTitle={sectionTitle} sectionNote={sectionNote} />

      {/* Venues & Spaces */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <MapPin size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Venues &amp; Spaces</span>
        </div>
        <div className="td-body" style={sectionNote}>These appear in the venue list when a production is added to the board.</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {venues.map((v) => (
            <span
              key={v}
              className="td-mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11.5,
                color: COLOR.textPrimary,
                border: `1px solid ${COLOR.line}`,
                borderRadius: 20,
                padding: '5px 8px 5px 12px',
              }}
            >
              {v}
              <button
                onClick={() => removeVenue(v)}
                className="td-focusable"
                style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
                aria-label={`Remove ${v}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="td-focusable"
            value={newVenue}
            onChange={(e) => setNewVenue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addVenue()}
            placeholder="Add a space, e.g. Courtyard Stage"
            style={{
              background: COLOR.void,
              border: `1px solid ${COLOR.line}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLOR.textPrimary,
              fontSize: 13,
              flex: 1,
              maxWidth: 280,
            }}
          />
          <button
            onClick={addVenue}
            disabled={!newVenue.trim()}
            className="td-focusable"
            style={{
              background: newVenue.trim() ? COLOR.amber : COLOR.slateDim,
              color: newVenue.trim() ? COLOR.void : COLOR.textFaint,
              border: 'none',
              borderRadius: 3,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: newVenue.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Locations */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Box size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Locations</span>
        </div>
        <div className="td-body" style={sectionNote}>Storage and staging spots — anywhere a location is picked (inventory, set pieces) pulls from this list.</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {locations.map((l) => (
            <span
              key={l}
              className="td-mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11.5,
                color: COLOR.textPrimary,
                border: `1px solid ${COLOR.line}`,
                borderRadius: 20,
                padding: '5px 8px 5px 12px',
              }}
            >
              {l}
              <button
                onClick={() => removeLocation(l)}
                className="td-focusable"
                style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
                aria-label={`Remove ${l}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="td-focusable"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLocation()}
            placeholder="Add a location, e.g. Paint Loft"
            style={{
              background: COLOR.void,
              border: `1px solid ${COLOR.line}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLOR.textPrimary,
              fontSize: 13,
              flex: 1,
              maxWidth: 280,
            }}
          />
          <button
            onClick={addLocation}
            disabled={!newLocation.trim()}
            className="td-focusable"
            style={{
              background: newLocation.trim() ? COLOR.amber : COLOR.slateDim,
              color: newLocation.trim() ? COLOR.void : COLOR.textFaint,
              border: 'none',
              borderRadius: 3,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: newLocation.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Instruments */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Music size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Instruments</span>
        </div>
        <div className="td-body" style={sectionNote}>What shows up when picking a musician's instrument on the Band page.</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {instruments.map((i) => (
            <span
              key={i}
              className="td-mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11.5,
                color: COLOR.textPrimary,
                border: `1px solid ${COLOR.line}`,
                borderRadius: 20,
                padding: '5px 8px 5px 12px',
              }}
            >
              {i}
              <button
                onClick={() => removeInstrument(i)}
                className="td-focusable"
                style={{ background: 'none', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}
                aria-label={`Remove ${i}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="td-focusable"
            value={newInstrument}
            onChange={(e) => setNewInstrument(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addInstrument()}
            placeholder="Add an instrument, e.g. Oboe"
            style={{
              background: COLOR.void,
              border: `1px solid ${COLOR.line}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLOR.textPrimary,
              fontSize: 13,
              flex: 1,
              maxWidth: 280,
            }}
          />
          <button
            onClick={addInstrument}
            disabled={!newInstrument.trim()}
            className="td-focusable"
            style={{
              background: newInstrument.trim() ? COLOR.amber : COLOR.slateDim,
              color: newInstrument.trim() ? COLOR.void : COLOR.textFaint,
              border: 'none',
              borderRadius: 3,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: newInstrument.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Categories & taxonomies */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Layers size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Categories & taxonomies</span>
        </div>
        <div className="td-body" style={sectionNote}>
          The vocabulary that threads through Crew, Cast, Band, Staff, Inventory, Set, and Run of Show. Rename or remove existing entries, or add new ones — everywhere these show up as a picker pulls from this list.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <TaxonomyEditor
            title="Crew rosters"
            note="Departments crew members belong to, per show."
            map={DEPARTMENTS}
            order={DEPARTMENT_ORDER}
            setMap={setDEPARTMENTS}
            setOrder={setDEPARTMENT_ORDER}
            defaultIcon={Layers}
          />
          <TaxonomyEditor
            title="Cast types"
            note="How actors are grouped — lead, ensemble, understudy..."
            map={CAST_TYPES}
            order={CAST_TYPE_ORDER}
            setMap={setCAST_TYPES}
            setOrder={setCAST_TYPE_ORDER}
            defaultIcon={Star}
          />
          <TaxonomyEditor
            title="Staff areas"
            note="Directing, back office, and other production staff."
            map={STAFF_AREAS}
            order={STAFF_AREA_ORDER}
            setMap={setSTAFF_AREAS}
            setOrder={setSTAFF_AREA_ORDER}
            defaultIcon={Briefcase}
          />
          <TaxonomyEditor
            title="Band sections"
            note="Instrument parts — keys, strings, winds..."
            map={MUSIC_SECTIONS}
            order={MUSIC_SECTION_ORDER}
            setMap={setMUSIC_SECTIONS}
            setOrder={setMUSIC_SECTION_ORDER}
            defaultIcon={Music}
          />
          <TaxonomyEditor
            title="Inventory categories"
            note="How gear is grouped in the stock room."
            map={INVENTORY_CATEGORIES}
            order={INVENTORY_CATEGORY_ORDER}
            setMap={setINVENTORY_CATEGORIES}
            setOrder={setINVENTORY_CATEGORY_ORDER}
            defaultIcon={Boxes}
          />
          <TaxonomyEditor
            title="Cue departments"
            note="LX, sound, fly... the prefix on every cue number."
            map={CUE_DEPTS}
            order={CUE_DEPT_ORDER}
            setMap={setCUE_DEPTS}
            setOrder={setCUE_DEPT_ORDER}
            defaultIcon={ClipboardList}
          />
        </div>
      </div>

        {/* Persistence */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Check size={14} color={persistenceError ? COLOR.amber : COLOR.green} strokeWidth={1.75} />
            <span className="td-display" style={sectionTitle}>
              Saving{lastSavedAt ? ` — last saved ${lastSavedAt.toLocaleTimeString()}` : ''}
            </span>
          </div>
          {persistenceError && (
            <div className="td-body" style={{ ...sectionNote, color: COLOR.amber }}>
              Couldn't reach the database — recent changes may not have been saved. Check your connection; the app keeps retrying as you work.
            </div>
          )}
        </div>

      {/* Data */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <RotateCcw size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Data</span>
        </div>
        <div className="td-body" style={{ ...sectionNote, color: COLOR.amber }}>
          This clears production data for your whole company — every show, every roster, everything — for everyone signed in, not just this device. Restores the sample board in its place.
        </div>
        {confirmingReset ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
            <span className="td-body" style={{ fontSize: 12.5, color: COLOR.textMuted }}>
              Type your company's name (<strong>{orgName}</strong>) to confirm. This can't be undone.
            </span>
            <input
              className="td-focusable"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder={orgName}
              style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 10px', color: COLOR.textPrimary, fontSize: 12.5 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { onReset(); setConfirmingReset(false); setResetConfirmText(''); }}
                disabled={resetConfirmText.trim() !== orgName}
                className="td-focusable"
                style={{
                  background: resetConfirmText.trim() === orgName ? COLOR.amber : COLOR.slateDim,
                  color: resetConfirmText.trim() === orgName ? COLOR.void : COLOR.textFaint,
                  border: 'none', borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 700,
                  cursor: resetConfirmText.trim() === orgName ? 'pointer' : 'not-allowed',
                }}
              >
                Confirm reset
              </button>
              <button
                onClick={() => { setConfirmingReset(false); setResetConfirmText(''); }}
                className="td-focusable"
                style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingReset(true)}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
          >
            <RotateCcw size={13} /> Reset to demo data
          </button>
        )}
      </div>

      {/* Members */}
        {/* Positions */}
        <PositionsPanel positions={positions} setPositions={setPositions} />

        {/* What each position can edit */}
        <PositionPermissionsPanel
          orgId={orgId}
          positions={positions}
          inventoryCategories={INVENTORY_CATEGORIES}
          sectionTitle={sectionTitle}
          sectionNote={sectionNote}
        />

        <MembersPanel orgId={orgId} sectionTitle={sectionTitle} sectionNote={sectionNote} />

        {/* Company */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Users size={14} color={COLOR.textMuted} strokeWidth={1.75} />
          <span className="td-display" style={sectionTitle}>Company</span>
        </div>
        <div className="td-body" style={sectionNote}>
          Share this ID with teammates so they can join <strong>{orgName}</strong> from the "Join existing" option when they sign up.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <code style={{ background: COLOR.void, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 10px', color: COLOR.textMuted, fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace" }}>
            {orgId}
          </code>
          <button
            onClick={() => navigator.clipboard && navigator.clipboard.writeText(orgId)}
            className="td-focusable"
            style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}
          >
            Copy
          </button>
        </div>
        <button
          onClick={onSignOut}
          className="td-focusable"
          style={{ background: 'transparent', color: COLOR.textFaint, border: `1px solid ${COLOR.line}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
