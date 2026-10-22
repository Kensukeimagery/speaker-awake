(function () {
  'use strict';
  const { MODES, LIMITS, WAVES, modeById, SHUFFLE_DEFAULTS, SHUFFLE_LIMITS } = window.Presets;
  const $ = (id) => document.getElementById(id);

  const DEFAULTS = {
    lang: (navigator.language || 'en').toLowerCase().startsWith('th') ? 'th' : 'en',
    mode: 'ultrasonic',
    params: {}, // per-mode overrides: { [modeId]: {...} }
    running: true,
    deviceId: 'default',
    autoStart: false,
    startMode: 'tray', // how to start with Windows: 'tray' (hidden) or 'window'
    schedule: { enabled: false, from: '22:00', to: '07:00' },
    smart: { enabled: false, thresholdDb: -55, resumeSec: 15 },
    shuffle: JSON.parse(JSON.stringify(SHUFFLE_DEFAULTS)),
  };

  let S = JSON.parse(JSON.stringify(DEFAULTS));
  let info = { version: '', packaged: false };
  let state = {};
  let saveTimer = null;
  let uiVisible = false; // is anyone looking? Drawing is skipped while the window is hidden in the tray
  let uiTimer = null;
  let lastReported = '';

  const t = () => window.I18N[S.lang];
  const modeText = (id) => window.I18N.modes[S.lang][id];

  // ---------- settings ----------
  function currentParams() {
    return Object.assign({}, modeById(S.mode).params, S.params[S.mode] || {});
  }
  function paramsFor(id) {
    return Object.assign({}, modeById(id).params, S.params[id] || {});
  }
  // The modes shuffle can rotate through: pulse modes only (continuous has no pulses).
  const shufflable = () => MODES.filter((m) => !m.shuffle && m.params.intervalSec > 0);
  function config() {
    const cfg = { params: currentParams(), deviceId: S.deviceId, schedule: S.schedule, smart: S.smart };
    if (S.mode === 'shuffle') {
      cfg.params = Object.assign({}, cfg.params, { intervalSec: S.shuffle.minSec });
      cfg.shuffle = {
        pool: S.shuffle.pool.map((id) => ({ id, params: paramsFor(id) })),
        minSec: S.shuffle.minSec, maxSec: S.shuffle.maxSec, jitterDb: S.shuffle.jitterDb,
      };
    }
    return cfg;
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => window.bridge.saveSettings(S), 200);
  }
  function sanitize(raw) {
    const out = JSON.parse(JSON.stringify(DEFAULTS));
    if (!raw || typeof raw !== 'object') return out;
    if (raw.lang === 'th' || raw.lang === 'en') out.lang = raw.lang;
    if (MODES.some((m) => m.id === raw.mode)) out.mode = raw.mode;
    if (typeof raw.running === 'boolean') out.running = raw.running;
    if (typeof raw.deviceId === 'string') out.deviceId = raw.deviceId;
    if (typeof raw.autoStart === 'boolean') out.autoStart = raw.autoStart;
    if (raw.startMode === 'tray' || raw.startMode === 'window') out.startMode = raw.startMode;
    if (raw.schedule && typeof raw.schedule === 'object') {
      out.schedule.enabled = !!raw.schedule.enabled;
      if (/^\d{2}:\d{2}$/.test(raw.schedule.from)) out.schedule.from = raw.schedule.from;
      if (/^\d{2}:\d{2}$/.test(raw.schedule.to)) out.schedule.to = raw.schedule.to;
    }
    if (raw.smart && typeof raw.smart === 'object') {
      out.smart.enabled = !!raw.smart.enabled;
      if (Number.isFinite(raw.smart.thresholdDb)) out.smart.thresholdDb = Math.min(-20, Math.max(-80, raw.smart.thresholdDb));
      if (Number.isFinite(raw.smart.resumeSec)) out.smart.resumeSec = Math.min(120, Math.max(3, raw.smart.resumeSec));
    }
    if (raw.shuffle && typeof raw.shuffle === 'object') {
      const ok = shufflable().map((m) => m.id);
      if (Array.isArray(raw.shuffle.pool)) {
        const pool = raw.shuffle.pool.filter((id, i, a) => ok.includes(id) && a.indexOf(id) === i);
        if (pool.length) out.shuffle.pool = pool;
      }
      for (const k of ['minSec', 'maxSec', 'jitterDb']) {
        const v = raw.shuffle[k], lim = SHUFFLE_LIMITS[k];
        if (Number.isFinite(v)) out.shuffle[k] = Math.min(lim.max, Math.max(lim.min, Math.round(v)));
      }
      if (out.shuffle.minSec > out.shuffle.maxSec) out.shuffle.maxSec = out.shuffle.minSec;
    }
    if (raw.params && typeof raw.params === 'object') {
      for (const m of MODES) {
        const p = raw.params[m.id];
        if (!p || typeof p !== 'object') continue;
        const clean = {};
        for (const k of Object.keys(LIMITS)) {
          if (typeof p[k] === 'number' && Number.isFinite(p[k])) {
            clean[k] = Math.min(LIMITS[k].max, Math.max(LIMITS[k].min, p[k]));
          }
        }
        if (WAVES.includes(p.wave)) clean.wave = p.wave;
        out.params[m.id] = clean;
      }
    }
    return out;
  }

  // ---------- helpers ----------
  const freqFromSlider = (v) => {
    const a = Math.log(LIMITS.freq.min), b = Math.log(LIMITS.freq.max);
    return Math.round(Math.exp(a + ((b - a) * v) / 1000));
  };
  const sliderFromFreq = (f) => {
    const a = Math.log(LIMITS.freq.min), b = Math.log(LIMITS.freq.max);
    return Math.round(((Math.log(f) - a) / (b - a)) * 1000);
  };
  const fmtFreq = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f % 1000 ? 1 : 0)} kHz` : `${f} Hz`);

  function setParam(patch) {
    S.params[S.mode] = Object.assign({}, S.params[S.mode] || {}, patch);
    save();
    renderTune();
    engine.update(config());
  }

  // ---------- rendering ----------
  function renderStatic() {
    const x = t();
    document.documentElement.lang = S.lang;
    $('brandName').textContent = x.appName;
    $('langBtn').textContent = x.langSwitch;
    $('modeTitle').textContent = x.modeTitle;
    $('tuneTitle').textContent = x.tuneTitle;
    $('tuneHint').textContent = x.tuneHint;
    $('lblPool').textContent = x.lblPool;
    $('lblShMin').textContent = x.lblShMin;
    $('lblShMax').textContent = x.lblShMax;
    $('lblShJit').textContent = x.lblShJit;
    $('shuffleHint').textContent = x.shuffleHint;
    $('lblWave').textContent = x.wave;
    $('lblFreq').textContent = x.freq;
    $('lblLevel').textContent = x.level;
    $('lblLen').textContent = x.length;
    $('lblEvery').textContent = x.interval;
    $('lblFade').textContent = x.fade;
    $('testPulse').textContent = x.testPulse;
    $('testAudible').textContent = x.testAudible;
    $('resetMode').textContent = x.resetMode;
    $('outputTitle').textContent = x.outputTitle;
    $('deviceHint').textContent = x.deviceHint;
    $('optionsTitle').textContent = x.optionsTitle;
    $('autoStartLbl').textContent = x.autoStart;
    $('autoStartSub').textContent = info.packaged ? x.autoStartSub : x.autoStartDev;
    $('schedLbl').textContent = x.schedule;
    $('schedSub').textContent = x.scheduleSub;
    $('startTray').textContent = x.startTray;
    $('startWindow').textContent = x.startWindow;
    renderStartMode();
    $('smartLbl').textContent = x.smart;
    $('lblThr').textContent = x.thr;
    $('lblResume').textContent = x.resume;
    $('meterLbl').textContent = x.meterLbl;
    $('smartNote').textContent = x.smartNote;
    renderSmart();
    $('lblFrom').textContent = x.from;
    $('lblTo').textContent = x.to;
    $('tipsTitle').textContent = x.tipsTitle;
    $('tipsList').replaceChildren(...x.tips.map((s) => Object.assign(document.createElement('li'), { textContent: s })));
    $('quitBtn').textContent = x.quit;
    $('quitTip').textContent = x.quitTip;
    $('ver').textContent = info.version ? `v${info.version}` : '';

    const wave = $('wave');
    wave.replaceChildren(...WAVES.map((w) => Object.assign(document.createElement('option'), { value: w, textContent: x.waves[w] })));
    renderModes();
    renderTune();
    if (uiVisible) renderDevices();
    renderStatus();
  }

  function renderModes() {
    const box = $('modes');
    box.replaceChildren(...MODES.map((m) => {
      const [name, desc] = modeText(m.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = m.shuffle ? 'mode wide' : 'mode';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(m.id === S.mode));
      b.dataset.id = m.id;
      const ico = Object.assign(document.createElement('span'), { className: 'ico', textContent: m.icon });
      ico.setAttribute('aria-hidden', 'true');
      b.append(ico, Object.assign(document.createElement('b'), { textContent: name }),
        Object.assign(document.createElement('span'), { className: 'desc', textContent: desc }));
      if (m.recommended) b.append(Object.assign(document.createElement('span'), { className: 'badge', textContent: m.shuffle ? t().newBadge : t().recommended }));
      return b;
    }));
  }

  function renderShuffle() {
    const x = t();
    const sh = S.shuffle;
    $('poolBox').replaceChildren(...shufflable().map((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.id = m.id;
      b.textContent = modeText(m.id)[0];
      b.setAttribute('aria-pressed', String(sh.pool.includes(m.id)));
      return b;
    }));
    $('shMin').value = sh.minSec;
    $('outShMin').textContent = `${sh.minSec} s`;
    $('shMax').value = sh.maxSec;
    $('outShMax').textContent = `${sh.maxSec} s`;
    $('shJit').value = sh.jitterDb;
    $('outShJit').textContent = sh.jitterDb ? `±${sh.jitterDb} ${x.dB}` : `0 ${x.dB}`;
  }

  function renderTune() {
    const p = currentParams();
    const x = t();
    const isShuffle = S.mode === 'shuffle';
    $('plainFields').hidden = isShuffle;
    $('shufflePanel').hidden = !isShuffle;
    if (isShuffle) renderShuffle();
    $('wave').value = p.wave;
    const noFreq = p.wave === 'white' || p.wave === 'pink';
    $('rowFreq').hidden = noFreq;
    $('freq').value = sliderFromFreq(p.freq);
    $('outFreq').textContent = fmtFreq(p.freq);
    $('freqNote').textContent = p.freq >= 17000 ? x.inaudible : p.freq <= 40 ? x.infrasound : x.audibleRange;
    $('gain').value = p.gainDb;
    $('outGain').textContent = `${p.gainDb} ${x.dB}`;
    const continuous = !(p.intervalSec > 0);
    $('rowLen').hidden = continuous || p.wave === 'click';
    $('rowFade').hidden = continuous || p.wave === 'click';
    $('len').value = p.durationMs;
    $('outLen').textContent = `${(p.durationMs / 1000).toFixed(2)} s`;
    $('every').value = p.intervalSec;
    $('outEvery').textContent = continuous ? x.intervalContinuous : `${p.intervalSec} s`;
    $('fade').value = p.fadeMs;
    $('outFade').textContent = `${p.fadeMs} ms`;
    renderSmart();
  }

  async function renderDevices() {
    const sel = $('device');
    let devices = [];
    try {
      devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
    } catch { /* leave only the default entry */ }
    const opts = [Object.assign(document.createElement('option'), { value: 'default', textContent: t().defaultDevice })];
    for (const d of devices) {
      if (d.deviceId === 'default' || d.deviceId === 'communications') continue;
      opts.push(Object.assign(document.createElement('option'), { value: d.deviceId, textContent: d.label || d.deviceId }));
    }
    sel.replaceChildren(...opts);
    const exists = opts.some((o) => o.value === S.deviceId);
    sel.value = exists ? S.deviceId : 'default';
    // Don't rewrite the saved id: the device may simply be unplugged right now.
  }

  function renderStartMode() {
    $('startModeBox').hidden = !(S.autoStart && info.packaged);
    for (const b of $('startMode').children) b.setAttribute('aria-checked', String(b.dataset.mode === S.startMode));
  }

  function renderSmart() {
    const x = t();
    const continuous = !(currentParams().intervalSec > 0);
    $('smartOn').disabled = continuous;
    $('smartSub').textContent = continuous ? x.smartSubContinuous : x.smartSub;
    $('smartBox').hidden = !(S.smart.enabled && !continuous);
    $('smartThr').value = S.smart.thresholdDb;
    $('outThr').textContent = `${S.smart.thresholdDb} ${x.dB}`;
    $('smartResume').value = S.smart.resumeSec;
    $('outResume').textContent = `${S.smart.resumeSec} s`;
    $('meterMark').style.left = `${Math.min(100, Math.max(0, ((S.smart.thresholdDb + 80) / 80) * 100))}%`;
  }

  function renderMeter() {
    const lvl = state.level;
    const pct = Number.isFinite(lvl) ? Math.min(100, Math.max(0, ((lvl + 80) / 80) * 100)) : 0;
    $('meterFill').style.width = `${pct}%`;
    $('meterOut').textContent = Number.isFinite(lvl) && lvl > -80 ? `${lvl.toFixed(0)} ${t().dB}` : t().meterSilent;
    $('meterFill').parentElement.classList.toggle('hot', !!state.paused);
  }

  function renderStatus() {
    const x = t();
    const on = !!state.running;
    const btn = $('power');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? x.tapToStop : x.tapToStart);
    $('statusTitle').textContent = !on ? x.statusOff : state.active === false ? x.statusOutside : state.paused ? x.statusPaused : x.statusOn;
    let sub = x.tapToStart;
    if (on) {
      if (!state.active) sub = x.statusOutside;
      else if (state.paused) sub = x.pausedSub;
      else if (state.continuous) sub = x.continuousOn;
      else if (state.nextAt) {
        const s = Math.max(0, Math.ceil((state.nextAt - Date.now()) / 1000));
        sub = s === 0 ? x.playingNow : x.nextIn(s);
      }
      if (state.pulses && !state.continuous) sub += ` · ${x.pulsesSent(state.pulses)}`;
      if (S.mode === 'shuffle' && state.lastKind && state.pulses) sub += ` · ${x.lastPulse}: ${modeText(state.lastKind)[0]}`;
    }
    $('statusSub').textContent = sub;
    const warn = $('warn');
    let msg = '';
    if (on && state.ctxState === 'suspended') msg = x.ctxSuspended;
    else if (on && state.error === 'device') msg = x.deviceMissing;
    else if (on && S.smart.enabled && state.smartError) msg = x.smartFailed;
    else if (state.sampleRate && state.sampleRate < 44100 && currentParams().freq > 16000) msg = x.nyquistWarn(state.sampleRate);
    warn.textContent = msg;
    warn.hidden = !msg;
  }

  // ---------- engine ----------
  const engine = new window.AwakeEngine.Engine((s) => {
    const prevPulses = state.pulses;
    state = s;
    // The tray only needs to hear about running/paused, and only when it changes.
    const key = String(!!s.running);
    if (key !== lastReported) { lastReported = key; window.bridge.reportState({ running: !!s.running }); }
    if (!uiVisible) return;
    renderStatus();
    renderMeter();
    if (s.pulses !== prevPulses && s.pulses > 0) {
      const btn = $('power');
      btn.classList.add('pulse');
      setTimeout(() => btn.classList.remove('pulse'), 400);
    }
  });

  // While the window is visible, refresh the countdown and meter twice a second; otherwise do nothing.
  function setUiVisible(v) {
    uiVisible = v;
    document.body.classList.toggle('ui-hidden', !v);
    clearInterval(uiTimer);
    uiTimer = null;
    if (!v) return;
    state = engine.snapshot();
    renderStatus();
    renderMeter();
    renderDevices();
    uiTimer = setInterval(() => { state = engine.snapshot(); renderStatus(); renderMeter(); }, 500);
  }

  async function setRunning(on) {
    S.running = on;
    save();
    if (on) await engine.start(config());
    else engine.stop();
  }

  // ---------- events ----------
  function bind() {
    $('power').addEventListener('click', () => setRunning(!state.running));
    window.bridge.onToggleRunning(() => setRunning(!state.running));
    window.bridge.onVisibility(setUiVisible);
    window.bridge.onResume(() => engine.tick());

    $('langBtn').addEventListener('click', () => {
      S.lang = S.lang === 'th' ? 'en' : 'th';
      window.bridge.setLang(S.lang);
      save();
      renderStatic();
    });

    $('modes').addEventListener('click', (e) => {
      const b = e.target.closest('.mode');
      if (!b) return;
      S.mode = b.dataset.id;
      save();
      renderModes();
      renderTune();
      engine.update(config());
    });
    $('modes').addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const i = MODES.findIndex((m) => m.id === S.mode);
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      S.mode = MODES[(i + d + MODES.length) % MODES.length].id;
      save();
      renderModes();
      renderTune();
      engine.update(config());
      $('modes').querySelector('[aria-checked="true"]').focus();
    });

    $('wave').addEventListener('change', (e) => setParam({ wave: e.target.value }));
    $('freq').addEventListener('input', (e) => setParam({ freq: freqFromSlider(Number(e.target.value)) }));
    $('gain').addEventListener('input', (e) => setParam({ gainDb: Number(e.target.value) }));
    $('len').addEventListener('input', (e) => setParam({ durationMs: Number(e.target.value) }));
    $('every').addEventListener('input', (e) => setParam({ intervalSec: Number(e.target.value) }));
    $('fade').addEventListener('input', (e) => setParam({ fadeMs: Number(e.target.value) }));

    $('poolBox').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      const id = b.dataset.id;
      const pool = S.shuffle.pool;
      if (pool.includes(id)) {
        if (pool.length === 1) return; // keep at least one sound
        S.shuffle.pool = pool.filter((x) => x !== id);
      } else {
        S.shuffle.pool = shufflable().map((m) => m.id).filter((x) => pool.includes(x) || x === id);
      }
      save(); renderShuffle(); engine.update(config());
    });
    const shSlider = (id, key) => $(id).addEventListener('input', (e) => {
      S.shuffle[key] = Number(e.target.value);
      if (S.shuffle.minSec > S.shuffle.maxSec) {
        if (key === 'minSec') S.shuffle.maxSec = S.shuffle.minSec; else S.shuffle.minSec = S.shuffle.maxSec;
      }
      save(); renderShuffle(); engine.update(config());
    });
    shSlider('shMin', 'minSec'); shSlider('shMax', 'maxSec'); shSlider('shJit', 'jitterDb');

    $('testPulse').addEventListener('click', () => engine.testPulse(config()));
    $('testAudible').addEventListener('click', () => engine.testAudible(config()));
    $('resetMode').addEventListener('click', () => {
      delete S.params[S.mode];
      if (S.mode === 'shuffle') S.shuffle = JSON.parse(JSON.stringify(SHUFFLE_DEFAULTS));
      save();
      renderTune();
      engine.update(config());
    });

    $('device').addEventListener('change', (e) => {
      S.deviceId = e.target.value;
      save();
      engine.update(config());
    });
    navigator.mediaDevices.addEventListener('devicechange', () => { if (uiVisible) renderDevices(); });

    $('autoStart').addEventListener('change', (e) => { S.autoStart = e.target.checked; save(); renderStartMode(); });
    $('startMode').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      S.startMode = b.dataset.mode;
      save();
      renderStartMode();
    });
    $('smartOn').addEventListener('change', (e) => {
      S.smart.enabled = e.target.checked;
      save(); renderSmart(); engine.update(config());
    });
    $('smartThr').addEventListener('input', (e) => {
      S.smart.thresholdDb = Number(e.target.value); save(); renderSmart(); engine.update(config());
    });
    $('smartResume').addEventListener('input', (e) => {
      S.smart.resumeSec = Number(e.target.value); save(); renderSmart(); engine.update(config());
    });
    $('schedOn').addEventListener('change', (e) => {
      S.schedule.enabled = e.target.checked;
      $('schedRow').hidden = !S.schedule.enabled;
      save();
      engine.update(config());
    });
    $('schedFrom').addEventListener('change', (e) => {
      if (e.target.value) { S.schedule.from = e.target.value; save(); engine.update(config()); }
    });
    $('schedTo').addEventListener('change', (e) => {
      if (e.target.value) { S.schedule.to = e.target.value; save(); engine.update(config()); }
    });

    $('ghLink').addEventListener('click', () => window.bridge.openExternal('https://github.com/Kensukeimagery/speaker-awake'));
    $('quitBtn').addEventListener('click', () => window.bridge.quit());

  }

  async function init() {
    const [saved, appInfo] = await Promise.all([window.bridge.loadSettings(), window.bridge.appInfo()]);
    info = appInfo;
    S = sanitize(saved);
    window.bridge.setLang(S.lang);
    $('autoStart').checked = S.autoStart;
    $('autoStart').disabled = !info.packaged;
    $('smartOn').checked = S.smart.enabled;
    $('schedOn').checked = S.schedule.enabled;
    $('schedRow').hidden = !S.schedule.enabled;
    $('schedFrom').value = S.schedule.from;
    $('schedTo').value = S.schedule.to;
    bind();
    renderStatic();
    setUiVisible(await window.bridge.isVisible());
    window.bridge.saveSettings(S); // registers auto-start on first run
    if (S.running) await engine.start(config());
    else { engine.stop(); }
  }

  init();
})();
