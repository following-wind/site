(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HummingMidi = api;
})(globalThis, function () {
  'use strict';
  const PPQ = 480, MAX_DELTA = 0x0fffffff;
  function integer(value, length) {
    return Array.from({length}, (_,i) => Math.floor(value / 256 ** (length-i-1)) & 255);
  }
  function variable(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DELTA) throw new Error('MIDI time out of range');
    const bytes = [value & 127];
    while ((value = Math.floor(value / 128))) bytes.unshift((value & 127) | 128);
    return bytes;
  }
  // SMF format 0, one track / channel; seconds converted using the written tempo.
  function createMidi(notes, bpm = 120) {
    if (!Array.isArray(notes) || !notes.length) throw new Error('No notes');
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) throw new Error('Invalid BPM');
    const tempo = Math.round(60000000 / bpm), ticksPerSecond = PPQ * 1000000 / tempo;
    const events = [{tick:0,order:0,bytes:[255,81,3,...integer(tempo,3)]}];
    for (const n of notes) {
      if (!n || !Number.isInteger(n.midi) || n.midi<0 || n.midi>127 ||
          !Number.isFinite(n.start) || n.start<0 || !Number.isFinite(n.duration) || n.duration<=0)
        throw new Error('Invalid note');
      const start = Math.round(n.start*ticksPerSecond);
      const end = Math.max(start+1,Math.round((n.start+n.duration)*ticksPerSecond));
      if (!Number.isSafeInteger(end) || end>MAX_DELTA) throw new Error('MIDI time out of range');
      events.push({tick:start,order:2,bytes:[144,n.midi,80]}, {tick:end,order:1,bytes:[128,n.midi,0]});
    }
    events.sort((a,b)=>a.tick-b.tick||a.order-b.order); // Note-off before note-on at a boundary.
    let previous = 0; const track = [];
    for(const e of events) { track.push(...variable(e.tick-previous),...e.bytes); previous=e.tick; }
    track.push(0,255,47,0);
    const header = [77,84,104,100,0,0,0,6,0,0,0,1,...integer(PPQ,2),77,84,114,107,...integer(track.length,4)];
    const bytes = new Uint8Array(header.length+track.length);bytes.set(header);bytes.set(track,header.length);
    return bytes;
  }
  return {createMidi,PPQ};
});
