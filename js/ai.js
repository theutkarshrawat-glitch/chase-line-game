/**
 * CHASE LINE AI runner and hunter. Difficulty scales reaction and risk.
 */
(function (root) {
  const Phys = () => root.ChasePhysics;

  function gapAhead(world, c, look) {
    const plats = Phys().platforms(world);
    const feet = c.y + c.h;
    const cx = c.x + c.w;
    let current = null;
    for (const p of plats) {
      if (cx >= p.x - 4 && cx <= p.x + p.w + 8 && Math.abs(feet - p.y) < 24) current = p;
    }
    if (!current) return { gap: 0, next: null, current: null, toEdge: 99 };
    const toEdge = current.x + current.w - cx;
    let next = null;
    for (const p of plats) {
      if (p.x >= current.x + current.w - 2 && p.x < current.x + current.w + look + 80) {
        if (!next || p.x < next.x) next = p;
      }
    }
    const gap = next ? next.x - (current.x + current.w) : 40;
    return { gap, next, current, toEdge };
  }

  function obstacleAhead(world, c) {
    const look = c.x + c.w + 50 + c.vx * 0.1;
    for (const o of (world.track.obstacles || [])) {
      if (o.x > c.x && o.x < look) return o;
    }
    for (const pipe of (world.track.pipes || [])) {
      if (pipe.x > c.x && pipe.x < look && c.y + 10 < pipe.y + pipe.h) return { pipe: true, x: pipe.x, y: pipe.y, w: pipe.w, h: 40 };
    }
    for (const g of world.gates) {
      if (g.open < 0.7 && g.x > c.x && g.x < look) return { gate: true, x: g.x, y: g.y, w: g.w, h: g.h };
    }
    return null;
  }

  function thinkRunner(world, diff) {
    const c = world.runner;
    const input = {};
    const d = gapAhead(world, c, 360);
    const delay = diff === 'easy' ? 0.12 : diff === 'hard' ? 0.02 : 0.06;
    c._ai = c._ai || { t: 0 };
    c._ai.t += Phys().DT;

    const o = obstacleAhead(world, c);
    const nearEdge = d.toEdge < 90;
    if (o && o.gate && o.x - (c.x + c.w) < 70 && !nearEdge) input.slide = true;
    if (o && o.pipe && o.x - (c.x + c.w) < 70 && !nearEdge) input.slide = true;
    if (o && !o.gate && !o.pipe && o.x - (c.x + c.w) < 56) {
      if (o.w >= 72) input.kong = true;
      input.jump = true;
      input.vault = true;
    }

    // jump before a gap
    if (d.current && d.gap > 28) {
      const need = Math.max(0.13, 0.09 + d.gap / 2000);
      const tTo = d.toEdge / Math.max(80, c.vx);
      if (tTo < need + delay && tTo > 0 && (c.onGround || c.coyote > 0 || c.state === 'roll')) {
        if (d.next && (d.next.tags || []).indexOf('precision') >= 0) input.precision = true;
        input.jump = true;
      }
    }
    if (Phys().hasSkill(c.loadout, 'wallrun')) {
      for (const w of (world.track.walls || [])) {
        const dx = w.x - (c.x + c.w);
        if (dx < 70 && dx > -20 && (w.tags || []).indexOf('wallrun') >= 0 && c.y + c.h > w.y && c.y < w.y + w.h + 40) {
          input.jump = true; input.wallrun = true;
        }
      }
    }
    // roll on hard landing
    if (!c.onGround && c.vy > 700) input.roll = true;

    // risky vs safe: if we have precision, try to stay high by jumping to precision ledges
    return input;
  }

  function thinkHunter(world, diff) {
    const h = world.hunter, r = world.runner;
    const input = {};
    const d = gapAhead(world, h, 360);
    const lead = r.x - h.x;

    if (d.current && d.gap > 36) {
      const tTo = d.toEdge / Math.max(80, h.vx);
      const need = 0.1 + d.gap / 2200;
      if (tTo < need && tTo > 0) input.jump = true;
    }
    const o = obstacleAhead(world, h);
    if (o && (o.gate || o.pipe) && o.x - (h.x + h.w) < 70) input.slide = true;
    if (o && !o.gate && !o.pipe && o.x - (h.x + h.w) < 56) { input.jump = true; input.vault = true; }
    if (!h.onGround && h.vy > 700) input.roll = true;

    // sprint if behind
    if (world.elapsed > 4 && lead > 180) input.sprint = true;

    const dist = Math.hypot((r.x - h.x), (r.y - h.y));
    if (world.elapsed > 2.2 && dist < 42) input.grab = true;

    if (world.elapsed > 5 && r.x > 900 && Phys().hasSkill(h.loadout, 'dive') && lead > 55 && lead < 100 && Math.abs(r.y - h.y) < 36) {
      if (diff !== 'easy' || lead < 80) input.dive = true;
    }

    // traps
    if (world.elapsed > 7 && r.x > 1600 && lead > 140 && lead < 560) {
      if (Phys().hasSkill(h.loadout, 'gate') && world.cooldown.gate <= 0 && Math.random() < (diff === 'hard' ? 0.02 : 0.01)) {
        input.trapGate = true;
      }
      if (Phys().hasSkill(h.loadout, 'collapse') && world.cooldown.collapse <= 0 && Math.random() < (diff === 'hard' ? 0.015 : 0.008)) {
        input.trapCollapse = true;
      }
    }
    return input;
  }

  const api = { thinkRunner, thinkHunter, gapAhead };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChaseAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
