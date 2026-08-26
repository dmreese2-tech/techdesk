import React, { useState } from 'react';
import { Pencil, Plus, X, ExternalLink, Copy, Check } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { ExportCsvButton } from './csv.jsx';
import { ImportCsvButton } from './csvImport.jsx';
import { linksSpec } from './importSpecs.jsx';
import { StubPanel } from './ui.jsx';

// ---------------------------------------------------------------------------
// LINKS — the standing set of URLs a show runs on: headshot uploads, bio
// submissions, references, marketing/press intake, social media, line
// learning tracks, and anything else that lives off-site but everyone on the
// show needs to find fast.
//
// Scoped to one show, same as Costumes/Props/Set — a link is grantable by
// position through the same permissions system, so a production manager or
// stage manager can be handed "Links" without also being handed Settings.
//
// Each link carries a category (for grouping and iconography), a label, a
// URL, an optional audience note (who it's for), and a free-text note. There
// is no per-category taxonomy editor the way departments or cast types have
// one — the category list is fixed and short, and "Other" covers anything
// that doesn't fit rather than forcing a Settings trip to add a bucket for a
// single one-off link.
// ---------------------------------------------------------------------------

export const LINK_CATEGORIES = {
  headshots: { label: 'Headshots', color: COLOR.amber },
  bios: { label: 'Bios', color: COLOR.amber },
  references: { label: 'References', color: COLOR.blueprint },
  marketing: { label: 'Marketing / Press', color: COLOR.green },
  social: { label: 'Social Media', color: COLOR.green },
  line_learning: { label: 'Line Learning', color: COLOR.blueprint },
  forms: { label: 'Forms', color: COLOR.slate },
  other: { label: 'Other', color: COLOR.slate },
};
export const LINK_CATEGORY_ORDER = ['headshots', 'bios', 'references', 'marketing', 'social', 'line_learning', 'forms', 'other'];

const AUDIENCES = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'cast', label: 'Cast' },
  { id: 'crew', label: 'Crew' },
  { id: 'staff', label: 'Staff' },
  { id: 'musicians', label: 'Musicians' },
];

function normalizeUrl(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// ---------------------------------------------------------------------------
// FORM — add or edit one link.
// ---------------------------------------------------------------------------
export function LinkForm({ initial, onSave, onCancel }) {
  const [label, setLabel] = useState(initial?.label || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [category, setCategory] = useState(initial?.category || 'forms');
  const [audience, setAudience] = useState(initial?.audience || 'everyone');
  const [notes, setNotes] = useState(initial?.notes || '');

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

  function handleSave() {
    if (!label.trim() || !url.trim()) return;
    onSave({
      id: initial?.id || `lnk${Date.now()}`,
      label: label.trim(),
      url: normalizeUrl(url),
      category,
      audience,
      notes: notes.trim(),
    });
  }

  return (
    <div style={{ background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="td-display" style={{ fontSize: 15, color: COLOR.textPrimary, letterSpacing: '0.04em' }}>
          {initial ? 'Edit link' : 'Add link'}
        </div>
        <button onClick={onCancel} className="td-focusable" style={{ background: 'transparent', border: 'none', color: COLOR.textFaint, cursor: 'pointer', display: 'flex' }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Label</label>
          <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Headshot upload" autoFocus />
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
            {LINK_CATEGORY_ORDER.map((key) => (
              <option key={key} value={key}>{LINK_CATEGORIES[key].label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>URL</label>
        <input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="forms.google.com/..." />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Audience</label>
          <select style={inputStyle} value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Due before first tech" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          className="td-focusable"
          style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, padding: '8px 16px', fontSize: 12.5, cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="td-focusable"
          disabled={!label.trim() || !url.trim()}
          style={{
            background: COLOR.amber,
            border: 'none',
            borderRadius: 3,
            color: COLOR.void,
            padding: '8px 18px',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: label.trim() && url.trim() ? 'pointer' : 'not-allowed',
            opacity: label.trim() && url.trim() ? 1 : 0.5,
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROW — one link, grouped under its category heading by the caller.
// ---------------------------------------------------------------------------
export function LinkRow({ link, onEdit, onRemove }) {
  const [copied, setCopied] = useState(false);
  const audience = AUDIENCES.find((a) => a.id === link.audience) || AUDIENCES[0];

  function copyUrl() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link.url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: COLOR.card,
        border: `1px solid ${COLOR.line}`,
        borderRadius: 4,
        padding: '12px 14px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="td-body" style={{ fontSize: 13.5, color: COLOR.textPrimary, fontWeight: 600 }}>{link.label}</span>
          {link.audience && link.audience !== 'everyone' && (
            <span className="td-mono" style={{ fontSize: 10, color: COLOR.textFaint, letterSpacing: '0.05em' }}>{audience.label.toUpperCase()}</span>
          )}
        </div>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="td-mono"
          style={{ fontSize: 11.5, color: COLOR.blueprint, wordBreak: 'break-all', textDecoration: 'none' }}
        >
          {link.url}
        </a>
        {link.notes && (
          <div className="td-body" style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 3 }}>{link.notes}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          onClick={copyUrl}
          title="Copy link"
          className="td-focusable"
          style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: copied ? COLOR.green : COLOR.textMuted, padding: 6, cursor: 'pointer', display: 'flex' }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open link"
          className="td-focusable"
          style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, padding: 6, display: 'flex' }}
        >
          <ExternalLink size={14} />
        </a>
        <button
          onClick={onEdit}
          title="Edit"
          className="td-focusable"
          style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, padding: 6, cursor: 'pointer', display: 'flex' }}
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onRemove}
          title="Remove"
          className="td-focusable"
          style={{ background: 'transparent', border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted, padding: 6, cursor: 'pointer', display: 'flex' }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MODULE — the show's whole link list, grouped by category.
// ---------------------------------------------------------------------------
export function LinksModule({ show, setShows }) {
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const links = show.links || [];
  const filtered = filter === 'all' ? links : links.filter((l) => l.category === filter);

  function addLink(link) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, links: [...(s.links || []), link] } : s)));
    setAdding(false);
  }
  function saveLink(link) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, links: (s.links || []).map((l) => (l.id === link.id ? link : l)) } : s)));
    setEditingId(null);
  }
  function removeLink(id) {
    setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, links: (s.links || []).filter((l) => l.id !== id) } : s)));
  }

  const counts = LINK_CATEGORY_ORDER.reduce((acc, c) => {
    acc[c] = links.filter((l) => l.category === c).length;
    return acc;
  }, {});

  // Group the filtered set by category, in category order, skipping empties.
  const grouped = LINK_CATEGORY_ORDER.map((cat) => ({
    cat,
    items: filtered.filter((l) => l.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <ImportCsvButton
          filename={`${show.title}-links`}
          columns={linksSpec.columns}
          sample={linksSpec.sample}
          onImport={(rows) => {
            const items = rows.map((r) => linksSpec.build(r));
            setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, links: [...(s.links || []), ...items] } : s)));
            return items.length;
          }}
        />
        <ExportCsvButton
          filename={`${show.title}-links`}
          rows={() =>
            links.map((l) => ({
              Label: l.label || '',
              Category: (LINK_CATEGORIES[l.category] || {}).label || l.category || '',
              URL: l.url || '',
              Audience: (AUDIENCES.find((a) => a.id === l.audience) || {}).label || '',
              Notes: l.notes || '',
            }))
          }
        />
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
        <span className="td-mono" style={{ fontSize: 11, color: COLOR.textMuted }}>
          <strong style={{ color: COLOR.amber }}>{links.length}</strong> link{links.length === 1 ? '' : 's'} for {show.title}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ id: 'all', label: 'All' }, ...LINK_CATEGORY_ORDER.filter((c) => counts[c] > 0).map((c) => ({ id: c, label: LINK_CATEGORIES[c].label }))].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="td-focusable"
              style={{
                background: filter === f.id ? COLOR.amber : 'transparent',
                color: filter === f.id ? COLOR.void : COLOR.textMuted,
                border: `1px solid ${filter === f.id ? COLOR.amber : COLOR.line}`,
                borderRadius: 20,
                padding: '5px 14px',
                fontSize: 12,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setAdding((v) => !v); setEditingId(null); }}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add link
        </button>
      </div>

      {adding && <LinkForm onSave={addLink} onCancel={() => setAdding(false)} />}

      {grouped.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {grouped.map(({ cat, items }) => (
            <div key={cat}>
              <div className="td-mono" style={{ fontSize: 11, color: LINK_CATEGORIES[cat].color, letterSpacing: '0.08em', marginBottom: 8 }}>
                {LINK_CATEGORIES[cat].label.toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((link) =>
                  editingId === link.id ? (
                    <LinkForm key={link.id} initial={link} onSave={saveLink} onCancel={() => setEditingId(null)} />
                  ) : (
                    <LinkRow
                      key={link.id}
                      link={link}
                      onEdit={() => { setEditingId(link.id); setAdding(false); }}
                      onRemove={() => removeLink(link.id)}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <StubPanel
          label={links.length === 0 ? `No links for ${show.title} yet` : 'Nothing matches this filter'}
          hint="Add the standing links this show runs on — headshot upload, bio submission, references, marketing intake, social media, line-learning tracks — so everyone can find them from one place instead of digging through email."
        />
      )}
    </div>
  );
}
