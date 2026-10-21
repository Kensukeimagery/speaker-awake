// Shuffle mode: pick the next pulse from a pool of modes, with small random variations,
// so a speaker never sees the same fixed pattern. Pure logic, unit-tested.
(function (root) {
  'use strict';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round = (v, step) => Math.round(v / step) * step;

  /**
   * pool: [{ id, params }]   (params as for Synth.render, intervalSec > 0)
   * opts: { minSec, maxSec, jitterDb }
   * Returns { id, params, intervalSec } or null when the pool is empty.
   * Values are rounded to coarse steps so the audio-buffer cache keeps hitting.
   */
  function next(pool, lastId, opts, rng) {
    rng = rng || Math.random;
    const usable = pool.filter((p) => p && p.params && p.params.intervalSec > 0);
    if (!usable.length) return null;
    const others = usable.filter((p) => p.id !== lastId);
    const from = others.length ? others : usable; // never repeat unless it is the only choice
    const choice = from[Math.floor(rng() * from.length) % from.length];
    const src = choice.params;

    const params = Object.assign({}, src);
    const j = Math.max(0, opts.jitterDb || 0);
    params.gainDb = clamp(src.gainDb + Math.round((rng() * 2 - 1) * j), -70, -6);
    if (src.wave === 'sine' || src.wave === 'triangle') {
      params.freq = clamp(round(src.freq * (1 + (rng() * 2 - 1) * 0.04), 50), 20, 22000);
    }
    if (src.wave !== 'click') {
      params.durationMs = clamp(round(src.durationMs * (0.75 + rng() * 0.5), 50), 50, 5000);
    }

    const lo = Math.max(1, Math.min(opts.minSec, opts.maxSec));
    const hi = Math.max(lo, opts.maxSec);
    const intervalSec = round(lo + rng() * (hi - lo), 0.5);
    return { id: choice.id, params, intervalSec: clamp(intervalSec, lo, hi) };
  }

  const api = { next };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shuffle = api;
})(typeof window !== 'undefined' ? window : globalThis);
