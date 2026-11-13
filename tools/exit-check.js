// Exit-door check on every track (plus a month of daily remixes): the runner must finish
// inside the doorway, nobody may pass the exit wall, and a hunter right on the runner's
// heels must stop at the door. Run: node tools/exit-check.js
const P = require('../js/physics.js'), T = require('../js/tracks.js'), AI = require('../js/ai.js');
const tracks = T.HANDCRAFTED.slice();
for (let d = 1; d <= 30; d++) tracks.push(T.dailyRemix(new Date(2026, 10, d)));
let fails = 0;
for (const t of tracks) {
  const w = P.createWorld(t, { runnerLoadout: ['jump', 'slide', 'roll', 'vault'], hunterLoadout: ['sprint'] });
  const E = w.geo.exit;
  let placed = false, steps = 0, maxR = -1e9, maxH = -1e9;
  while (steps < 60 * 80) {
    P.applyInput(w.runner, AI.thinkRunner(w, 'perfect'));
    if (!placed && w.runner.x > E.doorX - 520 && w.runner.onGround) {
      // put the hunter right behind, on the same roof, at full speed
      w.hunter.x = w.runner.x - 70; w.hunter.y = w.runner.y; w.hunter.vx = w.runner.vx; w.hunter.vy = 0; w.hunter.onGround = true; w.hunter.state = 'run'; w.hunter.move = null;
      placed = true;
    }
    if (placed) P.applyInput(w.hunter, { right: true });
    else { w.hunter.x = -5000; w.hunter.y = 0; }
    P.stepWorld(w, P.DT);
    w.events.length = 0;
    maxR = Math.max(maxR, w.runner.x + w.runner.w);
    if (placed) maxH = Math.max(maxH, w.hunter.x + w.hunter.w);
    steps++;
    if (w.over && w.exitT > 2) break;
    if (w.over && w.result !== 'escape') break;
  }
  const ok = w.result === 'escape' && w.runner.inside && maxR <= E.doorX + E.doorW + 2 && maxH <= E.doorX - 40;
  if (!ok) fails++;
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + t.id.padEnd(16) + ' result=' + w.result + ' inside=' + !!w.runner.inside +
    ' runnerMaxRight=' + Math.round(maxR - E.doorX) + ' hunterMaxRight=' + Math.round(maxH - E.doorX) + ' (relative to door x; door w ' + E.doorW + ')');
}
process.exit(fails ? 1 : 0);
