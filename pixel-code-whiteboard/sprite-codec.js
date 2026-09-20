export const SUPPORTED_SIZES = [32, 64];
const PALETTE_TOKENS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function assertSupportedSize(width, height) {
  if (!SUPPORTED_SIZES.includes(width) || !SUPPORTED_SIZES.includes(height) || width !== height) {
    throw new Error(`このバージョンでは ${SUPPORTED_SIZES.map(size => `${size}×${size}`).join(' / ')} のみ対応しています。受け取ったサイズ: ${width}×${height}`);
  }
}

export function spriteFromRgba({ id, name, width, height, rgba }) {
  assertSupportedSize(width, height);
  if (rgba.length !== width * height * 4) throw new Error('RGBAデータの長さが画像サイズと一致しません。');
  const pixels = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4, a = rgba[index + 3];
    if (a > 0) pixels.push([x, y, rgba[index], rgba[index + 1], rgba[index + 2], a]);
  }
  return { id, name, width, height, pixels, sourceRgba: Array.from(rgba) };
}

export function spriteToRgba(sprite) {
  const rgba = new Uint8ClampedArray(sprite.width * sprite.height * 4);
  for (const [x, y, r, g, b, a] of sprite.pixels) rgba.set([r, g, b, a], (y * sprite.width + x) * 4);
  return rgba;
}

export function spriteInfo(sprite) {
  const colors = new Set(sprite.pixels.map(([, , r, g, b, a]) => `${r},${g},${b},${a}`));
  return { colors: colors.size, painted: sprite.pixels.length, transparent: sprite.width * sprite.height - sprite.pixels.length };
}

export function rgbaMatchPercent(original, generated) {
  if (original.length !== generated.length) return 0;
  let matching = 0;
  for (let i = 0; i < original.length; i++) if (original[i] === generated[i]) matching++;
  return Math.round((matching / original.length) * 10000) / 100;
}

export function matchPercent(sprite) { return rgbaMatchPercent(sprite.sourceRgba || [], spriteToRgba(sprite)); }

export function jsVariableName(name) {
  let value = String(name || 'SPRITE').trim().toUpperCase().replace(/[^A-Z0-9_$]+/g, '_').replace(/^_+|_+$/g, '');
  if (!value) value = 'SPRITE';
  if (/^[0-9]/.test(value)) value = `SPRITE_${value}`;
  return value;
}

export function generateExactCode(sprite) {
  const constant = jsVariableName(sprite.name);
  return `const ${constant} = {\n  width: ${sprite.width},\n  height: ${sprite.height},\n  pixels: [\n${sprite.pixels.map(pixel => `    [${pixel.join(', ')}]`).join(',\n')}\n  ]\n};\n\nfunction drawPixelSprite(ctx, sprite, x, y, scale = 1) {\n  for (const [px, py, r, g, b, a] of sprite.pixels) {\n    ctx.fillStyle = \`rgba(\${r}, \${g}, \${b}, \${a / 255})\`;\n    ctx.fillRect(x + px * scale, y + py * scale, scale, scale);\n  }\n}\n\n// example\ndrawPixelSprite(ctx, ${constant}, 100, 100, 3);`;
}

// Compact is an export representation only. The editable/internal Sprite remains x,y,RGBA pixels.
export function encodeCompactSprite(sprite) {
  const byPosition = new Map(sprite.pixels.map(pixel => [`${pixel[0]},${pixel[1]}`, pixel]));
  const palette = { '.': null }, colorTokens = new Map(), rows = [];
  for (let y = 0; y < sprite.height; y++) {
    let row = '';
    for (let x = 0; x < sprite.width; x++) {
      const pixel = byPosition.get(`${x},${y}`);
      if (!pixel) { row += '.'; continue; }
      const color = pixel.slice(2), key = color.join(',');
      let token = colorTokens.get(key);
      if (!token) {
        if (colorTokens.size >= PALETTE_TOKENS.length) return { format: 'exact', width: sprite.width, height: sprite.height, pixels: sprite.pixels.map(pixel => [...pixel]) };
        token = PALETTE_TOKENS[colorTokens.size]; colorTokens.set(key, token); palette[token] = color;
      }
      row += token;
    }
    rows.push(row);
  }
  return { format: 'compact', width: sprite.width, height: sprite.height, palette, rows };
}

export function decodeCompactSprite(compact) {
  const rgba = new Uint8ClampedArray(compact.width * compact.height * 4);
  if (compact.format === 'exact') {
    for (const [x, y, r, g, b, a] of compact.pixels) rgba.set([r, g, b, a], (y * compact.width + x) * 4);
    return rgba;
  }
  for (let y = 0; y < compact.height; y++) {
    const row = compact.rows[y];
    if (typeof row !== 'string' || row.length !== compact.width) throw new Error('Compact SpriteのRowsサイズが不正です。');
    for (let x = 0; x < compact.width; x++) {
      const color = compact.palette[row[x]];
      if (color) rgba.set(color, (y * compact.width + x) * 4);
    }
  }
  return rgba;
}

function compactLiteral(compact) {
  const palette = Object.entries(compact.palette).map(([token, color]) => `    ${JSON.stringify(token)}: ${color ? `[${color.join(', ')}]` : 'null'}`).join(',\n');
  const rows = compact.rows.map(row => `    ${JSON.stringify(row)}`).join(',\n');
  return `{\n  width: ${compact.width},\n  height: ${compact.height},\n  palette: {\n${palette}\n  },\n  rows: [\n${rows}\n  ]\n}`;
}

export function generateCompactCode(sprite) {
  const compact = encodeCompactSprite(sprite);
  if (compact.format === 'exact') return `// ${PALETTE_TOKENS.length}色を超えるため、RGBAを失わないExact形式で出力しています。\n\n${generateExactCode(sprite)}`;
  const constant = jsVariableName(sprite.name);
  return `const ${constant} = ${compactLiteral(compact)};\n\nfunction drawPixelSprite(ctx, sprite, x, y, scale = 1) {\n  for (let py = 0; py < sprite.height; py++) {\n    const row = sprite.rows[py];\n    for (let px = 0; px < sprite.width; px++) {\n      const color = sprite.palette[row[px]];\n      if (!color) continue;\n      const [r, g, b, a] = color;\n      ctx.fillStyle = \`rgba(\${r}, \${g}, \${b}, \${a / 255})\`;\n      ctx.fillRect(x + px * scale, y + py * scale, scale, scale);\n    }\n  }\n}\n\n// example\ndrawPixelSprite(ctx, ${constant}, 100, 100, 3);`;
}

// Compatibility alias: the original output remains available as Exact.
export const generateCanvasCode = generateExactCode;
export function codeSize(code) { const bytes = new TextEncoder().encode(code).length; return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`; }

export function paintRgba(canvas, width, height, rgba, scale = 1) {
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  canvas.style.width = `${width * scale}px`; canvas.style.height = `${height * scale}px`;
}
