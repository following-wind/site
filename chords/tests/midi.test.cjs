const test = require("node:test");
const assert = require("node:assert/strict");
const rhythm = require("../patterns.js");
const midi = require("../midi.js");

const progression = [
  { root: "F", type: "m7" },
  { root: "C#", type: "maj7" },
  { root: "G#", type: "maj" },
  { root: "D#", type: "7" },
];
const base = { bpm: 70, repeatCount: 4, progression, bassPattern: "rootHold", drumPattern: "basic" };
const noteOns = (parsed) => parsed.events.filter((event) => event.kind === "on");
const meta = (parsed, type) => parsed.events.find((event) => event.kind === "meta" && event.type === type);

function parse(factory, overrides = {}) {
  return midi.parseMidi(factory({ ...base, ...overrides }));
}

test("全MIDIはformat 0、PPQ 480、Tempoと4/4を持つ", () => {
  [midi.createChordMidi, midi.createBassMidi, midi.createDrumsMidi].forEach((factory) => {
    const parsed = parse(factory);
    assert.equal(parsed.format, 0);
    assert.equal(parsed.tracks, 1);
    assert.equal(parsed.ppq, 480);
    assert.deepEqual(meta(parsed, 0x51).data, [0x0d, 0x14, 0x37]);
    assert.deepEqual(meta(parsed, 0x58).data, [4, 2, 24, 8]);
  });
});

test("Chordは選択コードの構成音を各小節に書き出す", () => {
  const parsed = parse(midi.createChordMidi);
  const firstBar = noteOns(parsed).filter((event) => event.tick === 0);
  assert.deepEqual(firstBar.map((event) => event.note).sort((a, b) => a - b), [53, 56, 60, 63]);
  assert.equal(noteOns(parsed).length, 60);
  assert.equal(parsed.endTick, 16 * midi.BAR_TICKS);
});

test("Bass 4パターンは異なるイベントになり、Approachは次コードとループ先頭を使う", () => {
  const patterns = ["rootHold", "rootPulse", "rootFifth", "approach"];
  const signatures = patterns.map((bassPattern) => noteOns(parse(midi.createBassMidi, { bassPattern }))
    .slice(0, 4).map((event) => event.tick + ":" + event.note).join(","));
  assert.equal(new Set(signatures).size, 4);
  const approach = noteOns(parse(midi.createBassMidi, { bassPattern: "approach" }));
  assert.deepEqual(approach.filter((event) => event.tick < midi.BAR_TICKS).map((event) => event.note), [41, 41, 41, 36]);
  const lastBar = approach.filter((event) => event.tick >= 15 * midi.BAR_TICKS);
  assert.equal(lastBar[3].note, 40);
});

test("10ドラムプリセットはGM 36/38/42と共有定義どおりの配置になる", () => {
  Object.keys(rhythm.DRUM_PATTERNS).filter((name) => name !== "off").forEach((drumPattern) => {
    const parsed = parse(midi.createDrumsMidi, { drumPattern });
    const events = noteOns(parsed);
    assert.ok(events.every((event) => [36, 38, 42].includes(event.note)));
    assert.ok(events.every((event) => event.channel === midi.DRUM_CHANNEL));
    const firstBar = events.filter((event) => event.tick < midi.BAR_TICKS);
    const expected = ["kick", "snare", "hat"].flatMap((voice) => rhythm.DRUM_PATTERNS[drumPattern][voice]
      .map((enabled, step) => enabled ? midi.DRUM_NOTES[voice] + "@" + (step * 240 + (step % 2 ? 240 * rhythm.DRUM_PATTERNS[drumPattern].swing : 0)) : null)
      .filter(Boolean)).sort();
    assert.deepEqual(firstBar.map((event) => event.note + "@" + event.tick).sort(), expected);
  });
});

test("BPMとRepeatは全パートに共通で反映される", () => {
  [1, 2, 4, 8].forEach((repeatCount) => {
    [midi.createChordMidi, midi.createBassMidi, midi.createDrumsMidi].forEach((factory) => {
      assert.equal(parse(factory, { repeatCount }).endTick, progression.length * repeatCount * midi.BAR_TICKS);
    });
  });
  const parsed = parse(midi.createChordMidi, { bpm: 100 });
  assert.deepEqual(meta(parsed, 0x51).data, [0x09, 0x27, 0xc0]);
});

test("3パートの開始と終了は一致し、Swingの裏拍だけ遅れる", () => {
  const parts = [midi.createChordMidi, midi.createBassMidi, midi.createDrumsMidi].map((factory) => parse(factory));
  assert.deepEqual(parts.map((part) => part.endTick), [30720, 30720, 30720]);
  assert.ok(parts.every((part) => noteOns(part)[0].tick === 0));
  const basicHats = noteOns(parse(midi.createDrumsMidi, { drumPattern: "basic" })).filter((event) => event.note === 42).slice(0, 2);
  const swingHats = noteOns(parse(midi.createDrumsMidi, { drumPattern: "swing" })).filter((event) => event.note === 42).slice(0, 2);
  assert.deepEqual(basicHats.map((event) => event.tick), [0, 240]);
  assert.deepEqual(swingHats.map((event) => event.tick), [0, 270]);
});


test("End of Trackは常に最後のイベントで、全パートが共通の曲終端を使う", () => {
  [1, 2, 4, 8].forEach((repeatCount) => {
    const expectedEnd = progression.length * repeatCount * midi.BAR_TICKS;
    const cases = [
      ["Chord", midi.createChordMidi, {}],
      ["Drums", midi.createDrumsMidi, {}],
      ...["rootHold", "rootPulse", "rootFifth", "approach"]
        .map((bassPattern) => ["Bass " + bassPattern, midi.createBassMidi, { bassPattern }]),
    ];
    cases.forEach(([name, factory, overrides]) => {
      const parsed = parse(factory, { repeatCount, ...overrides });
      const lastEvent = parsed.events.at(-1);
      assert.equal(parsed.endTick, expectedEnd, name + " end tick");
      assert.equal(lastEvent.kind, "meta", name + " final event kind");
      assert.equal(lastEvent.type, 0x2f, name + " final event is End of Track");
      assert.equal(lastEvent.tick, expectedEnd, name + " End of Track tick");
    });
  });
});

test("16小節のChordとRoot Hold Bassは最終Note Offの後にEnd of Trackを置く", () => {
  [midi.createChordMidi, midi.createBassMidi].forEach((factory) => {
    const parsed = parse(factory, { repeatCount: 4, bassPattern: "rootHold" });
    const finalNoteOff = parsed.events.filter((event) => event.kind === "off").at(-1);
    const endOfTrack = parsed.events.at(-1);
    assert.equal(finalNoteOff.tick, 30720);
    assert.equal(endOfTrack.tick, 30720);
    assert.ok(parsed.events.indexOf(finalNoteOff) < parsed.events.indexOf(endOfTrack));
  });
});
