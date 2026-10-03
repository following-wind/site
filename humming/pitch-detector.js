(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HummingPitch = api;
})(globalThis, function () {
  'use strict';
  const SAMPLE_RATE = 16000, HOP = 480, WINDOW = 1024;
  // YIN cumulative mean normalized difference, then parabolic interpolation.
  function detectPitch(samples, sampleRate) {
    const size = Math.floor(samples.length / 2);
    const maxLag = Math.min(size - 1, Math.ceil(sampleRate / 65));
    const minLag = Math.max(2, Math.floor(sampleRate / 1100));
    const difference = new Float64Array(maxLag + 1);
    let sum = 0, energy = 0;
    for (const x of samples) energy += x * x;
    if (Math.sqrt(energy / samples.length) < 0.008) return {freq: null, confidence: 0};
    difference[0] = 1;
    for (let lag = 1; lag <= maxLag; lag++) {
      let value = 0;
      for (let i = 0; i < size; i++) {
        const d = samples[i] - samples[i + lag]; value += d * d;
      }
      sum += value;
      difference[lag] = sum ? value * lag / sum : 1;
    }
    let lag = minLag;
    while (lag < maxLag && difference[lag] >= 0.15) lag++;
    if (lag === maxLag) return {freq: null, confidence: 0};
    while (lag + 1 <= maxLag && difference[lag + 1] < difference[lag]) lag++;
    const confidence = 1 - difference[lag];
    let refined = lag;
    if (lag > 0 && lag < maxLag) {
      const a = difference[lag - 1], b = difference[lag], c = difference[lag + 1];
      const denominator = a - 2 * b + c;
      if (denominator) refined += 0.5 * (a - c) / denominator;
    }
    const freq = sampleRate / refined;
    return {freq: freq >= 65 && freq <= 1100 ? freq : null, confidence};
  }
  async function trackSamples(samples, sampleRate = SAMPLE_RATE) {
    const hop = Math.round(sampleRate * 0.03);
    const windowSize = Math.round(WINDOW * sampleRate / SAMPLE_RATE);
    const frames = [], window = new Float32Array(windowSize);
    for (let offset = 0; offset < samples.length; offset += hop) {
      const length = Math.min(hop, samples.length - offset);
      let power = 0;
      for (let j = 0; j < length; j++) power += samples[offset + j] ** 2;
      const rms = Math.sqrt(power / length);
      const begin = offset + Math.floor(length / 2) - Math.floor(windowSize / 2);
      for (let j = 0; j < windowSize; j++) window[j] = samples[begin + j] || 0;
      const pitch = rms < 0.008 ? {freq: null, confidence: 0} : detectPitch(window, sampleRate);
      frames.push({time: offset / sampleRate, duration: length / sampleRate, ...pitch, rms});
      // Keep Stop / scrolling responsive during a 30-second analysis.
      if (frames.length % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return frames;
  }
  async function trackBuffer(buffer, {includeCandidates=false} = {}) {
    // The browser resampler applies antialias filtering; render only the first 30 seconds.
    const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    const ctx = new Offline(1, Math.max(1, Math.ceil(Math.min(30, buffer.duration) * SAMPLE_RATE)), SAMPLE_RATE);
    const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination); source.start();
    const mono = await ctx.startRendering();
    const samples = mono.getChannelData(0);
    const frames = await trackSamples(samples);
    if (!includeCandidates) return frames;
    const octave = typeof module === 'object' && module.exports ? require('./octave-corrector.js') : globalThis.HummingOctave;
    return octave.fromSamples(samples, frames);

  }
  return {detectPitch, trackSamples, trackBuffer, SAMPLE_RATE, HOP};
});
