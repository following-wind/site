(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ChordRhythm = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  // 再生とMIDI書き出しで共用するコード構成音。
  const CHORD_TYPES = {
    "maj":  { label: "maj（3音・明るい）",             intervals: [0, 4, 7] },
    "m":    { label: "m（3音・暗い）",                 intervals: [0, 3, 7] },
    "maj7": { label: "maj7（4音・明るく柔らかい）",     intervals: [0, 4, 7, 11] },
    "m7":   { label: "m7（4音・暗く柔らかい）",         intervals: [0, 3, 7, 10] },
    "7":    { label: "7（4音・次へ進みたい）",          intervals: [0, 4, 7, 10] },
  };
  const BASS_PATTERNS = {
    off: { label: "OFF" },
    rootHold: { label: "Root Hold" },
    rootPulse: { label: "Root Pulse" },
    rootFifth: { label: "Root + 5th" },
    approach: { label: "Approach" },
  };

  const basicKick = [1, 0, 0, 0, 1, 0, 0, 0];
  const basicSnare = [0, 0, 1, 0, 0, 0, 1, 0];
  const steadyHat = [1, 1, 1, 1, 1, 1, 1, 1];
  const DRUM_PATTERNS = {
    off: { label: "OFF", kick: [], snare: [], hat: [], velocity: { kick: 0, snare: 0, hat: 0 }, swing: 0 },
    basic: { label: "Basic", kick: basicKick, snare: basicSnare, hat: steadyHat, velocity: { kick: 1, snare: 1, hat: 0.48 }, swing: 0 },
    soft: { label: "Soft", kick: [1, 0, 0, 0, 0, 0, 0, 0], snare: basicSnare, hat: steadyHat, velocity: { kick: 0.58, snare: 0.62, hat: 0.30 }, swing: 0 },
    sparse: { label: "Sparse", kick: [1, 0, 0, 0, 0, 0, 1, 0], snare: [0, 0, 1, 0, 0, 0, 0, 0], hat: [1, 0, 1, 0, 1, 0, 1, 0], velocity: { kick: 0.78, snare: 0.76, hat: 0.38 }, swing: 0 },
    busy: { label: "Busy", kick: [1, 0, 1, 0, 1, 0, 0, 1], snare: basicSnare, hat: steadyHat, velocity: { kick: 0.9, snare: 0.92, hat: 0.42 }, swing: 0 },
    halfTime: { label: "Half-time", kick: [1, 0, 0, 0, 0, 0, 1, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0], hat: steadyHat, velocity: { kick: 0.9, snare: 0.95, hat: 0.40 }, swing: 0 },
    swing: { label: "Swing", kick: basicKick, snare: basicSnare, hat: steadyHat, velocity: { kick: 1, snare: 1, hat: 0.48 }, swing: 0.125 },
    lateKick: { label: "Late Kick", kick: [1, 0, 0, 1, 1, 0, 0, 0], snare: basicSnare, hat: steadyHat, velocity: { kick: 0.92, snare: 0.94, hat: 0.42 }, swing: 0 },
    brokenHat: { label: "Broken Hat", kick: basicKick, snare: basicSnare, hat: [1, 1, 1, 0, 1, 1, 0, 1], velocity: { kick: 1, snare: 1, hat: 0.48 }, swing: 0 },
    noHat: { label: "No Hat", kick: basicKick, snare: basicSnare, hat: [0, 0, 0, 0, 0, 0, 0, 0], velocity: { kick: 1, snare: 1, hat: 0 }, swing: 0 },
    minimal: { label: "Minimal", kick: [1, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 0, 0, 0, 1, 0, 0, 1], velocity: { kick: 0.72, snare: 0.72, hat: 0.32 }, swing: 0 },
  };

  function rootSemitone(rootName) {
    const index = ROOTS.indexOf(rootName);
    if (index < 0) throw new Error(`Unknown root: ${rootName}`);
    return index;
  }

  function bassEvents(patternName, chord, nextChord) {
    if (patternName === "off") return [];
    const root = rootSemitone(chord.root);
    if (patternName === "rootHold") return [{ beat: 0, semitone: root, durationBeats: 4 }];
    if (patternName === "rootPulse") return [0, 1, 2, 3].map((beat) => ({ beat, semitone: root, durationBeats: 0.78 }));
    if (patternName === "rootFifth") return [0, 1, 2, 3].map((beat) => ({ beat, semitone: root + (beat % 2 ? 7 : 0), durationBeats: 0.78 }));
    if (patternName === "approach") {
      const approach = rootSemitone(nextChord.root) - 1;
      return [0, 1, 2].map((beat) => ({ beat, semitone: root, durationBeats: 0.78 }))
        .concat({ beat: 3, semitone: approach, durationBeats: 0.65 });
    }
    throw new Error(`Unknown bass pattern: ${patternName}`);
  }

  function totalBars(chordCount, repeatCount) {
    return Math.max(0, chordCount) * Math.max(0, repeatCount);
  }

  return { ROOTS, CHORD_TYPES, BASS_PATTERNS, DRUM_PATTERNS, bassEvents, rootSemitone, totalBars };
});
