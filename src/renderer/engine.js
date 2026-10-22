// Web Audio playback + scheduling. Lives in the renderer; keeps running while the window is hidden.
//
// Scheduling is event-driven: one timer is armed for the next thing that can change (the next
// pulse, a schedule boundary, or a slow watchdog), so a hidden app wakes up a handful of times
// per minute instead of several times per second.
(function (root) {
  'use strict';

  const WATCHDOG_MS = 15000; // re-check audio state at least this often

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

  // Milliseconds until the next whole minute (the schedule can only change then).
  function msToNextMinute(date) {
    return 60000 - (date.getSeconds() * 1000 + date.getMilliseconds()) + 50;
  }

  class Engine {
    constructor(onUpdate) {
      this.onUpdate = onUpdate || (() => {});
      this.ctx = null;
      this.cfg = null;
      this.running = false;
      this.nextAt = 0;
      this.lastAt = 0;
      this.lastKind = null;
      this.pulses = 0;
      this.loopSource = null;
      this.loopKey = '';
      this.cache = new Map();
      this.timer = null;
      this.ticking = false;
      this.again = false;
      this.active = false;
      this.paused = false;      // auto-paused because something else is playing
      this.ownUntil = 0;        // our own audio is audible in loopback until this time
      this.released = false;    // we suspended the context on purpose (nothing to play)
      this.error = '';
      this.level = -Infinity;
      this.smartError = '';
      this.lastStartTry = 0;
      this.monitor = new root.SystemAudioMonitor((level) => { this.level = level; });
      this.monitor.isMasked = (now) => now < this.ownUntil;
      this.monitor.onBusyChange = () => this.tick();
      navigator.mediaDevices.addEventListener('devicechange', () => this.applySink());
    }

    get sampleRate() { return this.ctx ? this.ctx.sampleRate : 48000; }

    async ensureContext() {
      if (!this.ctx) {
        this.ctx = new AudioContext({ latencyHint: 'playback' });
        this.ctx.onstatechange = () => {
          // Windows can suspend/interrupt audio (device change, sleep/resume). Recover quickly,
          // unless we suspended it ourselves because there was nothing to play.
          if (this.running && !this.released && this.ctx && this.ctx.state !== 'running') this.tick();
          else this.emit();
        };
        await this.applySink();
      }
      if (this.ctx.state === 'closed') { this.ctx = null; return this.ensureContext(); }
      if (this.ctx.state !== 'running') {
        try { await this.ctx.resume(); } catch { /* the watchdog retries */ }
      }
      this.released = false;
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
      src.onended = () => src.disconnect();
      src.start();
      this.ownUntil = Date.now() + buf.duration * 1000 + 350; // pulse plus loopback latency
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

    snapshot() {
      return {
        running: this.running,
        active: this.active,
        paused: this.paused,
        lastKind: this.lastKind,
        level: this.level,
        smartError: this.smartError,
        nextAt: this.nextAt,
        lastAt: this.lastAt,
        pulses: this.pulses,
        continuous: !!(this.cfg && !(this.cfg.params.intervalSec > 0)),
        sampleRate: this.sampleRate,
        ctxState: this.released ? 'running' : (this.ctx ? this.ctx.state : 'none'),
        error: this.error,
      };
    }

    emit() {
      this.onUpdate(this.snapshot());
    }

    // Shuffle mode picks a different pulse (and wait) each time; other modes repeat their own.
    nextPulse(p) {
      const sh = this.cfg && this.cfg.shuffle;
      const r = sh && root.Shuffle.next(sh.pool, this.lastKind, sh);
      return r || { id: null, params: p, intervalSec: p.intervalSec };
    }

    // Re-evaluate everything now. Calls arriving while a step is running are folded into one rerun,
    // so overlapping triggers (slider drags, state changes) can never fire a pulse twice.
    async tick() {
      if (!this.running || !this.cfg) return;
      if (this.ticking) { this.again = true; return; }
      this.ticking = true;
      try {
        do {
          this.again = false;
          try { await this.step(); } catch (e) { this.error = String((e && e.message) || e); }
        } while (this.again && this.running);
      } finally {
        this.ticking = false;
      }
      this.emit();
      this.arm();
    }

    async step() {
      const now = Date.now();
      const cfg = this.cfg;
      const p = cfg.params;
      const active = inWindow(cfg.schedule, new Date(now));
      const continuous = !(p.intervalSec > 0);

      // Smart pause: stand down while other audio is playing. Not possible in continuous
      // mode, where our own signal is always in the mix and can't be told apart from theirs.
      const smart = cfg.smart;
      const smartOn = !!(smart && smart.enabled && !continuous && active);
      if (smartOn) {
        this.monitor.configure({ thresholdDb: smart.thresholdDb, resumeSec: smart.resumeSec });
        if (!this.monitor.listening && now - this.lastStartTry > 15000) {
          this.lastStartTry = now;
          this.monitor.start().then((ok) => { this.smartError = ok ? '' : this.monitor.error || 'failed'; });
        }
      } else if (this.monitor.listening) {
        this.monitor.stop();
        this.level = -Infinity;
      }
      const paused = smartOn && this.monitor.listening && this.monitor.busy(now);
      if (paused !== this.paused) this.nextAt = 0; // on resume, fire a pulse right away
      this.paused = paused;

      if (!active || paused) {
        this.stopLoop();
        this.active = active;
        if (!active) this.nextAt = 0;
        this.releaseDevice(); // nothing to play: do not hold the audio device open
      } else if (continuous) {
        await this.ensureContext();
        this.startLoop(p);
        this.active = true;
        this.nextAt = 0;
      } else {
        this.stopLoop();
        // A clock set backwards (time sync, manual change) must not leave the next pulse hours away.
        const longest = (cfg.shuffle ? cfg.shuffle.maxSec : p.intervalSec) * 1000 + 2000;
        if (this.nextAt - now > longest) this.nextAt = now;
        if (!this.active || this.nextAt === 0) this.nextAt = now; // fire at once when (re)activated
        this.active = true;
        await this.ensureContext();
        if (now >= this.nextAt) {
          const pick = this.nextPulse(p);
          this.playOnce(pick.params);
          this.pulses++;
          this.lastAt = now;
          this.lastKind = pick.id;
          this.nextAt = now + pick.intervalSec * 1000;
        }
      }
    }

    // Let go of the audio device while there is nothing to play (paused, outside the schedule).
    // Not done between pulses: measured, re-opening the device for every pulse costs more CPU than
    // keeping an idle stream open, and risks the speaker missing the start of a pulse.
    releaseDevice(force) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      if (!force && Date.now() < this.ownUntil) return; // let a pulse in progress finish
      this.released = true;
      this.ctx.suspend().catch(() => { this.released = false; });
    }

    // Arm one timer for the earliest thing that can change.
    arm() {
      clearTimeout(this.timer);
      this.timer = null;
      if (!this.running || !this.cfg) return;
      const now = Date.now();
      const cfg = this.cfg;
      let wait = WATCHDOG_MS;
      if (this.active && !this.paused && this.nextAt) wait = Math.min(wait, this.nextAt - now);
      else if (this.ctx && this.ctx.state === 'running' && this.ownUntil > now) wait = Math.min(wait, this.ownUntil - now + 50); // then release the device
      if (cfg.schedule && cfg.schedule.enabled) wait = Math.min(wait, msToNextMinute(new Date(now)));
      this.timer = setTimeout(() => this.tick(), Math.max(50, wait));
    }

    async start(cfg) {
      this.cfg = cfg;
      this.running = true;
      this.active = false;
      this.paused = false;
      this.nextAt = 0;
      await this.ensureContext();
      await this.applySink();
      await this.tick();
    }

    stop() {
      this.running = false;
      this.active = false;
      this.paused = false;
      this.monitor.stop();
      this.level = -Infinity;
      this.nextAt = 0;
      clearTimeout(this.timer);
      this.timer = null;
      this.stopLoop();
      // Fully release the device when paused: nothing needs the stream.
      this.releaseDevice(true);
      this.emit();
    }

    async update(cfg) {
      const sinkChanged = !this.cfg || this.cfg.deviceId !== cfg.deviceId;
      const paramsChanged = !this.cfg
        || JSON.stringify([this.cfg.params, this.cfg.shuffle]) !== JSON.stringify([cfg.params, cfg.shuffle]);
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
      const dur = this.playOnce(this.nextPulse(cfg.params).params);
      if (!this.running) this.releaseLater(dur);
      return dur;
    }

    // Same envelope but at an audible 1 kHz, to confirm the right device is producing sound.
    async testAudible(cfg) {
      await this.ensureContext();
      const p = Object.assign({}, cfg.params, { wave: 'sine', freq: 1000, gainDb: -24,
        durationMs: 500, intervalSec: 5, fadeMs: 80 });
      const dur = this.playOnce(p);
      if (!this.running) this.releaseLater(dur);
      return dur;
    }

    // While paused, a test beep should not leave the audio device open afterwards.
    releaseLater(durSec) {
      setTimeout(() => {
        if (!this.running) this.releaseDevice();
      }, durSec * 1000 + 300);
    }
  }

  const api = { Engine, inWindow, msToNextMinute };
  if (typeof module !== 'undefined' && module.exports) module.exports = { inWindow, msToNextMinute };
  root.AwakeEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
