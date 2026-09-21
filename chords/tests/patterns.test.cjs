const test = require('node:test');
const assert = require('node:assert/strict');
const rhythm = require('../patterns.js');

test('Bass 4パターンとOFFを定義する', () => {
  assert.deepEqual(Object.keys(rhythm.BASS_PATTERNS), ['off', 'rootHold', 'rootPulse', 'rootFifth', 'approach']);
  const chord = { root: 'F', type: 'm7' };
  const next = { root: 'C#', type: 'maj7' };
  assert.deepEqual(rhythm.bassEvents('rootHold', chord, next), [{ beat: 0, semitone: 5, durationBeats: 4 }]);
  assert.equal(rhythm.bassEvents('rootPulse', chord, next).length, 4);
  assert.deepEqual(rhythm.bassEvents('rootFifth', chord, next).map((event) => event.semitone), [5, 12, 5, 12]);
  assert.deepEqual(rhythm.bassEvents('approach', chord, next).map((event) => event.semitone), [5, 5, 5, 0]);
});

test('Approachはループ先頭がCでも半音下のBを選べる', () => {
  const events = rhythm.bassEvents('approach', { root: 'F' }, { root: 'C' });
  assert.equal(events[3].semitone, -1);
});

test('DrumsはOFFと10プリセットを持ち、各パターンは8ステップ', () => {
  assert.equal(Object.keys(rhythm.DRUM_PATTERNS).length, 11);
  for (const [name, pattern] of Object.entries(rhythm.DRUM_PATTERNS)) {
    if (name === 'off') continue;
    assert.equal(pattern.kick.length, 8, `${name} kick`);
    assert.equal(pattern.snare.length, 8, `${name} snare`);
    assert.equal(pattern.hat.length, 8, `${name} hat`);
  }
});

test('Basicは雨の窓と同じ配置', () => {
  const basic = rhythm.DRUM_PATTERNS.basic;
  assert.deepEqual(basic.kick, [1, 0, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(basic.snare, [0, 0, 1, 0, 0, 0, 1, 0]);
  assert.deepEqual(basic.hat, [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.ok(basic.velocity.kick > basic.velocity.hat);
  assert.ok(basic.velocity.snare > basic.velocity.hat);
});

test('Swingだけが裏拍を12.5%遅らせる設定を持つ', () => {
  assert.equal(rhythm.DRUM_PATTERNS.swing.swing, 0.125);
  for (const [name, pattern] of Object.entries(rhythm.DRUM_PATTERNS)) {
    if (name !== 'swing') assert.equal(pattern.swing, 0, name);
  }
});

test('コード数とRepeatから全パート共通の総小節数を計算する', () => {
  assert.equal(rhythm.totalBars(4, 4), 16);
  assert.equal(rhythm.totalBars(8, 2), 16);
});
