import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Globe, ShieldCheck, Sparkles } from 'lucide-react';
import { COLOR } from './theme.jsx';
import {
  GRANTABLE_MODULES,
  defaultsForPosition,
  loadPositionPermissions,
  savePositionPermission,
} from './permissions.js';

// ---------------------------------------------------------------------------
// POSITION PERMISSIONS
//
// What a job title is allowed to edit. Assigning someone to a production as
// Props Master is what grants them props on that production — nobody has to
// remember to also tick a box, and nobody accumulates access from a show that
// closed two seasons ago.
//
// Nothing here is enforced yet. These are the rules being written down; the
// database starts refusing writes in Phase 4.
// ---------------------------------------------------------------------------

const KIND_LABELS = { crew: 'Crew', musician: 'Band', staff: 'Staff' };

function Pill({ on, label, title, onClick }) {
  return (
    <button
      onClick={onClick}
      className="td-focusable"
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: on ? COLOR.amber : 'transparent',
        color: on ? COLOR.void : COLOR.textMuted,
        border: `1px solid ${on ? COLOR.amber : COLOR.line}`,
        borderRadius: 20,
        padding: '4px 10px',
        fontSize: 11,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {on && <Check size={11} />}
      {label}
    </button>
  );
}

function PositionRow({ orgId, kind, position, value, inventoryCategories, onSaved, onError }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(value), [value]);

  const commit = async (next) => {
    setDraft(next);
    setBusy(true);
    try {
      await savePositionPermission(orgId, kind, position, next);
      onSaved(kind, position, next);
    } catch (e) {
      onError(e.message || 'That did not save.');
      setDraft(value);
    } finally {
      setBusy(false);
    }
  };

  const toggleModule = (key) => {
    const has = draft.modules.includes(key);
    commit({ ...draft, modules: has ? draft.modules.filter((m) => m !== key) : [...draft.modules, key] });
  };

  const toggleCategory = (cat) => {
    const has = draft.inventoryCategories.includes(cat);
    commit({
      ...draft,
      inventoryCategories: has
        ? draft.inventoryCategories.filter((c) => c !== cat)
        : [...draft.inventoryCategories, cat],
    });
  };

  const applyDefault = () => {
    const d = defaultsForPosition(position);
    if (!d) return;
    commit({
      modules: d.modules || [],
      inventoryCategories: d.inventory === 'all' ? [] : d.inventory || [],
      companyWide: !!d.companyWide,
      ...(d.inventory === 'all' ? { modules: [...(d.modules || []), 'inventory'] } : {}),
    });
  };

  const suggestion = defaultsForPosition(position);
  const untouched = draft.modules.length === 0 && draft.inventoryCategories.length === 0;

  return (
    <div style={{ border: `1px solid ${COLOR.line}`, borderRadius: 4, marginBottom: 8, background: COLOR.card }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="td-focusable"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'transparent',
          border: 'none',
          color: COLOR.textPrimary,
          padding: '9px 11px',
          fontSize: 12.5,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span style={{ flex: 1 }}>{position}</span>
        {draft.companyWide && (
          <span className="td-mono" title="Writes on every production, assigned or not" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: COLOR.blueprint, letterSpacing: '0.08em' }}>
            <Globe size={11} /> COMPANY-WIDE
          </span>
        )}
        <span className="td-mono" style={{ fontSize: 10, color: untouched ? COLOR.textFaint : COLOR.amber }}>
          {untouched ? 'READ ONLY' : `${draft.modules.length} ${draft.modules.length === 1 ? 'MODULE' : 'MODULES'}`}
          {draft.inventoryCategories.length > 0 ? ` + ${draft.inventoryCategories.length} STOCK` : ''}
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 11px 12px 30px', opacity: busy ? 0.6 : 1 }}>
          {suggestion && untouched && (
            <button
              onClick={applyDefault}
              className="td-focusable"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px solid ${COLOR.blueprint}`, borderRadius: 3, color: COLOR.blueprint, fontSize: 11.5, padding: '5px 10px', cursor: 'pointer', marginBottom: 10 }}
            >
              <Sparkles size={12} /> Use the usual permissions for a {position.toLowerCase()}
            </button>
          )}

          <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.08em', marginBottom: 6 }}>CAN EDIT</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {GRANTABLE_MODULES.map((m) => (
              <Pill
                key={m.key}
                on={draft.modules.includes(m.key)}
                label={m.label}
                title={m.note}
                onClick={() => toggleModule(m.key)}
              />
            ))}
          </div>

          <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, letterSpacing: '0.08em', marginBottom: 6 }}>
            STOCK THEY LOOK AFTER
          </div>
          <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginBottom: 6 }}>
            Inventory is company stock and is granted category by category. A props master
            keeps the Props shelves; that says nothing about the rest of the warehouse.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {inventoryCategories.length === 0 ? (
              <span className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>
                No inventory categories yet — add them under Categories &amp; Taxonomies above.
              </span>
            ) : (
              inventoryCategories.map((cat) => (
                <Pill key={cat} on={draft.inventoryCategories.includes(cat)} label={cat} onClick={() => toggleCategory(cat)} />
              ))
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: COLOR.textMuted, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={draft.companyWide}
              onChange={(e) => commit({ ...draft, companyWide: e.target.checked })}
            />
            Holds this across the whole company, assigned to a production or not
          </label>
        </div>
      )}
    </div>
  );
}

export function PositionPermissionsPanel({ orgId, positions, inventoryCategories, sectionTitle, sectionNote }) {
  const [perms, setPerms] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadPositionPermissions(orgId)
      .then((p) => {
        if (!cancelled) setPerms(p);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Permissions could not be read.');
          setPerms({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const onSaved = (kind, position, value) => {
    setPerms((prev) => ({ ...prev, [`${kind}:${position}`]: value }));
  };

  const categories = useMemo(() => Object.keys(inventoryCategories || {}), [inventoryCategories]);
  const anyPositions = ['crew', 'musician', 'staff'].some((k) => (positions?.[k] || []).length > 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <ShieldCheck size={14} color={COLOR.textMuted} strokeWidth={1.75} />
        <span className="td-display" style={sectionTitle}>What each position can edit</span>
      </div>
      <div className="td-body" style={sectionNote}>
        Assigning someone to a production as Props Master is what gives them props on that
        production — and only that production, unless the position is marked company-wide.
        Nothing here is enforced yet; these are the rules being written down.
      </div>

      {error && <div className="td-body" style={{ ...sectionNote, color: COLOR.amber }}>{error}</div>}

      {!anyPositions ? (
        <div className="td-body" style={{ fontSize: 12.5, color: COLOR.textFaint, border: `1px dashed ${COLOR.line}`, borderRadius: 4, padding: 14 }}>
          No positions yet. Add them under Positions above — Stage Manager, Props Master,
          Master Electrician — and each one appears here with the permissions that come
          with the job.
        </div>
      ) : perms === null ? (
        <div className="td-body" style={sectionNote}>Loading…</div>
      ) : (
        ['staff', 'crew', 'musician'].map((kind) =>
          (positions?.[kind] || []).length === 0 ? null : (
            <div key={kind} style={{ marginBottom: 16 }}>
              <div className="td-mono" style={{ fontSize: 10, color: COLOR.blueprint, letterSpacing: '0.08em', marginBottom: 7 }}>
                {(KIND_LABELS[kind] || kind).toUpperCase()} POSITIONS
              </div>
              {(positions[kind] || []).map((position) => (
                <PositionRow
                  key={position}
                  orgId={orgId}
                  kind={kind}
                  position={position}
                  value={perms[`${kind}:${position}`] || { modules: [], inventoryCategories: [], companyWide: false }}
                  inventoryCategories={categories}
                  onSaved={onSaved}
                  onError={setError}
                />
              ))}
            </div>
          )
        )
      )}
    </div>
  );
}
