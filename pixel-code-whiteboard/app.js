import { spriteFromImageBlob } from './import-image.js';
import { inspectExcelTable, spriteFromExcelHtml } from './import-excel.js';
import { codeSize, decodeCompactSprite, encodeCompactSprite, generateCompactCode, generateExactCode, jsVariableName, paintRgba, rgbaMatchPercent, spriteInfo, spriteToRgba } from './sprite-codec.js';
import { createWhiteboard } from './whiteboard.js';

const $ = selector => document.querySelector(selector);
let selectedId = null, gesture = null, toastTimer, codeFormat = 'compact';
const board = createWhiteboard({ onChange: render });
function selected() { return board.get().find(item => item.id === selectedId); }
function notify(message) { $('#toast').textContent = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').textContent = '', 3500); }
function select(id) { selectedId = id; render(); }
function codeFor(sprite) { return codeFormat === 'exact' ? generateExactCode(sprite) : generateCompactCode(sprite); }

function render() {
  const items = board.get(); if (selectedId && !items.some(item => item.id === selectedId)) selectedId = null;
  $('#board-count').textContent = `${items.length} sprite${items.length === 1 ? '' : 's'}`;
  $('#empty-board').hidden = items.length > 0;
  const existing = new Map([...$('#board').querySelectorAll('.sprite-object')].map(node => [node.dataset.id, node]));
  for (const item of items) {
    let node = existing.get(item.id);
    if (!node) { node = document.createElement('div'); node.className = 'sprite-object'; node.dataset.id = item.id; node.innerHTML = '<canvas></canvas><span class="sprite-label"></span><button class="resize" aria-label="Spriteを拡大縮小"></button>'; $('#board').append(node); }
    existing.delete(item.id); const { spriteData } = item, display = item.scale;
    node.classList.toggle('selected', item.id === selectedId); node.style.left = `${item.x}px`; node.style.top = `${item.y}px`;
    node.style.width = `${spriteData.width * display}px`; node.style.height = `${spriteData.height * display}px`;
    paintRgba(node.querySelector('canvas'), spriteData.width, spriteData.height, spriteToRgba(spriteData), display);
    node.querySelector('.sprite-label').textContent = spriteData.name;
  }
  existing.forEach(node => node.remove());
  renderInspector(selected());
  $('#undo').disabled = !board.canUndo(); $('#redo').disabled = !board.canRedo();
}

function renderInspector(item) {
  $('#inspector').hidden = !item; if (!item) return;
  const sprite = item.spriteData, info = spriteInfo(sprite), compact = encodeCompactSprite(sprite);
  const compactRgba = decodeCompactSprite(compact), match = rgbaMatchPercent(sprite.sourceRgba, compactRgba);
  const compactCode = generateCompactCode(sprite), exactCode = generateExactCode(sprite);
  $('#selected-title').textContent = sprite.name; $('#sprite-name').value = sprite.name; $('#variable-name').textContent = `const ${jsVariableName(sprite.name)}`;
  $('#size').textContent = `${sprite.width} × ${sprite.height}`; $('#colors').textContent = info.colors; $('#painted').textContent = info.painted; $('#transparent').textContent = info.transparent;
  $('#match').textContent = `MATCH ${match}%`; $('#match').classList.toggle('bad-match', match !== 100);
  $('#compact-size').textContent = codeSize(compactCode); $('#exact-size').textContent = codeSize(exactCode);
  $('#code-heading').textContent = `Canvas JavaScript · ${codeFormat === 'compact' ? 'Compact' : 'Exact'}`;
  document.querySelectorAll('[data-code-format]').forEach(button => button.classList.toggle('active', button.dataset.codeFormat === codeFormat));
  paintRgba($('#original-preview'), sprite.width, sprite.height, sprite.sourceRgba, 6);
  // Generated Preview intentionally decodes Palette + Rows, not the internal pixel list.
  paintRgba($('#generated-preview'), sprite.width, sprite.height, compactRgba, 6);
  $('#code').textContent = codeFor(sprite);
}

async function importFromClipboard(event) {
  const transfer = event.clipboardData; if (!transfer) return;
  try {
    // Excel commonly supplies both text/html and an image preview. A valid table always wins.
    const html = transfer.getData('text/html');
    const table = inspectExcelTable(html);
    if (table) {
      event.preventDefault();
      console.info(`Excel table detected — Rows: ${table.height}, Columns: ${table.width}`);
      const identity = board.nextIdentity(); addSprite(spriteFromExcelHtml(html, identity)); return;
    }
    const image = [...transfer.items].find(item => item.kind === 'file' && item.type.startsWith('image/'));
    if (image) { event.preventDefault(); await importImage(image.getAsFile()); return; }
    notify('画像、またはExcelの32×32 / 64×64セル範囲を貼り付けてください。');
  } catch (error) { notify(error.message); }
}
async function importImage(file) { const identity = board.nextIdentity(); addSprite(await spriteFromImageBlob(file, identity)); }
function addSprite(sprite) { const offset = board.get().length * 24; board.add(sprite, { x: 70 + offset, y: 64 + offset, scale: 6 }); selectedId = sprite.id; render(); notify(`${sprite.name} をコード素材として読み取りました。`); }

$('#board').addEventListener('paste', importFromClipboard);
window.addEventListener('paste', event => { if (!event.target.closest('input,textarea,#board')) importFromClipboard(event); });
$('#paste-button').addEventListener('click', () => { $('#board').focus(); notify('ここで Ctrl/⌘ + V を押してください。'); });
$('#board').addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
$('#board').addEventListener('drop', async event => { event.preventDefault(); const file = [...event.dataTransfer.files].find(value => value.type.startsWith('image/')); if (!file) return notify('PNG画像をドロップしてください。'); try { await importImage(file); } catch (error) { notify(error.message); } });

$('#board').addEventListener('pointerdown', event => {
  const object = event.target.closest('.sprite-object'); if (!object) { select(null); return; }
  const item = board.get().find(value => value.id === object.dataset.id); select(item.id); event.preventDefault();
  const resize = event.target.closest('.resize'); gesture = { id: item.id, type: resize ? 'resize' : 'move', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: item.x, y: item.y, scale: item.scale, width: item.spriteData.width }; board.beginTransaction(); $('#board').setPointerCapture(event.pointerId);
});
$('#board').addEventListener('pointermove', event => { if (!gesture || event.pointerId !== gesture.pointerId) return; const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY; if (gesture.type === 'move') board.update(gesture.id, { x: Math.max(0, Math.round(gesture.x + dx)), y: Math.max(0, Math.round(gesture.y + dy)) }); else board.update(gesture.id, { scale: Math.max(1, Math.min(20, Math.round((gesture.scale + Math.max(dx, dy) / gesture.width) * 4) / 4)) }); });
for (const eventName of ['pointerup', 'pointercancel']) $('#board').addEventListener(eventName, event => { if (gesture && event.pointerId === gesture.pointerId) { if ($('#board').hasPointerCapture(event.pointerId)) $('#board').releasePointerCapture(event.pointerId); gesture = null; board.endTransaction(); } });

$('#sprite-name').addEventListener('change', event => { const item = selected(); if (!item) return; const name = event.target.value.trim() || item.spriteData.name; board.update(item.id, { spriteData: { ...item.spriteData, name } }); });
$('#duplicate').addEventListener('click', () => { if (selectedId) { selectedId = board.duplicate(selectedId); render(); } });
$('#delete').addEventListener('click', () => { if (selectedId) { board.remove(selectedId); selectedId = null; } });
$('#undo').addEventListener('click', () => board.undo()); $('#redo').addEventListener('click', () => board.redo());
document.querySelectorAll('[data-code-format]').forEach(button => button.addEventListener('click', () => { codeFormat = button.dataset.codeFormat; render(); }));
$('#copy-code').addEventListener('click', async () => { const item = selected(); if (!item) return; try { await navigator.clipboard.writeText(codeFor(item.spriteData)); notify('Copied'); } catch { const range = document.createRange(); range.selectNodeContents($('#code')); getSelection().removeAllRanges(); getSelection().addRange(range); document.execCommand('copy'); getSelection().removeAllRanges(); notify('Copied'); } });
document.addEventListener('keydown', event => { const modified = event.ctrlKey || event.metaKey; if (modified && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? board.redo() : board.undo(); } else if (!event.target.closest('input,textarea') && ['Delete', 'Backspace'].includes(event.key) && selectedId) { event.preventDefault(); board.remove(selectedId); selectedId = null; } });
render();
