const test = require('node:test');
const assert = require('node:assert');
const { SoundGate, rmsDb } = require('../src/renderer/gate.js');

test('idle before any sound', () => {
  const g = new SoundGate({ thresholdDb: -55, resumeSec: 10 });
  assert.strictEqual(g.busy(1000), false);
});

test('loud reading makes it busy, and it stays busy until resumeSec of quiet', () => {
  const g = new SoundGate({ thresholdDb: -55, resumeSec: 10 });
  g.feed(-30, 1000, false);
  assert.strictEqual(g.busy(1000), true);
  g.feed(-90, 5000, false);
  assert.strictEqual(g.busy(10999), true);
  assert.strictEqual(g.busy(11000), false);
});

test('new sound restarts the quiet countdown', () => {
  const g = new SoundGate({ thresholdDb: -55, resumeSec: 10 });
  g.feed(-30, 0, false);
  g.feed(-30, 8000, false);
  assert.strictEqual(g.busy(17999), true);
  assert.strictEqual(g.busy(18000), false);
});

test('readings taken while our own pulse plays are ignored', () => {
  const g = new SoundGate({ thresholdDb: -55, resumeSec: 10 });
  g.feed(-10, 1000, true);
  assert.strictEqual(g.busy(1000), false);
  assert.strictEqual(g.level, -Infinity);
});

test('threshold is respected and can be reconfigured', () => {
  const g = new SoundGate({ thresholdDb: -40, resumeSec: 5 });
  g.feed(-50, 0, false);
  assert.strictEqual(g.busy(0), false);
  g.configure({ thresholdDb: -60, resumeSec: 5 });
  g.feed(-50, 1000, false);
  assert.strictEqual(g.busy(1000), true);
});

test('rmsDb of known signals', () => {
  assert.strictEqual(rmsDb(new Float32Array(100)), -Infinity);
  const full = new Float32Array(1000).fill(1);
  assert.ok(Math.abs(rmsDb(full)) < 1e-9);
  const sine = Float32Array.from({ length: 4800 }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 1000 * i) / 48000));
  assert.ok(Math.abs(rmsDb(sine) - (-23.01)) < 0.1); // 0.1 / sqrt(2) -> -23 dBFS
});
