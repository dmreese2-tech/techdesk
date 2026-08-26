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

// ---------------------------------------------------------------------------
// CHOREOGRAPHY INSERTS — a whole extra page, not a marker on an existing one.
// Stored per script version as `inserts`, alongside `markers`. Each insert
// says which page it follows (`afterPage`) and which blocking diagram it
// shows; the export step is what turns "follows page 42" into an actual
// physical page 43, which is all duplex printing needs to land it on the
// back of page 42.
// ---------------------------------------------------------------------------

// Greedy word wrap against pdf-lib's own font metrics, so the blocking-notes
// block never overruns its column width on paper.
function wrapPdfText(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const trial = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(trial, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  });
  if (line) lines.push(line);
  return lines;
}

// Draws one inserted page: the blocking diagram (capped under half the page,
// per the SM's spec), the choreography entry's own Blocking Notes text below
// it, then ruled lines for handwritten notes filling the rest.
function drawChoreoInsertPage(page, insert, entry, diagram, boldFont, bodyFont) {
  const { width, height } = page.getSize();
  const margin = 40;
  const dark = rgb(0.1, 0.12, 0.14);
  const faint = rgb(0.5, 0.5, 0.5);
  const amber = rgb(0.91, 0.64, 0.24);
  const rule = rgb(0.8, 0.8, 0.8);

  let cursorY = height - margin;

  page.drawText(`CHOREOGRAPHY INSERT \u00b7 Ref ${insert.refLabel}`, { x: margin, y: cursorY, size: 12, font: boldFont, color: dark });
  cursorY -= 16;
  const entryLabel = entry ? (entry.name || 'Untitled number') : 'Unlinked entry';
  const diagramLabel = diagram ? diagram.label : '';
  page.drawText(
    `Follows script p.${insert.afterPage} \u00b7 ${entryLabel}${diagramLabel ? ' \u2014 ' + diagramLabel : ''}`,
    { x: margin, y: cursorY, size: 9.5, font: bodyFont, color: faint }
  );
  cursorY -= 20;

  // Diagram zone — hard-capped at 46% of page height, safely under half.
  const zoneTop = cursorY;
  const zoneHeight = height * 0.46;
  const zoneBottom = zoneTop - zoneHeight;
  const availW = width - margin * 2;
  let boxW = Math.min(availW * 0.6, zoneHeight * 1.5);
  let boxH = boxW / 1.5;
  if (boxH > zoneHeight) {
    boxH = zoneHeight;
    boxW = boxH * 1.5;
  }
  const boxX = margin;
  const boxY = zoneBottom + (zoneHeight - boxH) / 2;

  page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 1 });
  const thirdY1 = boxY + (boxH * 2) / 3;
  const thirdY2 = boxY + boxH / 3;
  const thirdX1 = boxX + boxW / 3;
  const thirdX2 = boxX + (boxW * 2) / 3;
  [thirdY1, thirdY2].forEach((y) => page.drawLine({ start: { x: boxX, y }, end: { x: boxX + boxW, y }, thickness: 0.5, color: rule, dashArray: [3, 3] }));
  [thirdX1, thirdX2].forEach((x) => page.drawLine({ start: { x, y: boxY }, end: { x, y: boxY + boxH }, thickness: 0.5, color: rule, dashArray: [3, 3] }));
  page.drawText('UPSTAGE', { x: boxX + boxW / 2 - 18, y: boxY + boxH - 10, size: 6.5, font: bodyFont, color: faint });
  page.drawText('DOWNSTAGE / AUDIENCE', { x: boxX + boxW / 2 - 42, y: boxY + 4, size: 6.5, font: bodyFont, color: faint });

  const markers = (diagram && diagram.markers) || [];
  markers.forEach((m, i) => {
    // Marker y is 0 at upstage (top on screen) / 100 at downstage (bottom on
    // screen); pdf-lib's y-axis runs bottom-up, so it flips against boxY+boxH.
    const mx = boxX + (m.x / 100) * boxW;
    const my = boxY + boxH - (m.y / 100) * boxH;
    page.drawCircle({ x: mx, y: my, size: 7, color: amber, borderColor: dark, borderWidth: 0.5 });
    const label = String(i + 1);
    page.drawText(label, { x: mx - (label.length > 1 ? 4.5 : 2.5), y: my - 3, size: 8, font: boldFont, color: dark });
  });

  // Position key, same numbering convention as the on-screen StageDiagram —
  // marker i pairs with positions[i], matching how the app already shows it.
  const keyX = boxX + boxW + 18;
  let keyY = boxY + boxH - 2;
  if (keyX < width - margin - 40) {
    page.drawText('POSITION KEY', { x: keyX, y: keyY, size: 8, font: boldFont, color: faint });
    keyY -= 12;
    (entry?.positions || []).forEach((p, i) => {
      if (keyY < zoneBottom) return;
      page.drawText(`${i + 1}. ${p.label || '\u2014'}`, { x: keyX, y: keyY, size: 8, font: bodyFont, color: dark });
      keyY -= 11;
    });
  }

  cursorY = zoneBottom - 16;

  // Blocking Notes — the entry's own notes field, printed as text.
  page.drawText('BLOCKING NOTES', { x: margin, y: cursorY, size: 8.5, font: boldFont, color: faint });
  cursorY -= 13;
  const wrapped = wrapPdfText(entry?.notes || '\u2014', bodyFont, 9, width - margin * 2);
  const notesLineCount = Math.min(wrapped.length, 6);
  wrapped.slice(0, notesLineCount).forEach((line) => {
    page.drawText(line, { x: margin, y: cursorY, size: 9, font: bodyFont, color: dark });
    cursorY -= 12;
  });

  cursorY -= 10;

  // Written notes — blank ruled lines for the SM, filling the rest of the page.
  page.drawText('NOTES', { x: margin, y: cursorY, size: 8.5, font: boldFont, color: faint });
  cursorY -= 16;
  while (cursorY > margin) {
    page.drawLine({ start: { x: margin, y: cursorY }, end: { x: width - margin, y: cursorY }, thickness: 0.5, color: rule });
    cursorY -= 20;
  }
}

export function ScriptModule({ show, orgId, cueSheets, setShows, CUE_DEPTS, canEdit = true }) {
  const versions = show.scriptVersions || [];

  // One PDF per production, many markups over it.
  //
  // Versions started out each carrying their own upload, which meant a second
  // cued script meant uploading the same pages twice. Now the base holds the
  // file and every other version is a layer of markers pointing back at it —
  // `sourceId` is the whole difference between the two.
  //
  // Rows written before this have no sourceId and their own file, so they are
  // their own base. That is what fileFor falls back to, and why nothing had to
  // be migrated.
  const base = versions.find((v) => v.isBase) || versions.find((v) => !v.sourceId) || null;
  const fileFor = (v) => (v && v.sourceId) || (v && v.id);
  const markups = versions.filter((v) => v !== base);
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
  // Which choreography entry's "Insert page" picker is open, and which of
  // its formations are checked, so several can go in as one action.
  const [insertPickerFor, setInsertPickerFor] = useState(null);
  const [insertSelection, setInsertSelection] = useState([]);
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
        const bytes = await downloadScriptPdf(orgId, show.id, fileFor(script));
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
      // Replacing keeps the base's id so every markup layered on it still
      // points somewhere. New pages under old markers is the uploader's
      // problem to check, not something to solve by orphaning their work.
      const id = base ? base.id : `sv-${Date.now()}`;
      await uploadScriptPdf(orgId, show.id, id, file);
      const baseVersion = {
        id,
        isBase: true,
        type: 'original',
        label: 'Base script',
        fileName: file.name,
        pageCount,
        markers: base ? base.markers || [] : [],
        // Uploading is not publishing. A half-marked blocking draft should not
        // land on forty phones the moment it is saved.
        published: base ? !!base.published : false,
        uploadedAt: new Date().toISOString(),
      };
      setShows((prev) =>
        prev.map((s) =>
          s.id === show.id
            ? {
                ...s,
                scriptVersions: base
                  ? (s.scriptVersions || []).map((v) => (v.id === id ? { ...v, ...baseVersion } : v))
                  : [...(s.scriptVersions || []), baseVersion],
              }
            : s
        )
      );
      setActiveId(id);
      // Page counts follow the file, so every layer over it moves too.
      if (base) {
        setShows((prev) =>
          prev.map((s) =>
            s.id === show.id
              ? { ...s, scriptVersions: (s.scriptVersions || []).map((v) => (v.sourceId === id ? { ...v, pageCount } : v)) }
              : s
          )
        );
      }
    } catch (err) {
      // Say what actually went wrong. The generic version of this line is what
      // hid a CDN version mismatch for as long as it did.
      setUploadError(`Could not add that script: ${err?.message || 'unknown error'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // A markup is a name and an empty set of markers. The pages come from the
  // base, which is the entire point of the change.
  function addMarkup() {
    if (!base) return;
    const preset = SCRIPT_TYPES.find((t) => t.key === newType);
    const version = {
      id: `sv-${Date.now()}`,
      sourceId: base.id,
      type: newType,
      label: newLabel.trim() || (preset ? preset.label : 'Markup'),
      fileName: base.fileName,
      pageCount: base.pageCount,
      markers: [],
      published: false,
      uploadedAt: new Date().toISOString(),
    };
    setShows((prev) =>
      prev.map((s) => (s.id === show.id ? { ...s, scriptVersions: [...(s.scriptVersions || []), version] } : s))
    );
    setActiveId(version.id);
    setAdding(false);
    setNewLabel('');
  }

  function replaceScript() {
    if (!script) return;
    const isBase = script === base;
    // Deleting the base takes every markup with it — they are pages of a file
    // that no longer exists. Only the base owns a PDF, so only the base has one
    // to remove from storage.
    if (isBase) deleteScriptPdf(orgId, show.id, script.id).catch(() => {});
    setShows((prev) =>
      prev.map((s) =>
        s.id === show.id
          ? {
              ...s,
              scriptVersions: (s.scriptVersions || []).filter(
                (v) => v.id !== script.id && (!isBase || v.sourceId !== script.id)
              ),
            }
          : s
      )
    );
    setActiveId(null);
    setPlacing(null);
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

  function openInsertPicker(choreoId) {
    setInsertPickerFor((cur) => (cur === choreoId ? null : choreoId));
    setInsertSelection([]);
  }
  function toggleInsertSelection(diagramId) {
    setInsertSelection((prev) => (prev.includes(diagramId) ? prev.filter((id) => id !== diagramId) : [...prev, diagramId]));
  }
  function confirmInserts(choreoId) {
    if (insertSelection.length === 0) {
      setInsertPickerFor(null);
      return;
    }
    setShows((prev) =>
      prev.map((s) => {
        if (s.id !== show.id) return s;
        return {
          ...s,
          scriptVersions: (s.scriptVersions || []).map((v) => {
            if (v.id !== script.id) return v;
            // One insert per checked formation, labelled in the order they
            // were selected so a batch of three reads 42A/42B/42C. Picks the
            // lowest unused letter on this page rather than counting
            // survivors, so removing 12B and adding a new one can't produce
            // a second 12C.
            const usedLetters = new Set(
              (v.inserts || [])
                .filter((i) => i.afterPage === pageNum)
                .map((i) => i.refLabel.slice(String(pageNum).length))
            );
            let letterCode = 65;
            const created = insertSelection.map((diagramId) => {
              while (usedLetters.has(String.fromCharCode(letterCode))) letterCode += 1;
              const letter = String.fromCharCode(letterCode);
              usedLetters.add(letter);
              const refLabel = `${pageNum}${letter}`;
              return {
                id: `ins-${Date.now()}-${diagramId}`,
                afterPage: pageNum,
                choreoId,
                diagramId,
                refLabel,
                createdAt: new Date().toISOString(),
              };
            });
            return { ...v, inserts: [...(v.inserts || []), ...created] };
          }),
        };
      })
    );
    setInsertPickerFor(null);
    setInsertSelection([]);
  }
  function removeInsert(insertId) {
    setShows((prev) =>
      prev.map((s) => (s.id === show.id ? { ...s, scriptVersions: (s.scriptVersions || []).map((v) => (v.id === script.id ? { ...v, inserts: (v.inserts || []).filter((i) => i.id !== insertId) } : v)) } : s))
    );
  }

  async function handleExport() {
    if (!script) return;
    setExporting(true);
    try {
      const bytes = await downloadScriptPdf(orgId, show.id, fileFor(script));
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

      // Choreography inserts — physically interleaved pages, not marks on an
      // existing one. Sorted by the page they follow so a duplex print run
      // puts each on the back of the right sheet; a running offset accounts
      // for earlier insertions pushing everything after them down by one.
      const inserts = [...(script.inserts || [])].sort((a, b) => a.afterPage - b.afterPage);
      if (inserts.length > 0) {
        const bodyFont = await outDoc.embedFont(StandardFonts.Helvetica);
        const anchorSize = pages[0] ? pages[0].getSize() : { width: 612, height: 792 };
        let offset = 0;
        inserts.forEach((ins) => {
          const entry = choreo.find((c) => c.id === ins.choreoId);
          const diagram = entry?.diagrams?.find((d) => d.id === ins.diagramId);
          const targetIndex = ins.afterPage + offset;
          const insertedPage = outDoc.insertPage(targetIndex, [anchorSize.width, anchorSize.height]);
          drawChoreoInsertPage(insertedPage, ins, entry, diagram, font, bodyFont);
          offset += 1;
        });
      }

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
              {v === base && <FileText size={11} />}
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
            ? `One PDF, marked up as many ways as you need.${base ? ` Every version here reads ${base.fileName || 'the base script'}; only the markers differ.` : ''} Cast see published versions only — the eye tells you which.`
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
  const insertsOnPage = (script.inserts || []).filter((i) => i.afterPage === pageNum);

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
            {canEdit && script === base && (
              <>
                <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleUpload} style={{ display: 'none' }} />
                <button
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  disabled={uploading}
                  className="td-focusable"
                  title="Swap the PDF everything is marked up over. Markers stay where they are, so check they still line up."
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${COLOR.line}`, color: COLOR.textMuted, borderRadius: 3, padding: '7px 12px', fontSize: 11.5, cursor: 'pointer' }}
                >
                  <Upload size={12} /> {uploading ? 'Reading…' : 'Replace PDF'}
                </button>
              </>
            )}
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
            <button
              onClick={replaceScript}
              className="td-focusable"
              title={script === base
                ? `Delete the base PDF${markups.length ? ` and the ${markups.length} markup${markups.length === 1 ? '' : 's'} over it` : ''}.`
                : 'Delete this markup. The base PDF stays.'}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${COLOR.line}`, color: COLOR.textFaint, borderRadius: 3, padding: '7px 12px', fontSize: 11.5, cursor: 'pointer' }}
            >
              <Trash2 size={12} /> {script === base ? `Delete base${markups.length ? ` + ${markups.length}` : ''}` : 'Delete markup'}
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

        {insertsOnPage.length > 0 && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(199,125,191,0.08)', border: '1px solid #C77DBF', borderRadius: 4 }}>
            <div className="td-mono" style={{ fontSize: 10, color: '#C77DBF', letterSpacing: '0.05em', marginBottom: 6 }}>
              INSERT PAGE{insertsOnPage.length === 1 ? '' : 'S'} FOLLOWING THIS PAGE
            </div>
            {insertsOnPage.map((ins) => {
              const entry = choreo.find((c) => c.id === ins.choreoId);
              const diagram = entry?.diagrams?.find((d) => d.id === ins.diagramId);
              return (
                <div key={ins.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: COLOR.textMuted, padding: '3px 0' }}>
                  <span>
                    <strong style={{ color: '#C77DBF' }}>{ins.refLabel}</strong>{' '}
                    {entry ? (entry.name || 'Untitled number') : 'Unlinked entry'}
                    {diagram ? ` \u2014 ${diagram.label}` : ''}
                  </span>
                  <button onClick={() => removeInsert(ins.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}>
                    remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
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
                <div key={n.id} style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4, padding: '7px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                  {(() => {
                    const hasDiagrams = (n.diagrams || []).length > 0;
                    const ownInserts = (script.inserts || []).filter((i) => i.choreoId === n.id);
                    return (
                      <div style={{ marginTop: 2 }}>
                        {ownInserts.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}>
                            {ownInserts.map((ins) => (
                              <div key={ins.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: COLOR.textFaint }}>
                                <button onClick={() => setPageNum(ins.afterPage)} className="td-focusable" style={{ background: 'none', border: 'none', color: '#C77DBF', fontSize: 10, cursor: 'pointer' }}>
                                  Insert {ins.refLabel}
                                </button>
                                <button onClick={() => removeInsert(ins.id)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 9.5, cursor: 'pointer', textDecoration: 'underline' }}>remove</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => (hasDiagrams ? openInsertPicker(n.id) : null)}
                          disabled={!hasDiagrams}
                          title={hasDiagrams ? `Insert a page after p.${pageNum} showing blocking for this number` : 'Add a formation diagram on the Choreography page first'}
                          className="td-focusable"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            background: 'transparent',
                            color: hasDiagrams ? COLOR.textMuted : COLOR.slateDim,
                            border: `1px dashed ${hasDiagrams ? COLOR.line : COLOR.slateDim}`,
                            borderRadius: 3,
                            padding: '4px 9px',
                            fontSize: 10,
                            cursor: hasDiagrams ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <Plus size={10} /> Insert page after p.{pageNum}
                        </button>
                        {insertPickerFor === n.id && (
                          <div style={{ marginTop: 6, padding: '8px 10px', background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 4 }}>
                            <div className="td-mono" style={{ fontSize: 9.5, color: COLOR.textFaint, marginBottom: 6 }}>WHICH FORMATION(S)?</div>
                            {n.diagrams.map((d) => (
                              <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLOR.textMuted, padding: '3px 0', cursor: 'pointer' }}>
                                <input type="checkbox" checked={insertSelection.includes(d.id)} onChange={() => toggleInsertSelection(d.id)} />
                                {d.label}
                              </label>
                            ))}
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button
                                onClick={() => confirmInserts(n.id)}
                                disabled={insertSelection.length === 0}
                                className="td-focusable"
                                style={{ background: insertSelection.length ? '#C77DBF' : COLOR.slateDim, color: COLOR.void, border: 'none', borderRadius: 3, padding: '5px 10px', fontSize: 10.5, fontWeight: 600, cursor: insertSelection.length ? 'pointer' : 'not-allowed' }}
                              >
                                Add {insertSelection.length || ''} page{insertSelection.length === 1 ? '' : 's'}
                              </button>
                              <button onClick={() => setInsertPickerFor(null)} className="td-focusable" style={{ background: 'none', border: 'none', color: COLOR.textFaint, fontSize: 10.5, cursor: 'pointer' }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
