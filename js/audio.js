/**
 * CHASE LINE WebAudio — footsteps, wind, whoosh, traps, stings. No samples.
 */
(function (root) {
  const Audio = {
    ctx: null, master: null, sfx: null, windGain: null, windSrc: null,
    muted: false, unlocked: false, lastStep: 0, stepRate: 0,
  };

  function now() { return Audio.ctx ? Audio.ctx.currentTime : 0; }

  function env(t, a, h, r, peak) {
    const g = Audio.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r);
    return g;
  }

  function tone({ freq, t, dur, type, peak, attack, release, filter, dest, slide }) {
    const ac = Audio.ctx;
    const osc = ac.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    let node = osc;
    if (filter) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(filter, t);
      osc.connect(f);
      node = f;
    }
    const a = attack != null ? attack : 0.004;
    const rel = release != null ? release : Math.max(0.05, dur * 0.5);
    const h = Math.max(0, dur - a - 0.01);
    const g = env(t, a, h, rel, peak != null ? peak : 0.12);
    node.connect(g);
    g.connect(dest || Audio.sfx);
    osc.start(t);
    osc.stop(t + a + h + rel + 0.02);
  }

  function noise({ t, dur, peak, from, to, type, dest, Q }) {
    const ac = Audio.ctx;
    const n = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(from || 800, t);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    f.Q.value = Q || 1;
    const g = env(t, 0.005, dur * 0.25, dur * 0.7, peak != null ? peak : 0.15);
    src.connect(f); f.connect(g); g.connect(dest || Audio.sfx);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function ready() { return Audio.ctx && Audio.unlocked && !Audio.muted; }

  Audio.unlock = function () {
    if (!Audio.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      Audio.ctx = new AC();
      Audio.master = Audio.ctx.createGain();
      Audio.master.gain.value = 0.85;
      const comp = Audio.ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3;
      Audio.sfx = Audio.ctx.createGain();
      Audio.sfx.connect(comp); comp.connect(Audio.master); Audio.master.connect(Audio.ctx.destination);
      // looping wind
      const len = Audio.ctx.sampleRate * 2;
      const buf = Audio.ctx.createBuffer(1, len, Audio.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
      Audio.windSrc = Audio.ctx.createBufferSource();
      Audio.windSrc.buffer = buf; Audio.windSrc.loop = true;
      const f = Audio.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 400;
      Audio.windGain = Audio.ctx.createGain();
      Audio.windGain.gain.value = 0;
      Audio.windSrc.connect(f); f.connect(Audio.windGain); Audio.windGain.connect(Audio.master);
      Audio.windSrc.start();
    }
    if (Audio.ctx.state === 'suspended') Audio.ctx.resume();
    Audio.unlocked = true;
  };

  Audio.setMuted = function (m) {
    Audio.muted = !!m;
    if (Audio.master) Audio.master.gain.value = Audio.muted ? 0 : 0.85;
  };
  Audio.toggleMute = function () { Audio.setMuted(!Audio.muted); return Audio.muted; };
  // a trap button just came live: a short, soft two-note tick
  Audio.trapReady = function (kind) {
    Audio.haptic(12);
    if (!ready()) return;
    const t = now();
    tone({ freq: kind === 'gate' ? 880 : 660, t, dur: 0.07, type: 'sine', peak: 0.07, release: 0.06 });
    tone({ freq: kind === 'gate' ? 1320 : 990, t: t + 0.07, dur: 0.09, type: 'sine', peak: 0.06, release: 0.08 });
  };
  Audio.door = function () {
    if (!ready()) return;
    const t = now();
    noise({ t, dur: 0.12, peak: 0.16, from: 900, to: 300, type: 'bandpass' });
    tone({ freq: 110, t: t + 0.05, dur: 0.2, type: 'triangle', peak: 0.12, release: 0.18 });
  };
  Audio.haptic = function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* */ } };

  Audio.setWind = function (speed01) {
    if (!Audio.windGain) return;
    const t = now();
    const g = Audio.muted ? 0 : 0.02 + speed01 * 0.12;
    Audio.windGain.gain.linearRampToValueAtTime(g, t + 0.08);
  };

  // Logo: two running hits and a rising whoosh into a distant horn
  Audio.logo = function () {
    if (!ready()) return;
    const t = now() + 0.02;
    noise({ t, dur: 0.06, peak: 0.16, from: 300, to: 120, type: 'lowpass' });
    noise({ t: t + 0.14, dur: 0.06, peak: 0.16, from: 320, to: 130, type: 'lowpass' });
    noise({ t: t + 0.22, dur: 0.35, peak: 0.14, from: 600, to: 1800, type: 'bandpass' });
    tone({ freq: 196, t: t + 0.42, dur: 0.55, type: 'sine', peak: 0.14, release: 0.5 });
    tone({ freq: 294, t: t + 0.5, dur: 0.6, type: 'sine', peak: 0.1, release: 0.55 });
    Audio.haptic(16);
  };

  Audio.step = function (speed) {
    if (!ready()) return;
    const t = now();
    if (t - Audio.lastStep < 0.08) return;
    Audio.lastStep = t;
    const p = 0.07 + Math.min(0.08, speed * 0.00012);
    noise({ t, dur: 0.045, peak: p, from: 200 + speed * 0.3, to: 80, type: 'lowpass' });
  };

  Audio.jump = function () {
    if (!ready()) return;
    noise({ t: now(), dur: 0.16, peak: 0.18, from: 400, to: 1600, type: 'bandpass' });
    Audio.haptic(10);
  };

  Audio.land = function (hard) {
    if (!ready()) return;
    noise({ t: now(), dur: hard ? 0.16 : 0.08, peak: hard ? 0.22 : 0.12, from: hard ? 180 : 250, to: 60, type: 'lowpass' });
    Audio.haptic(hard ? 22 : 8);
  };

  Audio.roll = function () {
    if (!ready()) return;
    noise({ t: now(), dur: 0.18, peak: 0.14, from: 500, to: 200, type: 'bandpass' });
  };

  Audio.vault = function () {
    if (!ready()) return;
    noise({ t: now(), dur: 0.1, peak: 0.12, from: 700, to: 300, type: 'bandpass' });
  };

  Audio.gate = function () {
    if (!ready()) return;
    const t = now();
    tone({ freq: 140, t, dur: 0.2, type: 'square', peak: 0.1, filter: 800 });
    noise({ t, dur: 0.2, peak: 0.2, from: 2000, to: 400, type: 'bandpass' });
    Audio.haptic([8, 30, 18]);
  };

  Audio.collapse = function () {
    if (!ready()) return;
    noise({ t: now(), dur: 0.55, peak: 0.28, from: 200, to: 50, type: 'lowpass' });
    tone({ freq: 55, t: now(), dur: 0.5, type: 'sine', peak: 0.16, release: 0.4 });
    Audio.haptic([20, 40, 30]);
  };

  Audio.catch = function () {
    if (!ready()) return;
    const t = now();
    noise({ t, dur: 0.2, peak: 0.24, from: 300, to: 80, type: 'lowpass' });
    tone({ freq: 90, t, dur: 0.3, type: 'triangle', peak: 0.16, release: 0.25 });
    Audio.haptic([30, 40, 40]);
  };

  Audio.escape = function () {
    if (!ready()) return;
    const t = now();
    tone({ freq: 392, t, dur: 0.25, type: 'sine', peak: 0.14, release: 0.2 });
    tone({ freq: 523, t: t + 0.12, dur: 0.3, type: 'sine', peak: 0.14, release: 0.22 });
    tone({ freq: 784, t: t + 0.26, dur: 0.55, type: 'sine', peak: 0.16, release: 0.45 });
    Audio.haptic(20);
  };

  Audio.end = function () {
    if (!ready()) return;
    const t = now();
    tone({ freq: 262, t, dur: 0.7, type: 'sine', peak: 0.12, release: 0.6 });
    tone({ freq: 196, t: t + 0.08, dur: 0.8, type: 'sine', peak: 0.1, release: 0.7 });
  };

  Audio.fail = function () {
    if (!ready()) return;
    tone({ freq: 150, t: now(), dur: 0.22, type: 'triangle', peak: 0.1, filter: 400, release: 0.2 });
  };

  Audio.ui = function () {
    if (!ready()) return;
    noise({ t: now(), dur: 0.03, peak: 0.08, from: 1800, to: 900, type: 'bandpass' });
  };

  Audio.nearMiss = function () {
    if (!ready()) return;
    noise({ t: now(), dur: 0.4, peak: 0.1, from: 1200, to: 400, type: 'bandpass' });
    tone({ freq: 220, t: now(), dur: 0.45, type: 'sine', peak: 0.07, release: 0.4 });
  };

  root.ChaseAudio = Audio;
})(typeof globalThis !== 'undefined' ? globalThis : this);
