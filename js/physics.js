/**
 * CHASE LINE fixed-timestep parkour sim. Momentum, weighted landings,
 * edge jumps, traps, simple verlet ragdoll. Pure JS, no DOM.
 */
(function (root) {
  const DT = 1 / 60;
  const G = 2450;
  const ACCEL = 540;
  const AIR_ACCEL = 120;
  const FRICTION = 70;
  const WET_FRICTION = 22;
  const WET_ACCEL = 320;
  const MAX_SPEED = 455;
  const SPRINT_MAX = 575;
  const SLIDE_FRICTION = 36;
  const COYOTE = 0.09;
  const JUMP_BUF = 0.11;
  const ROLL_WINDOW = 0.24;
  const HARD_LAND = 780;
  const HUGE_LAND = 1100;
  const EDGE = 16;
  const CATCH_R = 38;
  const DIVE_R = 78;
  const CHAR_W = 22;
  const CHAR_H = 52;
  const SLIDE_H = 24;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function hasSkill(loadout, id) {
    return !loadout || loadout.indexOf(id) >= 0;
  }

  function makeChar(role, x, y, loadout) {
    return {
      role,
      x, y, vx: 0, vy: 0,
      w: CHAR_W, h: CHAR_H,
      standingH: CHAR_H, slideH: SLIDE_H,
      onGround: false, groundedT: 0, coyote: 0, jumpBuf: 0,
      state: 'run', stateT: 0,
      facing: 1,
      wall: 0, wallT: 0,
      stamina: 1,
      stunT: 0,
      rollWindow: 0,
      lastImpact: 0,
      ledge: null,
      hanging: false,
      sprinting: false,
      diving: false,
      grabT: 0,
      vaultT: 0,
      trick: '',
      phase: 0,
      caught: false,
      downed: false,
      ragdoll: null,
      scarf: [],
      styleEvents: [],
      loadout: loadout ? loadout.slice() : [],
      airTime: 0,
      lastPlat: null,
      wantJump: false, wantSlide: false, wantGrab: false,
      wantSprint: false, wantDive: false,
      wantVault: false, wantWall: false, wantKong: false, wantPrec: false,
      wantRoll: false, wantHold: false,
    };
  }

  function initScarf(c) {
    c.scarf = [];
    for (let i = 0; i < 6; i++) c.scarf.push({ x: c.x - 8 - i * 5, y: c.y + 8, vx: 0, vy: 0 });
  }

  function createWorld(track, opts) {
    opts = opts || {};
    const runnerX = 420;
    const runnerY = (track.platforms[0] ? track.platforms[0].y : 260) - CHAR_H;
    const hunterX = 10;
    const w = {
      track,
      wet: !!track.wet,
      finishX: track.finishX,
      t: 60,
      elapsed: 0,
      scale: 1,
      shake: 0,
      slowMo: 0,
      debris: [],
      gates: [],
      collapsed: [],
      runner: makeChar('runner', runnerX, runnerY, opts.runnerLoadout || ['jump', 'slide', 'roll', 'vault']),
      hunter: makeChar('hunter', hunterX, runnerY, opts.hunterLoadout || ['sprint', 'grab', 'collapse']),
      style: 0,
      boost: 0,
      events: [],
      over: false,
      result: null,
      nearMiss: 0,
      cooldown: { gate: 0, collapse: 0, sprintR: 0, sprintH: 0 },
    };
    // hunter starts a little behind
    w.hunter.x = 20;
    initScarf(w.runner);
    initScarf(w.hunter);
    // settle on first roof
    settle(w, w.runner);
    settle(w, w.hunter);
    return w;
  }

  function settle(world, c) {
    const p = supportUnder(world, c.x + c.w / 2, c.y + c.h + 4, c.w);
    if (p) {
      c.y = p.y - c.h;
      c.onGround = true;
      c.lastPlat = p;
    }
  }

  function platforms(world) {
    const out = [];
    const gone = world.collapsed;
    for (const p of world.track.platforms) {
      let x = p.x, w = p.w;
      let skip = false;
      for (const c of gone) {
        if (Math.abs((p.x + p.w / 2) - (c.x + c.w / 2)) < 8 && Math.abs(p.y - c.y) < 8) {
          // split around collapse hole
          if (c.x > p.x && c.x + c.w < p.x + p.w) {
            out.push({ x: p.x, y: p.y, w: c.x - p.x, h: p.h, tags: p.tags });
            out.push({ x: c.x + c.w, y: p.y, w: p.x + p.w - (c.x + c.w), h: p.h, tags: p.tags });
            skip = true;
          } else skip = true;
        }
      }
      if (!skip) out.push(p);
    }
    return out;
  }

  function supportUnder(world, cx, feet, hw) {
    let best = null;
    const half = hw * 0.5;
    for (const p of platforms(world)) {
      if (cx + half < p.x + 2 || cx - half > p.x + p.w - 2) continue;
      const top = p.y;
      if (feet >= top - 8 && feet <= top + 22) {
        if (!best || top < best.y) best = p;
      }
    }
    return best;
  }

  function solidAt(world, x, y, w, h, ignoreFeet) {
    const hits = [];
    for (const p of platforms(world)) {
      if (x + w <= p.x + 1 || x >= p.x + p.w - 1) continue;
      if (y + h <= p.y - 2 || y >= p.y + p.h) continue;
      hits.push(p);
    }
    for (const o of (world.track.obstacles || [])) {
      if (x + w <= o.x || x >= o.x + o.w) continue;
      if (y + h <= o.y - o.h || y >= o.y) continue;
      hits.push({ x: o.x, y: o.y - o.h, w: o.w, h: o.h, tags: o.tags, obstacle: o });
    }
    for (const pipe of (world.track.pipes || [])) {
      if (x + w <= pipe.x || x >= pipe.x + pipe.w) continue;
      if (y + h <= pipe.y || y >= pipe.y + pipe.h) continue;
      hits.push({ x: pipe.x, y: pipe.y, w: pipe.w, h: pipe.h, pipe: true });
    }
    for (const g of world.gates) {
      if (g.open > 0.85) continue;
      const gh = g.h * (1 - g.open);
      const gy = g.y - gh;
      if (x + w <= g.x || x >= g.x + g.w) continue;
      if (y + h <= gy || y >= g.y) continue;
      hits.push({ x: g.x, y: gy, w: g.w, h: gh, gate: true });
    }
    for (const wll of (world.track.walls || [])) {
      if (x + w <= wll.x || x >= wll.x + wll.w) continue;
      if (y + h <= wll.y || y >= wll.y + wll.h) continue;
      hits.push({ x: wll.x, y: wll.y, w: wll.w, h: wll.h, wall: wll });
    }
    return hits;
  }

  function nearObstacle(world, c, kind) {
    const look = c.x + c.w + 10 + Math.max(0, c.vx) * 0.08;
    for (const o of (world.track.obstacles || [])) {
      if (o.x > c.x - 10 && o.x < look + 40) {
        if (Math.abs((o.y) - (c.y + c.h)) < 80 || (c.y + c.h > o.y - o.h - 20 && c.y < o.y + 10)) {
          if (!kind || (o.tags || []).indexOf(kind) >= 0 || o.type === kind) return o;
          if (!kind) return o;
          return o;
        }
      }
    }
    return null;
  }

  function nearWall(world, c) {
    for (const wll of (world.track.walls || [])) {
      const dx = wll.x - (c.x + c.w);
      if (dx > -30 && dx < 46 && c.y + c.h > wll.y && c.y < wll.y + wll.h) return wll;
    }
    return null;
  }

  function atLeadingEdge(c, plat) {
    if (!plat) return 0;
    const feetR = c.x + c.w;
    const edgeX = plat.x + plat.w;
    const dist = edgeX - feetR;
    return dist;
  }

  function beginRagdoll(c) {
    if (c.ragdoll) return;
    const x = c.x + c.w / 2, y = c.y + 8;
    const pts = [
      { id: 'head', x: x + 4, y: y - 10, ox: x + 4, oy: y - 10, pin: false },
      { id: 'neck', x: x, y: y + 2, ox: x, oy: y + 2 },
      { id: 'hip', x: x - 2, y: y + 24, ox: x - 2, oy: y + 24 },
      { id: 'lhand', x: x - 14, y: y + 10, ox: x - 14, oy: y + 10 },
      { id: 'rhand', x: x + 16, y: y + 8, ox: x + 16, oy: y + 8 },
      { id: 'lfoot', x: x - 8, y: y + 46, ox: x - 8, oy: y + 46 },
      { id: 'rfoot', x: x + 12, y: y + 44, ox: x + 12, oy: y + 44 },
    ];
    for (const p of pts) { p.vx = c.vx * 0.6; p.vy = c.vy * 0.4; }
    const L = [
      ['head', 'neck', 12], ['neck', 'hip', 22],
      ['neck', 'lhand', 18], ['neck', 'rhand', 18],
      ['hip', 'lfoot', 22], ['hip', 'rfoot', 22],
    ];
    c.ragdoll = { pts, links: L, t: 0 };
    c.state = 'ragdoll';
    c.stateT = 0;
  }

  function stepRagdoll(world, c, dt) {
    const r = c.ragdoll;
    r.t += dt;
    const g = G * dt;
    for (const p of r.pts) {
      p.vy += g;
      p.vx *= 0.995;
      p.vy *= 0.995;
      p.ox = p.x; p.oy = p.y;
      p.x += (p.vx + c.vx * 0.02) * dt;
      p.y += p.vy * dt;
      const feet = p.y + 3;
      const plat = supportUnder(world, p.x, feet, 8);
      if (plat && feet > plat.y) {
        p.y = plat.y - 3;
        p.vy *= -0.25;
        p.vx *= 0.7;
      }
    }
    for (let k = 0; k < 3; k++) {
      for (const [a, b, len] of r.links) {
        const A = r.pts.find((p) => p.id === a);
        const B = r.pts.find((p) => p.id === b);
        let dx = B.x - A.x, dy = B.y - A.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = (d - len) / d;
        const ox = dx * 0.5 * diff, oy = dy * 0.5 * diff;
        A.x += ox; A.y += oy;
        B.x -= ox; B.y -= oy;
      }
    }
    const hip = r.pts.find((p) => p.id === 'hip');
    c.x = hip.x - c.w / 2;
    c.y = hip.y - 24;
  }

  function style(world, c, kind, pts) {
    if (c.role !== 'runner') return;
    world.style += pts;
    world.boost = clamp(world.boost + pts / 120, 0, 1);
    c.styleEvents.push({ kind, pts, t: 0 });
    world.events.push({ type: 'style', kind, pts });
  }

  function jumpImpulse(c, world, kind) {
    const run = Math.max(0, c.vx);
    let vy = 620 + run * 0.42;
    if (kind === 'precision') vy = 700 + run * 0.5;
    if (c.hanging) vy = 520;
    c.vy = -vy;
    c.onGround = false;
    c.hanging = false;
    c.ledge = null;
    c.coyote = 0;
    c.jumpBuf = 0;
    c.airTime = 0;
    c.state = kind === 'precision' ? 'precision' : 'jump';
    c.stateT = 0;
    c.trick = kind || 'jump';
    // edge timing
    if (c.lastPlat) {
      const d = atLeadingEdge(c, c.lastPlat);
      if (d >= 0 && d <= EDGE) {
        c.vx *= 1.13;
        style(world, c, 'perfect-edge', 25);
        world.events.push({ type: 'perfect' });
      } else if (d < 0 && d > -22) {
        c.vx *= 0.82;
        world.events.push({ type: 'late-edge' });
      }
    }
    c.vx += 8;
  }

  function startSlide(c) {
    c.state = 'slide';
    c.stateT = 0;
    c.h = c.slideH;
    c.y += (c.standingH - c.slideH);
    c.wantSlide = false;
  }

  function standUp(c) {
    if (c.h !== c.standingH) {
      c.y -= (c.standingH - c.h);
      c.h = c.standingH;
    }
  }

  function startVault(world, c, o, kong) {
    if (!o) return;
    c.state = kong ? 'kong' : 'vault';
    c.stateT = 0;
    c.vaultT = kong ? 0.32 : 0.42;
    c.vy = kong ? -420 : -360;
    c.vx = Math.max(c.vx, kong ? 420 : 300) * (kong ? 1.08 : 0.95);
    c.onGround = false;
    c.trick = c.state;
    style(world, c, c.state, kong ? 30 : 12);
    world.events.push({ type: 'vault', kong: !!kong });
  }

  function startWallRun(world, c, wll) {
    if (!wll) return;
    c.state = 'wallrun';
    c.stateT = 0;
    c.wallT = 0.62;
    c.wall = wll;
    c.vy = -280;
    c.vx = Math.max(220, c.vx * 0.6);
    c.onGround = false;
    style(world, c, 'wallrun', 35);
    world.events.push({ type: 'wallrun' });
  }

  function startDive(world, c) {
    c.state = 'dive';
    c.stateT = 0;
    c.diving = true;
    c.vy = -120;
    c.vx = Math.max(c.vx, 380) + 160;
    c.onGround = false;
    world.events.push({ type: 'dive' });
  }

  function stumble(world, c, severity) {
    c.state = 'stumble';
    c.stateT = 0;
    c.stunT = 0.35 + severity * 0.25;
    c.vx *= 0.35 + 0.15 * (1 - severity);
    standUp(c);
    world.shake = Math.max(world.shake, 6 + severity * 6);
    world.events.push({ type: 'stumble', role: c.role });
    if (c.role === 'runner') world.boost = Math.max(0, world.boost - 0.15);
  }

  function applyInput(c, input) {
    input = input || {};
    if (input.jump) c.jumpBuf = JUMP_BUF;
    if (input.slide) c.wantSlide = true;
    if (input.roll) c.wantRoll = true;
    if (input.grab) c.wantGrab = true;
    if (input.sprint) c.wantSprint = true;
    else if (input.sprint === false) c.wantSprint = false;
    if (input.dive) c.wantDive = true;
    if (input.vault) c.wantVault = true;
    if (input.wallrun) c.wantWall = true;
    if (input.kong) c.wantKong = true;
    if (input.precision) c.wantPrec = true;
    if (input.hold) c.wantHold = true;
    else if (input.hold === false) c.wantHold = false;
  }

  function stepChar(world, c, dt) {
    if (c.caught || c.downed) {
      if (c.ragdoll) stepRagdoll(world, c, dt);
      return;
    }
    if (c.ragdoll) {
      stepRagdoll(world, c, dt);
      return;
    }

    c.stateT += dt;
    if (c.stunT > 0) c.stunT -= dt;
    if (c.grabT > 0) c.grabT -= dt;
    if (c.jumpBuf > 0) c.jumpBuf -= dt;
    if (c.rollWindow > 0) c.rollWindow -= dt;
    if (c.vaultT > 0) c.vaultT -= dt;

    const wet = world.wet || (c.lastPlat && (c.lastPlat.tags || []).indexOf('slip') >= 0);
    const accel = wet ? WET_ACCEL : ACCEL;
    const fric = wet ? WET_FRICTION : FRICTION;
    const maxV = (c.sprinting && hasSkill(c.loadout, 'sprint')) ? SPRINT_MAX : MAX_SPEED;

    // sprint
    if (c.role === 'hunter' && c.wantSprint && hasSkill(c.loadout, 'sprint') && c.stamina > 0 && c.stunT <= 0) {
      c.sprinting = true;
      c.stamina -= dt * 0.45;
      if (c.stamina <= 0) { c.sprinting = false; c.wantSprint = false; }
    } else {
      c.sprinting = false;
      c.stamina = Math.min(1, c.stamina + dt * 0.18);
    }

    // context skills
    const obst = nearObstacle(world, c);
    const wll = nearWall(world, c);

    if (c.jumpBuf > 0 && c.stunT <= 0 && c.state !== 'slide' && c.state !== 'wallrun' && (c.state !== 'roll' || c.stateT > 0.14)) {
      if (c.onGround || c.coyote > 0 || c.hanging) {
        // vault / kong if approaching an obstacle
        if (obst && c.onGround && (c.wantVault || c.wantKong || c.jumpBuf > 0)) {
          const wide = obst.w >= 72;
          if (wide && hasSkill(c.loadout, 'kong') && (c.wantKong || !hasSkill(c.loadout, 'vault') || c.wantVault === false || c.vx > 340)) {
            startVault(world, c, obst, true);
            c.jumpBuf = 0;
          } else if (!wide || !hasSkill(c.loadout, 'kong')) {
            if (wide && !hasSkill(c.loadout, 'kong')) {
              // basic vault can't clear a wide unit cleanly
              jumpImpulse(c, world, 'jump');
            } else {
              startVault(world, c, obst, false);
              c.jumpBuf = 0;
            }
          } else {
            startVault(world, c, obst, true);
            c.jumpBuf = 0;
          }
        } else if (wll && hasSkill(c.loadout, 'wallrun') && (c.wantWall || c.jumpBuf > 0) && (c.wantWall || wll)) {
          // only wall-run if skill equipped and near a wall-run wall
          if ((wll.tags || []).indexOf('wallrun') >= 0 && hasSkill(c.loadout, 'wallrun')) {
            startWallRun(world, c, wll);
            c.jumpBuf = 0;
          } else {
            jumpImpulse(c, world, c.wantPrec && hasSkill(c.loadout, 'precision') ? 'precision' : 'jump');
          }
        } else {
          jumpImpulse(c, world, c.wantPrec && hasSkill(c.loadout, 'precision') ? 'precision' : 'jump');
        }
      }
    }

    if (c.wantDive && c.role === 'hunter' && hasSkill(c.loadout, 'dive') && c.stunT <= 0 && c.state !== 'dive' && c.state !== 'ragdoll') {
      startDive(world, c);
      c.wantDive = false;
    }

    if (c.wantSlide && c.onGround && c.stunT <= 0 && c.state !== 'slide' && c.state !== 'roll') {
      startSlide(c);
    }
    if ((c.wantRoll || c.wantSlide) && !c.onGround && c.rollWindow <= 0 && c.vy > 200) {
      // pre-roll in air: arms the landing window longer
      c.wantRoll = true;
    }

    // horizontal control — no instant direction change
    if (c.stunT <= 0 && c.state !== 'slide' && c.state !== 'wallrun' && !c.hanging) {
      const target = (c.sprinting ? maxV : MAX_SPEED);
      const ax = c.onGround ? accel : AIR_ACCEL;
      if (c.vx < target) c.vx += ax * dt;
      if (c.vx > target + 20) c.vx -= (c.onGround ? fric * 2 : AIR_ACCEL) * dt;
    }
    if (c.state === 'slide') {
      c.vx -= (wet ? SLIDE_FRICTION * 0.45 : SLIDE_FRICTION) * dt;
      if (c.vx < 140 || c.stateT > (wet ? 0.95 : 0.58)) {
        c.state = 'run';
        standUp(c);
      }
    }
    if (c.state === 'wallrun') {
      c.wallT -= dt;
      c.vy = Math.min(c.vy, -80);
      c.vy += G * 0.25 * dt;
      c.x = (c.wall ? c.wall.x - c.w + 2 : c.x);
      if (c.wallT <= 0 || c.jumpBuf > 0 && c.stateT > 0.12) {
        if (c.jumpBuf > 0) { c.vy = -520; c.vx = Math.max(c.vx, 280); }
        c.state = 'jump';
        c.wall = 0;
        c.jumpBuf = 0;
      }
    }

    // gravity
    if (!c.onGround && c.state !== 'wallrun' && !c.hanging) {
      c.vy += G * dt;
      c.airTime += dt;
    } else if (c.hanging) {
      c.vy = 0;
      c.vx *= 0.4;
      if (c.jumpBuf > 0) jumpImpulse(c, world, 'jump');
      if (!c.wantHold && c.stateT > 0.15) { c.hanging = false; c.ledge = null; }
    }

    // integrate
    let nx = c.x + c.vx * dt;
    let ny = c.y + c.vy * dt;

    // face walls
    const hits = solidAt(world, nx, ny, c.w, c.h);
    let landed = false;
    let impact = 0;
    for (const h of hits) {
      if (h.wall && c.state === 'wallrun') continue;
      const prevFeet = c.y + c.h;
      const nextFeet = ny + c.h;
      const wasAbove = prevFeet <= h.y + 10 || (c.vy >= 0 && prevFeet <= h.y + 24);
      if (wasAbove && nextFeet >= h.y && nx + c.w > h.x + 4 && nx < h.x + h.w - 4 && c.vy >= -20) {
        ny = h.y - c.h;
        impact = c.vy;
        c.vy = 0;
        landed = true;
        c.lastPlat = h.obstacle ? c.lastPlat : h;
        if (h.pipe) {
          if (c.state === 'slide' || c.h <= c.slideH + 2) {
            landed = false;
            continue;
          }
          // overhead bar: bump, don't stand on it
          if (c.y + 10 < h.y + h.h && c.vy < 200) {
            nx = h.x - c.w - 1;
            c.vx *= 0.35;
            stumble(world, c, 0.35);
          }
          landed = false;
          continue;
        }
        if (h.gate && c.state !== 'slide' && c.h > 30) {
          nx = h.x - c.w - 1;
          c.vx *= 0.15;
          stumble(world, c, 0.6);
          world.events.push({ type: 'gate-hit' });
          landed = false;
          c.vy = 0;
        }
      } else if (h.obstacle) {
        const o = h.obstacle;
        const wide = o.w >= 72;
        const vaulting = c.state === 'vault' || c.state === 'kong' || c.vaultT > 0;
        if (vaulting && (!wide || c.state === 'kong')) {
          // clear it
          continue;
        }
        // clip
        if (nx + c.w > o.x && c.x + c.w <= o.x + 8 && c.vy >= -10 && (c.y + c.h > o.y - o.h + 8)) {
          nx = o.x - c.w - 1;
          c.vx *= 0.2;
          stumble(world, c, 0.55);
        }
      } else if (h.wall && c.state !== 'wallrun') {
        if (nx + c.w > h.x && c.x + c.w <= h.x + 6 && c.vy > -200) {
          nx = h.x - c.w - 1;
          c.vx *= 0.3;
        }
      } else if (h.gate && c.state !== 'slide') {
        if (nx + c.w > h.x && c.x + c.w <= h.x + 8) {
          nx = h.x - c.w - 1;
          c.vx *= 0.2;
          stumble(world, c, 0.5);
        }
      }
    }

    // small step-up (kerb / roof lip)
    if (!landed && c.stunT <= 0) {
      const feet = (c.onGround ? c.y + c.h : ny + c.h);
      for (const h of hits) {
        if (h.pipe || h.gate || h.wall || h.obstacle) continue;
        const lip = h.y;
        if (nx + c.w > h.x && c.x + c.w <= h.x + 12 && lip < feet && lip > feet - 34 && (c.onGround || c.vy >= 0)) {
          ny = lip - c.h;
          nx = c.x + Math.max(c.vx * 0.016, 4);
          c.vy = Math.min(c.vy, 0);
          landed = true;
          c.lastPlat = h;
          break;
        }
      }
    }

    c.x = nx;
    c.y = ny;

    if (landed) {
      const wasAir = !c.onGround;
      c.onGround = true;
      c.coyote = COYOTE;
      c.airTime = 0;
      if (wasAir) {
        c.lastImpact = impact;
        const hard = impact >= HARD_LAND;
        const huge = impact >= HUGE_LAND;
        if ((c.wantRoll || c.wantSlide) && (hard || c.wantRoll) && hasSkill(c.loadout, 'roll')) {
          c.state = 'roll';
          c.stateT = 0;
          c.wantRoll = false;
          c.wantSlide = false;
          standUp(c);
          if (huge) c.vx *= 0.92;
          style(world, c, 'roll', huge ? 22 : 14);
          world.events.push({ type: 'roll' });
        } else if (hard) {
          stumble(world, c, huge ? 1 : 0.6);
          world.events.push({ type: 'hard-land' });
        } else {
          if (c.state === 'jump' || c.state === 'precision' || c.state === 'vault' || c.state === 'kong' || c.state === 'dive') {
            c.state = 'run';
            standUp(c);
          }
          world.events.push({ type: 'land', role: c.role });
        }
        if (c.state === 'precision' && c.lastPlat && (c.lastPlat.tags || []).indexOf('precision') >= 0) {
          style(world, c, 'precision', 40);
          c.vx *= 1.08;
        }
        // roll window after any hard-ish landing if they didn't already roll
        if (hard && c.state !== 'roll') c.rollWindow = ROLL_WINDOW;
      }
    } else {
      const feet = c.y + c.h;
      const sup = supportUnder(world, c.x + c.w / 2, feet + 2, c.w);
      if (sup && Math.abs(feet - sup.y) < 18 && c.vy >= 0) {
        const wasAir = !c.onGround;
        c.y = sup.y - c.h;
        c.onGround = true;
        c.lastPlat = sup;
        c.coyote = COYOTE;
        c.vy = 0;
        if (wasAir && (c.state === 'jump' || c.state === 'precision' || c.state === 'vault' || c.state === 'kong' || c.state === 'dive' || c.state === 'wallrun')) {
          c.state = 'run';
          standUp(c);
        }
      } else {
        if (c.onGround) c.coyote = COYOTE;
        c.onGround = false;
        if (c.coyote > 0) c.coyote -= dt;
        // ledge catch
        if (c.vy > 80 && c.wantHold) {
          for (const p of platforms(world)) {
            const lip = p.x;
            if (c.x + c.w > lip - 8 && c.x + c.w < lip + 18 && c.y + 10 < p.y && c.y + c.h > p.y - 6) {
              c.hanging = true;
              c.ledge = p;
              c.y = p.y - 12;
              c.vy = 0;
              c.vx = 0;
              c.state = 'hang';
              c.stateT = 0;
              break;
            }
            const lipR = p.x + p.w;
            if (c.x < lipR + 8 && c.x > lipR - 18 && c.y + 10 < p.y && c.y + c.h > p.y - 6) {
              c.hanging = true;
              c.ledge = p;
              c.y = p.y - 12;
              c.vy = 0;
              c.state = 'hang';
              break;
            }
          }
        }
      }
    }

    if (c.onGround && (c.state === 'jump' || c.state === 'precision') && c.stateT > 0.2 && c.vy >= 0) { c.state = 'run'; standUp(c); }
    if (c.state === 'roll' && c.stateT > 0.38) { c.state = 'run'; standUp(c); }
    if (c.state === 'stumble' && c.stunT <= 0) {
      c.state = 'run';
      standUp(c);
      if (c.vx < 120) c.vx = 140;
    }
    if ((c.state === 'vault' || c.state === 'kong') && c.onGround && c.stateT > 0.2) { c.state = 'run'; standUp(c); }
    if (c.state === 'dive' && c.onGround) {
      c.diving = false;
      stumble(world, c, 0.7);
    }

    if (c.y > 720) {
      if (c.role === 'hunter') {
        // Hunter respawns on a roof behind the runner so the chase stays alive.
        const targetX = Math.max(40, (world.runner.x || 200) - 320);
        let plat = supportUnder(world, targetX, 0, 40);
        const plats = platforms(world);
        if (!plat) {
          plat = plats.find((p) => targetX >= p.x && targetX <= p.x + p.w) || plats[0];
        }
        if (plat) {
          c.x = Math.min(Math.max(targetX, plat.x + 8), plat.x + plat.w - c.w - 8);
          c.y = plat.y - c.standingH;
          c.h = c.standingH;
          c.vx = Math.max(200, (world.runner.vx || 200) * 0.7);
          c.vy = 0;
          c.onGround = true;
          c.ragdoll = null;
          c.downed = false;
          c.state = 'run';
          c.stunT = 0.15;
          c.lastPlat = plat;
          world.events.push({ type: 'hunter-recover' });
        }
      } else {
        c.downed = true;
        beginRagdoll(c);
        world.events.push({ type: 'fall', role: c.role });
        world.shake = Math.max(world.shake, 10);
      }
    }

    // run cycle
    if (c.onGround && c.state === 'run') c.phase += c.vx * dt * 0.045;
    c.wantVault = false;
    c.wantWall = false;
    c.wantKong = false;
    c.wantPrec = false;
    c.wantRoll = c.wantRoll && c.rollWindow > 0;

    // scarf
    stepScarf(c, dt);
  }

  function stepScarf(c, dt) {
    if (!c.scarf || !c.scarf.length) initScarf(c);
    let ax = c.x + 2, ay = c.y + 10;
    for (let i = 0; i < c.scarf.length; i++) {
      const s = c.scarf[i];
      const tx = ax - (10 + i * 6) - c.vx * 0.01;
      const ty = ay + 6 + Math.sin(c.phase * 2 + i) * 2;
      s.vx += (tx - s.x) * 18 * dt;
      s.vy += (ty - s.y) * 18 * dt + 40 * dt;
      s.vx *= 0.82; s.vy *= 0.82;
      s.x += s.vx * dt * 60 * 0.4;
      s.y += s.vy * dt * 60 * 0.4;
      ax = s.x; ay = s.y;
    }
  }

  function tryCatch(world) {
    const r = world.runner, h = world.hunter;
    if (r.caught || r.downed || h.downed) return;
    const dx = (r.x + r.w / 2) - (h.x + h.w / 2);
    const dy = (r.y + r.h / 2) - (h.y + h.h / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const diving = h.state === 'dive' || h.diving;
    const range = diving ? DIVE_R : CATCH_R;
    const inReach = dist < range && Math.abs(dy) < (diving ? 50 : 36);

    if (h.wantGrab || diving) {
      if (inReach && (h.wantGrab || diving)) {
        // counters: slide dodges grab (not dive); roll dodges dive
        if (!diving && r.state === 'slide' && hasSkill(r.loadout, 'slide')) {
          world.nearMiss = 0.7;
          world.scale = 0.35;
          world.slowMo = 0.55;
          world.events.push({ type: 'near-miss', why: 'slide-under-grab' });
          style(world, r, 'near-miss', 40);
          h.wantGrab = false;
          h.grabT = 0.4;
          return;
        }
        if (diving && r.state === 'roll' && hasSkill(r.loadout, 'roll')) {
          world.nearMiss = 0.7;
          world.scale = 0.35;
          world.slowMo = 0.55;
          world.events.push({ type: 'near-miss', why: 'roll-under-dive' });
          style(world, r, 'near-miss', 50);
          return;
        }
        r.caught = true;
        beginRagdoll(r);
        h.state = 'grab';
        h.stateT = 0;
        h.vx *= 0.3;
        world.shake = 14;
        world.scale = 0.42;
        world.slowMo = 0.7;
        world.events.push({ type: 'catch' });
        world.over = true;
        world.result = 'catch';
        return;
      }
      if (h.wantGrab && dist < range + 22 && !inReach) {
        // reached but missed
        world.nearMiss = 0.65;
        world.scale = 0.32;
        world.slowMo = 0.5;
        world.events.push({ type: 'near-miss', why: 'grab-whiff' });
        style(world, r, 'near-miss', 28);
        h.grabT = 0.35;
      }
      h.wantGrab = false;
    } else if (inReach && dist < 16 && r.onGround && h.onGround && r.state !== 'slide') {
      // body bump close — not an auto catch; hunter must grab
    }
  }

  function spawnDebris(world, x, y, w) {
    for (let i = 0; i < 10; i++) {
      world.debris.push({
        x: x + Math.random() * w,
        y: y - 8,
        w: 10 + Math.random() * 22,
        h: 8 + Math.random() * 16,
        vx: (Math.random() - 0.4) * 180,
        vy: -80 - Math.random() * 220,
        rot: Math.random() * 4,
        vr: (Math.random() - 0.5) * 8,
        life: 2.2 + Math.random(),
      });
    }
  }

  function dropCollapse(world) {
    if (world.cooldown.collapse > 0) return false;
    const r = world.runner;
    const slots = world.track.collapse || [];
    let slot = null;
    for (const s of slots) {
      if (s.x > r.x + 80 && s.x < r.x + 620) { slot = s; break; }
    }
    if (!slot) return false;
    const plat = platforms(world).find((p) => sOverlap(p, slot)) || platforms(world).find((p) => p.x <= slot.x && p.x + p.w >= slot.x + (slot.w || 200));
    const y = plat ? plat.y : 250;
    const w = slot.w || 240;
    world.collapsed.push({ x: slot.x, y, w, t: 0 });
    spawnDebris(world, slot.x, y, w);
    world.shake = 16;
    world.cooldown.collapse = 8;
    world.events.push({ type: 'collapse', x: slot.x });
    return true;
  }
  function sOverlap(p, slot) {
    return !(p.x + p.w < slot.x || p.x > slot.x + (slot.w || 200));
  }

  function dropGate(world) {
    if (world.cooldown.gate > 0) return false;
    if (!hasSkill(world.hunter.loadout, 'gate')) return false;
    const r = world.runner;
    const slots = world.track.gateSlots || [];
    let slot = null;
    for (const s of slots) {
      if (s.x > r.x + 60 && s.x < r.x + 700) { slot = s; break; }
    }
    if (!slot) {
      // free-place a gate a bit ahead on current roof
      const ahead = r.x + 280;
      const p = supportUnder(world, ahead, r.y + r.h + 8, 20);
      if (!p) return false;
      slot = { x: clamp(ahead, p.x + 40, p.x + p.w - 40), y: p.y, w: 22, h: 120 };
    }
    world.gates.push({ x: slot.x, y: slot.y, w: slot.w || 22, h: slot.h || 120, open: 1, closing: true });
    world.cooldown.gate = 7;
    world.events.push({ type: 'gate', x: slot.x });
    return true;
  }

  function stepWorld(world, dt) {
    if (world.over && world.slowMo <= 0) return;
    const scaled = dt * (world.scale || 1);
    world.elapsed += scaled;
    if (!world.over) world.t = Math.max(0, world.t - scaled);
    if (world.slowMo > 0) {
      world.slowMo -= dt;
      if (world.slowMo <= 0) world.scale = 1;
    }
    if (world.shake > 0) world.shake *= 0.86;
    if (world.cooldown.gate > 0) world.cooldown.gate -= scaled;
    if (world.cooldown.collapse > 0) world.cooldown.collapse -= scaled;
    world.boost = Math.max(0, world.boost - scaled * 0.04);

    for (const g of world.gates) {
      if (g.closing) g.open = Math.max(0, g.open - scaled * 1.8);
    }
    for (const d of world.debris) {
      d.vy += G * 0.8 * scaled;
      d.x += d.vx * scaled;
      d.y += d.vy * scaled;
      d.rot += d.vr * scaled;
      d.life -= scaled;
    }
    world.debris = world.debris.filter((d) => d.life > 0);

    stepChar(world, world.runner, scaled);
    stepChar(world, world.hunter, scaled);
    tryCatch(world);

    if (!world.over) {
      if (world.runner.downed) {
        world.over = true;
        world.result = 'catch';
        world.events.push({ type: 'catch', why: 'fall' });
      } else if (world.runner.x + world.runner.w >= world.finishX) {
        world.over = true;
        world.result = 'escape';
        world.events.push({ type: 'escape' });
      } else if (world.t <= 0.0001) {
        world.over = true;
        world.result = 'escape';
        world.events.push({ type: 'escape', why: 'timer' });
      }
    }
  }

  function snapshot(world) {
    return clone({
      t: world.t, elapsed: world.elapsed, scale: world.scale, shake: world.shake, slowMo: world.slowMo,
      style: world.style, boost: world.boost, over: world.over, result: world.result, nearMiss: world.nearMiss,
      cooldown: world.cooldown, gates: world.gates, collapsed: world.collapsed, debris: world.debris,
      runner: slim(world.runner), hunter: slim(world.hunter),
    });
  }
  function slim(c) {
    return {
      role: c.role, x: c.x, y: c.y, vx: c.vx, vy: c.vy, w: c.w, h: c.h,
      onGround: c.onGround, state: c.state, stateT: c.stateT, phase: c.phase,
      stamina: c.stamina, sprinting: c.sprinting, hanging: c.hanging,
      caught: c.caught, downed: c.downed, facing: c.facing,
      scarf: c.scarf, ragdoll: c.ragdoll, trick: c.trick, loadout: c.loadout,
    };
  }

  const api = {
    DT, G, MAX_SPEED, SPRINT_MAX, CHAR_W, CHAR_H,
    createWorld, stepWorld, applyInput, dropGate, dropCollapse,
    snapshot, clone, hasSkill, beginRagdoll, platforms, supportUnder,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChasePhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
