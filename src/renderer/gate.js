// Decides "is something else playing?" from a stream of level readings. Pure logic, unit-tested.
(function (root) {
  'use strict';

  class SoundGate {
    /**
     * thresholdDb: level (dBFS, RMS) above which audio counts as "playing".
     * resumeSec:   how long it must stay quiet before we call it idle again.
     */
    constructor(opts) {
      this.thresholdDb = opts.thresholdDb;
      this.resumeMs = opts.resumeSec * 1000;
      this.lastSoundAt = -Infinity;
      this.level = -Infinity;
    }

    configure(opts) {
      this.thresholdDb = opts.thresholdDb;
      this.resumeMs = opts.resumeSec * 1000;
    }

    // `masked` = our own pulse is playing right now, so the reading says nothing about others.
    feed(levelDb, now, masked) {
      if (masked) return;
      this.level = levelDb;
      if (levelDb >= this.thresholdDb) this.lastSoundAt = now;
    }

    busy(now) {
      return now - this.lastSoundAt < this.resumeMs;
    }

    reset() {
      this.lastSoundAt = -Infinity;
      this.level = -Infinity;
    }
  }

  function rmsDb(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / Math.max(1, samples.length));
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  }

  const api = { SoundGate, rmsDb };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gate = api;
})(typeof window !== 'undefined' ? window : globalThis);
