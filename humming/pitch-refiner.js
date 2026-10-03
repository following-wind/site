// Pitch-only representative estimator. Segmentation always receives original raw frames.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HummingPitchRefiner = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function estimate(track, window) {
    const end = window.start + window.duration;
    const pitches = track.filter(f => f.time >= window.start - 1e-9 && f.time < end - 1e-9 &&
      Number.isFinite(f.freq) && f.freq > 0 && Number.isFinite(f.confidence) && f.confidence >= .85 &&
      (!Number.isFinite(f.rms) || f.rms >= .008))
      .map(f => 69 + 12 * Math.log2(f.freq / 440)).sort((a,b) => a-b);
    if (!pitches.length) return null;
    const mid = Math.floor(pitches.length / 2);
    return Math.round(pitches.length % 2 ? pitches[mid] : (pitches[mid-1] + pitches[mid]) / 2);
  }
  function refine(track, notes) {
    return notes.map(n => {
      const midi = estimate(track, n);
      if (midi === null || midi < 0 || midi > 127) return {...n};
      const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      return {...n, midi, note: names[midi % 12] + (Math.floor(midi / 12)-1)};
    });
  }
  return {estimate, refine};
});
