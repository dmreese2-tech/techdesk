import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Crosshair, Download, Eye, EyeOff, FileText, Plus, Trash2, Upload } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { uploadScriptPdf, downloadScriptPdf, deleteScriptPdf } from './persistence.js';
import { COLOR } from './theme.jsx';

// The worker has to be pointed at a real URL before any page is rendered;
// this module is the only place that touches pdfjs now, so it sets it here.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';
import { cueCode } from './shared.jsx';
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
  const [pageNum, setPageNum] = useState(1);
  const [placingCueId, setPlacingCueId] = useState(null);
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
      setUploadError('Could not upload that PDF. Try again.');
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
    if (!placingCueId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;
    const marker = { id: `mk-${Date.now()}`, cueId: placingCueId, page: pageNum, xPct, yPct };
    setShows((prev) =>
      prev.map((s) =>
        s.id === show.id
          ? { ...s, scriptVersions: (s.scriptVersions || []).map((v) => (v.id === script.id ? { ...v, markers: [...(v.markers || []).filter((m) => m.cueId !== placingCueId), marker] } : v)) }
          : s
      )
    );
    setPlacingCueId(null);
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
      (script.markers || []).forEach((marker) => {
        const page = pages[marker.page - 1];
        if (!page) return;
        const cue = cues.find((c) => c.id === marker.cueId);
        const label = cue ? cueCode(cue, CUE_DEPTS) : '?';
        const { width, height } = page.getSize();
        const x = marker.xPct * width;
        const y = height - marker.yPct * height;
        page.drawCircle({ x, y, size: 9, color: rgb(0.91, 0.64, 0.24), opacity: 0.85 });
        page.drawText(label, { x: x + 12, y: y - 4, size: 10, font, color: rgb(0.72, 0.47, 0.08) });
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

        {placingCueId && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: COLOR.amberDim, borderRadius: 4, padding: '8px 12px', marginBottom: 10 }}>
            <span className="td-mono" style={{ fontSize: 11, color: COLOR.amber, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crosshair size={12} /> Click the script where {cueCode(cues.find((c) => c.id === placingCueId) || {}, CUE_DEPTS)} calls
            </span>
            <button onClick={() => setPlacingCueId(null)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.amber, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
              Cancel
            </button>
          </div>
        )}

        <div style={{ position: 'relative', display: 'inline-block', border: `1px solid ${COLOR.line}`, borderRadius: 4, overflow: 'hidden', maxWidth: '100%' }}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{ display: 'block', maxWidth: '100%', height: 'auto', cursor: placingCueId ? 'crosshair' : 'default' }}
          />
          {rendering && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(11,14,17,0.6)' }}>
              <span className="td-mono" style={{ fontSize: 11, color: COLOR.textFaint }}>Rendering page...</span>
            </div>
          )}
          {markersOnPage.map((m) => {
            const cue = cues.find((c) => c.id === m.cueId);
            return (
              <button
                key={m.id}
                onClick={() => removeMarker(m.id)}
                className="td-focusable"
                title="Click to remove"
                style={{
                  position: 'absolute',
                  left: `${m.xPct * 100}%`,
                  top: `${m.yPct * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  background: COLOR.amber,
                  color: COLOR.void,
                  border: `2px solid ${COLOR.void}`,
                  borderRadius: 20,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {cue ? cueCode(cue, CUE_DEPTS) : '?'}
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
                    <div className="td-mono" style={{ fontSize: 11, color: COLOR.amber }}>{cueCode(cue, CUE_DEPTS)}</div>
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
                      onClick={() => setPlacingCueId(cue.id)}
                      className="td-focusable"
                      style={{
                        flexShrink: 0,
                        background: placingCueId === cue.id ? COLOR.amber : 'transparent',
                        color: placingCueId === cue.id ? COLOR.void : COLOR.amber,
                        border: `1px solid ${COLOR.amber}`,
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
      </div>
    </div>
    </div>
  );
}
