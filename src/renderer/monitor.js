// Listens to what Windows is playing (loopback) and feeds levels into a SoundGate.
(function (root) {
  'use strict';

  class SystemAudioMonitor {
    constructor(onLevel) {
      this.onLevel = onLevel || (() => {});
      this.gate = new root.Gate.SoundGate({ thresholdDb: -55, resumeSec: 15 });
      this.stream = null;
      this.ctx = null;
      this.analyser = null;
      this.buf = null;
      this.timer = null;
      this.isMasked = () => false;
      this.onBusyChange = () => {};
      this.lastBusy = false;
      this.error = '';
    }

    get listening() { return !!this.timer; }

    configure(opts) { this.gate.configure(opts); }

    async start() {
      if (this.listening) return true;
      try {
        // Needs the loopback handler in main.js. Video is required by the API; drop it at once.
        this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        this.stream.getVideoTracks().forEach((t) => t.stop());
        if (!this.stream.getAudioTracks().length) throw new Error('no audio track');
        this.ctx = new AudioContext({ latencyHint: 'playback' });
        const src = this.ctx.createMediaStreamSource(new MediaStream(this.stream.getAudioTracks()));
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 16384; // ~340 ms of audio: longer than the 250 ms sample period, so nothing slips between samples
        const mute = this.ctx.createGain(); // keeps the graph pulled without making a sound
        mute.gain.value = 0;
        src.connect(this.analyser);
        this.analyser.connect(mute);
        mute.connect(this.ctx.destination);
        this.buf = new Float32Array(this.analyser.fftSize);
        this.error = '';
        this.timer = setInterval(() => this.sample(), 250);
        return true;
      } catch (e) {
        this.error = String((e && e.message) || e);
        this.stop();
        return false;
      }
    }

    sample() {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      const now = Date.now();
      const db = root.Gate.rmsDb(this.buf);
      this.gate.feed(db, now, this.isMasked(now));
      this.onLevel(this.gate.level);
      const busy = this.gate.busy(now);
      if (busy !== this.lastBusy) { this.lastBusy = busy; this.onBusyChange(busy); }
    }

    busy(now) { return this.gate.busy(now); }

    stop() {
      clearInterval(this.timer);
      this.timer = null;
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      if (this.ctx) this.ctx.close().catch(() => {});
      this.ctx = null;
      this.analyser = null;
      this.lastBusy = false;
      this.gate.reset();
    }
  }

  root.SystemAudioMonitor = SystemAudioMonitor;
})(typeof window !== 'undefined' ? window : globalThis);
