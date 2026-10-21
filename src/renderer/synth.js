// Pure signal generation: no DOM / Web Audio, so it can be unit-tested in Node.
(function (root) {
  'use strict';

  const MIN_FREQ = 20;
  const MAX_FREQ = 22000;
  const LSB16 = 1 / 32768;

  function dbToGain(db) {
    return Math.pow(10, db / 20);
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  // Raised-cosine fade so the pulse never starts/stops with an audible click.
  function envelope(i, n, fadeSamples) {
    if (fadeSamples <= 0) return 1;
    if (i < fadeSamples) return 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeSamples);
    if (i >= n - fadeSamples) return 0.5 - 0.5 * Math.cos((Math.PI * (n - 1 - i)) / fadeSamples);
    return 1;
  }

  function makePinkSource() {
    // Paul Kellet's economy pink-noise filter.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    return function () {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
      return out * 0.11;
    };
  }

  /**
   * Render one pulse (or one loopable block when p.intervalSec === 0).
   * p: { wave, freq, gainDb, durationMs, intervalSec, fadeMs }
   * Returns a mono Float32Array.
   */
  function render(p, sampleRate) {
    const continuous = !(p.intervalSec > 0);
    const amp = dbToGain(clamp(p.gainDb, -90, 0));
    const wave = p.wave;

    let freq = clamp(p.freq, MIN_FREQ, Math.min(MAX_FREQ, sampleRate / 2 - 500));
    let n;
    if (continuous) {
      // 2 s loop block with a whole number of cycles so the loop seam is silent.
      freq = Math.max(1, Math.round(freq));
      n = Math.round(sampleRate * 2);
    } else if (wave === 'click') {
      n = Math.max(8, Math.round((sampleRate * Math.min(p.durationMs, 60)) / 1000));
    } else {
      n = Math.max(16, Math.round((sampleRate * clamp(p.durationMs, 20, 10000)) / 1000));
    }

    const out = new Float32Array(n);
    const fadeSamples = continuous || wave === 'click'
      ? 0
      : Math.min(Math.floor(n / 2), Math.round((sampleRate * clamp(p.fadeMs, 0, 2000)) / 1000));
    const pink = wave === 'pink' ? makePinkSource() : null;
    const w = (2 * Math.PI * freq) / sampleRate;

    for (let i = 0; i < n; i++) {
      let s;
      switch (wave) {
        case 'sine':
          s = Math.sin(w * i);
          break;
        case 'triangle': {
          const ph = (freq * i) / sampleRate;
          s = 4 * Math.abs(ph - Math.floor(ph + 0.5)) - 1;
          break;
        }
        case 'white':
          s = (Math.random() * 2 - 1) * 0.7;
          break;
        case 'pink':
          s = pink();
          break;
        case 'click': {
          // Short decaying burst: sounds like a faint tick, easy for level detectors to catch.
          const t = i / sampleRate;
          s = Math.sin(w * i) * Math.exp(-t * 900);
          break;
        }
        default:
          s = 0;
      }
      s *= amp * envelope(i, n, fadeSamples);
      // TPDF dither (+-1 LSB of 16 bit): stops very quiet signals collapsing into
      // quantisation distortion / digital silence further down the Windows audio chain.
      s += (Math.random() - Math.random()) * LSB16;
      out[i] = s;
    }
    return out;
  }

  const api = { render, dbToGain, MIN_FREQ, MAX_FREQ };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Synth = api;
})(typeof window !== 'undefined' ? window : globalThis);
