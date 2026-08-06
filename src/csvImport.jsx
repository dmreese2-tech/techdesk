import React, { useRef, useState } from 'react';
import { FileDown, Upload } from 'lucide-react';
import { COLOR } from './theme.jsx';
import { downloadCsv } from './csv.jsx';

// ---------------------------------------------------------------------------
// CSV IMPORT
//
// Twelve modules take the same shape of work: hand someone a template, let them
// fill it in wherever they already keep this stuff, and read it back. So this
// is one component and twelve column specs rather than twelve importers.
//
// Two rules run through all of it.
//
// Import appends. It never replaces what is already there, because a mis-shaped
// spreadsheet should cost you nothing more than the rows you just added. If you
// want a clean slate, delete first — deliberately, with the buttons that exist.
//
// A row that can't be read is reported by its line number and skipped; the rest
// still land. An import that refuses everything because row 14 has a typo is
// how people end up re-typing forty rows by hand.
// ---------------------------------------------------------------------------

// RFC 4180: quoted fields may hold commas, newlines and doubled quotes.
// Hand-rolled because the alternative is a dependency for eighty lines.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, ''); // Excel writes a BOM; it is not data

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* handled by \n */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Header matching is deliberately forgiving: case, spaces and punctuation vary
// with whoever last opened the file, and none of it changes what the column is.
const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export function rowsToObjects(text, columns) {
  const grid = parseCsv(text);
  if (grid.length === 0) return { rows: [], errors: ['That file was empty.'] };

  const header = grid[0].map(norm);
  const missing = columns.filter((c) => c.required && !header.includes(norm(c.key)));
  if (missing.length > 0) {
    return { rows: [], errors: [`Missing column${missing.length === 1 ? '' : 's'}: ${missing.map((c) => c.key).join(', ')}. Download the template to see the expected header.`] };
  }

  const index = {};
  columns.forEach((c) => { index[c.key] = header.indexOf(norm(c.key)); });

  const rows = [];
  const errors = [];
  grid.slice(1).forEach((cells, i) => {
    const line = i + 2; // 1-based, and the header is line 1
    const get = (key) => (index[key] >= 0 ? (cells[index[key]] || '').trim() : '');
    const blank = columns.filter((c) => c.required && !get(c.key));
    if (blank.length > 0) {
      errors.push(`Line ${line}: needs ${blank.map((c) => c.key).join(' and ')}.`);
      return;
    }
    rows.push({ __line: line, get });
  });
  return { rows, errors };
}

export function TemplateButton({ label = 'CSV template', filename, columns, sample }) {
  return (
    <button
      onClick={() => {
        // One example row. A template with only a header leaves people guessing
        // what a date or a yes/no is supposed to look like.
        const example = {};
        columns.forEach((c) => { example[c.key] = sample && sample[c.key] !== undefined ? sample[c.key] : ''; });
        downloadCsv(`${filename}-template`, [example]);
      }}
      className="td-focusable"
      title={`Download a blank ${filename} spreadsheet with the right columns`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
        border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted,
        fontSize: 11.5, padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <FileDown size={13} /> {label}
    </button>
  );
}

export function ImportCsvButton({ label = 'Import CSV', filename, columns, sample, onImport, disabled }) {
  const inputRef = useRef(null);
  const [result, setResult] = useState(null);

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const { rows, errors } = rowsToObjects(text, columns);
      if (rows.length === 0) {
        setResult({ bad: true, message: errors[0] || 'Nothing in that file could be read.' });
        return;
      }
      const added = onImport(rows);
      const parts = [`Added ${added} row${added === 1 ? '' : 's'}`];
      if (errors.length) parts.push(`${errors.length} skipped`);
      setResult({ bad: false, message: parts.join(' · '), detail: errors.slice(0, 4) });
    } catch (err) {
      setResult({ bad: true, message: `Could not read that file: ${err?.message || 'unknown error'}` });
    }
  }

  return (
    <>
      <TemplateButton filename={filename} columns={columns} sample={sample} />
      <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
      <button
        onClick={() => inputRef.current && inputRef.current.click()}
        disabled={disabled}
        className="td-focusable"
        title="Add rows from a spreadsheet. Nothing already here is touched."
        style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
          border: `1px solid ${COLOR.line}`, borderRadius: 3, color: COLOR.textMuted,
          fontSize: 11.5, padding: '6px 10px', cursor: disabled ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap', opacity: disabled ? 0.5 : 1,
        }}
      >
        <Upload size={13} /> {label}
      </button>
      {result && (
        <span
          className="td-mono"
          onClick={() => setResult(null)}
          title={result.detail && result.detail.length ? result.detail.join('\n') : 'Click to dismiss'}
          style={{ fontSize: 10.5, color: result.bad ? COLOR.amber : COLOR.green, cursor: 'pointer', maxWidth: 320 }}
        >
          {result.message}
          {result.detail && result.detail.length > 0 && ' — hover for detail'}
        </span>
      )}
    </>
  );
}

// Small shared readers, so "yes" means the same thing in every module.
export const yes = (v) => /^(y|yes|true|1|x)$/i.test(String(v || '').trim());
export const num = (v, fallback = 0) => {
  const n = Number(String(v || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
};
export const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// Matching a name to something already in the app — a scene, an actor, a
// character. Case and spacing vary; intent doesn't.
export const byName = (list, name, fields = ['name']) => {
  const target = norm(name);
  if (!target) return null;
  return list.find((item) => fields.some((f) => norm(item[f]) === target)) || null;
};
