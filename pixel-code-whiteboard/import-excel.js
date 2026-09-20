import { spriteFromRgba } from './sprite-codec.js';

export function inspectExcelTable(html) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const rows = [...table.rows];
  const width = Math.max(0, ...rows.map(row => [...row.cells].reduce((total, cell) => total + (Number(cell.colSpan) || 1), 0)));
  return rows.length && width ? { doc, table, rows, width, height: rows.length } : null;
}

export function spriteFromExcelHtml(html, identity) {
  const parsed = inspectExcelTable(html);
  if (!parsed) throw new Error('Excelの表が見つかりません。32×32または64×64のセル範囲をコピーしてください。');
  const { doc, rows, width, height } = parsed;
  const classColors = collectClassColors(doc);
  const rgba = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => { let x = 0; [...row.cells].forEach(cell => {
    const color = cellColor(cell, classColors), span = Number(cell.colSpan) || 1;
    if (color) for (let dx = 0; dx < span; dx++) rgba.set(color, (y * width + x + dx) * 4);
    x += span;
  }); });
  return spriteFromRgba({ ...identity, width, height, rgba });
}

// Excel often writes class names such as xl65 and a <style> block instead of an inline background.
function collectClassColors(doc) {
  const colors = new Map();
  const css = [...doc.querySelectorAll('style')].map(style => style.textContent).join('\n');
  for (const match of css.matchAll(/\.([\w-]+)[^{]*\{([^}]*)\}/g)) {
    const raw = backgroundFromStyle(match[2]);
    if (raw) colors.set(match[1], raw);
  }
  return colors;
}

function cellColor(cell, classColors) {
  const style = cell.getAttribute('style') || '';
  const raw = cell.getAttribute('bgcolor') || backgroundFromStyle(style) || [...cell.classList].map(name => classColors.get(name)).find(Boolean);
  if (!raw || /transparent|none/i.test(raw)) return null;
  return cssColorToRgba(raw.trim());
}

function backgroundFromStyle(style) {
  return style.match(/background-color\s*:\s*([^;]+)/i)?.[1] || style.match(/background\s*:\s*([^;]+)/i)?.[1] || null;
}

function cssColorToRgba(value) {
  let match = value.match(/^#([\da-f]{3,8})/i);
  if (match) { const hex = match[1]; const expand = char => parseInt(char + char, 16); if (hex.length === 3 || hex.length === 4) return [expand(hex[0]), expand(hex[1]), expand(hex[2]), hex.length === 4 ? expand(hex[3]) : 255]; if (hex.length === 6 || hex.length === 8) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255]; }
  match = value.match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?/i);
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] == null ? 255 : Math.round(Number(match[4]) * (Number(match[4]) <= 1 ? 255 : 1))];
  const probe = document.createElement('canvas').getContext('2d'); probe.fillStyle = '#000'; probe.fillStyle = value; const parsed = probe.fillStyle;
  if (parsed !== '#000' || /^black$/i.test(value)) return cssColorToRgba(parsed);
  return null;
}
