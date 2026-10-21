// Mode presets. `params` feed Synth.render(); intervalSec 0 = continuous signal.
(function (root) {
  'use strict';

  const MODES = [
    {
      id: 'ultrasonic',
      icon: '〰',
      recommended: true,
      params: { wave: 'sine', freq: 20000, gainDb: -32, durationMs: 600, intervalSec: 15, fadeMs: 80 },
    },
    {
      id: 'subsonic',
      icon: '≋',
      recommended: true,
      params: { wave: 'sine', freq: 30, gainDb: -30, durationMs: 1500, intervalSec: 15, fadeMs: 300 },
    },
    {
      id: 'whisper',
      icon: '∿',
      recommended: false,
      params: { wave: 'pink', freq: 1000, gainDb: -52, durationMs: 400, intervalSec: 12, fadeMs: 100 },
    },
    {
      id: 'tick',
      icon: '•',
      recommended: false,
      params: { wave: 'click', freq: 1000, gainDb: -34, durationMs: 12, intervalSec: 10, fadeMs: 0 },
    },
    {
      id: 'continuous',
      icon: '━',
      recommended: false,
      params: { wave: 'sine', freq: 20000, gainDb: -40, durationMs: 1000, intervalSec: 0, fadeMs: 0 },
    },
    {
      id: 'custom',
      icon: '⚙',
      recommended: false,
      params: { wave: 'sine', freq: 18000, gainDb: -36, durationMs: 500, intervalSec: 20, fadeMs: 60 },
    },
  ];

  const LIMITS = {
    freq: { min: 20, max: 22000 },
    gainDb: { min: -70, max: -6 },
    durationMs: { min: 5, max: 5000 },
    intervalSec: { min: 0, max: 600 },
    fadeMs: { min: 0, max: 1000 },
  };

  const WAVES = ['sine', 'triangle', 'white', 'pink', 'click'];

  function modeById(id) {
    return MODES.find((m) => m.id === id) || MODES[0];
  }

  const api = { MODES, LIMITS, WAVES, modeById };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Presets = api;
})(typeof window !== 'undefined' ? window : globalThis);
