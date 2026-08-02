import React from 'react';
import { Download } from 'lucide-react';
import { COLOR } from './theme.jsx';

// ---------------------------------------------------------------------------
// CSV EXPORT
//
// Every section can hand its contents to a producer, a shop, or a spreadsheet.
// Rows are plain objects; the keys of the first row become the header, so each
// section decides its own columns and the order it wants them in.
//
// The BOM matters: without it Excel opens UTF-8 as Latin-1 and turns every em
// dash and accented name into mojibake, which is exactly the kind of thing
// that gets noticed on a printed call sheet.
// ---------------------------------------------------------------------------

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Quote anything containing a delimiter, a quote, or a line break, and
  // double up embedded quotes, per RFC 4180.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(escapeCell).join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => escapeCell(row[h])).join(','));
  });
  return lines.join('\r\n');
}

function safeName(text) {
  return String(text || 'export')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'export';
}

export function downloadCsv(filename, rows) {
  const csv = toCsv(rows);
  if (!csv) return false;
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(filename)}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

// `rows` is a function so nothing is built until someone actually exports.
export function ExportCsvButton({ filename, rows, label = 'Export CSV', title }) {
  const [empty, setEmpty] = React.useState(false);

  const onClick = () => {
    const built = typeof rows === 'function' ? rows() : rows;
    const ok = downloadCsv(filename, built);
    if (!ok) {
      setEmpty(true);
      setTimeout(() => setEmpty(false), 2200);
    }
  };

  return (
    <button
      onClick={onClick}
      className="td-focusable"
      title={title || 'Download this section as a spreadsheet'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'transparent',
        border: `1px solid ${COLOR.line}`,
        borderRadius: 3,
        color: empty ? COLOR.amber : COLOR.textMuted,
        fontSize: 11.5,
        padding: '6px 10px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <Download size={13} />
      {empty ? 'Nothing to export' : label}
    </button>
  );
}
