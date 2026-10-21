const test = require('node:test');
const assert = require('node:assert');
const Synth = require('../src/renderer/synth.js');
const Presets = require('../src/renderer/presets.js');

const SR = 48000;

// Single-bin DFT magnitude (normalised so a full-scale sine of amplitude A returns ~A).
function bin(buf, freq, sr = SR) {
  let re = 0, im = 0;
  const w = (2 * Math.PI * freq) / sr;
  for (let i = 0; i < buf.length; i++) {
    re += buf[i] * Math.cos(w * i);
    im -= buf[i] * Math.sin(w * i);
  }
  return (2 * Math.hypot(re, im)) / buf.length;
}

const peak = (b) => b.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('ultrasonic pulse has energy at 20 kHz and almost none in the audible band', () => {
  const p = { wave: 'sine', freq: 20000, gainDb: -32, durationMs: 600, intervalSec: 15, fadeMs: 80 };
  const b = Synth.render(p, SR);
  const amp = Synth.dbToGain(-32);
  assert.strictEqual(b.length, Math.round(SR * 0.6));
  const sustain = b.subarray(Math.round(SR * 0.1), Math.round(SR * 0.5));
  assert.ok(Math.abs(bin(sustain, 20000) - amp) / amp < 0.05, 'level at 20 kHz matches gainDb');
  for (const f of [100, 1000, 5000, 10000]) {
    assert.ok(bin(sustain, f) < amp * 0.01, `no leakage at ${f} Hz`);
  }
});

test('pulse fades in and out (no click at the edges)', () => {
  const b = Synth.render(
    { wave: 'sine', freq: 30, gainDb: -20, durationMs: 1000, intervalSec: 10, fadeMs: 200 }, SR);
  const amp = Synth.dbToGain(-20);
  assert.ok(Math.abs(b[0]) < amp * 0.01 + 1e-4);
  assert.ok(Math.abs(b[b.length - 1]) < amp * 0.01 + 1e-4);
  assert.ok(peak(b) <= amp * 1.001 + 1e-4);
});

test('gain stays within requested level for every mode preset', () => {
  for (const m of Presets.MODES) {
    const b = Synth.render(m.params, SR);
    const amp = Synth.dbToGain(m.params.gainDb);
    assert.ok(b.length > 0, `${m.id} renders`);
    // Noise/click can exceed the nominal sine amplitude a little; allow 3x headroom.
    assert.ok(peak(b) <= Math.max(amp * 3, 1e-3), `${m.id} peak ${peak(b)} vs ${amp}`);
    assert.ok(peak(b) > 0, `${m.id} not silent`);
    assert.ok(b.every(Number.isFinite), `${m.id} finite`);
  }
});

test('continuous mode loops seamlessly (integer cycles)', () => {
  const b = Synth.render(
    { wave: 'sine', freq: 20000.4, gainDb: -30, durationMs: 1000, intervalSec: 0, fadeMs: 0 }, SR);
  assert.strictEqual(b.length, SR * 2);
  const amp = Synth.dbToGain(-30);
  // Sample after the last one would be sin(0)=0, so the last sample must be near a zero crossing step.
  const step = Math.abs(b[b.length - 1] - 0);
  assert.ok(step <= amp * Math.sin((2 * Math.PI * 20000) / SR) * 1.05 + 1e-4);
});

test('frequency is clamped below Nyquist', () => {
  const b = Synth.render(
    { wave: 'sine', freq: 22000, gainDb: -30, durationMs: 200, intervalSec: 5, fadeMs: 10 }, 44100);
  assert.ok(b.every(Number.isFinite));
  // 22 kHz is Nyquist at 44.1 kHz; must have been pulled lower so signal is real.
  assert.ok(bin(b.subarray(2000, 6000), 21550, 44100) > Synth.dbToGain(-30) * 0.5);
});

test('pink noise is spectrally tilted (more low than high energy)', () => {
  const b = Synth.render(
    { wave: 'pink', freq: 1000, gainDb: -20, durationMs: 2000, intervalSec: 5, fadeMs: 0 }, SR);
  let lo = 0, hi = 0;
  for (let k = 0; k < 20; k++) { lo += bin(b, 200 + k * 13); hi += bin(b, 8000 + k * 13); }
  assert.ok(lo > hi * 1.5, `low ${lo} should exceed high ${hi}`);
});

test('presets stay inside the UI limits', () => {
  for (const m of Presets.MODES) {
    for (const [k, lim] of Object.entries(Presets.LIMITS)) {
      const v = m.params[k];
      assert.ok(v >= lim.min && v <= lim.max, `${m.id}.${k}=${v}`);
    }
  }
});
