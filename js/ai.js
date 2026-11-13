/**
 * CHASE LINE v2 AI. Both roles read the same interaction zones the player does,
 * so the AI vaults, climbs, ducks and jumps with the same canned moves.
 */
(function (root) {
  const Phys = () => root.ChasePhysics;

  function brain(c) {
    c._ai = c._ai || { key: '', thr: 0, miss: false, rnd: 1 };
    return c._ai;
  }
  function rand(c) {
    // deterministic per character so sims are repeatable
    const b = brain(c);
    b.rnd = (b.rnd * 16807) % 2147483647;
    return b.rnd / 2147483647;
  }

  function movement(world, c, diff, input) {
    const P = Phys();
    const b = brain(c);
    const z = P.zoneAhead(world, c, 220);
    if (z) {
      const key = z.kind + ':' + Math.round((z.s ? z.s.x : z.edge) || 0);
      if (b.key !== key) {
        b.key = key;
        const r = rand(c);
        if (diff === 'perfect') b.thr = z.kind === 'gap' ? 14 : z.kind === 'climb' ? 40 : 26;
        else if (diff === 'hard') b.thr = z.kind === 'gap' ? 10 + r * 30 : 24 + r * 20;
        else if (diff === 'easy') b.thr = z.kind === 'gap' ? 25 + r * 80 : 18 + r * 40;
        else b.thr = z.kind === 'gap' ? 14 + r * 55 : 20 + r * 30;
        b.miss = diff === 'easy' ? r > 0.88 : diff === 'normal' ? r > 0.95 : false;
        if (z.kind === 'gap') b.miss = false; // nobody runs off a roof on purpose
      }
      if (!b.miss && c.onGround) {
        if (z.kind === 'duck' && z.dist <= Math.min(60, b.thr + 20)) input.slide = true;
        else if ((z.kind === 'vault' || z.kind === 'kong') && z.active && z.dist <= b.thr + 10) { input.jump = true; input.vault = true; input.kong = true; }
        else if (z.kind === 'climb' && z.active && z.dist <= b.thr + 10) input.jump = true;
        else if (z.kind === 'wallrun' && z.active && P.hasSkill(c.loadout, 'wallrun') && c.role === 'runner' && z.dist <= 40) { input.jump = true; input.wallrun = true; }
        else if (z.kind === 'gap' && z.active && z.dist <= b.thr) { input.jump = true; input.precision = true; }
      }
    }
    // roll big drops
    if (!c.onGround && c.vy > 200 && (c.y + c.h) - c.airPeak > 50) {
      if (diff !== 'easy' || rand(c) > 0.3) input.roll = true;
    }
    return input;
  }

  function thinkRunner(world, diff) {
    return movement(world, world.runner, diff || 'normal', {});
  }

  function thinkHunter(world, diff) {
    const P = Phys();
    const h = world.hunter, r = world.runner;
    h.aiDiff = diff;
    const input = movement(world, h, diff === 'easy' ? 'normal' : 'hard', {});
    const lead = (r.x + r.w / 2) - (h.x + h.w / 2);
    const dy = (r.y + r.h) - (h.y + h.h);
    // sprint in bursts when the runner pulls away
    const b = brain(h);
    if (b.sprinting && (h.stamina < 0.06 || lead < 90)) b.sprinting = false;
    if (!b.sprinting && lead > 250 && h.stamina > 0.45 && world.elapsed > 3) b.sprinting = true;
    input.sprint = !!b.sprinting;
    if (world.elapsed > 1.5 && lead > -10 && lead < 30 && Math.abs(dy) < 28) input.grab = true;
    if (world.elapsed > 4 && P.hasSkill(h.loadout, 'dive') && lead > 44 && lead < 66 && Math.abs(dy) < 8 && h.onGround && r.onGround) {
      if (diff !== 'easy' || rand(h) > 0.6) input.dive = true;
    }
    if (world.elapsed > 7 && lead > 160 && lead < 560) {
      if (P.hasSkill(h.loadout, 'gate') && world.cooldown.gate <= 0 && rand(h) < (diff === 'hard' ? 0.02 : 0.01)) input.trapGate = true;
      if (P.hasSkill(h.loadout, 'collapse') && world.cooldown.collapse <= 0 && rand(h) < (diff === 'hard' ? 0.015 : 0.008)) input.trapCollapse = true;
    }
    return input;
  }

  const api = { thinkRunner, thinkHunter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChaseAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
