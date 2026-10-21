const test = require('node:test');
const assert = require('node:assert');
const Shuffle = require('../src/renderer/shuffle.js');
const Presets = require('../src/renderer/presets.js');

const pool = Presets.MODES
  .filter((m) => m.params.intervalSec > 0 && !m.shuffle)
  .map((m) => ({ id: m.id, params: m.params }));
const opts = { minSec: 5, maxSec: 20, jitterDb: 3 };

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

test('empty or unusable pool returns null', () => {
  assert.strictEqual(Shuffle.next([], null, opts), null);
  const cont = [{ id: 'c', params: Object.assign({}, pool[0].params, { intervalSec: 0 }) }];
  assert.strictEqual(Shuffle.next(cont, null, opts), null);
});

test('never repeats the previous mode when there is a choice', () => {
  const rng = seeded(1);
  let last = null;
  for (let i = 0; i < 500; i++) {
    const r = Shuffle.next(pool, last, opts, rng);
    assert.notStrictEqual(r.id, last);
    last = r.id;
  }
});

test('a single-item pool may repeat', () => {
  const one = [pool[0]];
  assert.strictEqual(Shuffle.next(one, pool[0].id, opts).id, pool[0].id);
});

test('every mode in the pool gets used', () => {
  const rng = seeded(7);
  const seen = new Set();
  let last = null;
  for (let i = 0; i < 300; i++) { const r = Shuffle.next(pool, last, opts, rng); seen.add(r.id); last = r.id; }
  assert.strictEqual(seen.size, pool.length);
});

test('interval, level and duration stay inside their bounds', () => {
  const rng = seeded(42);
  let last = null;
  for (let i = 0; i < 1000; i++) {
    const r = Shuffle.next(pool, last, opts, rng);
    last = r.id;
    assert.ok(r.intervalSec >= 5 && r.intervalSec <= 20, `interval ${r.intervalSec}`);
    const src = pool.find((p) => p.id === r.id).params;
    assert.ok(Math.abs(r.params.gainDb - src.gainDb) <= 3, 'gain jitter');
    assert.ok(r.params.gainDb <= -6 && r.params.gainDb >= -70);
    assert.ok(r.params.freq >= 20 && r.params.freq <= 22000);
    assert.ok(r.params.durationMs >= 5 && r.params.durationMs <= 5000);
    assert.ok(r.params.intervalSec > 0, 'stays a pulse, not continuous');
  }
});

test('the output actually varies (not a fixed pattern)', () => {
  const rng = seeded(3);
  const intervals = new Set();
  const gains = new Set();
  let last = null;
  for (let i = 0; i < 200; i++) { const r = Shuffle.next(pool, last, opts, rng); intervals.add(r.intervalSec); gains.add(r.params.gainDb); last = r.id; }
  assert.ok(intervals.size > 10);
  assert.ok(gains.size > 5);
});

test('zero jitter keeps the preset level; swapped min/max still works', () => {
  const r = Shuffle.next(pool, null, { minSec: 20, maxSec: 5, jitterDb: 0 }, seeded(9));
  assert.strictEqual(r.params.gainDb, pool.find((p) => p.id === r.id).params.gainDb);
  assert.ok(r.intervalSec >= 5 && r.intervalSec <= 20);
});
