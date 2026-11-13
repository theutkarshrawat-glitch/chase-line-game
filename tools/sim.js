// Node sim harness for CHASE LINE v2 physics + AI.
const P = require('../js/physics.js');
const T = require('../js/tracks.js');
const AI = require('../js/ai.js');

function pen(world, c) {
  let worst = 0, what = null;
  for (const s of P.solids(world)) {
    const ox = Math.min(c.x + c.w, s.x + s.w) - Math.max(c.x, s.x);
    const oy = Math.min(c.y + c.h, s.y + s.h) - Math.max(c.y, s.y);
    if (ox > 0 && oy > 0) { const d = Math.min(ox, oy); if (d > worst) { worst = d; what = s.kind + '@' + Math.round(s.x) + ',' + Math.round(s.y); } }
  }
  return { worst, what };
}

function run(track, o) {
  o = o || {};
  const w = P.createWorld(track, { runnerLoadout: o.rl || ['jump', 'slide', 'roll', 'vault'], hunterLoadout: o.hl || ['sprint', 'grab', 'collapse'] });
  let maxPen = 0, penWhat = null, maxStuck = { runner: 0, hunter: 0 }, stuck = { runner: 0, hunter: 0 }, lastX = { runner: w.runner.x, hunter: w.hunter.x };
  const moves = {}; let steps = 0; const trace = [];
  while (!w.over && steps < 60 * 70) {
    const ri = o.passive ? {} : AI.thinkRunner(w, o.rdiff || 'perfect');
    P.applyInput(w.runner, ri);
    if (!o.noHunter) {
      const hi = AI.thinkHunter(w, o.hdiff || 'normal');
      P.applyInput(w.hunter, hi);
      if (hi.trapGate) P.dropGate(w);
      if (hi.trapCollapse) P.dropCollapse(w);
    } else { w.hunter.x = -5000; w.hunter.y = 0; }
    P.stepWorld(w, P.DT);
    for (const e of w.events) if (e.type !== 'style') moves[e.type + (e.role ? ':' + e.role[0] : '')] = (moves[e.type + (e.role ? ':' + e.role[0] : '')] || 0) + 1;
    w.events.length = 0;
    for (const k of ['runner', 'hunter']) {
      if (k === 'hunter' && o.noHunter) continue;
      const c = w[k];
      const p = pen(w, c);
      if (p.worst > maxPen) { maxPen = p.worst; penWhat = k + ' ' + c.state + (c.move ? '/' + c.move.type : '') + ' ' + p.what + ' at x=' + Math.round(c.x); }
      if (c.x > lastX[k] + 3) { lastX[k] = c.x; stuck[k] = 0; } else { stuck[k] += P.DT; maxStuck[k] = Math.max(maxStuck[k], stuck[k]); }
    }
    if (o.trace && steps % 30 === 0) trace.push([steps / 60, Math.round(w.runner.x), Math.round(w.runner.y), w.runner.state, Math.round(w.hunter.x), w.hunter.state].join(' '));
    steps++;
  }
  return { track: track.id, result: w.result, time: +(w.elapsed).toFixed(1), rx: Math.round(w.runner.x), hx: Math.round(w.hunter.x), lead: Math.round(w.runner.x - w.hunter.x), maxPen: +maxPen.toFixed(2), penWhat, maxStuck: { r: +maxStuck.runner.toFixed(2), h: +maxStuck.hunter.toFixed(2) }, moves, trace };
}

module.exports = { run, pen };
if (require.main === module) {
  const tracks = T.HANDCRAFTED.concat([T.dailyRemix(new Date(2026, 10, 13)), T.dailyRemix(new Date(2026, 10, 14))]);
  const arg = process.argv[2] || 'all';
  for (const t of tracks) {
    if (arg !== 'all' && t.id !== arg) continue;
    const solo = run(t, { noHunter: true, trace: !!process.env.TRACE });
    console.log('SOLO', JSON.stringify(Object.assign({}, solo, { trace: undefined })));
    if (process.env.TRACE) console.log(solo.trace.join('\n'));
  }
}
