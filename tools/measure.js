// Measures our movement the same way docs/vector-measurements.md measures Vector:
// run speed in body heights/s, cadence, jump air time + apex, duration of every move type.
// Usage: node tools/measure.js [bodyPx]   (bodyPx = drawn body height, default from rig scale)
const P = require('../js/physics.js'), T = require('../js/tracks.js'), AI = require('../js/ai.js');
const R = (() => { try { return require('../js/rig.js'); } catch (e) { return null; } })();
const BODY = +(process.argv[2] || (R && R.BODY_PX) || P.CHAR_H);
const CYC = (R && R.CYCLE) || 128;
const tracks = T.HANDCRAFTED.concat([T.dailyRemix(new Date(2026, 10, 13))]);
const acc = {}; const add = (k, v) => (acc[k] = acc[k] || []).push(v);
let runSpeeds = [];
for (const t of tracks) {
  const w = P.createWorld(t, { runnerLoadout: ['jump', 'slide', 'roll', 'vault', 'kong', 'wallrun', 'precision'] });
  w.hunter.x = -5000;
  const c = w.runner; let st = null, stT = 0, air = null, prevState = c.state, prevMove = null;
  for (let i = 0; i < 60 * 80 && !w.over; i++) {
    P.applyInput(c, AI.thinkRunner(w, 'perfect'));
    P.stepWorld(w, P.DT); w.events.length = 0; w.hunter.x = -5000; w.hunter.y = 0;
    const key = c.state === 'move' && c.move ? 'move:' + c.move.type : c.state;
    if (key !== st) { if (st && st !== 'run' && st !== 'air') add(st, stT); st = key; stT = 0; }
    stT += P.DT;
    if (c.state === 'run' && c.onGround && w.elapsed > 2) runSpeeds.push(c.vx);
    if (!c.onGround && c.state === 'air' && !air) air = { t: 0, y0: c.y + c.h, top: c.y + c.h, kind: c.trick || 'fall' };
    if (air) { air.t += P.DT; air.top = Math.min(air.top, c.y + c.h); }
    if (air && (c.onGround || c.state === 'move')) { if (air.kind !== 'fall' && air.kind !== '') add('air:' + air.kind, [air.t, (air.y0 - air.top) / BODY]); air = null; }
  }
}
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const vrun = med(runSpeeds.filter((v) => v > P.RUN_V * 0.9));
console.log('body px', BODY, '| run', vrun.toFixed(0), 'px/s =', (vrun / BODY).toFixed(2), 'body-heights/s | cycle', CYC, 'px =', (CYC / BODY).toFixed(2), 'bh, cadence', (vrun / CYC).toFixed(2), 'Hz');
for (const k of Object.keys(acc).sort()) {
  const a = acc[k];
  if (k.startsWith('air:')) console.log(k.padEnd(18), 'n=' + a.length, 'air', med(a.map((x) => x[0])).toFixed(2) + 's', 'apex', med(a.map((x) => x[1])).toFixed(2) + ' bh');
  else console.log(k.padEnd(18), 'n=' + a.length, 'median', med(a).toFixed(2) + 's', 'min', Math.min(...a).toFixed(2), 'max', Math.max(...a).toFixed(2));
}
