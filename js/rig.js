/**
 * CHASE LINE v2 character rig. An articulated adult silhouette (head, neck, torso,
 * upper/lower arms, hands, thighs, shins, feet) posed procedurally:
 *  - run cycle driven by distance travelled, so planted feet don't skate
 *  - canned-move poses keyed by move progress, with two-bone IK snapping
 *    hands (and feet on walls) to the exact contact points the sim provides
 *  - jacket tail and tie follow the sim's spring chains
 * Runner: hooded jacket + tie. Hunter: broader build, helmet with a lit visor.
 */
(function (root) {
  const L = { shin: 12.4, thigh: 12.6, torso: 16.2, neck: 2.4, head: 4.3, upper: 9.4, fore: 9.0, foot: 5.6 };
  const LEG = L.shin + L.thigh;
  const CYCLE = 128; // px per full run cycle (two strides, ~4.4 m)
  const TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sm(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function seg(u, a, b) { return sm((u - a) / (b - a)); }
  function dirv(a) { return [Math.sin(a), Math.cos(a)]; }

  const KEYS = ['hipX', 'hipY', 'torso', 'head', 'th0', 'kn0', 'ft0', 'th1', 'kn1', 'ft1', 'ua0', 'el0', 'ua1', 'el1', 'rot'];
  function pose(o) {
    const p = { hipX: 0, hipY: -LEG + 0.6, torso: 0.06, head: 0, th0: 0.05, kn0: 0.08, ft0: 0, th1: -0.05, kn1: 0.08, ft1: 0, ua0: 0.12, el0: 0.35, ua1: -0.1, el1: 0.3, rot: 0, ground: true, ik: null };
    return Object.assign(p, o || {});
  }
  function blend(a, b, t) {
    const o = Object.assign({}, b);
    for (const k of KEYS) o[k] = lerp(a[k], b[k], t);
    return o;
  }

  // ---------------------------------------------------------- pose library

  function runPose(phase, speed, hunter) {
    const s0 = phase, s1 = phase + Math.PI;
    const sp = clamp(speed, 0, 1.2);
    function leg(s) {
      const th = 0.12 + (0.25 + 0.62 * sp) * Math.sin(s);
      const swing = Math.max(0, Math.cos(s - 0.35));
      const kn = 0.22 + (0.5 + 1.25 * sp) * Math.pow(swing, 1.6) + 0.18 * Math.max(0, -Math.cos(s));
      const ft = Math.cos(s) > 0 ? -0.5 * swing : 0;
      return [th, kn, ft];
    }
    function arm(s) {
      const ua = 0.05 + (0.3 + 0.55 * sp) * Math.sin(s);
      const el = 1.15 + 0.25 * sp + 0.3 * Math.sin(s);
      return [ua, el];
    }
    const a = leg(s0), b = leg(s1), ra = arm(s1), rb = arm(s0);
    const lean = 0.2 + 0.3 * sp + (hunter ? 0.04 : 0);
    return pose({
      torso: lean + 0.03 * Math.sin(phase * 2), head: -lean * 0.55,
      th0: a[0], kn0: a[1], ft0: a[2], th1: b[0], kn1: b[1], ft1: b[2],
      ua0: ra[0] + lean * 0.4, el0: ra[1], ua1: rb[0] + lean * 0.4, el1: rb[1],
      ground: 'plant',
    });
  }

  const P = {
    stand: () => pose(),
    crouch: (k) => pose({ torso: 0.35 * k, th0: 1.0 * k, kn0: 1.7 * k, th1: 0.75 * k, kn1: 1.5 * k, ua0: 0.5 * k, el0: 0.8, ua1: 0.3 * k, el1: 0.9, ground: 'plant' }),
    airUp: () => pose({ torso: 0.32, head: -0.2, th0: 1.15, kn0: 1.55, ft0: -0.3, th1: -0.35, kn1: 1.25, ft1: -0.5, ua0: 2.1, el0: 0.6, ua1: -0.75, el1: 0.7, ground: false }),
    airTop: () => pose({ torso: 0.28, head: -0.15, th0: 1.25, kn0: 1.9, ft0: -0.2, th1: 0.55, kn1: 1.9, ft1: -0.3, ua0: 1.7, el0: 0.7, ua1: 0.8, el1: 0.9, ground: false }),
    airDown: () => pose({ torso: 0.12, head: -0.05, th0: 0.85, kn0: 0.7, ft0: 0.1, th1: 0.35, kn1: 0.9, ft1: 0, ua0: 1.45, el0: 0.4, ua1: -0.4, el1: 0.5, ground: false }),
    flail: (t) => pose({ torso: -0.1 + 0.2 * Math.sin(t * 9), head: -0.2, th0: 0.6 + 0.7 * Math.sin(t * 11), kn0: 1.0, th1: 0.2 - 0.7 * Math.sin(t * 11), kn1: 1.2, ua0: 2.4 + 0.6 * Math.sin(t * 13), el0: 0.3, ua1: 2.0 - 0.6 * Math.sin(t * 13), el1: 0.4, ground: false }),
    land: (k) => pose({ torso: 0.55 * k + 0.1, head: -0.3 * k, th0: 1.1 * k + 0.1, kn0: 1.9 * k + 0.1, th1: 0.7 * k, kn1: 1.6 * k + 0.1, ua0: 0.9 * k, el0: 0.6, ua1: 0.5 * k - 0.2, el1: 0.8, ground: 'plant' }),
    slide: () => pose({ hipY: -7, torso: -0.95, head: 0.75, th0: 1.42, kn0: 0.06, ft0: 0.25, th1: 1.0, kn1: 2.1, ft1: 0, ua0: -0.55, el0: 0.15, ua1: 1.1, el1: 0.9, ground: 'fixed' }),
    rollTuck: () => pose({ hipY: -13, torso: 0.95, head: 0.4, th0: 2.1, kn0: 2.45, th1: 1.9, kn1: 2.5, ua0: 1.5, el0: 1.4, ua1: 1.3, el1: 1.5, ground: 'fixed' }),
    stumble: (t) => pose({ torso: 0.95 - 0.5 * sm(t / 0.5), head: -0.5, th0: 0.9, kn0: 1.1, th1: -0.45, kn1: 0.9, ua0: 1.7 + 0.3 * Math.sin(t * 20), el0: 0.25, ua1: 1.2, el1: 0.3, ground: 'plant' }),
    dive: () => pose({ hipY: -14, torso: 1.48, head: -1.1, th0: 1.25, kn0: 0.25, th1: 1.05, kn1: 0.5, ua0: 2.95, el0: 0.05, ua1: 2.8, el1: 0.1, ground: false }),
    prone: () => pose({ hipY: -3.5, torso: 1.56, head: -1.3, th0: 1.58, kn0: 0.25, ft0: 0.6, th1: 1.5, kn1: 0.7, ft1: 0.6, ua0: 3.0, el0: 0.4, ua1: 2.4, el1: 1.2, ground: 'fixed' }),
    kneel: () => pose({ hipY: -15, torso: 0.95, head: -0.6, th0: 1.45, kn0: 2.5, ft0: 0.3, th1: 0.2, kn1: 1.9, ua0: 1.75, el0: 0.25, ua1: 1.45, el1: 0.55, ground: 'fixed' }),
    reach: () => pose({ torso: 0.32, th0: 0.6, kn0: 0.6, th1: -0.3, kn1: 0.7, ua0: 1.62, el0: 0.05, ua1: 1.3, el1: 0.2, ground: 'plant' }),
  };

  // ---------------------------------------------------------- choose a pose

  function targetPose(c, env) {
    const hunter = c.role === 'hunter';
    const speed = Math.abs(c.vx) / 261;
    const st = c.state;
    const m = c.move;
    if (st === 'caught') {
      const t = c.stateT || 0;
      const a = blend(P.airDown(), P.prone(), sm(t / 0.45));
      a.ground = t > 0.3 ? 'fixed' : 'plant';
      if (t < 0.45) a.hipY = lerp(-LEG + 2, -3.5, sm(t / 0.45));
      return a;
    }
    if (st === 'takedown') {
      const t = c.stateT || 0;
      const a = blend(P.dive(), P.kneel(), sm(t / 0.4));
      a.ground = 'fixed';
      return a;
    }
    if (c.downed) return P.flail(env.time);
    if (st === 'move' && m) return movePose(c, m, env);
    if (st === 'slide') return P.slide();
    if (st === 'roll') {
      const u = clamp((c.stateT || 0) / 0.42, 0, 1);
      const a = P.rollTuck();
      a.rot = u * TAU;
      a.hipY = -13 + 6 * Math.sin(u * Math.PI);
      return u > 0.86 ? blend(a, runPose(c.phase, speed, hunter), (u - 0.86) / 0.14) : a;
    }
    if (st === 'dive') return P.dive();
    if (st === 'stumble') return P.stumble(c.stateT || 0);
    if (!c.onGround && st !== 'stumble') {
      if (c.trick === 'hop' || c.trick === 'jump' || c.trick === 'precision' || c.trick === 'leap' || st === 'air') {
        if (c.vy < -60) return blend(P.airUp(), P.airTop(), clamp((c.vy + 240) / 180, 0, 1));
        if (c.vy < 160) return blend(P.airTop(), P.airDown(), clamp((c.vy + 60) / 220, 0, 1));
        if (c.vy > 520) return blend(P.airDown(), P.flail(env.time), clamp((c.vy - 520) / 300, 0, 1));
        return P.airDown();
      }
    }
    let base = speed < 0.08 ? P.stand() : runPose(c.phase, speed, hunter);
    if (speed < 0.35 && speed >= 0.08) base = blend(P.stand(), base, speed / 0.35);
    if (st === 'land' || c.land > 0) {
      const k = clamp(c.land / 0.4, 0, 1) * (1 - clamp((c.stateT || 0) / 0.16, 0, 1));
      if (k > 0.01) base = blend(base, P.land(Math.min(1, 0.4 + k)), k * 1.4 > 1 ? 1 : k * 1.4);
    }
    if (hunter && c.grabAnim > 0) base = blend(base, P.reach(), clamp(c.grabAnim / 0.15, 0, 1));
    return base;
  }

  function movePose(c, m, env) {
    const u = m.u || 0;
    const t = m.type;
    let a;
    if (t === 'vault' || t === 'stepvault' || t === 'climbover' || t === 'kong') {
      const k = m.keys || [];
      const u1 = k[1] ? k[1][0] : 0.35, u2 = k[2] ? k[2][0] : 0.7;
      const take = P.crouch(0.6);
      take.ground = false;
      let over;
      if (t === 'kong') over = pose({ hipY: -12, torso: 1.38, head: -1.0, th0: 1.95, kn0: 2.3, th1: 1.75, kn1: 2.35, ua0: 1.6, el0: 0, ua1: 1.5, el1: 0, ground: false, ik: 'hands' });
      else if (t === 'climbover') over = pose({ hipY: -12, torso: 0.9, head: -0.6, th0: 1.8, kn0: 2.3, th1: 0.4, kn1: 1.4, ua0: 1.2, el0: 0.6, ua1: 1.0, el1: 0.6, ground: false, ik: 'hand' });
      else over = pose({ hipY: -15, torso: 0.15, head: -0.15, th0: 1.5, kn0: 0.35, th1: 1.35, kn1: 0.9, ua0: 0.9, el0: 0.2, ua1: 2.3, el1: 0.5, ground: false, ik: 'hand' });
      const land = P.land(0.55); land.ground = false;
      if (u < u1) a = blend(runPose(c.phase, 1, c.role === 'hunter'), take, seg(u, 0, u1));
      else if (u < u2) { a = blend(take, over, seg(u, u1, u1 + (u2 - u1) * 0.35)); a.ik = over.ik; }
      else a = blend(over, land, seg(u, u2, 1));
      if (u >= u1 - 0.05 && u <= u2 + 0.05) a.ik = t === 'kong' ? 'hands' : 'hand';
      return a;
    }
    if (t === 'mantle' || t === 'climb' || t === 'ledge') {
      const reachU = t === 'mantle' ? 0.6 : 0.68;
      const hang = pose({ hipX: -3, torso: 0.12, head: -0.35, th0: 0.9, kn0: 1.4, th1: 0.4, kn1: 1.2, ua0: 2.9, el0: 0.1, ua1: 2.9, el1: 0.1, ground: false, ik: 'hands+feet' });
      const pull = pose({ hipX: 2, hipY: -18, torso: 0.95, head: -0.6, th0: 1.9, kn0: 2.4, th1: 0.9, kn1: 1.8, ua0: 0.4, el0: -0.2, ua1: 0.5, el1: -0.2, ground: false, ik: 'hands' });
      const up = P.crouch(0.6); up.ground = 'plant';
      if (u < 0.12) a = blend(P.airUp(), hang, seg(u, 0, 0.12));
      else if (u < reachU) {
        a = Object.assign({}, hang);
        // climbing feet walk up the wall
        const w = (u - 0.12) / (reachU - 0.12);
        a.th0 = 0.9 + 0.5 * Math.sin(w * 6); a.th1 = 0.9 - 0.5 * Math.sin(w * 6);
        a.kn0 = 1.4 + 0.5 * Math.cos(w * 6); a.kn1 = 1.4 - 0.5 * Math.cos(w * 6);
        a.ik = 'hands+feet';
      } else if (u < 0.86) { a = blend(hang, pull, seg(u, reachU, 0.86)); a.ik = 'hands'; }
      else a = blend(pull, up, seg(u, 0.86, 1));
      return a;
    }
    if (t === 'wallrun') {
      const ph = (m.t || 0) * 18;
      if (u < 0.22) return blend(runPose(c.phase, 1), P.airUp(), seg(u, 0, 0.22));
      if (u < 0.62) {
        a = pose({ hipX: -3, torso: -0.05, head: -0.4, th0: 1.3 + 0.6 * Math.sin(ph), kn0: 1.2 + 0.6 * Math.cos(ph), th1: 1.3 - 0.6 * Math.sin(ph), kn1: 1.2 - 0.6 * Math.cos(ph), ua0: 0.4 + 1.2 * Math.sin(ph + 1), el0: 1.3, ua1: 0.4 - 1.2 * Math.sin(ph + 1), el1: 1.3, ground: false });
        a.rot = -0.25;
        return a;
      }
      a = blend(pose({ hipY: -12, torso: 0.9, th0: 1.9, kn0: 2.3, th1: 1.5, kn1: 2.2, ua0: 1.0, el0: 0.6, ua1: 0.6, el1: 0.6, ground: false, ik: 'hand' }), P.airDown(), seg(u, 0.8, 1));
      if (u < 0.8) a.ik = 'hand';
      return a;
    }
    return runPose(c.phase, 1);
  }

  // ---------------------------------------------------------- forward kinematics

  function ik2(ax, ay, tx, ty, l1, l2, bendDir) {
    let dx = tx - ax, dy = ty - ay;
    let d = Math.hypot(dx, dy);
    const maxd = l1 + l2 - 0.01;
    if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const base = Math.atan2(dy, dx);
    const ang = base + a * bendDir;
    return { jx: ax + Math.cos(ang) * l1, jy: ay + Math.sin(ang) * l1, ex: ax + dx, ey: ay + dy };
  }

  /** Solve joint positions in world space. anchor = feet centre on the ground. */
  function solve(c, p, ax, ay, bodyScale, extra) {
    const S = bodyScale;
    const j = {};
    let hx = ax + p.hipX * S, hy = ay + p.hipY * S;
    // leg FK relative to hip
    function legFK(th, kn, ft) {
      const d1 = dirv(th), k = [d1[0] * L.thigh * S, d1[1] * L.thigh * S];
      const sa = th - kn, d2 = dirv(sa);
      const an = [k[0] + d2[0] * L.shin * S, k[1] + d2[1] * L.shin * S];
      const fa = sa + Math.PI / 2 + ft, d3 = dirv(fa);
      const toe = [an[0] + d3[0] * L.foot * S, an[1] + d3[1] * L.foot * S];
      return { k, an, toe };
    }
    let l0 = legFK(p.th0, p.kn0, p.ft0), l1 = legFK(p.th1, p.kn1, p.ft1);
    if (p.ground === 'plant') {
      // drop the hip until the lowest foot touches the ground: bob + planted feet for free
      const low = Math.max(l0.an[1] + 1.2 * S, l1.an[1] + 1.2 * S, l0.toe[1], l1.toe[1]);
      hy = ay - low;
    }
    j.hip = [hx, hy];
    const rot = p.rot || 0;
    const cx = hx, cy = hy;
    function R(x, y) {
      if (!rot) return [x, y];
      const dx = x - cx, dy = y - cy, cs = Math.cos(rot), sn = Math.sin(rot);
      return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs];
    }
    j.knee0 = R(hx + l0.k[0], hy + l0.k[1]); j.ankle0 = R(hx + l0.an[0], hy + l0.an[1]); j.toe0 = R(hx + l0.toe[0], hy + l0.toe[1]);
    j.knee1 = R(hx + l1.k[0], hy + l1.k[1]); j.ankle1 = R(hx + l1.an[0], hy + l1.an[1]); j.toe1 = R(hx + l1.toe[0], hy + l1.toe[1]);
    const td = [Math.sin(p.torso), -Math.cos(p.torso)];
    const neck = [hx + td[0] * L.torso * S, hy + td[1] * L.torso * S];
    j.neck = R(neck[0], neck[1]);
    j.chest = R(hx + td[0] * L.torso * 0.62 * S, hy + td[1] * L.torso * 0.62 * S);
    const ha = p.torso + p.head;
    j.head = R(neck[0] + Math.sin(ha) * (L.neck + L.head) * S, neck[1] - Math.cos(ha) * (L.neck + L.head) * S);
    j.headAng = ha + rot;
    j.torsoAng = p.torso + rot;
    const sh = [neck[0] - td[0] * 1.6 * S, neck[1] - td[1] * 1.6 * S];
    j.sh = R(sh[0], sh[1]);
    function armFK(ua, el) {
      const d1 = dirv(ua), e = [sh[0] + d1[0] * L.upper * S, sh[1] + d1[1] * L.upper * S];
      const d2 = dirv(ua + el), h = [e[0] + d2[0] * L.fore * S, e[1] + d2[1] * L.fore * S];
      return { e: R(e[0], e[1]), h: R(h[0], h[1]) };
    }
    const a0 = armFK(p.ua0, p.el0), a1 = armFK(p.ua1, p.el1);
    j.elbow0 = a0.e; j.hand0 = a0.h; j.elbow1 = a1.e; j.hand1 = a1.h;
    // IK contacts from the sim (hand on the edge, feet on the wall)
    if (p.ik && extra && extra.hand) {
      const hx2 = extra.hand.x, hy2 = extra.hand.y - 0.6 * S;
      const s0 = ik2(j.sh[0], j.sh[1], hx2 - 1.2, hy2, L.upper * S, L.fore * S, -1);
      j.elbow0 = [s0.jx, s0.jy]; j.hand0 = [s0.ex, s0.ey];
      if (p.ik === 'hands' || p.ik === 'hands+feet') {
        const s1 = ik2(j.sh[0], j.sh[1], hx2 + 2.5, hy2, L.upper * S, L.fore * S, -1);
        j.elbow1 = [s1.jx, s1.jy]; j.hand1 = [s1.ex, s1.ey];
      }
      if (p.ik === 'hands+feet' && extra.faceX != null) {
        const fy0 = Math.min(j.hip[1] + 18 * S, ay), fy1 = Math.min(j.hip[1] + 11 * S, ay);
        const f0 = ik2(j.hip[0], j.hip[1], extra.faceX - 1.5, fy0, L.thigh * S, L.shin * S, -1);
        const f1 = ik2(j.hip[0], j.hip[1], extra.faceX - 1.5, fy1, L.thigh * S, L.shin * S, -1);
        j.knee0 = [f0.jx, f0.jy]; j.ankle0 = [f0.ex, f0.ey]; j.toe0 = [f0.ex + 1.5, f0.ey - 4.5 * S];
        j.knee1 = [f1.jx, f1.jy]; j.ankle1 = [f1.ex, f1.ey]; j.toe1 = [f1.ex + 1.5, f1.ey - 4.5 * S];
      }
    }
    return j;
  }

  // ---------------------------------------------------------- drawing

  function limb(ctx, a, b, w0, w1) {
    // tapered capsule: two discs joined by their outer tangents (separate sub-shapes, no winding holes)
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 0.001;
    const nx = -dy / d, ny = dx / d;
    const r0 = w0 / 2, r1 = w1 / 2;
    ctx.beginPath();
    ctx.moveTo(a[0] + nx * r0, a[1] + ny * r0);
    ctx.lineTo(b[0] + nx * r1, b[1] + ny * r1);
    ctx.lineTo(b[0] - nx * r1, b[1] - ny * r1);
    ctx.lineTo(a[0] - nx * r0, a[1] - ny * r0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); ctx.arc(a[0], a[1], r0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(b[0], b[1], r1, 0, Math.PI * 2); ctx.fill();
  }

  function draw(ctx, c, p, j, S, tf, opts) {
    // tf: world->screen {x(v), y(v), z}
    const z = tf.z;
    const P2 = (q) => [tf.x(q[0]), tf.y(q[1])];
    const hunter = c.role === 'hunter';
    const ink = opts.ink || '#07090c';
    const far = '#1b2129';
    const k = S * z;
    const B = hunter ? 1.18 : 1;
    const J = {};
    for (const key in j) if (Array.isArray(j[key])) J[key] = P2(j[key]);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // far limbs first, slightly lifted in tone for depth
    ctx.fillStyle = far;
    limb(ctx, J.hip, J.knee1, 6.2 * k * B, 4.6 * k * B);
    limb(ctx, J.knee1, J.ankle1, 4.6 * k * B, 3.0 * k);
    limb(ctx, J.ankle1, J.toe1, 3.0 * k, 2.4 * k);
    limb(ctx, J.sh, J.elbow1, 4.0 * k * B, 3.2 * k * B);
    limb(ctx, J.elbow1, J.hand1, 3.2 * k * B, 2.4 * k);
    ctx.fillStyle = ink;
    // jacket tail (runner) from the sim's spring chain
    if (!hunter && c.scarf && c.scarf.length && !opts.noCloth) {
      const pts = c.scarf.map((q) => [tf.x(q.x), tf.y(q.y)]);
      const waist = [lerp(J.hip[0], J.chest[0], 0.35), lerp(J.hip[1], J.chest[1], 0.35)];
      ctx.beginPath();
      ctx.moveTo(waist[0] + 2.2 * k, waist[1]);
      ctx.lineTo(J.hip[0] - 3.4 * k, J.hip[1] - 4 * k);
      let lx = J.hip[0] - 3.4 * k, ly = J.hip[1] - 4 * k;
      const n = Math.min(pts.length, 3);
      for (let i = 0; i < n; i++) {
        const q = pts[i];
        const qx = J.hip[0] + (q[0] - pts[0][0]) * 0.55 * z - 3.2 * k - i * 0.6 * k, qy = J.hip[1] + (q[1] - pts[0][1]) * 0.55 * z + (i + 1) * 2.6 * k;
        ctx.quadraticCurveTo(lx, ly, qx, qy);
        lx = qx; ly = qy;
      }
      ctx.lineTo(J.hip[0] + 2.4 * k, J.hip[1] + 4.2 * k);
      ctx.closePath();
      ctx.fill();
    }
    // torso
    const tw = (hunter ? 11.5 : 9.4) * k, hw = (hunter ? 8.6 : 7.0) * k;
    limb(ctx, J.hip, J.chest, hw, tw);
    limb(ctx, J.chest, J.neck, tw, (hunter ? 9.5 : 7.2) * k);
    if (hunter) { // shoulder pads and a belt rig
      ctx.beginPath(); ctx.arc(J.sh[0], J.sh[1], 3.8 * k, 0, Math.PI * 2); ctx.fill();
    }
    // tie (runner) flaps in front of the chest
    if (!hunter && c.tie && c.tie.length && !opts.noCloth) {
      ctx.lineWidth = 1.5 * k;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      const nk = [lerp(J.neck[0], J.chest[0], 0.15), lerp(J.neck[1], J.chest[1], 0.15)];
      ctx.moveTo(nk[0] + 2.6 * k * Math.cos(j.torsoAng), nk[1] + 2.6 * k * Math.sin(j.torsoAng));
      let px = nk[0], py = nk[1];
      for (let i = 0; i < c.tie.length; i++) {
        const q = c.tie[i];
        const dx = (q.x - (i ? c.tie[i - 1].x : c.tie[0].x)), dy = (q.y - (i ? c.tie[i - 1].y : c.tie[0].y));
        px += (i === 0 ? 3.4 * k * Math.cos(j.torsoAng) : dx * z * 1.05); py += (i === 0 ? 3.4 * k * Math.sin(j.torsoAng) : dy * z * 1.05);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // near leg
    limb(ctx, J.hip, J.knee0, 6.6 * k * B, 4.8 * k * B);
    limb(ctx, J.knee0, J.ankle0, 4.8 * k * B, 3.1 * k);
    limb(ctx, J.ankle0, J.toe0, 3.2 * k, 2.6 * k);
    // head
    const hr = L.head * k;
    ctx.beginPath(); ctx.arc(J.head[0], J.head[1], hr * (hunter ? 1.12 : 1), 0, Math.PI * 2); ctx.fill();
    limb(ctx, J.neck, J.head, 3.4 * k, 3.0 * k);
    const ha = j.headAng;
    const fwd = [Math.sin(ha + Math.PI / 2), -Math.cos(ha + Math.PI / 2)];
    const up = [Math.sin(ha), -Math.cos(ha)];
    if (hunter) {
      // helmet brim + visor glow
      ctx.beginPath();
      ctx.moveTo(J.head[0] - fwd[0] * hr * 1.2 + up[0] * hr * 0.2, J.head[1] - fwd[1] * hr * 1.2 + up[1] * hr * 0.2);
      ctx.lineTo(J.head[0] + fwd[0] * hr * 1.55 + up[0] * hr * 0.15, J.head[1] + fwd[1] * hr * 1.55 + up[1] * hr * 0.15);
      ctx.lineTo(J.head[0] + fwd[0] * hr * 1.2 + up[0] * hr * 0.5, J.head[1] + fwd[1] * hr * 1.2 + up[1] * hr * 0.5);
      ctx.closePath(); ctx.fill();
      const vx = J.head[0] + fwd[0] * hr * 0.7 - up[0] * hr * 0.12, vy = J.head[1] + fwd[1] * hr * 0.7 - up[1] * hr * 0.12;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, 7 * k);
      g.addColorStop(0, 'rgba(255,80,50,0.9)'); g.addColorStop(1, 'rgba(255,40,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(vx, vy, 7 * k, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 1.3 * k;
      ctx.beginPath();
      ctx.moveTo(vx - fwd[0] * 1.2 * k, vy - fwd[1] * 1.2 * k);
      ctx.lineTo(vx + fwd[0] * 2.6 * k, vy + fwd[1] * 2.6 * k);
      ctx.stroke();
      ctx.fillStyle = ink;
    } else {
      // hood peak at the back of the head, short fringe at the front
      ctx.beginPath();
      ctx.moveTo(J.head[0] - fwd[0] * hr * 0.6 + up[0] * hr * 0.75, J.head[1] - fwd[1] * hr * 0.6 + up[1] * hr * 0.75);
      ctx.lineTo(J.head[0] - fwd[0] * hr * 1.35 - up[0] * hr * 0.25, J.head[1] - fwd[1] * hr * 1.35 - up[1] * hr * 0.25);
      ctx.lineTo(J.head[0] - fwd[0] * hr * 0.5 - up[0] * hr * 0.9, J.head[1] - fwd[1] * hr * 0.5 - up[1] * hr * 0.9);
      ctx.closePath(); ctx.fill();
    }
    // near arm on top
    limb(ctx, J.sh, J.elbow0, 4.2 * k * B, 3.4 * k * B);
    limb(ctx, J.elbow0, J.hand0, 3.4 * k * B, 2.5 * k);
    ctx.beginPath(); ctx.arc(J.hand0[0], J.hand0[1], 1.7 * k, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const Rig = { L, LEG, CYCLE, targetPose, blend, solve, draw, P, pose };
  if (typeof module !== 'undefined' && module.exports) module.exports = Rig;
  root.ChaseRig = Rig;
})(typeof globalThis !== 'undefined' ? globalThis : this);
