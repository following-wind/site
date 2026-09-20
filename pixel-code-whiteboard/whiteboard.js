export function createWhiteboard({ onChange }) {
  let sprites = [], undo = [], redo = [], sequence = 0, transaction = null;
  const snapshot = () => structuredClone(sprites);
  const remember = before => { undo.push(before); if (undo.length > 100) undo.shift(); redo = []; };
  const commit = next => { const before = snapshot(); sprites = next; if (!transaction) remember(before); onChange(get()); };
  const get = () => structuredClone(sprites);
  const nextId = () => `sprite-${String(++sequence).padStart(3, '0')}`;
  return {
    get, nextIdentity() { const id = nextId(); return { id, name: `SPRITE_${String(sequence).padStart(3, '0')}` }; },
    add(sprite, position = {}) { commit([...sprites, { id: sprite.id, type: 'pixel-sprite', x: position.x ?? 80, y: position.y ?? 80, scale: position.scale ?? 6, spriteData: sprite }]); return sprite.id; },
    update(id, patch) { commit(sprites.map(item => item.id === id ? { ...item, ...patch, spriteData: patch.spriteData ? patch.spriteData : item.spriteData } : item)); },
    remove(id) { commit(sprites.filter(item => item.id !== id)); },
    duplicate(id) { const item = sprites.find(value => value.id === id); if (!item) return null; const identity = this.nextIdentity(); const spriteData = { ...structuredClone(item.spriteData), ...identity }; this.add(spriteData, { x: item.x + 28, y: item.y + 28, scale: item.scale }); return identity.id; },
    beginTransaction() { if (!transaction) transaction = snapshot(); },
    endTransaction() { if (!transaction) return; const before = transaction; transaction = null; if (JSON.stringify(before) !== JSON.stringify(sprites)) remember(before); onChange(get()); },
    canUndo: () => undo.length > 0, canRedo: () => redo.length > 0,
    undo() { this.endTransaction(); if (!undo.length) return false; redo.push(snapshot()); sprites = undo.pop(); onChange(get()); return true; },
    redo() { this.endTransaction(); if (!redo.length) return false; undo.push(snapshot()); sprites = redo.pop(); onChange(get()); return true; }
  };
}
