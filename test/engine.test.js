const test = require('node:test');
const assert = require('node:assert');

// ---- minimal browser stubs so the real Engine can run in Node ----
const log = { starts: [], suspends: 0, resumes: 0 };
class FakeNode { connect() {} disconnect() {} }
class FakeSource extends FakeNode {
  start(when) { log.starts.push({ at: Date.now(), when }); }
  stop() {}
}
class FakeContext {
  constructor() { this.state = 'suspended'; this.sampleRate = 48000; this.currentTime = 0; this.destination = new FakeNode(); }
  async resume() { log.resumes++; this.state = 'running'; if (this.onstatechange) this.onstatechange(); }
  async suspend() { log.suspends++; this.state = 'suspended'; if (this.onstatechange) this.onstatechange(); }
  async setSinkId() {}
  createBuffer(_c, len, sr) { return { duration: len / sr, copyToChannel() {} }; }
  createBufferSource() { return new FakeSource(); }
}
globalThis.AudioContext = FakeContext;
Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { addEventListener() {} } }, configurable: true });
globalThis.Synth = require('../src/renderer/synth.js');
globalThis.Shuffle = require('../src/renderer/shuffle.js');
globalThis.Gate = require('../src/renderer/gate.js');
require('../src/renderer/monitor.js');
require('../src/renderer/engine.js');
const { Engine, inWindow, msToNextMinute } = globalThis.AwakeEngine;

const pulseCfg = (over = {}) => Object.assign({
  params: { wave: 'sine', freq: 20000, gainDb: -32, durationMs: 600, intervalSec: 10, fadeMs: 80 },
  deviceId: 'default', schedule: { enabled: false, from: '22:00', to: '07:00' },
  smart: { enabled: false, thresholdDb: -55, resumeSec: 15 },
}, over);

// let queued promise continuations run
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function setup() {
  log.starts = []; log.suspends = 0; log.resumes = 0;
  test.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-22T12:00:00') });
  return new Engine(() => {});
}
const advance = async (ms) => { test.mock.timers.tick(ms); await flush(); };

test('inWindow handles overnight, same-time and disabled schedules', () => {
  const at = (h, m) => new Date(2026, 9, 22, h, m);
  const night = { enabled: true, from: '22:00', to: '07:00' };
  assert.ok(inWindow(night, at(23, 0)));
  assert.ok(inWindow(night, at(6, 59)));
  assert.ok(!inWindow(night, at(7, 0)));
  assert.ok(!inWindow(night, at(12, 0)));
  assert.ok(inWindow({ enabled: true, from: '08:00', to: '08:00' }, at(3, 0)));
  assert.ok(inWindow({ enabled: false, from: '22:00', to: '07:00' }, at(12, 0)));
});

test('msToNextMinute lands just after the minute boundary', () => {
  assert.strictEqual(msToNextMinute(new Date(2026, 9, 22, 12, 0, 0, 0)), 60050);
  assert.strictEqual(msToNextMinute(new Date(2026, 9, 22, 12, 0, 59, 950)), 100);
});

test('pulses fire on schedule and the app is quiet in between (event-driven, no polling)', async (t) => {
  const e = setup(); t.after(() => { e.stop(); test.mock.timers.reset(); });
  await e.start(pulseCfg());
  assert.strictEqual(log.starts.length, 1, 'first pulse right away');
  await advance(9999); assert.strictEqual(log.starts.length, 1);
  await advance(2); assert.strictEqual(log.starts.length, 2);
  await advance(10000); assert.strictEqual(log.starts.length, 3);
  assert.strictEqual(log.suspends, 0, 'the device stays open between pulses');
});

test('overlapping updates never fire a pulse twice', async (t) => {
  const e = setup(); t.after(() => { e.stop(); test.mock.timers.reset(); });
  await e.start(pulseCfg());
  const before = log.starts.length;
  // a slider drag: many updates with changed params in the same instant
  const burst = [];
  for (let i = 0; i < 20; i++) burst.push(e.update(pulseCfg({ params: { wave: 'sine', freq: 20000, gainDb: -32 + (i % 3), durationMs: 600, intervalSec: 10, fadeMs: 80 } })));
  await Promise.all(burst); await flush();
  assert.ok(log.starts.length - before <= 2, `fired ${log.starts.length - before} times for one burst`);
});

test('outside the schedule: nothing plays and the device is released', async (t) => {
  const e = setup(); t.after(() => { e.stop(); test.mock.timers.reset(); });
  await e.start(pulseCfg({ schedule: { enabled: true, from: '22:00', to: '23:00' } })); // clock says 12:00
  assert.strictEqual(log.starts.length, 0);
  assert.strictEqual(e.snapshot().active, false);
  assert.strictEqual(log.suspends, 1);
});

test('stop() silences everything and releases the device', async (t) => {
  const e = setup(); t.after(() => { test.mock.timers.reset(); });
  await e.start(pulseCfg());
  e.stop(); await flush();
  const n = log.starts.length;
  await advance(60000);
  assert.strictEqual(log.starts.length, n, 'no pulses after stop');
  assert.ok(log.suspends >= 1);
});

test('a context interrupted by the system is resumed', async (t) => {
  const e = setup(); t.after(() => { e.stop(); test.mock.timers.reset(); });
  await e.start(pulseCfg());
  const r = log.resumes;
  e.ctx.state = 'suspended'; e.ctx.onstatechange(); await flush(); await flush();
  assert.ok(log.resumes > r, 'engine resumed the interrupted context');
});

test('a clock moved backwards does not strand the next pulse', async (t) => {
  const e = setup(); t.after(() => { e.stop(); test.mock.timers.reset(); });
  await e.start(pulseCfg());
  assert.strictEqual(log.starts.length, 1);
  e.nextAt += 3 * 3600 * 1000; // as if the clock had been set back three hours
  await e.update(pulseCfg()); await flush();
  assert.strictEqual(log.starts.length, 2, 'engine noticed and fired again');
});
