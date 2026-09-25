const QUOTE = String.fromCharCode(34);

/**
 * RFC 4180 CSV reader.
 *
 * The WFP file genuinely contains quoted fields with commas inside them
 * ("Milk (powder, infant formula)"), so splitting on commas silently corrupts
 * the commodity column and invents categories that do not exist.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === QUOTE) {
        if (text[i + 1] === QUOTE) { field += QUOTE; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === QUOTE) {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Parses to objects keyed by header, dropping HXL tag rows (`#tag`). */
export function parseCsvObjects(text) {
  const rows = parseCsv(text.trim());
  if (!rows.length) return [];
  const header = rows[0];
  return rows
    .slice(1)
    .filter((r) => r[0] && !r[0].startsWith('#'))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
