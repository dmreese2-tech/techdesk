import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { supabase } from './supabaseClient.js';

// ---------------------------------------------------------------------------
// REFERENCE IMAGES
//
// "Something like this" is how most costume and prop conversations start, and a
// link to a shop listing rots long before the show opens. So the picture lives
// with the item.
//
// The bytes go to Storage at {orgId}/{showId}/{module}/{imageId} — the path is
// what the policy reads to decide who may upload, so the module has to be in
// it. The item only ever stores the id and the file name, never the image, for
// the same reason the script PDF isn't in the shows row: a few hundred rows of
// base64 would make every save of that module enormous.
//
// Signed URLs rather than public ones. These sit next to notes naming
// suppliers and prices, and none of that should be one guessed URL away.
// ---------------------------------------------------------------------------

const BUCKET = 'references';
const MAX_IMAGES = 6;
const SIGNED_URL_TTL = 60 * 60; // an hour; the page is reloaded far more often

const pathFor = (orgId, showId, module, imageId) => `${orgId}/${showId}/${module}/${imageId}`;

export function ReferenceImages({ orgId, showId, module, images, onChange, canEdit = true, compact = false }) {
  const list = images || [];
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoomed, setZoomed] = useState(null);
  const inputRef = useRef(null);

  // Sign what we have whenever the set changes. One call for the batch rather
  // than one per thumbnail.
  useEffect(() => {
    let cancelled = false;
    if (list.length === 0) { setUrls({}); return undefined; }
    (async () => {
      const paths = list.map((img) => pathFor(orgId, showId, module, img.id));
      const { data, error: err } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
      if (cancelled || err || !data) return;
      const next = {};
      data.forEach((row, i) => { if (row.signedUrl) next[list[i].id] = row.signedUrl; });
      setUrls(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, showId, module, list.map((i) => i.id).join(',')]);

  async function handleFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length === 0) return;

    const room = MAX_IMAGES - list.length;
    if (room <= 0) {
      setError(`That's the ${MAX_IMAGES}-image limit. Remove one first.`);
      return;
    }

    setBusy(true);
    setError('');
    const added = [];
    for (const file of files.slice(0, room)) {
      if (!/^image\//.test(file.type)) { setError('Only images can go here.'); continue; }
      const id = `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      // eslint-disable-next-line no-await-in-loop
      const { error: err } = await supabase.storage
        .from(BUCKET)
        .upload(pathFor(orgId, showId, module, id), file, { contentType: file.type, upsert: false });
      if (err) { setError(err.message); break; }
      added.push({ id, name: file.name });
    }
    setBusy(false);
    if (added.length > 0) onChange([...list, ...added]);
  }

  async function remove(img) {
    // Storage first: an orphaned row you can still see and delete is a smaller
    // problem than a file nobody has a handle on any more.
    await supabase.storage.from(BUCKET).remove([pathFor(orgId, showId, module, img.id)]).catch(() => {});
    onChange(list.filter((i) => i.id !== img.id));
  }

  const size = compact ? 44 : 62;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {list.map((img) => (
          <div key={img.id} style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            <button
              onClick={() => urls[img.id] && setZoomed(urls[img.id])}
              className="td-focusable"
              title={img.name || 'Reference image'}
              style={{
                width: '100%', height: '100%', padding: 0, borderRadius: 3, overflow: 'hidden',
                border: `1px solid ${COLOR.line}`, background: COLOR.void, cursor: 'pointer', display: 'block',
              }}
            >
              {urls[img.id] ? (
                <img src={urls[img.id]} alt={img.name || 'Reference'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <span className="td-mono" style={{ fontSize: 8, color: COLOR.textFaint }}>…</span>
              )}
            </button>
            {canEdit && (
              <button
                onClick={() => remove(img)}
                className="td-focusable"
                aria-label={`Remove ${img.name || 'image'}`}
                style={{
                  position: 'absolute', top: -5, right: -5, width: 15, height: 15, borderRadius: 10,
                  background: COLOR.void, border: `1px solid ${COLOR.line}`, color: COLOR.textMuted,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                <X size={9} />
              </button>
            )}
          </div>
        ))}

        {canEdit && list.length < MAX_IMAGES && (
          <>
            <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
            <button
              onClick={() => inputRef.current && inputRef.current.click()}
              disabled={busy}
              className="td-focusable"
              title="Add reference images — examples of what this could be"
              style={{
                width: size, height: size, flexShrink: 0, borderRadius: 3,
                border: `1px dashed ${COLOR.line}`, background: 'transparent', color: COLOR.textFaint,
                cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ImagePlus size={compact ? 13 : 16} />
            </button>
          </>
        )}
      </div>

      {error && <div className="td-mono" style={{ fontSize: 10, color: COLOR.amber, marginTop: 5 }}>{error}</div>}

      {zoomed && (
        <div
          onClick={() => setZoomed(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, cursor: 'zoom-out' }}
        >
          <img src={zoomed} alt="Reference" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }} />
        </div>
      )}
    </div>
  );
}
