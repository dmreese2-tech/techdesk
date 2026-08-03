import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Crosshair, Download, Eye, EyeOff, FileText, Footprints, Plus, StickyNote, Trash2, Upload } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { uploadScriptPdf, downloadScriptPdf, deleteScriptPdf } from './persistence.js';
import { COLOR } from './theme.jsx';

// The worker is bundled, not fetched from a CDN.
//
// It used to point at a hardcoded cdnjs URL for 4.0.379 while package.json
// asked for ^4.0.379 — which npm happily resolved to 4.10.38. pdf.js refuses a
// worker whose version doesn't match the API, falls back to a "fake worker",
// and every upload died in the catch that reported "Could not upload that PDF".
// The bug wasn't in the uploader; nothing ever reached it.
//
// Importing the worker through Vite means it can never drift from the version
// actually installed, and a theatre with bad wifi still gets a working script.
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
import { cueCode, deptColor } from './shared.jsx';
import { StubPanel } from './ui.jsx';

// SCRIPT — the uploaded PDF, click-to-place cue markers on the real page, and
// the annotated export.

// ---------------------------------------------------------------------------
// SCRIPT MODULE — upload the show's PDF, click on a page to drop a cue at
// that spot, export a new PDF with every cue burned onto the page it was
// placed on. Rendering (pdfjs-dist) and export (pdf-lib) are the only two
// features in this file that depend on packages outside lucide-react —
// see the import comment at the top of the file.
// ---------------------------------------------------------------------------
// The variants a production actually keeps. Presets so the callboard reads the
// same on every show; the free-text box below covers everything else.
export const SCRIPT_TYPES = [
  { key: 'original', label: 'Original' },
  { key: 'cues', label: 'Script with cues' },
  { key: 'blocking', label: 'Script with blocking notes' },
  { key: 'choreo', label: 'Script with choreo notes' },
  { key: 'rehearsal', label: 'Rehearsal draft' },
];

export function ScriptModule({ show, orgId, cueSheets, setShows, CUE_DEPTS, canEdit = true }) {
  const versions = show.scriptVersions || [];
  const [activeId, setActiveId] = useState(null);
  // Fall back to the first version rather than nothing, so opening the section
  // shows a script instead of an empty frame with a picker above it.
  const script = versions.find((v) => v.id === activeId) || versions[0] || null;
  const cues = cueSheets[show.id] || [];
  const choreo = show.choreography || [];

  // A marker written before there were kinds is a cue — it has a cueId and
  // nothing else. Reading that as 'cue' costs one line and saves a migration.
  const markerKind = (m) => m.kind || (m.cueId ? 'cue' : 'note');
  const [pageNum, setPageNum] = useState(1);
  // What the next click on the page will drop. Three kinds share one surface:
  // a cue from the cue sheet, a choreography number, or a free note. Null means
  // clicking the page does nothing, which is the resting state.
  const [placing, setPlacing] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState('cues');
  const [newLabel, setNewLabel] = useState('');
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // (Re)load the pdfjs document from Storage whenever a different show's
  // script comes into view. The bytes never live in React state — only
  // fileName/pageCount/markers do — so this always fetches fresh.
  useEffect(() => {
    let cancelled = false;
    if (!script) {
      setPdfDoc(null);
      return undefined;
    }
    (async () => {
      try {
        const bytes = await downloadScriptPdf(orgId, show.id, script.id);
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (!cancelled) {
          setPdfDoc(doc);
          setPageNum(1);
        }
      } catch (err) {
        if (!cancelled) setUploadError('Could not load that script from storage.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, show.id, script?.fileName]);

  // Render the current page to the canvas whenever the doc or page changes.
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return undefined;
    let cancelled = false;
    setRendering(true);
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        // Page failed to render — leave the previous frame up rather than crash.
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNum]);

  async function handleUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setUploadError('That file isn\u2019t a PDF.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const pageCount = doc.numPages;
      const id = `sv-${Date.now()}`;
      await uploadScriptPdf(orgId, show.id, id, file);
      const preset = SCRIPT_TYPES.find((t) => t.key === newType);
      const version = {
        id,
        type: newType,
        label: (newLabel.trim() || (preset ? preset.label : 'Script')),
        fileName: file.name,
        pageCount,
        markers: [],
        // Uploading is not publishing. A half-marked blocking draft should not
        // land on forty phones the moment it is saved.
        published: false,
        uploadedAt: new Date().toISOString(),
      };
      setShows((prev) =>
        prev.map((s) => (s.id === show.id ? { ...s, scriptVersions: [...(s.scriptVersions || []), version] } : s))
      );
      setActiveId(id);
      setAdding(false);
      setNewLabel('');
    } catch (err) {
      // Say what actually went wrong. The generic version of this line is what
      // hid a CDN version mismatch for as long as it did.
      setUploadError(`Could not add that script: ${err?.message || 'unknown error'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function replaceScript() {
    if (!script) return;
    deleteScriptPdf(orgId, show.id, script.id).catch(() => {});
    setShows((prev) =>
      prev.map((s) =>
        s.id === show.id ? { ...s, scriptVersions: (s.scriptVersions || []).filter((v) => v.id !== script.id) } : s
      )
    );
    setActiveId(null);
    setPlacingCueId(null);
  }

  // Every write goes through here so a version edit only ever replaces that
  // version's row — the same identity trick the rest of the app uses.
  function patchVersion(versionId, patch) {
    setShows((prev) =>
      prev.map((s) =>
        s.id === show.id
          ? {
              ...s,
              scriptVersions: (s.scriptVersions || []).map((v) =>
                v.id === versionId ? { ...v, ...patch } : v
              ),
            }
          : s
      )
    );
  }

  function handleCanvasClick(e) {
    if (!placing || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;

    const base = { id: `mk-${Date.now()}`, page: pageNum, xPct, yPct, kind: placing.kind };
    let marker;
    if (placing.kind === 'cue') marker = { ...base, cueId: placing.id };
    else if (placing.kind === 'choreo') marker = { ...base, choreoId: placing.id };
    else marker = { ...base, text: noteDraft.trim() || 'Note' };

    setShows((prev) =>
      prev.map((s) =>
        s.id === show.id
          ? {
              ...s,
              scriptVersions: (s.scriptVersions || []).map((v) =>
                v.id === script.id
                  ? {
                      ...v,
                      markers: [
                        // A cue or a number can only be in one place, so
                        // re-placing it moves it. Notes are free to repeat —
                        // "watch the trap" belongs on every page it matters on.
                        ...(v.markers || []).filter(
                          (m) =>
                            placing.kind === 'note' ||
                            (placing.kind === 'cue' ? m.cueId !== placing.id : m.choreoId !== placing.id)
                        ),
                        marker,
                      ],
                    }
                  : v
              ),
            }
          : s
      )
    );
    setPlacing(null);
    setNoteDraft('');
  }

  function removeMarker(markerId) {
    setShows((prev) =>
      prev.map((s) => (s.id === show.id ? { ...s, scriptVersions: (s.scriptVersions || []).map((v) => (v.id === script.id ? { ...v, markers: (v.markers || []).filter((m) => m.id !== markerId) } : v)) } : s))
    );
  }

  async function handleExport() {
    if (!script) return;
    setExporting(true);
    try {
      const bytes = await downloadScriptPdf(orgId, show.id, script.id);
      const outDoc = await PDFDocument.load(bytes);
      const font = await outDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = outDoc.getPages();
      // #RRGGBB to pdf-lib's 0..1 triple. The colours are chosen on screen and
      // have to survive onto paper unchanged, so they are converted rather than
      // approximated.
      const toRgb = (hex) => {
        const h = String(hex || '#E8A33D').replace('#', '');
        return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
      };

      (script.markers || []).forEach((marker) => {
        const page = pages[marker.page - 1];
        if (!page) return;
        const face = markerFace(marker);
        const { width, height } = page.getSize();
        const x = marker.xPct * width;
        const y = height - marker.yPct * height;
        const color = toRgb(face.color);

        if (face.kind === 'note') {
          // A note is words, not a call. It gets a box it can be read out of
          // rather than a dot someone has to decode.
          const size = 8.5;
          const textWidth = font.widthOfTextAtSize(face.label, size);
          page.drawRectangle({
            x: x - 3,
            y: y - 4,
            width: textWidth + 10,
            height: size + 7,
            color: rgb(1, 1, 1),
            borderColor: color,
            borderWidth: 1,
            opacity: 0.92,
          });
          page.drawText(face.label, { x: x + 2, y: y, size, font, color: rgb(0.1, 0.12, 0.14) });
          return;
        }

        const label = face.kind === 'choreo' ? `* ${face.label}` : face.label;
        page.drawCircle({ x, y, size: 9, color, opacity: 0.85 });
        page.drawText(label, { x: x + 12, y: y - 4, size: 10, font, color });
      });
      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${show.title.replace(/\s+/g, '_')}_cued_script.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setUploadError('Could not export the annotated script.');
    } finally {
      setExporting(false);
    }
  }

  const inputStyle = {
    background: COLOR.void,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: '7px 12px',
    color: COLOR.textPrimary,
    fontSize: 12.5,
  };

  const typeLabel = (v) => v.label || (SCRIPT_TYPES.find((t) => t.key === v.type) || {}).label || 'Script';

  const versionStrip = (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: versions.length ? 10 : 0 }}>
        {versions.map((v) => {
          const on = script && v.id === script.id;
          return (
            <button
              key={v.id}
              onClick={() => setActiveId(v.id)}
              className="td-focusable"
              title={`${v.fileName || ''} — ${v.pageCount || '?'} pages`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: on ? COLOR.amber : 'transparent',
                color: on ? COLOR.void : COLOR.textMuted,
                border: `1px solid ${on ? COLOR.amber : COLOR.line}`,
                borderRadius: 20,
                padding: '5px 12px',
                fontSize: 11.5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {typeLabel(v)}
              {v.published ? (
                <Eye size={11} />
              ) : (
                <EyeOff size={11} style={{ opacity: 0.7 }} />
              )}
            </button>
          );
        })}
        {canEdit && (
          <button
            onClick={() => setAdding((a) => !a)}
            className="td-focusable"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: COLOR.blueprint, border: `1px dashed ${COLOR.line}`, borderRadius: 20, padding: '5px 12px', fontSize: 11.5, cursor: 'pointer' }}
          >
            <Plus size={12} /> Add a version
          </button>
        )}
      </div>

      {versions.length > 0 && (
        <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint }}>
          {canEdit
            ? 'Cast see published versions only — the eye tells you which. Everything else is yours alone until you publish it.'
            : 'These are the versions published for this production. You can read and download them.'}
        </div>
      )}

      {canEdit && adding && (
        <div style={{ marginTop: 12, background: COLOR.card, border: `1px solid ${COLOR.lineBright}`, borderRadius: 4, padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, display: 'block', marginBottom: 4 }}>WHICH SCRIPT IS THIS?</label>
              <select className="td-focusable" style={{ ...inputStyle, width: '100%' }} value={newType} onChange={(e) => setNewType(e.target.value)}>
                {SCRIPT_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, display: 'block', marginBottom: 4 }}>NAME IT SOMETHING ELSE (OPTIONAL)</label>
              <input
                className="td-focusable"
                style={{ ...inputStyle, width: '100%' }}
                value={newLabel}
                placeholder="e.g. Music director's copy"
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleUpload} style={{ display: 'none' }} />
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={uploading}
            className="td-focusable"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: COLOR.amber, color: COLOR.void, border: 'none', borderRadius: 3, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}
          >
            <Upload size={14} /> {uploading ? 'Reading PDF…' : 'Choose PDF'}
          </button>
          {uploadError && <div className="td-mono" style={{ fontSize: 11, color: COLOR.amber, marginTop: 10 }}>{uploadError}</div>}
        </div>
      )}
    </div>
  );

  if (!script) {
    return (
      <div>
        {versionStrip}
        <div
          style={{
            border: `1px dashed ${COLOR.lineBright}`,
            borderRadius: 6,
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <FileText size={28} color={COLOR.textFaint} strokeWidth={1.5} style={{ margin: '0 auto 12px' }} />
          <div className="td-body" style={{ fontSize: 13.5, color: COLOR.textMuted, marginBottom: 4 }}>
            No script uploaded for {show.title} yet.
          </div>
          <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textFaint, marginBottom: 18 }}>
            Upload the show's PDF to start placing cues on it.
          </div>
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleUpload} style={{ display: 'none' }} id="script-upload-input" />
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={uploading}
            className="td-focusable"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: COLOR.amber,
              color: COLOR.void,
              border: 'none',
              borderRadius: 3,
              padding: '9px 18px',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: uploading ? 'default' : 'pointer',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            <Upload size={14} /> {uploading ? 'Reading PDF...' : 'Upload script PDF'}
          </button>
          {uploadError && (
            <div className="td-mono" style={{ fontSize: 11, color: COLOR.amber, marginTop: 12 }}>{uploadError}</div>
          )}
        </div>
      </div>
    );
  }

  function markerFace(m) {
    const kind = markerKind(m);
    if (kind === 'choreo') {
      const n = choreo.find((c) => c.id === m.choreoId);
      return { label: n ? n.name || n.title || 'Number' : 'Number', color: '#C77DBF', kind };
    }
    if (kind === 'note') return { label: m.text || 'Note', color: '#9AA5B1', kind };
    const cue = cues.find((c) => c.id === m.cueId);
    return {
      label: cue ? cueCode(cue, CUE_DEPTS) : '?',
      color: cue ? deptColor(cue.dept, CUE_DEPTS) : COLOR.amber,
      kind,
    };
  }

  const markersOnPage = (script.markers || []).filter((m) => m.page === pageNum);

  return (
    <div>
    {versionStrip}
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 480px', minWidth: 320 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="td-body" style={{ fontSize: 13, color: COLOR.textPrimary, fontWeight: 500 }}>{script.fileName}</div>
            <div className="td-mono" style={{ fontSize: 10.5, color: COLOR.textFaint, marginTop: 2 }}>
              {(script.markers || []).length} cue{(script.markers || []).length === 1 ? '' : 's'} placed · {script.pageCount} page{script.pageCount === 1 ? '' : 's'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {canEdit && (
              <button
                onClick={() => patchVersion(script.id, { published: !script.published })}
                className="td-focusable"
                title={script.published ? 'Cast can open this. Unpublish to take it back.' : 'Only you can see this. Publish it to give it to the cast.'}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: script.published ? COLOR.amber : 'transparent', color: script.published ? COLOR.void : COLOR.amber, border: `1px solid ${COLOR.amber}`, borderRadius: 3, padding: '7px 12px', fontSize: 11.5, cursor: 'pointer' }}
              >
                {script.published ? <><Check size={12} /> Published</> : <><Eye size={12} /> Publish to cast</>}
              </button>
            )}
            {canEdit && (
            <button onClick={replaceScript} className="td-focusable" title="Delete this version" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${COLOR.line}`, color: COLOR.textFaint, borderRadius: 3, padding: '7px 12px', fontSize: 11.5, cursor: 'pointer' }}>
              <Trash2 size={12} /> Delete version
            </button>
            )}
            <button
              onClick={handleExport}
              disabled={exporting || (script.markers || []).length === 0}
              className="td-focusable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: (script.markers || []).length > 0 ? COLOR.amber : COLOR.slateDim,
                color: (script.markers || []).length > 0 ? COLOR.void : COLOR.textFaint,
                border: 'none',
                borderRadius: 3,
                padding: '7px 14px',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: (script.markers || []).length > 0 && !exporting ? 'pointer' : 'not-allowed',
              }}
            >
              <Download size={13} /> {exporting ? 'Exporting...' : 'Export cued script'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            className="td-focusable"
            style={{ background: 'none', border: `1px solid ${COLOR.line}`, color: pageNum <= 1 ? COLOR.slateDim : COLOR.textMuted, borderRadius: 3, padding: '5px 10px', cursor: pageNum <= 1 ? 'default' : 'pointer' }}
          >
            <ChevronUp size={13} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <span className="td-mono" style={{ fontSize: 11.5, color: COLOR.textMuted }}>
            Page {pageNum} of {script.pageCount}
          </span>
          <button
            onClick={() => setPageNum((p) => Math.min(script.pageCount, p + 1))}
            disabled={pageNum >= script.pageCount}
            className="td-focusable"
            style={{ background: 'none', border: `1px solid ${COLOR.line}`, color: pageNum >= script.pageCount ? COLOR.slateDim : COLOR.textMuted, borderRadius: 3, padding: '5px 10px', cursor: pageNum >= script.pageCount ? 'default' : 'pointer' }}
          >
            <ChevronDown size={13} style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>

        {placing && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: COLOR.amberDim, borderRadius: 4, padding: '8px 12px', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
            <span className="td-mono" style={{ fontSize: 11, color: COLOR.amber, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crosshair size={12} />
              {placing.kind === 'cue' && <>Click the script where {cueCode(cues.find((c) => c.id === placing.id) || {}, CUE_DEPTS)} calls</>}
              {placing.kind === 'choreo' && <>Click where {(choreo.find((c) => c.id === placing.id) || {}).name || 'this number'} starts</>}
              {placing.kind === 'note' && <>Type the note, then click where it goes</>}
            </span>
            {placing.kind === 'note' && (
              <input
                autoFocus
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="e.g. watch the trap"
                className="td-focusable"
                style={{ flex: '1 1 200px', background: COLOR.void, border: `1px solid ${COLOR.amber}`, borderRadius: 3, color: COLOR.textPrimary, fontSize: 12, padding: '5px 9px' }}
              />
            )}
            <button onClick={() => { setPlacing(null); setNoteDraft(''); }} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.amber, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
              Cancel
            </button>
          </div>
        )}

        <div style={{ position: 'relative', display: 'inline-block', border: `1px solid ${COLOR.line}`, borderRadius: 4, overflow: 'hidden', maxWidth: '100%' }}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{ display: 'block', maxWidth: '100%', height: 'auto', cursor: placing ? 'crosshair' : 'default' }}
          />
          {rendering && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(11,14,17,0.6)' }}>
              <span className="td-mono" style={{ fontSize: 11, color: COLOR.textFaint }}>Rendering page...</span>
            </div>
          )}
          {markersOnPage.map((m) => {
            const face = markerFace(m);
            // Notes are squared off and quieter than cues; a note is context,
            // not a thing anyone is waiting to be called.
            const isNote = face.kind === 'note';
            return (
              <button
                key={m.id}
                onClick={() => removeMarker(m.id)}
                className="td-focusable"
                title={`${face.label} — click to remove`}
                style={{
                  position: 'absolute',
                  left: `${m.xPct * 100}%`,
                  top: `${m.yPct * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  background: isNote ? 'rgba(255,255,255,0.92)' : face.color,
                  color: isNote ? '#1B1F24' : '#101317',
                  border: `2px solid ${isNote ? face.color : COLOR.void}`,
                  borderRadius: isNote ? 3 : 20,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  maxWidth: 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: 'pointer',
                }}
              >
                {face.kind === 'choreo' ? `♪ ${face.label}` : face.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: '0 0 260px', minWidth: 220 }}>
        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', marginBottom: 10 }}>
          CUE SHEET
        </div>
        {cues.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cues.map((cue) => {
              const marker = (script.markers || []).find((m) => m.cueId === cue.id);
              return (
                <div key={cue.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="td-mono" style={{ fontSize: 11, color: deptColor(cue.dept, CUE_DEPTS) }}>{cueCode(cue, CUE_DEPTS)}</div>
                    <div className="td-body" style={{ fontSize: 11, color: COLOR.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cue.desc}</div>
                  </div>
                  {marker ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                      <button onClick={() => setPageNum(marker.page)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.green, fontSize: 10, cursor: 'pointer' }}>
                        p.{marker.page}
                      </button>
                      <button onClick={() => removeMarker(marker.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 9.5, cursor: 'pointer', textDecoration: 'underline' }}>
                        remove
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPlacing({ kind: 'cue', id: cue.id })}
                      className="td-focusable"
                      style={{
                        flexShrink: 0,
                        background: placing && placing.id === cue.id ? deptColor(cue.dept, CUE_DEPTS) : 'transparent',
                        color: placing && placing.id === cue.id ? COLOR.void : deptColor(cue.dept, CUE_DEPTS),
                        border: `1px solid ${deptColor(cue.dept, CUE_DEPTS)}`,
                        borderRadius: 3,
                        padding: '4px 9px',
                        fontSize: 10.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Place
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <StubPanel label="No cues on this show's cue sheet yet — add them on Run of Show first" hint="Cues are created on Run of Show. Once they exist, come back here to place each one on the actual script page and export an annotated copy for the book." />
        )}

        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', margin: '22px 0 10px' }}>
          CHOREOGRAPHY
        </div>
        {choreo.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {choreo.map((n) => {
              const marker = (script.markers || []).find((m) => m.choreoId === n.id);
              return (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="td-body" style={{ fontSize: 11.5, color: COLOR.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name || 'Untitled number'}</div>
                    {n.notes && <div className="td-body" style={{ fontSize: 10.5, color: COLOR.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.notes}</div>}
                  </div>
                  {marker ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                      <button onClick={() => setPageNum(marker.page)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.green, fontSize: 10, cursor: 'pointer' }}>p.{marker.page}</button>
                      <button onClick={() => removeMarker(marker.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 9.5, cursor: 'pointer', textDecoration: 'underline' }}>remove</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPlacing({ kind: 'choreo', id: n.id })}
                      className="td-focusable"
                      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', color: '#C77DBF', border: '1px solid #C77DBF', borderRadius: 3, padding: '4px 9px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}
                    >
                      <Footprints size={11} /> Place
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <StubPanel label="No numbers on this show yet" hint="Choreography numbers are built on the Choreography page. Once they exist, drop each one on the script page where it starts." />
        )}

        <div className="td-mono" style={{ fontSize: 11, color: COLOR.blueprint, letterSpacing: '0.1em', margin: '22px 0 10px' }}>
          NOTES ON THE PAGE
        </div>
        <button
          onClick={() => setPlacing({ kind: 'note', id: null })}
          className="td-focusable"
          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center', background: 'transparent', color: COLOR.textMuted, border: `1px dashed ${COLOR.line}`, borderRadius: 4, padding: '8px 10px', fontSize: 11.5, cursor: 'pointer', marginBottom: 8 }}
        >
          <StickyNote size={12} /> Add a note to this page
        </button>
        {(script.markers || []).filter((m) => markerKind(m) === 'note').map((m) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, marginBottom: 6 }}>
            <span className="td-body" style={{ flex: 1, fontSize: 11, color: COLOR.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.text}</span>
            <button onClick={() => setPageNum(m.page)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.green, fontSize: 10, cursor: 'pointer', flexShrink: 0 }}>p.{m.page}</button>
            <button onClick={() => removeMarker(m.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 9.5, cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>remove</button>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
