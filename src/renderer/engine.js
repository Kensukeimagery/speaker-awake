// Web Audio playback + scheduling. Lives in the renderer; keeps running while the window is hidden.
(function (root) {
  'use strict';

  function toMinutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }

  // Overnight windows (22:00 -> 07:00) are supported.
  function inWindow(schedule, date) {
    if (!schedule || !schedule.enabled) return true;
    const now = date.getHours() * 60 + date.getMinutes();
    const from = toMinutes(schedule.from);
    const to = toMinutes(schedule.to);
    if (from === to) return true;
    return from < to ? now >= from && now < to : now >= from || now < to;
  }

  class Engine {
    constructor(onUpdate) {
      this.onUpdate = onUpdate || (() => {});
      this.ctx = null;
      this.cfg = null;
      this.running = false;
      this.nextAt = 0;
      this.lastAt = 0;
      this.pulses = 0;
      this.loopSource = null;
      this.loopKey = '';
      this.cache = new Map();
      this.timer = null;
      this.active = false;
      this.error = '';
      navigator.mediaDevices.addEventListener('devicechange', () => this.applySink());
    }

    get sampleRate() { return this.ctx ? this.ctx.sampleRate : 48000; }

    async ensureContext() {
      if (!this.ctx) {
        this.ctx = new AudioContext({ latencyHint: 'playback' });
        this.ctx.onstatechange = () => this.emit();
        await this.applySink();
      }
      if (this.ctx.state !== 'running') {
        try { await this.ctx.resume(); } catch { /* retried on next tick */ }
      }
      return this.ctx;
    }

    async applySink() {
      if (!this.ctx || !this.ctx.setSinkId) return;
      const wanted = (this.cfg && this.cfg.deviceId) || 'default';
      try {
        await this.ctx.setSinkId(wanted === 'default' ? '' : wanted);
        this.error = '';
      } catch {
        try { await this.ctx.setSinkId(''); } catch { /* keep going on default */ }
        this.error = 'device';
      }
      this.emit();
    }

    bufferFor(params) {
      const sr = this.ctx.sampleRate;
      const key = JSON.stringify([params, sr]);
      let buf = this.cache.get(key);
      if (!buf) {
        const data = root.Synth.render(params, sr);
        buf = this.ctx.createBuffer(1, data.length, sr);
        buf.copyToChannel(data, 0);
        if (this.cache.size > 24) this.cache.clear();
        this.cache.set(key, buf);
      }
      return { buf, key };
    }

    playOnce(params) {
      const { buf } = this.bufferFor(params);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start();
      return buf.duration;
    }

    stopLoop() {
      if (this.loopSource) {
        try { this.loopSource.stop(); } catch { /* already stopped */ }
        this.loopSource.disconnect();
        this.loopSource = null;
        this.loopKey = '';
      }
    }

    startLoop(params) {
      const { buf, key } = this.bufferFor(params);
      if (this.loopSource && this.loopKey === key) return;
      this.stopLoop();
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.ctx.destination);
      src.start();
      this.loopSource = src;
      this.loopKey = key;
    }

    emit() {
      this.onUpdate({
        running: this.running,
        active: this.active,
        nextAt: this.nextAt,
        lastAt: this.lastAt,
        pulses: this.pulses,
        continuous: !!(this.cfg && !(this.cfg.params.intervalSec > 0)),
        sampleRate: this.sampleRate,
        ctxState: this.ctx ? this.ctx.state : 'none',
        error: this.error,
      });
    }

    async tick() {
      if (!this.running || !this.cfg) return;
      try {
        await this.ensureContext();
        const now = Date.now();
        const active = inWindow(this.cfg.schedule, new Date(now));
        const p = this.cfg.params;
        const continuous = !(p.intervalSec > 0);

        if (!active) {
          this.stopLoop();
          this.active = false;
          this.nextAt = 0;
        } else if (continuous) {
          this.startLoop(p);
          this.active = true;
          this.nextAt = 0;
        } else {
          this.stopLoop();
          if (!this.active || this.nextAt === 0) this.nextAt = now; // fire at once when (re)activated
          this.active = true;
          if (now >= this.nextAt) {
            this.playOnce(p);
            this.pulses++;
            this.lastAt = now;
            this.nextAt = now + p.intervalSec * 1000;
          }
        }
      } catch (e) {
        this.error = String(e && e.message || e);
      }
      this.emit();
    }

    async start(cfg) {
      this.cfg = cfg;
      this.running = true;
      this.active = false;
      this.nextAt = 0;
      await this.ensureContext();
      await this.applySink();
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 250);
      await this.tick();
    }

    stop() {
      this.running = false;
      this.active = false;
      this.nextAt = 0;
      clearInterval(this.timer);
      this.stopLoop();
      this.emit();
    }

    async update(cfg) {
      const sinkChanged = !this.cfg || this.cfg.deviceId !== cfg.deviceId;
      const paramsChanged = !this.cfg || JSON.stringify(this.cfg.params) !== JSON.stringify(cfg.params);
      this.cfg = cfg;
      if (sinkChanged) await this.applySink();
      if (paramsChanged) {
        this.nextAt = 0; // apply the new interval right away
        this.stopLoop();
      }
      if (this.running) await this.tick();
      else this.emit();
    }

    // One pulse of the current mode, regardless of running state.
    async testPulse(cfg) {
      this.cfg = this.cfg || cfg;
      await this.ensureContext();
      return this.playOnce(cfg.params);
    }

    // Same envelope but at an audible 1 kHz, to confirm the right device is producing sound.
    async testAudible(cfg) {
      await this.ensureContext();
      const p = Object.assign({}, cfg.params, { wave: 'sine', freq: 1000, gainDb: -24,
        durationMs: 500, intervalSec: 5, fadeMs: 80 });
      return this.playOnce(p);
    }
  }

  const api = { Engine, inWindow };
  if (typeof module !== 'undefined' && module.exports) module.exports = { inWindow };
  root.AwakeEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
