/**
 * CHASE LINE v2 sim. Kinematic parkour controller in the style of Vector:
 *  - real-ish scale (29 px per metre, 1.8 m body), ~9 m/s sprint, gravity x1.75
 *  - solid swept AABB collision, X then Y, against every solid; nobody overlaps geometry
 *  - interaction zones (edge, vault, climb, duck, wall-run) that turn a swipe into a
 *    canned move whose root path and hand/foot contact points snap to the geometry
 *  - a missed swipe becomes a bump: stumble, slow recovery move, hunter gains
 * Pure JS, no DOM. Fixed timestep.
 */
(function (root) {
  const DT = 1 / 60;
  const PPM = 29;                 // pixels per metre
  const G = 500;                  // ~9.8 m/s^2 x 1.75
  const RUN_V = 261;              // 9 m/s
  const MAX_SPEED = RUN_V;
  const SPRINT_MAX = RUN_V * 1.08;
  const CHAR_W = 22;
  const CHAR_H = 52;              // 1.8 m
  const SLIDE_H = 24;
  const TUCK_H = 30;
  const CROUCH_H = 40;
  const JUMP_CAP = 236;           // max take-off vy for a normal jump (apex ~1.9 m)
  const PREC_CAP = 330;
  const HOP_V = 205;
  const VAULT_MAX = 48;           // obstacles at or under this are vaults
  const MANTLE_MAX = 60;          // ~2 m
  const CLIMB_MAX = 142;          // ~4.9 m with a run-up kick
  const HAND_REACH = 32;          // above head while airborne
  const ROLL_DROP = 87;           // 3 m
  const EDGE_ZONE = 118;
  const PERFECT = 34;
  const FALL_Y = 760;
  const CATCH_R = 30;
  const DIVE_R = 70;
  const EPS = 0.01;
  const CYCLE = 150;              // world px per run cycle: 2.3 drawn body heights per two strides (Vector)
  const BUF_UP = 0.42;            // swipe buffers: an early swipe queues into the next move
  const BUF_DOWN = 0.32;
  // hunter trap windows (distance from the runner's chest to the trap site, world px)
  const TRAP = {
    gate: { charge: 760, hi: 240, peakHi: 190, peakLo: 110, lo: 78 },
    collapse: { charge: 900, hi: 330, peakHi: 260, peakLo: 150, lo: 96 },
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  const BASIC = ['jump', 'slide', 'roll', 'vault', 'climb'];
  function hasSkill(loadout, id) {
    if (BASIC.indexOf(id) >= 0) return true;
    return !loadout || loadout.indexOf(id) >= 0;
  }

  // ---------------------------------------------------------------- geometry

  /** Normalise a track into solid geometry. Fixes legacy overlaps so the lower
   *  route never runs into the body of an upper roof:
   *   - a lower roof that ends under an upper building is trimmed to its wall (climb)
   *   - an upper roof over a lower route becomes a slab with headroom (pass under) */
  function buildGeo(track) {
    const plats = track.platforms.map((p, i) => ({ x: p.x, y: p.y, w: p.w, h: p.h || 170, tags: (p.tags || []).slice(), id: 'p' + i, kind: 'plat' }));
    const overX = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1;
    for (const A of plats) for (const B of plats) {
      if (A === B || !(B.y > A.y + 10) || !overX(A, B)) continue;
      if (B.x < A.x - 4 && B.x + B.w <= A.x + A.w + 10) { B.w = A.x - B.x; B.trimmed = true; }
    }
    for (const A of plats) for (const B of plats) {
      if (A === B || !(B.y > A.y + 10) || !overX(A, B)) continue;
      const maxH = B.y - A.y - (CHAR_H + 12);
      if (A.h > maxH) A.h = Math.max(16, maxH);
      A.slab = true; // something runs underneath: draw it as a deck on stilts, not a building
    }
    const obstacles = (track.obstacles || []).map((o, i) => ({ x: o.x, y: o.y - o.h, w: o.w, h: o.h, base: o.y, type: o.type, tags: (o.tags || []).slice(), id: 'o' + i, kind: 'obst' }));
    const pipes = (track.pipes || []).map((p, i) => ({ x: p.x, y: p.y, w: p.w, h: p.h, id: 'pi' + i, kind: 'pipe' }));
    const walls = (track.walls || []).map((wl, i) => {
      const r = { x: wl.x, y: wl.y, w: wl.w || 18, h: wl.h, tags: (wl.tags || []).slice(), id: 'w' + i, kind: 'wall' };
      for (const p of plats) {
        if (r.x < p.x + p.w && p.x < r.x + r.w && p.y >= r.y + 4) {
          const maxBottom = p.y - CHAR_H - 8;
          if (r.y + r.h > maxBottom) r.h = Math.max(30, maxBottom - r.y);
        }
      }
      return r;
    });
    // the exit: a door in the face of a tall block that closes the route, so nobody runs past it
    let exit = null;
    if (track.finishX) {
      const fp = plats.filter((p) => p.x <= track.finishX - 40 && p.x + p.w >= track.finishX + 40).sort((a, b) => a.y - b.y)[0]
        || plats.slice().sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
      if (fp) {
        const x = track.finishX;
        exit = { x, y: fp.y, doorX: x, doorW: 34, doorH: 72, plat: fp.id,
          wall: { x: x + 36, y: fp.y - 900, w: Math.max(260, fp.x + fp.w - (x + 36) + 160), h: 900, kind: 'exit', id: 'exit', tags: [] } };
      }
    }
    return { plats, obstacles, pipes, walls, exit };
  }

  function livePlatforms(world) {
    if (world._liveKey === world.collapsed.length && world._live) return world._live;
    let out = world.geo.plats.slice();
    for (const hole of world.collapsed) {
      const next = [];
      for (const p of out) {
        if (Math.abs(p.y - hole.y) > 8 || hole.x >= p.x + p.w || hole.x + hole.w <= p.x) { next.push(p); continue; }
        if (hole.x > p.x + 8) next.push(Object.assign({}, p, { w: hole.x - p.x, id: p.id + 'a' }));
        if (hole.x + hole.w < p.x + p.w - 8) next.push(Object.assign({}, p, { x: hole.x + hole.w, w: p.x + p.w - (hole.x + hole.w), id: p.id + 'b' }));
      }
      out = next;
    }
    world._live = out;
    world._liveKey = world.collapsed.length;
    return out;
  }
  function platforms(world) { return livePlatforms(world); }

  function gateRect(g) {
    // a steel shutter that drops from above and stops 30 px off the floor (slide under it)
    const top = g.y - g.h - 10;
    const bottom = g.y - 30 - 92 * g.open;
    return { x: g.x, y: top, w: g.w, h: Math.max(4, bottom - top), kind: 'gate', id: 'g' + g.x };
  }

  function obstacleGone(world, o) {
    for (const hole of world.collapsed) if (Math.abs(o.base - hole.y) < 8 && o.x + o.w > hole.x - 6 && o.x < hole.x + hole.w + 6) return true;
    return false;
  }

  function solids(world) {
    const out = livePlatforms(world).slice();
    for (const o of world.geo.obstacles) if (!obstacleGone(world, o)) out.push(o);
    for (const p of world.geo.pipes) out.push(p);
    for (const w of world.geo.walls) out.push(w);
    if (world.geo.exit) out.push(world.geo.exit.wall);
    for (const g of world.gates) out.push(gateRect(g));
    return out;
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
  }
  function boxFree(world, x, y, w, h, list) {
    const box = { x, y, w, h };
    for (const s of (list || solids(world))) if (overlaps(box, s)) return false;
    return true;
  }

  /** Swept move on one axis. Returns the solid that stopped us, if any. */
  function moveX(world, c, dx, list) {
    if (!dx) return null;
    list = list || world._solids;
    let nx = c.x + dx, hit = null;
    for (const s of list) {
      if (c.y + c.h <= s.y + EPS || c.y >= s.y + s.h - EPS) continue;
      if (dx > 0 && c.x + c.w <= s.x + 0.05 && nx + c.w > s.x) { nx = s.x - c.w; hit = s; }
      else if (dx < 0 && c.x >= s.x + s.w - 0.05 && nx < s.x + s.w) { nx = s.x + s.w; hit = s; }
    }
    c.x = nx;
    return hit;
  }
  function moveY(world, c, dy, list) {
    if (!dy) return null;
    list = list || world._solids;
    let ny = c.y + dy, hit = null;
    for (const s of list) {
      if (c.x + c.w <= s.x + EPS || c.x >= s.x + s.w - EPS) continue;
      if (dy > 0 && c.y + c.h <= s.y + 0.05 && ny + c.h > s.y) { ny = s.y - c.h; hit = s; }
      else if (dy < 0 && c.y >= s.y + s.h - 0.05 && ny < s.y + s.h) { ny = s.y + s.h; hit = s; }
    }
    c.y = ny;
    return hit;
  }

  /** Solid whose top the character is standing on (feet within 0.6 px, x overlap >= 2 px). */
  function supportOf(world, c, list) {
    list = list || world._solids;
    const feet = c.y + c.h;
    let best = null;
    for (const s of list) {
      if (Math.abs(feet - s.y) > 0.6) continue;
      if (c.x + c.w <= s.x + 2 || c.x >= s.x + s.w - 2) continue;
      if (!best || s.x + s.w > best.x + best.w) best = s;
    }
    return best;
  }

  function supportUnder(world, cx, feet, hw) {
    let best = null;
    const half = (hw || CHAR_W) * 0.5;
    for (const p of livePlatforms(world)) {
      if (cx + half < p.x + 2 || cx - half > p.x + p.w - 2) continue;
      if (feet >= p.y - 8 && feet <= p.y + 22) if (!best || p.y < best.y) best = p;
    }
    return best;
  }

  /** Right-hand end of the continuous floor the character stands on. */
  function runwayEnd(world, s, list) {
    let end = s.x + s.w;
    let guard = 0, changed = true;
    while (changed && guard++ < 8) {
      changed = false;
      for (const o of list) {
        if (Math.abs(o.y - s.y) <= 2 && o.x <= end + 18 && o.x + o.w > end + 1 && o.kind !== 'gate') { end = o.x + o.w; changed = true; }
      }
    }
    return end;
  }

  // ---------------------------------------------------------------- characters

  function makeChar(role, x, y, loadout) {
    return {
      role, x, y, vx: 0, vy: 0, w: CHAR_W, h: CHAR_H,
      onGround: false, coyote: 0, jumpBuf: 0, downBuf: 0, rollBuf: 0,
      state: 'run', stateT: 0,
      facing: 1, stamina: 1, sprinting: false,
      move: null, auto: null,
      airPeak: y + CHAR_H, lastTake: 0,
      phase: 0, dist: 0,
      caught: false, downed: false, hanging: false,
      ragdoll: null, scarf: [], tie: [],
      trick: '', loadout: loadout ? loadout.slice() : [],
      wantGrab: false, wantSprint: false, wantDive: false, wantHold: false,
      progX: x, progT: 0, stuckT: 0, contactT: 0, grabT: 0, grabAnim: 0,
      land: 0, lean: 0,
    };
  }

  function initCloth(c) {
    c.scarf = []; c.tie = [];
    for (let i = 0; i < 5; i++) c.scarf.push({ x: c.x - i * 4, y: c.y + 18 + i * 3 });
    for (let i = 0; i < 3; i++) c.tie.push({ x: c.x + c.w / 2 + 2, y: c.y + 12 + i * 3 });
  }

  function createWorld(track, opts) {
    opts = opts || {};
    const geo = buildGeo(track);
    const w = {
      track, geo, wet: !!track.wet, finishX: track.finishX,
      t: 60, elapsed: 0, scale: 1, shake: 0, slowMo: 0,
      debris: [], gates: [], collapsed: [], dust: [],
      runner: null, hunter: null,
      style: 0, boost: 0, events: [], over: false, result: null, nearMiss: 0,
      cooldown: { gate: 0, collapse: 0, sprintR: 0, sprintH: 0 },
      diff: opts.diff || 'normal',
    };
    const first = geo.plats[0];
    const y0 = (first ? first.y : 260) - CHAR_H;
    w.runner = makeChar('runner', 380, y0, opts.runnerLoadout || ['jump', 'slide', 'roll', 'vault']);
    w.hunter = makeChar('hunter', 40, y0, opts.hunterLoadout || ['sprint', 'grab', 'collapse']);
    w.runner.vx = RUN_V * 0.55; w.hunter.vx = RUN_V * 0.5;
    w._solids = solids(w);
    for (const c of [w.runner, w.hunter]) { settle(w, c); initCloth(c); }
    w.trapSites = buildTrapSites(w);
    w.traps = { gate: trapState(w, 'gate'), collapse: trapState(w, 'collapse') };
    return w;
  }

  // ---------------------------------------------------------------- hunter trap sites
  /** Fixed places on the route where a trap can be sprung. The HUD charges each
   *  trap button as the runner closes on the next site; it is live only inside the
   *  site's window and goes dark once the runner is past. */
  function buildTrapSites(world) {
    const out = [];
    const plats = world.geo.plats;
    const fin = world.finishX || 1e9;
    for (const slot of (world.track.collapse || [])) {
      const w = Math.min(slot.w || 160, 165);
      const plat = plats.find((p) => p.x + 30 < slot.x && p.x + p.w > slot.x + w + 30);
      if (plat) out.push({ kind: 'collapse', x: slot.x, w, y: plat.y, used: false, id: 'c' + slot.x });
    }
    const clear = (x, floor) => {
      for (const s of world._solids) if (s.y < floor && s.x < x + 130 && s.x + s.w > x - 110 && s.y + s.h > floor - 140) return false;
      return true;
    };
    const gates = [];
    for (const sl of (world.track.gateSlots || [])) {
      const p = supportUnder(world, sl.x + 10, sl.y, 20);
      gates.push({ x: sl.x, y: p ? p.y : sl.y, w: sl.w || 18, h: sl.h || 120 });
    }
    // auto sites on long flat roofs: a clear stretch with head room and no edge nearby
    for (const p of plats) {
      if (p.slab || p.w < 320) continue;
      for (let x = p.x + 170; x < p.x + p.w - 150; x += 520) {
        if (x > fin - 420 || x < 900) continue;
        if (!clear(x, p.y)) continue;
        if (out.some((c) => Math.abs(c.x - x) < 360)) continue;
        if (plats.some((q) => q !== p && q.y < p.y && q.y > p.y - 300 && q.x < x + 60 && q.x + q.w > x - 60)) continue;
        gates.push({ x, y: p.y, w: 18, h: 120, auto: true });
      }
    }
    gates.sort((a, b) => a.x - b.x);
    let lastX = -1e9;
    for (const g of gates) {
      if (g.x - lastX < 650) continue;
      lastX = g.x;
      out.push({ kind: 'gate', x: g.x, y: g.y, w: g.w, h: g.h, used: false, id: 'g' + Math.round(g.x) });
    }
    return out.sort((a, b) => a.x - b.x);
  }

  /** Charge state of one trap kind for the HUD and the AI. */
  function trapState(world, kind) {
    const W = TRAP[kind], r = world.runner;
    const prev = world.traps && world.traps[kind];
    const owned = hasSkill(world.hunter.loadout, kind);
    const cd = Math.max(0, world.cooldown[kind] || 0);
    const front = r.x + r.w;
    // the next site the runner has not yet passed on (roughly) its level
    let site = null;
    for (const st of world.trapSites || []) {
      if (st.kind !== kind || st.used) continue;
      const d = st.x - front;
      if (d < W.lo) continue;
      if (Math.abs(st.y - (r.y + r.h)) > 260 && d < W.charge) continue;
      site = st; break;
    }
    const st = { kind, owned, cd, site: site ? site.id : null, x: site ? site.x : null, y: site ? site.y : null, w: site ? (site.w || 18) : 0,
      d: site ? site.x - front : null, charge: 0, ready: false, peak: false, missedT: prev ? Math.max(0, (prev.missedT || 0) - DT) : 0 };
    if (site) {
      const d = st.d;
      st.charge = d > W.hi ? clamp(1 - (d - W.hi) / (W.charge - W.hi), 0, 1) : 1;
      st.ready = owned && cd <= 0 && d <= W.hi && d >= W.lo && !world.over;
      st.peak = st.ready && d <= W.peakHi && d >= W.peakLo;
    }
    // the runner just went past the site we were charging for: flag the miss for the HUD
    if (prev && prev.site && prev.site !== st.site && prev.charge >= 1 && !(world.trapSites.find((x) => x.id === prev.site) || {}).used) st.missedT = 0.7;
    return st;
  }

  function settle(world, c) {
    const list = solids(world);
    const s = list.filter((p) => c.x + c.w > p.x + 2 && c.x < p.x + p.w - 2 && p.y >= c.y + c.h - 30).sort((a, b) => a.y - b.y)[0];
    if (s) { c.y = s.y - c.h; c.onGround = true; c.airPeak = s.y; }
  }

  function style(world, c, kind, pts) {
    if (c.role !== 'runner') return;
    world.style += pts;
    world.boost = clamp(world.boost + pts / 120, 0, 1);
    world.events.push({ type: 'style', kind, pts });
  }

  function setH(world, c, h) {
    if (c.h === h) return true;
    const ny = c.y + c.h - h;
    if (h > c.h && !boxFree(world, c.x, ny, c.w, h, world._solids)) return false;
    c.y = ny; c.h = h;
    return true;
  }

  function targetSpeed(world, c) {
    if (c.role === 'runner') return RUN_V * (1 + 0.06 * world.boost);
    const r = world.runner;
    const lead = r.x - c.x;
    // shadow the runner: a touch slower when close, catches up when left far behind
    let f = lead < 260 ? 0.965 : 0.965 + clamp((lead - 260) / 3000, 0, 0.09);
    if (c.aiDiff === 'easy') f -= 0.03;
    if (c.aiDiff === 'hard') f += 0.008;
    let v = RUN_V * f;
    if (c.sprinting) v = Math.max(v, SPRINT_MAX);
    return v;
  }

  // ---------------------------------------------------------------- canned moves

  /** keys: [[u, x, y, ease], ...] in feet coordinates (centre x, feet y). */
  function startMove(world, c, type, keys, dur, opts) {
    opts = opts || {};
    c.move = {
      type, t: 0, dur: Math.max(0.12, dur), keys,
      h: opts.h || CROUCH_H, exitVx: opts.exitVx != null ? opts.exitVx : c.vx,
      hand: opts.hand || null, foot: opts.foot || null, after: opts.after || null,
      top: opts.top != null ? opts.top : null, faceX: opts.faceX != null ? opts.faceX : null,
      u: 0, fromAir: !!opts.fromAir,
    };
    c.state = 'move'; c.stateT = 0; c.onGround = false;
    c.trick = type;
    if (c.h !== c.move.h) { c.y = c.y + c.h - c.move.h; c.h = c.move.h; }
  }

  function samplePath(keys, u) {
    for (let i = 1; i < keys.length; i++) {
      if (u <= keys[i][0] || i === keys.length - 1) {
        const a = keys[i - 1], b = keys[i];
        const t = clamp((u - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
        const ease = b[3] || 'lin';
        const ty = ease === 'up' ? Math.sin(t * Math.PI / 2) : ease === 'down' ? 1 - Math.cos(t * Math.PI / 2) : smooth(t);
        const tx = ease === 'slowx' ? smooth(t) : ease === 'out' ? 1 - (1 - t) * (1 - t) : t;
        return { x: lerp(a[1], b[1], tx), y: lerp(a[2], b[2], ty) };
      }
    }
    const k = keys[keys.length - 1];
    return { x: k[1], y: k[2] };
  }

  function stepMove(world, c, dt) {
    const m = c.move;
    m.t += dt;
    m.u = clamp(m.t / m.dur, 0, 1);
    const p = samplePath(m.keys, m.u);
    const tx = p.x - c.w / 2, ty = p.y - c.h;
    const ox = c.x, oy = c.y;
    // vertical first when rising, horizontal first otherwise: paths are authored corner-safe
    if (ty < c.y) { moveY(world, c, ty - c.y); moveX(world, c, tx - c.x); }
    else { moveX(world, c, tx - c.x); moveY(world, c, ty - c.y); }
    c.vx = (c.x - ox) / dt; c.vy = (c.y - oy) / dt;
    c.dist += Math.abs(c.x - ox);
    const dev = Math.hypot(c.x - tx, c.y - ty);
    if (dev > 4) { endMove(world, c, true); return; }
    if (m.u >= 1) endMove(world, c, false);
  }

  function endMove(world, c, aborted) {
    const m = c.move;
    c.move = null;
    c.trick = '';
    c.vx = aborted ? Math.min(c.vx, m.exitVx * 0.5) : m.exitVx;
    c.vy = aborted ? 0 : Math.max(0, c.vy * 0.2);
    if (!aborted && m.after && m.after.kind === 'jump') {
      c.state = 'air'; c.onGround = false;
      c.vx = m.after.vx; c.vy = m.after.vy; c.airPeak = c.y + c.h;
      c.trick = 'jump';
      setH(world, c, TUCK_H + 8);
      return;
    }
    setH(world, c, CHAR_H) || setH(world, c, CROUCH_H) || setH(world, c, SLIDE_H);
    const s = supportOf(world, c);
    if (m.type === 'exit') { c.onGround = true; c.vx = 0; c.state = 'stand'; return; }
    if (s) { c.onGround = true; c.state = 'run'; c.land = 0.12; c.airPeak = s.y; }
    else { c.onGround = false; c.state = 'air'; c.airPeak = c.y + c.h; }
  }

  function moveVault(world, c, o, kind) {
    const fx0 = c.x + c.w / 2, g = c.y + c.h, top = o.y;
    const v = Math.max(170, c.vx);
    const xs = [fx0, o.x - 12, o.x + o.w + 12, o.x + o.w + 30];
    const total = xs[3] - xs[0];
    const u1 = Math.max(0.05, (xs[1] - xs[0]) / total), u2 = (xs[2] - xs[0]) / total;
    let mult = 1, exit = v, clear = 3;
    if (kind === 'kong') { mult = 1.1; exit = v * 1.06; clear = 2; }
    if (kind === 'stepvault') { mult = 0.78; exit = v * 0.9; clear = 4; }
    if (kind === 'climbover') { mult = 0.42; exit = Math.max(120, v * 0.55); clear = 4; }
    const keys = [[0, xs[0], g], [u1, xs[1], top - clear, 'up'], [u2, xs[2], top - clear], [1, xs[3], o.base != null ? o.base : g, 'down']];
    const hand = kind === 'kong' ? { x: o.x + Math.min(o.w * 0.45, 30), y: top } : { x: o.x + 7, y: top };
    startMove(world, c, kind, keys, total / (v * mult), { h: TUCK_H, exitVx: exit, hand, top, faceX: o.x });
    world.events.push({ type: 'vault', kong: kind === 'kong', role: c.role, kind });
    if (kind === 'kong') style(world, c, 'kong', 14);
    else if (kind === 'vault') style(world, c, 'vault', 8);
  }

  function moveClimb(world, c, S, opts) {
    opts = opts || {};
    const fx0 = c.x + c.w / 2, f0 = c.y + c.h, top = S.y;
    const rise = f0 - top;
    const face = S.x - c.w / 2 - 0.5;
    const v = Math.max(150, c.vx);
    let kind, dur, exit;
    if (opts.fromAir) { kind = 'ledge'; dur = 0.44 + rise * 0.0014; exit = Math.max(170, v * 0.82); }
    else if (rise <= MANTLE_MAX) { kind = 'mantle'; dur = opts.fast ? 0.36 : 0.55; exit = opts.fast ? v * 0.95 : v * 0.66; }
    else { kind = 'climb'; dur = (opts.fast ? 0.44 : 0.8) + rise * 0.0018; exit = opts.fast ? v * 0.88 : v * 0.55; }
    if (opts.scramble) { kind = 'climb'; dur = 1.1 + rise * 0.003; exit = 120; }
    const keys = [[0, fx0, f0]];
    if (fx0 < face - 0.5) keys.push([kind === 'mantle' ? 0.2 : 0.16, face, f0 - Math.min(rise * 0.25, 18), 'up']);
    keys.push([kind === 'mantle' ? 0.6 : 0.68, face, top - 1.5, 'up']);
    keys.push([0.86, S.x + 6, top - 1, 'slowx']);
    keys.push([1, S.x + 20, top, 'slowx']);
    startMove(world, c, kind, keys, dur, { h: CROUCH_H, exitVx: exit, hand: { x: S.x + 3, y: top }, foot: { x: S.x, y: top + Math.min(rise * 0.5, 40) }, top, faceX: S.x, fromAir: opts.fromAir });
    world.events.push({ type: 'climb', role: c.role, kind });
    if (opts.fast) style(world, c, kind, kind === 'climb' ? 12 : 6);
  }

  function moveWallrun(world, c, W) {
    const fx0 = c.x + c.w / 2, f0 = c.y + c.h;
    const face = W.x - c.w / 2 - 0.5;
    const v = Math.max(200, c.vx);
    const dest = livePlatforms(world).filter((p) => p.tags.indexOf('wallrun-dest') >= 0 && p.x > W.x - 120 && p.x < W.x + 420 && p.y < W.y + 90)
      .sort((a, b) => a.x - b.x)[0];
    const contactY = Math.min(f0 - 6, W.y + W.h - 2);
    const overX = W.x + W.w + c.w / 2 + 1.5;
    const keys = [[0, fx0, f0], [0.22, face, contactY, 'up'], [0.62, face, W.y - 2, 'up'], [0.8, overX, W.y - 16, 'up']];
    let after = null;
    if (dest && dest.x + 24 > overX) {
      const lx = Math.max(dest.x + 26, overX + 10);
      keys.push([1, lx, dest.y, 'down']);
    } else {
      after = { kind: 'jump', vx: v * 1.06, vy: -120 };
      keys[3][0] = 1;
    }
    const dist = (face - fx0) + (contactY - W.y) + 40;
    startMove(world, c, 'wallrun', keys, clamp(dist / (v * 1.1), 0.55, 1.05), { h: TUCK_H + 14, exitVx: v * 1.06, foot: { x: W.x, y: contactY }, hand: { x: W.x + 2, y: W.y }, top: W.y, faceX: W.x, after });
    world.events.push({ type: 'wallrun', role: c.role });
    style(world, c, 'wall-run', 18);
  }

  // ---------------------------------------------------------------- jump planning

  /** Simulate a jump arc against the geometry. Returns the solid we land on and where. */
  function simArc(world, list, fx, feet, vx, vy, maxT) {
    const c = { x: fx - CHAR_W / 2, y: feet - (TUCK_H + 8), w: CHAR_W, h: TUCK_H + 8 };
    const h = 1 / 90;
    let t = 0;
    while (t < (maxT || 2.2)) {
      vy += G * h;
      const bx = moveX(world, c, vx * h, list);
      if (bx) return { blocked: bx, x: c.x + c.w / 2, y: c.y + c.h, t };
      const by = moveY(world, c, vy * h, list);
      if (by) {
        if (vy > 0) return { land: by, x: c.x + c.w / 2, y: c.y + c.h, t };
        vy = 0;
      }
      if (c.y > FALL_Y) return { fall: true, t };
      t += h;
    }
    return { none: true };
  }

  function planJump(world, c, opts) {
    opts = opts || {};
    const list = world._solids;
    const fx = c.x + c.w / 2, feet = c.y + c.h;
    const v = Math.max(RUN_V * 0.7, c.vx);
    const canPrec = opts.precision;
    const ahead = livePlatforms(world).filter((p) => p.x + p.w > fx + 30 && p.x < fx + 420 && p.y > feet - 160 && p.y < feet + 300 && p !== opts.from);
    // rank: precision (if skilled) > higher/same roofs > lower roofs; nearer first
    const cand = ahead.filter((p) => canPrec || p.tags.indexOf('precision') < 0).map((p) => {
      let score = -p.x * 0.002 - Math.max(0, p.y - feet) * 0.01;
      if (p.tags.indexOf('precision') >= 0) score += 6;
      if (p.y <= feet + 12) score += 2;
      return { p, score };
    }).sort((a, b) => b.score - a.score);
    for (const { p } of cand) {
      const prec = p.tags.indexOf('precision') >= 0;
      const cap = prec ? PREC_CAP : JUMP_CAP;
      const lands = prec ? [p.x + p.w / 2] : [p.x + 30, p.x + 52, p.x + 85, p.x + 130];
      for (const lx of lands) {
        if (lx > p.x + p.w - 14 || lx <= fx + 20) continue;
        for (const vm of [1, 1.06, 1.12]) {
          const vxx = v * vm * (prec ? 1.04 : 1);
          const T = (lx - fx) / vxx;
          if (T > 1.3) continue;
          const dy = p.y - feet;
          const vy = (dy - 0.5 * G * T * T) / T;
          if (-vy > cap || vy > 40) continue;
          const r = simArc(world, list, fx, feet, vxx, Math.min(vy, -60), 1.6);
          if (r.land && r.land.id === p.id) return { vx: vxx, vy: Math.min(vy, -60), target: p, prec, landX: r.x };
        }
      }
    }
    return null;
  }

  function doJump(world, c, plan, kind) {
    c.state = 'air'; c.onGround = false;
    c.vx = plan.vx; c.vy = plan.vy;
    c.airPeak = c.y + c.h;
    c.coyote = 0; c.jumpBuf = 0;
    c.trick = kind || (plan.prec ? 'precision' : 'jump');
    c.jumpPlan = plan.target ? { x: plan.landX, y: plan.target.y } : null;
    c.lastTake = world.elapsed;
    setH(world, c, TUCK_H + 8);
    world.events.push({ type: 'jump', role: c.role, kind: c.trick });
  }

  // ---------------------------------------------------------------- zones

  /** What is the next actionable thing ahead of this character? */
  function zoneAhead(world, c, range) {
    range = range || 170;
    const list = world._solids;
    const fx = c.x + c.w / 2, feet = c.y + c.h, right = c.x + c.w;
    let best = null;
    function take(z) { if (!best || z.dist < best.dist) best = z; }
    for (const s of list) {
      const dx = s.x - right;
      if (dx < -0.5 || dx > range) continue;
      const blocksStand = s.y < feet - 0.6 && s.y + s.h > feet - CHAR_H + 0.6;
      if (!blocksStand) continue;
      const rise = feet - s.y;
      if (s.y + s.h <= feet - SLIDE_H - 1 && s.kind !== 'obst') {
        take({ kind: 'duck', s, dist: dx, active: dx <= 110 });
      } else if (s.kind === 'obst' && rise <= VAULT_MAX + 0.5) {
        const wide = s.w >= 72 || s.tags.indexOf('kong') >= 0;
        take({ kind: wide ? 'kong' : 'vault', s, dist: Math.max(0, dx - 2), active: dx <= 84, wide });
      } else if (s.kind === 'wall') {
        take({ kind: 'wallrun', s, dist: dx, active: dx <= 150 });
      } else if (rise <= CLIMB_MAX + 0.5) {
        take({ kind: 'climb', s, dist: dx, active: dx <= 100, rise });
      } else {
        take({ kind: 'block', s, dist: dx, active: false, rise });
      }
    }
    // wall-run walls that hang above the lane
    for (const W of world.geo.walls) {
      const dx = W.x - right;
      if (dx >= -0.5 && dx <= 150 && W.tags.indexOf('wallrun') >= 0 && W.y + W.h > feet - CHAR_H - 70 && W.y < feet) {
        take({ kind: 'wallrun', s: W, dist: Math.max(0, dx - 60), active: true, wall: true });
      }
    }
    const sup = c.onGround ? supportOf(world, c, list) : null;
    if (sup) {
      const end = runwayEnd(world, sup, list);
      const d = end - fx;
      if (d < range) take({ kind: 'gap', dist: Math.max(0, d), active: d <= EDGE_ZONE && d >= -CHAR_W / 2, edge: end, from: sup });
    }
    return best;
  }

  // ---------------------------------------------------------------- input

  function applyInput(c, input) {
    input = input || {};
    if (input.jump || input.vault || input.wallrun || input.kong || input.precision) c.jumpBuf = BUF_UP;
    if (input.slide || input.roll) { c.downBuf = BUF_DOWN; c.rollBuf = 0.5; }
    if (input.grab) c.wantGrab = true;
    if (input.sprint) c.wantSprint = true;
    else if (input.sprint === false) c.wantSprint = false;
    if (input.dive) c.wantDive = true;
    if (input.hold) c.wantHold = true;
    else if (input.hold === false) c.wantHold = false;
  }

  function tryUp(world, c) {
    const z = zoneAhead(world, c, 170);
    if (z && z.active) {
      if (z.kind === 'wallrun' && hasSkill(c.loadout, 'wallrun') && c.role === 'runner') { moveWallrun(world, c, z.s); return true; }
      if (z.kind === 'vault' || z.kind === 'kong') {
        const kind = z.kind === 'kong' ? (hasSkill(c.loadout, 'kong') && c.role === 'runner' ? 'kong' : 'stepvault') : 'vault';
        moveVault(world, c, z.s, kind);
        return true;
      }
      if (z.kind === 'climb') { moveClimb(world, c, z.s, { fast: true }); return true; }
      if (z.kind === 'gap') {
        const prec = hasSkill(c.loadout, 'precision') && c.role === 'runner';
        const plan = planJump(world, c, { precision: prec, from: z.from });
        const perfect = z.dist <= PERFECT;
        if (plan) {
          if (perfect) { plan.vx *= 1.04; }
          doJump(world, c, plan);
          if (perfect) { world.events.push({ type: 'perfect', role: c.role }); style(world, c, 'perfect', 10); }
          if (plan.prec) style(world, c, 'precision', 20);
        } else {
          doJump(world, c, { vx: Math.max(c.vx, RUN_V) * 1.06, vy: -JUMP_CAP }, 'leap');
        }
        return true;
      }
    }
    // swiped a little early: hold the swipe until the move's zone opens (queued, like Vector)
    if (z && !z.active && z.dist < 200 && /vault|kong|climb|gap|wallrun/.test(z.kind)) return false;
    if (c.onGround) {
      doJump(world, c, { vx: c.vx, vy: -HOP_V }, 'hop');
      return true;
    }
    return false;
  }

  function startSlide(world, c, forced) {
    if (!setH(world, c, SLIDE_H)) return;
    c.state = 'slide'; c.stateT = 0;
    c.slideDur = (world.wet ? 0.85 : 0.58) + (forced ? 0.2 : 0);
    if (forced) c.vx = Math.max(c.vx, 110);
    world.events.push({ type: 'slide', role: c.role });
  }

  function stumble(world, c, t, auto) {
    c.state = 'stumble'; c.stateT = 0; c.stumbleT = t;
    c.auto = auto || null;
    c.vx *= 0.25;
    world.events.push({ type: 'stumble', role: c.role });
    if (c.role === 'runner') world.boost = Math.max(0, world.boost - 0.2);
    world.shake = Math.max(world.shake, 4);
  }

  // ---------------------------------------------------------------- step

  function respawnHunter(world, c) {
    const r = world.runner;
    const plats = livePlatforms(world);
    let best = null;
    for (const p of plats) {
      const x = clamp(r.x - 300, p.x + 10, p.x + p.w - 40);
      if (x > r.x - 120 || x < r.x - 600) continue;
      if (!best || Math.abs(x - (r.x - 300)) < Math.abs(best.x - (r.x - 300))) best = { p, x };
    }
    if (!best) { const p = plats[0]; best = { p, x: p.x + 10 }; }
    c.x = best.x; c.h = CHAR_H; c.y = best.p.y - CHAR_H;
    c.vx = RUN_V * 0.8; c.vy = 0; c.onGround = true; c.state = 'run'; c.move = null;
    c.airPeak = best.p.y; c.progX = c.x; c.progT = 0;
    initCloth(c);
    world.events.push({ type: 'hunter-recover' });
  }

  function stepChar(world, c, dt) {
    const list = world._solids;
    c.stateT += dt;
    c.jumpBuf = Math.max(0, c.jumpBuf - dt);
    c.downBuf = Math.max(0, c.downBuf - dt);
    c.rollBuf = Math.max(0, c.rollBuf - dt);
    c.coyote = Math.max(0, c.coyote - dt);
    c.land = Math.max(0, c.land - dt);
    c.grabT = Math.max(0, c.grabT - dt);
    c.grabAnim = Math.max(0, (c.grabAnim || 0) - dt);
    c.phase = (c.dist / CYCLE) * Math.PI * 2;

    if (c.y > FALL_Y) {
      if (c.role === 'hunter') { respawnHunter(world, c); return; }
      if (!c.downed) {
        c.downed = true;
        world.events.push({ type: 'fall', role: c.role });
        world.shake = Math.max(world.shake, 10);
      }
      return;
    }
    if (c.inside) { c.vx = 0; c.vy = 0; return; }
    if (c.role === 'hunter' && c.onGround && c.state !== 'move' && ((world.over && world.result === 'escape') || world.runner.exiting) && world.geo.exit) {
      // the runner is going through the door: pull up smoothly short of it
      const stopX = world.geo.exit.doorX - 46 - c.w;
      c.vx = Math.min(c.vx * Math.pow(0.35, dt), Math.max(0, (stopX - c.x) * 5));
      if (c.vx < 8) c.vx = 0;
      c.state = c.vx > 40 ? 'run' : 'stand'; c.sprinting = false;
      moveX(world, c, c.vx * dt); c.dist += c.vx * dt;
      stepCloth(c, dt);
      return;
    }
    if (c.caught || c.state === 'takedown') {
      // takedown: both skid to a stop on the roof
      if (c.caught) c.state = 'caught';
      c.vx *= Math.pow(c.caught ? 0.08 : 0.1, dt);
      if (!c.onGround) c.vy += G * dt;
      c.dist += Math.abs(c.vx * dt);
      moveX(world, c, c.vx * dt);
      const hy = moveY(world, c, c.onGround ? 1 : c.vy * dt);
      if (hy && c.vy >= 0) { c.onGround = true; c.vy = 0; }
      setH(world, c, c.caught ? SLIDE_H : CROUCH_H);
      stepCloth(c, dt);
      return;
    }

    // sprint stamina (hunter)
    const canSprint = c.role === 'hunter' && hasSkill(c.loadout, 'sprint');
    c.sprinting = !!(canSprint && c.wantSprint && c.stamina > 0.05 && c.onGround);
    if (c.sprinting) c.stamina = Math.max(0, c.stamina - dt * 0.34);
    else c.stamina = Math.min(1, c.stamina + dt * 0.1);

    if (c.state === 'move' && c.move) {
      stepMove(world, c, dt);
      stepCloth(c, dt);
      return;
    }

    const vt = targetSpeed(world, c);
    const wetSup = world.wet;

    if (c.state === 'stumble') {
      c.vx += (0 - c.vx) * Math.min(1, dt * 6);
      if (c.stateT >= c.stumbleT) {
        const a = c.auto; c.auto = null;
        c.state = 'run';
        if (a && a.kind === 'climbover' && c.onGround) { c.vx = 120; moveVault(world, c, a.s, 'climbover'); }
        else if (a && a.kind === 'climb' && c.onGround) { c.vx = 120; moveClimb(world, c, a.s, {}); }
        else if (a && a.kind === 'duck') { startSlide(world, c, true); }
      }
    }

    // --- grounded
    if (c.onGround && c.state !== 'stumble') {
      if (c.state === 'air' || (c.state === 'roll' && c.stateT > 0.42) || (c.state === 'land' && c.stateT > 0.12)) c.state = 'run';
      if (c.state === 'slide') {
        const decay = wetSup ? 0.35 : 0.9;
        c.vx += (vt * 0.82 - c.vx) * Math.min(1, dt * decay);
        if (c.stateT >= c.slideDur) {
          if (setH(world, c, CHAR_H)) { c.state = 'run'; }
        }
      } else if (c.state === 'roll') {
        c.vx += (vt - c.vx) * Math.min(1, dt * 2);
      } else if (c.state !== 'move') {
        const k = wetSup ? 2.2 : 4.2;
        c.vx += (vt - c.vx) * Math.min(1, dt * k);
        if (c.vx < 60) c.vx = Math.min(vt, c.vx + 220 * dt);
      }

      // hunter dive
      if (c.wantDive && c.role === 'hunter' && hasSkill(c.loadout, 'dive') && c.state === 'run') {
        c.wantDive = false;
        c.state = 'dive'; c.stateT = 0; c.onGround = false;
        c.vx = Math.max(c.vx, RUN_V) * 1.5; c.vy = -150; c.airPeak = c.y + c.h;
        setH(world, c, TUCK_H);
        world.events.push({ type: 'dive' });
      }
      // swipes
      if (c.onGround && (c.state === 'run' || c.state === 'land' || (c.state === 'slide' && c.stateT > 0.15))) {
        if (c.jumpBuf > 0) {
          if (c.state === 'slide' && !setH(world, c, CHAR_H)) { /* under something, keep sliding */ }
          else if (tryUp(world, c)) { c.jumpBuf = 0; }
        }
        if (c.onGround && c.downBuf > 0 && c.state !== 'slide' && c.state !== 'move') { c.downBuf = 0; startSlide(world, c); }
      }
    }
    c.wantDive = false;

    if (c.state === 'move') { stepCloth(c, dt); return; }

    // --- integrate
    if (!c.onGround) {
      c.vy += G * dt;
      if (c.vy > 900) c.vy = 900;
      c.vx += (vt - c.vx) * Math.min(1, dt * 0.15); // a whisper of air control
    }
    const hx = moveX(world, c, c.vx * dt, list);
    c.dist += Math.abs(c.vx * dt);
    if (hx) onSideHit(world, c, hx);
    if (c.state === 'move') { stepCloth(c, dt); return; }

    if (c.onGround) {
      const s = supportOf(world, c, list);
      if (!s) {
        c.onGround = false; c.coyote = 0.1;
        if (c.state !== 'slide') c.state = 'air';
        c.vy = 0; c.airPeak = c.y + c.h;
      }
    }
    if (!c.onGround) {
      const hy = moveY(world, c, c.vy * dt, list);
      if (c.y + c.h < c.airPeak) c.airPeak = c.y + c.h;
      if (hy) {
        if (c.vy > 0) onLand(world, c, hy);
        else c.vy = 0;
      }
      // late jump (coyote) off an edge
      if (!c.onGround && c.coyote > 0 && c.jumpBuf > 0 && c.state === 'air' && c.vy >= 0) {
        const plan = planJump(world, c, { precision: hasSkill(c.loadout, 'precision') && c.role === 'runner' });
        doJump(world, c, plan || { vx: c.vx * 1.02, vy: -JUMP_CAP * 0.9 }, plan ? 'jump' : 'leap');
        world.events.push({ type: 'late-edge' });
      }
      if (!c.onGround && c.state === 'air' && c.vy > 0 && c.h < CHAR_H && c.stateT > 0.1) setH(world, c, Math.min(CHAR_H, c.h + 2));
    }

    // stuck detector: no forward progress for a second -> recover
    if (c.state !== 'stumble' && !world.over) {
      if (c.x > c.progX + 6) { c.progX = c.x; c.progT = 0; }
      else c.progT += dt;
      if (c.progT > 1.0 && c.onGround) {
        c.progT = 0; c.progX = c.x;
        const z = zoneAhead(world, c, 40);
        if (z && (z.kind === 'climb' || z.kind === 'block')) moveClimb(world, c, z.s, { scramble: true });
        else if (z && (z.kind === 'vault' || z.kind === 'kong')) moveVault(world, c, z.s, 'climbover');
        else if (z && z.kind === 'duck') startSlide(world, c, true);
        else c.vx = Math.max(c.vx, 140);
        world.events.push({ type: 'unstuck', role: c.role });
      }
    }
    stepCloth(c, dt);
  }

  function onSideHit(world, c, s) {
    const feet = c.y + c.h;
    const rise = feet - s.y;
    c.vx = 0;
    if (c.onGround) {
      if (rise > 0 && rise <= 12 && boxFree(world, c.x, s.y - c.h, c.w, c.h, world._solids)) { c.y = s.y - c.h; return; }
      if (c.state === 'slide') {
        if (s.kind === 'obst' && rise <= VAULT_MAX + 0.5 && setH(world, c, CHAR_H)) { stumble(world, c, 0.3, { kind: 'climbover', s }); world.events.push({ type: 'bump', role: c.role }); }
        return;
      }
      if (s.kind === 'obst' && rise <= VAULT_MAX + 0.5) { stumble(world, c, 0.32, { kind: 'climbover', s }); world.events.push({ type: 'bump', role: c.role }); return; }
      if (s.y + s.h <= feet - SLIDE_H - 1 && s.y + s.h > feet - CHAR_H) {
        stumble(world, c, 0.3, { kind: 'duck', s });
        world.events.push({ type: s.kind === 'gate' ? 'gate-hit' : 'bump', role: c.role });
        return;
      }
      if (rise <= CLIMB_MAX) { stumble(world, c, 0.26, { kind: 'climb', s }); world.events.push({ type: 'bump', role: c.role }); return; }
      return; // too tall; the stuck detector scrambles up
    }
    // airborne: catch the ledge if the hands can reach it
    if (rise > -2 && s.y >= c.y + c.h - CHAR_H - HAND_REACH && c.state !== 'dive') {
      if (rise < 4) { c.y = s.y - c.h; return; }
      moveClimb(world, c, s, { fromAir: true });
    }
  }

  function onLand(world, c, s) {
    const drop = s.y - c.airPeak;
    c.onGround = true;
    const vy = c.vy;
    c.vy = 0;
    const wasDive = c.state === 'dive';
    c.jumpPlan = null;
    setH(world, c, CHAR_H) || setH(world, c, CROUCH_H) || setH(world, c, SLIDE_H);
    world.dust.push({ x: c.x + c.w / 2, y: s.y, t: 0, big: drop > 40 });
    if (wasDive) { stumble(world, c, 0.6); return; }
    if (drop > ROLL_DROP && vy > 300) {
      if (c.rollBuf > 0) {
        c.state = 'roll'; c.stateT = 0; setH(world, c, SLIDE_H + 4);
        c.vx *= 0.97;
        world.events.push({ type: 'roll', role: c.role });
        style(world, c, 'roll', 10);
      } else {
        stumble(world, c, 0.5);
        c.vx = Math.max(c.vx, 40);
        world.events.push({ type: 'hard-land', role: c.role });
        world.shake = Math.max(world.shake, 8);
      }
      return;
    }
    c.state = 'land'; c.stateT = 0; c.land = clamp(vy / 900, 0.05, 0.4);
    if (c.trick === 'precision') style(world, c, 'stick', 6);
    c.trick = '';
    world.events.push({ type: 'land', role: c.role });
  }

  // secondary motion for jacket tail and tie: position-based chains hung off the body
  function stepCloth(c, dt) {
    if (!c.scarf || !c.scarf.length) initCloth(c);
    chain(c.scarf, c.x + c.w * 0.3, c.y + Math.min(c.h * 0.48, 26), 4.2, dt, c);
    chain(c.tie, c.x + c.w * 0.62, c.y + Math.min(c.h * 0.22, 12), 3.2, dt, c);
  }
  function chain(pts, ax, ay, seg, h, c) {
    // air at rest drags the cloth behind a moving body, gravity pulls it down,
    // turbulence makes it flutter faster the faster the body moves
    let px = ax, py = ay;
    const speed = Math.abs(c.vx) + Math.abs(c.vy) * 0.5;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.px == null) { p.px = p.x; p.py = p.y; }
      const vx = (p.x - p.px) * 0.94, vy = (p.y - p.py) * 0.94;
      p.px = p.x; p.py = p.y;
      const flut = Math.sin((c.dist || 0) * 0.11 + i * 1.7 + (c.stateT || 0) * 9) * speed * 0.0009;
      p.x += vx; p.y += vy + 240 * h * h + flut;
      const dx = p.x - px, dy = p.y - py;
      const d = Math.hypot(dx, dy) || 1;
      p.x = px + dx / d * seg; p.y = py + dy / d * seg;
      px = p.x; py = p.y;
    }
  }

  // ---------------------------------------------------------------- catch

  function tryCatch(world) {
    const r = world.runner, h = world.hunter;
    if (r.caught || r.downed || world.over || r.exiting) return;
    const dx = (r.x + r.w / 2) - (h.x + h.w / 2);
    const dy = (r.y + r.h) - (h.y + h.h);
    const diving = h.state === 'dive';
    const range = diving ? DIVE_R : CATCH_R;
    const inReach = dx > -14 && dx < range && Math.abs(dy) < (diving ? 40 : 30);
    // the hunter cannot run through the runner on the same level
    if (dx < -2 && Math.abs(dy) < 24 && h.onGround && r.onGround) moveX(world, h, dx + 2);
    if (Math.abs(dx) < 16 && Math.abs(dy) < 20) h.contactT += DT; else h.contactT = 0;
    const want = h.wantGrab || diving || h.contactT > 0.3;
    if (h.wantGrab) h.grabAnim = 0.3;
    if (want && inReach) {
      const dodgeGrab = !diving && h.contactT <= 0.3 && (r.state === 'slide' || (r.state === 'move' && r.move && /vault|kong/.test(r.move.type)));
      const dodgeDive = diving && r.state === 'roll';
      if (dodgeGrab || dodgeDive) {
        if (h.grabT <= 0) {
          world.nearMiss = 0.7; world.scale = 0.35; world.slowMo = 0.55;
          world.events.push({ type: 'near-miss', why: dodgeDive ? 'roll-under-dive' : 'slide-under-grab' });
          style(world, r, 'near-miss', dodgeDive ? 50 : 40);
          h.grabT = 0.6;
        }
        h.wantGrab = false;
        return;
      }
      r.caught = true;
      r.state = 'caught'; r.stateT = 0; r.move = null;
      r.vx = Math.max(r.vx, 120) * 0.8;
      if (r.h !== CHAR_H) { r.y += r.h - CHAR_H; r.h = CHAR_H; }
      h.state = 'takedown'; h.stateT = 0; h.move = null;
      h.vx = Math.max(h.vx, r.vx + 30);
      world.shake = 14; world.scale = 0.42; world.slowMo = 0.75;
      world.events.push({ type: 'catch' });
      world.over = true; world.result = 'catch';
      return;
    }
    if (h.wantGrab && !inReach && Math.abs(dx) < range + 26 && Math.abs(dy) < 40 && h.grabT <= 0) {
      world.nearMiss = 0.65; world.scale = 0.32; world.slowMo = 0.5;
      world.events.push({ type: 'near-miss', why: 'grab-whiff' });
      style(world, r, 'near-miss', 28);
      h.grabT = 0.5;
    }
    h.wantGrab = false;
  }

  // ---------------------------------------------------------------- traps

  function spawnDebris(world, x, y, w) {
    for (let i = 0; i < 12; i++) {
      world.debris.push({
        x: x + Math.random() * w, y: y - 4,
        w: 6 + Math.random() * 18, h: 5 + Math.random() * 12,
        vx: (Math.random() - 0.4) * 160, vy: -60 - Math.random() * 200,
        rot: Math.random() * 4, vr: (Math.random() - 0.5) * 8, life: 2.2 + Math.random(),
      });
    }
  }

  function dropCollapse(world) {
    const T = world.traps && world.traps.collapse;
    if (!T || !T.ready) return false;
    const site = world.trapSites.find((x) => x.id === T.site);
    if (!site) return false;
    const slot = site, w = site.w;
    const plat = livePlatforms(world).find((p) => p.x + 30 < slot.x && p.x + p.w > slot.x + w + 30);
    if (!plat) return false;
    site.used = true;
    world.collapsed.push({ x: slot.x, y: plat.y, w, t: 0 });
    world._solids = solids(world);
    spawnDebris(world, slot.x, plat.y, w);
    world.shake = 16;
    world.cooldown.collapse = 8;
    world.events.push({ type: 'collapse', x: slot.x });
    return true;
  }

  function dropGate(world) {
    const T = world.traps && world.traps.gate;
    if (!T || !T.ready) return false;
    const slot = world.trapSites.find((x) => x.id === T.site);
    if (!slot) return false;
    slot.used = true;
    const p = supportUnder(world, slot.x + 10, slot.y, 20);
    const floor = p ? p.y : slot.y;
    world.gates.push({ x: slot.x, y: floor, w: slot.w || 18, h: slot.h || 120, open: 1, closing: true });
    world.cooldown.gate = 7;
    world.events.push({ type: 'gate', x: slot.x });
    return true;
  }

  function beginRagdoll(c) { c.ragdoll = null; }

  // ---------------------------------------------------------------- world step

  function stepWorld(world, dt) {
    if (world.over && world.slowMo <= 0 && world._overT > 2.5) return;
    const scaled = dt * (world.scale || 1);
    world.elapsed += scaled;
    if (world.over) world._overT = (world._overT || 0) + dt;
    if (!world.over) world.t = Math.max(0, world.t - scaled);
    if (world.slowMo > 0) { world.slowMo -= dt; if (world.slowMo <= 0) world.scale = 1; }
    if (world.nearMiss > 0) world.nearMiss = Math.max(0, world.nearMiss - dt);
    if (world.shake > 0) world.shake *= 0.86;
    if (world.cooldown.gate > 0) world.cooldown.gate -= scaled;
    if (world.cooldown.collapse > 0) world.cooldown.collapse -= scaled;
    world.boost = Math.max(0, world.boost - scaled * 0.04);
    let gatesMoving = false;
    for (const g of world.gates) if (g.closing && g.open > 0) { g.open = Math.max(0, g.open - scaled * 2.2); gatesMoving = true; }
    if (gatesMoving || !world._solids) {
      // never close a shutter onto someone: it stops at their head
      world._solids = solids(world);
      for (const g of world.gates) {
        for (const c of [world.runner, world.hunter]) {
          if (overlaps(gateRect(g), c)) { g.open = Math.min(1, g.open + scaled * 2.2 + 0.02); }
        }
      }
      world._solids = solids(world);
    }
    for (const d of world.debris) {
      d.vy += G * 1.2 * scaled; d.x += d.vx * scaled; d.y += d.vy * scaled; d.rot += d.vr * scaled; d.life -= scaled;
    }
    world.debris = world.debris.filter((d) => d.life > 0);
    for (const d of world.dust) d.t += scaled;
    world.dust = world.dust.filter((d) => d.t < 0.6);
    // if a collapse opened under someone, drop them
    for (const c of [world.runner, world.hunter]) {
      if (c.onGround && c.state !== 'move' && !supportOf(world, c)) { c.onGround = false; if (c.state !== 'slide') c.state = 'air'; c.airPeak = c.y + c.h; }
    }

    stepChar(world, world.runner, scaled);
    stepChar(world, world.hunter, scaled);
    tryCatch(world);
    stepExit(world, scaled);
    world.traps = { gate: trapState(world, 'gate'), collapse: trapState(world, 'collapse') };

    if (!world.over) {
      const r = world.runner;
      if (r.downed) { world.over = true; world.result = 'catch'; world.events.push({ type: 'catch', why: 'fall' }); }
      else if (r.inside) { world.over = true; world.result = 'escape'; world.events.push({ type: 'escape' }); }
      else if (world.t <= 0.0001) { world.over = true; world.result = 'escape'; world.events.push({ type: 'escape', why: 'timer' }); }
    }
  }

  /** Finish: the runner runs into the exit doorway (a canned decelerating walk-in),
   *  the door shuts behind them; the hunter pulls up short of the door. */
  function stepExit(world, dt) {
    const E = world.geo.exit;
    if (!E) return;
    const r = world.runner, h = world.hunter;
    if (world.exitT != null) world.exitT += dt;
    if (!world.over && !r.caught && !r.downed && !r.inside && r.state !== 'move' && r.onGround && !r.exiting) {
      const fx = r.x + r.w / 2;
      if (fx >= E.doorX - 70 && Math.abs((r.y + r.h) - E.y) < 4) {
        const target = E.doorX + E.doorW / 2;
        const v = Math.max(140, r.vx);
        const dist = Math.max(4, target - fx);
        r.exiting = true;
        startMove(world, r, 'exit', [[0, fx, E.y], [1, target, E.y, 'out']], clamp(2 * dist / v, 0.22, 0.75), { h: CHAR_H, exitVx: 0, top: E.y, faceX: E.doorX });
        r.onGround = true;
        world.events.push({ type: 'exit-door' });
      }
    }
    if (r.exiting && !r.move && !r.inside) {
      r.inside = true; r.vx = 0; r.state = 'inside'; world.exitT = 0;
      world.events.push({ type: 'door-close' });
    }
    // after an escape the hunter brakes and stops short of the door
    if (((world.over && world.result === 'escape') || r.exiting) && !h.caught) {
      const stopX = E.doorX - 46 - h.w;
      if (h.x > stopX && h.onGround) h.x = stopX;
    }
  }

  // ---------------------------------------------------------------- net

  function snapshot(world) {
    return clone({
      t: world.t, elapsed: world.elapsed, scale: world.scale, shake: world.shake, slowMo: world.slowMo,
      style: world.style, boost: world.boost, over: world.over, result: world.result, nearMiss: world.nearMiss,
      cooldown: world.cooldown, gates: world.gates, collapsed: world.collapsed, debris: world.debris,
      runner: slim(world.runner), hunter: slim(world.hunter),
      trapUsed: (world.trapSites || []).filter((x) => x.used).map((x) => x.id), exitT: world.exitT,
    });
  }
  function slim(c) {
    return {
      role: c.role, x: c.x, y: c.y, vx: c.vx, vy: c.vy, w: c.w, h: c.h,
      onGround: c.onGround, state: c.state, stateT: c.stateT, phase: c.phase, dist: c.dist,
      stamina: c.stamina, sprinting: c.sprinting, hanging: c.hanging,
      caught: c.caught, downed: c.downed, facing: c.facing, land: c.land, airPeak: c.airPeak, inside: !!c.inside, exiting: !!c.exiting,
      ragdoll: null, trick: c.trick, loadout: c.loadout,
      move: c.move ? { type: c.move.type, u: c.move.u, t: c.move.t, dur: c.move.dur, hand: c.move.hand, foot: c.move.foot, top: c.move.top, faceX: c.move.faceX, keys: c.move.keys, h: c.move.h, exitVx: c.move.exitVx, after: c.move.after } : null,
    };
  }

  const api = {
    CYCLE, TRAP, trapState, DT, G, PPM, RUN_V, MAX_SPEED, SPRINT_MAX, CHAR_W, CHAR_H, SLIDE_H, EDGE_ZONE, PERFECT, ROLL_DROP,
    createWorld, stepWorld, applyInput, dropGate, dropCollapse,
    snapshot, clone, hasSkill, beginRagdoll, platforms, supportUnder, supportOf,
    solids, zoneAhead, planJump, gateRect, overlaps, buildGeo, samplePath, stepCloth,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChasePhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
