/**
 * CHASE LINE v2 renderer.
 *  Look: Vector-style — pure black foreground architecture and silhouettes against a
 *  bright, desaturated blue-white city with atmospheric depth, god rays and haze.
 *  Background layers are generated once per track into offscreen canvases.
 *  Camera: follows the LOCAL character (each phone its own), keeps it on the left third,
 *  critically damped springs on x / y / zoom, zoom driven by obstacle look-ahead and
 *  by how close the other character is. Off-screen indicator for the other character.
 */
(function (root) {
  const Phys = () => root.ChasePhysics;
  const Rig = () => root.ChaseRig;

  const Render = {
    canv: null, ctx: null, dpr: 1, w: 0, h: 0,
    cam: { x: 0, y: 0, z: 1, vx: 0, vy: 0, vz: 0, ground: 260, init: false },
    camX: 0, camY: 0, shakeX: 0, shakeY: 0,
    layers: null, layerKey: '',
    anim: {}, localRole: 'runner', time: 0,
    debug: {},
  };

  Render.init = function (canvas) {
    Render.canv = canvas;
    Render.ctx = canvas.getContext('2d');
  };

  Render.resize = function (cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (Render.w === cssW && Render.h === cssH && Render.dpr === dpr && Render.canv.width) return;
    Render.dpr = dpr; Render.w = cssW; Render.h = cssH;
    Render.canv.width = Math.round(cssW * dpr);
    Render.canv.height = Math.round(cssH * dpr);
    Render.canv.style.width = cssW + 'px';
    Render.canv.style.height = cssH + 'px';
    Render.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Render.layers = null; Render.fx = null;
  };

  // ------------------------------------------------------------------ palette

  const PAL = {
    dawn: {
      sky: ['#cfe3ee', '#e4eff4', '#f4f7f6'], sun: 'rgba(255,248,232,', haze: '#dde9ef',
      far: '#c3d6e2', farWin: '#b2c8d6', mid: '#a7bfcf', midWin: '#8fa9bb', midLit: '#d9e6ee',
      near: '#8aa3b6', nearDark: '#6f889b', nearLit: '#c7d6e0', glass: '#6d8799', glassLit: '#a9d0c9',
      accent: '#c8423a', rays: 0.13, ink: '#06080b', rim: 'rgba(210,228,240,0.10)', rain: false,
    },
    monsoon: {
      sky: ['#6e7e8c', '#8695a1', '#a7b1b8'], sun: 'rgba(225,235,245,', haze: '#8d9aa5',
      far: '#7e8d99', farWin: '#74838f', mid: '#6b7b88', midWin: '#5d6c79', midLit: '#93a2ad',
      near: '#56656f', nearDark: '#46535d', nearLit: '#7d8c97', glass: '#4b5a65', glassLit: '#8fb5b0',
      accent: '#b8463c', rays: 0.05, ink: '#05070a', rim: 'rgba(170,190,205,0.12)', rain: true,
    },
  };
  function pal(world) { return PAL[(world && world.track && world.track.sky) === 'monsoon' ? 'monsoon' : 'dawn']; }

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function mk(w, h) {
    const c = document.createElement('canvas');
    const s = Math.min(Render.dpr, 2);
    c.width = Math.ceil(w * s); c.height = Math.ceil(h * s);
    const x = c.getContext('2d'); x.setTransform(s, 0, 0, s, 0, 0);
    return { c, x, w, h };
  }

  // ------------------------------------------------------------------ background layers

  function windowsGrid(x, bx, by, bw, bh, cw, ch, gx, gy, col, litCol, r, litP) {
    for (let yy = by + gy; yy < by + bh - ch; yy += ch + gy) {
      for (let xx = bx + gx; xx < bx + bw - cw - 1; xx += cw + gx) {
        x.fillStyle = r() < litP ? litCol : col;
        x.fillRect(xx, yy, cw, ch);
      }
    }
  }

  function farSkyline(P, seed, W, H) {
    const L = mk(W, H); const x = L.x; const r = rng(seed);
    let px = -20;
    while (px < W) {
      const bw = 40 + r() * 90, bh = H * (0.35 + r() * 0.6);
      const by = H - bh;
      x.fillStyle = P.far; x.fillRect(px, by, bw, bh);
      if (r() < 0.4) { const sw = bw * (0.4 + r() * 0.3); x.fillRect(px + (bw - sw) / 2, by - 18 - r() * 30, sw, 40); }
      if (r() < 0.35) { x.fillRect(px + bw * 0.5, by - 30 - r() * 40, 1.5, 60); }
      windowsGrid(x, px, by, bw, bh, 3, 2, 3, 4, P.farWin, P.haze, r, 0.05);
      px += bw + r() * 14 - 4;
    }
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, P.haze);
    x.globalAlpha = 0.75; x.fillStyle = g; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
    return L;
  }

  function midSkyline(P, seed, W, H) {
    const L = mk(W, H); const x = L.x; const r = rng(seed);
    let px = -30;
    while (px < W) {
      const bw = 70 + r() * 130, bh = H * (0.3 + r() * 0.62);
      const by = H - bh;
      // body with a lit left face
      x.fillStyle = P.mid; x.fillRect(px, by, bw, bh);
      x.fillStyle = P.midLit; x.globalAlpha = 0.35; x.fillRect(px, by, Math.max(4, bw * 0.12), bh); x.globalAlpha = 1;
      // setbacks / crowns
      if (r() < 0.5) {
        x.fillStyle = P.mid;
        const sw = bw * (0.5 + r() * 0.3);
        x.fillRect(px + bw * 0.1, by - 22, sw, 22);
        if (r() < 0.5) { x.fillRect(px + bw * 0.1 + sw * 0.4, by - 60, 2, 40); x.fillRect(px + bw * 0.1 + sw * 0.4 - 4, by - 26, 10, 4); }
      }
      // window bands or grids
      if (r() < 0.5) {
        for (let yy = by + 8; yy < H - 10; yy += 11) { x.fillStyle = P.midWin; x.fillRect(px + 4, yy, bw - 8, 4); }
      } else windowsGrid(x, px, by, bw, bh, 5, 6, 4, 5, P.midWin, P.midLit, r, 0.07);
      // water tank or dish on top
      if (r() < 0.35) {
        x.fillStyle = P.midWin;
        const tx = px + bw * (0.2 + r() * 0.5);
        x.fillRect(tx, by - 16, 14, 12); x.fillRect(tx + 2, by - 4, 2, 4); x.fillRect(tx + 10, by - 4, 2, 4);
      }
      px += bw + r() * 22 - 6;
    }
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, P.haze);
    x.globalAlpha = 0.6; x.fillStyle = g; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
    return L;
  }

  // The close background: detailed office facades, ledges, pipes, dishes, billboards.
  function nearFacades(P, seed, W, H) {
    const L = mk(W, H); const x = L.x; const r = rng(seed);
    let px = -40;
    while (px < W) {
      const bw = 160 + r() * 260, bh = H * (0.45 + r() * 0.5);
      const by = H - bh;
      const kind = r();
      const g = x.createLinearGradient(px, 0, px + bw, 0);
      g.addColorStop(0, P.nearLit); g.addColorStop(0.18, P.near); g.addColorStop(1, P.nearDark);
      x.fillStyle = g; x.fillRect(px, by, bw, bh);
      // cornice / roof ledge
      x.fillStyle = P.nearLit; x.fillRect(px - 3, by - 3, bw + 6, 4);
      x.fillStyle = P.nearDark; x.fillRect(px - 3, by + 1, bw + 6, 2);
      if (kind < 0.45) {
        // glass bands with soft reflections
        for (let yy = by + 14; yy < H - 16; yy += 30) {
          x.fillStyle = P.glass; x.fillRect(px + 6, yy, bw - 12, 15);
          x.fillStyle = P.glassLit; x.globalAlpha = 0.35;
          for (let k = 0; k < bw - 20; k += 7) if (r() < 0.22) x.fillRect(px + 8 + k, yy + 5, 2, 2);
          x.globalAlpha = 0.12; x.fillStyle = '#ffffff'; x.fillRect(px + 6, yy, bw - 12, 3); x.globalAlpha = 1;
          x.fillStyle = P.nearLit; x.globalAlpha = 0.5; x.fillRect(px + 2, yy + 17, bw - 4, 2); x.globalAlpha = 1;
          // mullions
          x.fillStyle = P.nearDark; for (let k = px + 6; k < px + bw - 6; k += 26) x.fillRect(k, yy, 1, 15);
        }
      } else if (kind < 0.75) {
        // punched windows grid
        windowsGrid(x, px, by, bw, bh, 9, 12, 7, 9, P.glass, P.glassLit, r, 0.08);
      } else {
        // industrial: big panel seams, a door, an external pipe, a fire box
        x.fillStyle = P.nearDark; x.globalAlpha = 0.5;
        for (let k = px + 30; k < px + bw; k += 46) x.fillRect(k, by, 1, bh);
        x.globalAlpha = 1;
        x.fillStyle = P.glass; x.fillRect(px + bw * 0.6, H - 46, 18, 46);
        x.fillStyle = P.accent; x.fillRect(px + bw * 0.3, by + 10, 2, bh - 10);
        x.fillRect(px + bw * 0.3 - 6, H - 70, 12, 14);
      }
      // rooftop kit: AC boxes, dish, railing, vents
      const roofItems = 1 + Math.floor(r() * 3);
      for (let i = 0; i < roofItems; i++) {
        const ix = px + 10 + r() * (bw - 40);
        const t = r();
        x.fillStyle = P.nearDark;
        if (t < 0.35) { x.fillRect(ix, by - 12, 24, 12); x.fillStyle = P.near; x.beginPath(); x.arc(ix + 7, by - 6, 3.5, 0, 6.3); x.arc(ix + 17, by - 6, 3.5, 0, 6.3); x.fill(); }
        else if (t < 0.6) { x.beginPath(); x.ellipse(ix + 8, by - 16, 9, 11, -0.5, 0, 6.3); x.fill(); x.fillRect(ix + 7, by - 8, 2, 8); }
        else if (t < 0.8) { x.fillRect(ix, by - 22, 4, 22); x.fillRect(ix - 3, by - 24, 10, 3); }
        else { // railing
          x.fillRect(ix, by - 10, 60, 1.2); for (let k = 0; k <= 60; k += 10) x.fillRect(ix + k, by - 10, 1.2, 10);
        }
      }
      // billboard now and then
      if (r() < 0.22) {
        const bx = px + 20, bwid = Math.min(120, bw - 40), byy = by - 64;
        x.fillStyle = P.nearDark; x.fillRect(bx + 10, byy + 40, 3, 24); x.fillRect(bx + bwid - 14, byy + 40, 3, 24);
        x.fillStyle = '#e9eef0'; x.fillRect(bx, byy, bwid, 42);
        x.fillStyle = P.near; x.fillRect(bx + 6, byy + 8, bwid * 0.45, 5); x.fillRect(bx + 6, byy + 17, bwid * 0.3, 3);
        x.fillStyle = P.accent; x.globalAlpha = 0.8; x.fillRect(bx + bwid * 0.62, byy + 6, bwid * 0.3, 30); x.globalAlpha = 1;
      }
      px += bw + 12 + r() * 50;
    }
    // atmospheric wash to the bottom so the black roofs pop
    const fog = x.createLinearGradient(0, 0, 0, H);
    fog.addColorStop(0, 'rgba(0,0,0,0)'); fog.addColorStop(0.75, 'rgba(0,0,0,0)'); fog.addColorStop(1, P.haze);
    x.globalAlpha = 0.45; x.fillStyle = fog; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
    return L;
  }

  function clouds(P, seed, W, H) {
    const L = mk(W, H); const x = L.x; const r = rng(seed);
    for (let i = 0; i < 9; i++) {
      const cx = r() * W, cy = H * (0.2 + r() * 0.6), rw = 80 + r() * 160;
      for (let k = 0; k < 6; k++) {
        const g = x.createRadialGradient(cx + (r() - 0.5) * rw, cy + (r() - 0.5) * 18, 2, cx, cy, rw * (0.4 + r() * 0.4));
        g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(cx - rw, cy - rw, rw * 2, rw * 2);
      }
    }
    return L;
  }

  function ensureLayers(world) {
    const P = pal(world);
    const key = (world.track && world.track.id) + '|' + Render.w + 'x' + Render.h + '|' + Render.dpr;
    if (Render.layers && Render.layerKey === key) return;
    const seed = hashStr(String(world.track && world.track.id || 'x'));
    const H = Render.h;
    Render.layers = {
      P,
      clouds: clouds(P, seed ^ 7, 1600, H * 0.6),
      far: farSkyline(P, seed ^ 11, 1600, Math.round(H * 0.62)),
      mid: midSkyline(P, seed ^ 23, 1700, Math.round(H * 0.7)),
      near: nearFacades(P, seed ^ 41, 1900, Math.round(H * 0.85)),
    };
    // screen-space sky, rays, vignette
    const W = Render.w;
    const sky = mk(W, H); {
      const g = sky.x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, P.sky[0]); g.addColorStop(0.55, P.sky[1]); g.addColorStop(1, P.sky[2]);
      sky.x.fillStyle = g; sky.x.fillRect(0, 0, W, H);
    }
    const rays = mk(W, H); {
      const x = rays.x;
      x.globalCompositeOperation = 'lighter';
      const sx = W * 0.18, sy = -H * 0.25;
      const rr = rng(seed ^ 99);
      for (let i = 0; i < 7; i++) {
        const a0 = 0.35 + i * 0.13 + rr() * 0.05, a1 = a0 + 0.03 + rr() * 0.05;
        const len = H * 2.2;
        const g = x.createLinearGradient(sx, sy, sx + Math.cos(a0) * len, sy + Math.sin(a0) * len);
        g.addColorStop(0, P.sun + (P.rays * (0.6 + rr() * 0.6)) + ')'); g.addColorStop(0.7, P.sun + '0)');
        x.fillStyle = g;
        x.beginPath(); x.moveTo(sx, sy);
        x.lineTo(sx + Math.cos(a0) * len, sy + Math.sin(a0) * len);
        x.lineTo(sx + Math.cos(a1) * len, sy + Math.sin(a1) * len);
        x.closePath(); x.fill();
      }
      const glow = x.createRadialGradient(sx + W * 0.05, 0, 0, sx, 0, H * 0.9);
      glow.addColorStop(0, P.sun + '0.55)'); glow.addColorStop(1, P.sun + '0)');
      x.fillStyle = glow; x.fillRect(0, 0, W, H);
    }
    const vig = mk(W, H); {
      const x = vig.x;
      const g = x.createRadialGradient(W * 0.5, H * 0.45, H * 0.35, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(10,16,24,0)'); g.addColorStop(1, 'rgba(10,16,24,0.42)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    Render.fx = { sky, rays, vig };
    Render.layerKey = key;
    // birds for this track
    const rb = rng(seed ^ 5);
    Render.birds = [];
    for (let i = 0; i < 7; i++) Render.birds.push({ x: rb() * 2400, y: 30 + rb() * 120, s: 0.6 + rb() * 0.7, ph: rb() * 6, v: 18 + rb() * 22 });
  }

  function drawStrip(ctx, L, ox, bottomY, scale) {
    const w = L.w * scale, h = L.h * scale;
    let x0 = -(((ox % w) + w) % w);
    for (let x = x0; x < Render.w; x += w) ctx.drawImage(L.c, x, bottomY - h, w + 0.5, h);
  }

  // ------------------------------------------------------------------ camera

  function local(world) { return Render.localRole === 'hunter' ? world.hunter : world.runner; }
  function other(world) { return Render.localRole === 'hunter' ? world.runner : world.hunter; }

  function baseZoom() { return clamp(Render.h / 345, 0.6, 2.6) * (Render.zoomMul || 1); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function camTarget(world) {
    const L = local(world), O = other(world);
    const cam = Render.cam;
    const fx = L.x + L.w / 2, feet = L.y + L.h;
    if (cam.ground == null) cam.ground = feet;
    const kg = 1 - Math.exp(-(Render._fdt || 0.016) * 15);
    if (L.onGround) cam.ground += (feet - cam.ground) * (Math.abs(feet - cam.ground) > 140 ? 1 : kg);
    else if (L.state === 'move') cam.ground += (Math.max(feet, L.move && L.move.top != null ? L.move.top : feet) - cam.ground) * 0.12;
    else if (feet > cam.ground + 10) cam.ground += (feet - cam.ground) * 0.15;
    else if (feet < cam.ground - 90) cam.ground += (feet + 90 - cam.ground) * 0.1;
    // look-ahead: gaps, drops, tall climbs push the zoom out; tight ducks pull it in
    let out = 0, inn = 0, yBias = 0;
    const PH = Phys();
    const sup = L.onGround ? PH.supportOf(world, L) : null;
    if (sup) {
      const plats = PH.platforms(world);
      let end = sup.x + sup.w;
      for (const p of plats) if (Math.abs(p.y - sup.y) < 2 && p.x <= end + 18 && p.x + p.w > end) end = p.x + p.w;
      const d = end - fx;
      if (d < 560) {
        let next = null;
        for (const p of plats) if (p.x >= end - 2 && p.x < end + 450 && (!next || p.x < next.x)) next = p;
        const gap = next ? next.x - end : 400;
        const drop = next ? next.y - sup.y : 300;
        const sev = clamp(Math.max(gap / 260, drop / 220, -drop / 160), 0, 1.2);
        const near = 1 - d / 560;
        out = Math.max(out, sev * near);
        if (drop > 40) yBias = Math.min(drop, 200) * 0.45 * near;
      }
    } else if (!L.onGround) {
      out = Math.max(out, clamp((feet - L.airPeak) / 260, 0, 1));
    }
    const z = PH.zoneAhead(world, L, 320);
    if (z) {
      if ((z.kind === 'climb' || z.kind === 'block' || z.kind === 'wallrun') && (z.rise || 80) > 58) out = Math.max(out, clamp((z.rise || 90) / 200, 0, 0.8) * (1 - z.dist / 320));
      if (z.kind === 'duck') inn = Math.max(inn, 1 - z.dist / 320);
    }
    const zb = baseZoom();
    let zt = zb * (1 - 0.22 * clamp(out, 0, 1) + 0.08 * inn);
    // frame a close rival: the hunter breathing down the runner's neck, or the runner just ahead
    const lsx = Render.w * (Render.localRole === 'hunter' ? 0.32 : 0.4);
    const dxo = (O.x + O.w / 2) - fx;
    if (!O.downed && Math.abs((O.y + O.h) - feet) < 260) {
      if (dxo < 0 && dxo > -270) zt = Math.min(zt, (lsx - 34) / -dxo);
      if (dxo > 0 && dxo < 700) zt = Math.min(zt, (Render.w - 70 - lsx) / dxo);
    }
    zt = clamp(zt, zb * 0.6, zb * 1.12);
    const lead = clamp(L.vx * 0.05, -10, 26);
    const tx = fx + lead + (Render.w * 0.5 - lsx) / zt;
    const ty = cam.ground - (Render.h * 0.58 - Render.h * 0.5) / zt + yBias;
    Render.debug.out = out; Render.debug.inn = inn; Render.debug.zt = zt;
    return { x: tx, y: ty, z: zt };
  }

  function spring(pos, vel, target, omega, dt) {
    const f = 1 + 2 * dt * omega, oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo;
    const det = 1 / (f + hhoo);
    const np = (f * pos + dt * vel + hhoo * target) * det;
    const nv = (vel + hoo * (target - pos)) * det;
    return [np, nv];
  }

  Render.resetCam = function (world, role) {
    if (role) Render.localRole = role;
    Render.cam.ground = null;
    const t = camTarget(world);
    Object.assign(Render.cam, { x: t.x, y: t.y, z: t.z, vx: 0, vy: 0, vz: 0, init: true });
    Render.anim = {};
  };

  Render.follow = function (world, dt, role) {
    if (role && role !== Render.localRole) { Render.localRole = role; }
    if (!Render.cam.init || Render.cam.world !== world) { Render.cam.world = world; Render.resetCam(world, role); }
    dt = Math.min(0.05, dt || 0.016);
    Render._fdt = dt;
    const t = camTarget(world);
    const c = Render.cam;
    [c.x, c.vx] = spring(c.x, c.vx, t.x, 7.5, dt);
    [c.y, c.vy] = spring(c.y, c.vy, t.y, 3.6, dt);
    [c.z, c.vz] = spring(c.z, c.vz, t.z, 2.4, dt);
    Render.camX = c.x; Render.camY = c.y;
    if (world.shake > 0.4) {
      Render.shakeX = (Math.random() - 0.5) * world.shake * 0.8;
      Render.shakeY = (Math.random() - 0.5) * world.shake * 0.5;
    } else { Render.shakeX = 0; Render.shakeY = 0; }
  };

  /** Title: a slow drift past the skyline. */
  Render.titleCam = function (world, t) {
    const z = baseZoom() * 1.05;
    Render.localRole = 'runner';
    Object.assign(Render.cam, { x: 560 + Math.sin(t * 0.05) * 60 + Render.w * 0.12 / z, y: 260 - Render.h * 0.18 / z, z, init: false });
    Render.shakeX = 0; Render.shakeY = 0;
  };

  function sx(x) { return (x - Render.cam.x) * Render.cam.z + Render.w / 2 + Render.shakeX; }
  function sy(y) { return (y - Render.cam.y) * Render.cam.z + Render.h / 2 + Render.shakeY; }
  Render.toScreen = function (x, y) { return [sx(x), sy(y)]; };

  // ------------------------------------------------------------------ foreground architecture

  function rect(ctx, x, y, w, h) { ctx.fillRect(sx(x), sy(y), w * Render.cam.z, h * Render.cam.z); }

  function drawPlatform(ctx, p, P, wet, seed) {
    const z = Render.cam.z;
    const x0 = sx(p.x), x1 = sx(p.x + p.w), y0 = sy(p.y);
    if (x1 < -40 || x0 > Render.w + 40) return;
    ctx.fillStyle = P.ink;
    if (p.slab) {
      // elevated deck: slab, steel trusses down to the lower roof (non-solid, drawn behind in a softer tone)
      const y1 = sy(p.y + p.h);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = 'rgba(6,8,11,0.55)';
      const step = 46 * z;
      for (let xx = x0 + 8 * z; xx < x1 - 4 * z; xx += step) {
        ctx.fillRect(xx, y1, 3 * z, Render.h - y1);
        ctx.save(); ctx.strokeStyle = 'rgba(6,8,11,0.4)'; ctx.lineWidth = 1.4 * z;
        ctx.beginPath(); ctx.moveTo(xx, y1); ctx.lineTo(Math.min(xx + step, x1), y1 + step); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = P.ink;
      // railing on top
      railing(ctx, p.x + 4, p.y, Math.min(p.w - 8, 160), P);
      return;
    }
    ctx.fillRect(x0, y0, x1 - x0, Render.h - y0 + 20);
    // parapet lip and a cornice line so the edge reads
    ctx.fillRect(x0 - 2 * z, y0 - 3 * z, x1 - x0 + 4 * z, 3 * z);
    ctx.fillStyle = P.rim; ctx.fillRect(x0 - 2 * z, y0 - 3 * z, x1 - x0 + 4 * z, 1 * z);
    if (wet) { ctx.fillStyle = 'rgba(200,220,235,0.18)'; ctx.fillRect(x0, y0 + 0.5 * z, x1 - x0, 1.2 * z); }
    // facade detail on the visible side walls (very dark, just enough to read as a building)
    ctx.fillStyle = 'rgba(40,52,64,0.30)';
    const r = rng(seed);
    for (let yy = p.y + 26; yy < p.y + 900; yy += 34) {
      const yy0 = sy(yy);
      if (yy0 > Render.h) break;
      for (let xx = p.x + 18; xx < p.x + p.w - 30; xx += 28) if (r() < 0.25) ctx.fillRect(sx(xx), yy0, 12 * z, 16 * z);
    }
    // a few rooftop details along the top (decorative, below knee height so they never lie about collision)
    const rr = rng(seed ^ 77);
    ctx.fillStyle = P.ink;
    for (let xx = p.x + 30; xx < p.x + p.w - 60; xx += 90 + rr() * 140) {
      const t = rr();
      if (t < 0.3) { rect(ctx, xx, p.y - 6, 18, 6); rect(ctx, xx + 4, p.y - 9, 10, 3); }
      else if (t < 0.5) { rect(ctx, xx, p.y - 12, 3, 12); rect(ctx, xx - 3, p.y - 14, 9, 3); }
      else if (t < 0.62) railing(ctx, xx, p.y, 70, P);
      else if (t < 0.72) { // skylight
        rect(ctx, xx, p.y - 7, 34, 7);
        ctx.fillStyle = 'rgba(160,190,210,0.25)'; rect(ctx, xx + 3, p.y - 5, 28, 3); ctx.fillStyle = P.ink;
      }
    }
  }

  function railing(ctx, x, y, w, P) {
    const z = Render.cam.z;
    ctx.fillStyle = P.ink;
    rect(ctx, x, y - 16, w, 1.6);
    rect(ctx, x, y - 8, w, 1.0);
    for (let k = 0; k <= w; k += 12) rect(ctx, x + k, y - 16, 1.5, 16);
  }

  function drawObstacle(ctx, o, P, t) {
    const z = Render.cam.z;
    ctx.fillStyle = P.ink;
    if (o.type === 'ac' || o.w >= 72) {
      // AC unit: box + two fans with spinning blades lit from behind
      rect(ctx, o.x, o.y, o.w, o.h);
      rect(ctx, o.x - 2, o.y - 2, o.w + 4, 3);
      const r = Math.min(o.h * 0.34, 13);
      for (let i = 0; i < 2; i++) {
        const cx = sx(o.x + o.w * (0.27 + i * 0.46)), cy = sy(o.y + o.h * 0.52);
        ctx.fillStyle = 'rgba(140,165,185,0.45)';
        ctx.beginPath(); ctx.arc(cx, cy, r * z, 0, 6.29); ctx.fill();
        ctx.fillStyle = P.ink;
        for (let b = 0; b < 4; b++) {
          const a = t * 14 + b * Math.PI / 2 + i;
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r * 0.92 * z, a, a + 0.5); ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(cx, cy, 2 * z, 0, 6.29); ctx.fill();
      }
      ctx.fillStyle = P.ink;
      rect(ctx, o.x + 3, o.y + o.h, 4, 1); rect(ctx, o.x + o.w - 7, o.y + o.h, 4, 1);
    } else {
      // vent housing with louvres
      rect(ctx, o.x, o.y + 3, o.w, o.h - 3);
      rect(ctx, o.x - 3, o.y, o.w + 6, 4);
      ctx.fillStyle = 'rgba(140,165,185,0.32)';
      for (let yy = o.y + 9; yy < o.y + o.h - 4; yy += 5) rect(ctx, o.x + 5, yy, o.w - 10, 1.3);
      ctx.fillStyle = P.ink;
    }
  }

  function drawPipe(ctx, p, P) {
    const z = Render.cam.z;
    ctx.fillStyle = P.ink;
    rect(ctx, p.x - 30, p.y, p.w + 60, p.h);
    for (let xx = p.x - 24; xx < p.x + p.w + 30; xx += 60) { rect(ctx, xx, p.y - 2, 5, p.h + 4); rect(ctx, xx + 1, p.y - 70, 2, 70); }
    ctx.fillStyle = 'rgba(190,210,225,0.18)'; rect(ctx, p.x - 30, p.y + 2, p.w + 60, 1.5);
    // hazard band so the duck reads
    ctx.fillStyle = 'rgba(240,190,40,0.85)';
    for (let xx = p.x; xx < p.x + p.w; xx += 16) rect(ctx, xx, p.y + p.h - 3, 8, 3);
  }

  function drawWall(ctx, W, P) {
    // a billboard on a lattice frame: the face is the wall-run surface
    const z = Render.cam.z;
    ctx.fillStyle = P.ink;
    rect(ctx, W.x, W.y, W.w, W.h);
    rect(ctx, W.x - 3, W.y - 3, W.w + 6, 4);
    const top = W.y + W.h;
    ctx.fillStyle = 'rgba(6,8,11,0.55)';
    rect(ctx, W.x + 3, top, 2.5, 120); rect(ctx, W.x + W.w - 5, top, 2.5, 120);
    ctx.save(); ctx.strokeStyle = 'rgba(6,8,11,0.45)'; ctx.lineWidth = 1.2 * z;
    for (let yy = top; yy < top + 110; yy += 22) { ctx.beginPath(); ctx.moveTo(sx(W.x + 4), sy(yy)); ctx.lineTo(sx(W.x + W.w - 4), sy(yy + 22)); ctx.stroke(); }
    ctx.restore();
    // back-lit panel edge
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; rect(ctx, W.x + W.w - 2, W.y + 4, 1.5, W.h - 8);
  }

  function drawGate(ctx, g, P) {
    const PH = Phys();
    const r = PH.gateRect(g);
    ctx.fillStyle = P.ink;
    rect(ctx, r.x - 6, r.y - 6, r.w + 12, 8);       // housing
    rect(ctx, r.x - 4, r.y, 3, g.y - r.y);           // guide rails
    rect(ctx, r.x + r.w + 1, r.y, 3, g.y - r.y);
    rect(ctx, r.x, r.y, r.w, r.h);                   // shutter
    ctx.fillStyle = 'rgba(150,170,190,0.28)';
    for (let yy = r.y + 4; yy < r.y + r.h - 4; yy += 6) rect(ctx, r.x + 2, yy, r.w - 4, 1);
    ctx.fillStyle = 'rgba(240,190,40,0.95)';
    for (let k = 0; k < 3; k++) rect(ctx, r.x + 1, r.y + r.h - 4 - k * 0.1, r.w - 2, 3);
    ctx.fillStyle = 'rgba(255,60,40,0.9)';
    const blink = (Render.time * 4) % 1 < 0.5;
    if (blink) { ctx.beginPath(); ctx.arc(sx(r.x + r.w / 2), sy(r.y - 9), 2.4 * Render.cam.z, 0, 6.29); ctx.fill(); }
  }

  /** The exit: a tall block that ends the route with a lit doorway in its face.
   *  'back' draws the building and the light; 'front' the frame, sign and the door
   *  panel that slides shut once the runner is through. */
  function drawExit(ctx, world, P, pass) {
    const E = world.geo && world.geo.exit;
    if (!E) return;
    const x0 = sx(E.doorX - 10), x1 = sx(E.wall.x + E.wall.w);
    if (x1 < -40 || x0 > Render.w + 40) return;
    const z = Render.cam.z, fy = sy(E.y), top = sy(E.y - 300);
    const shut = clamp((world.exitT || 0) / 0.35, 0, 1);
    if (pass === 'back') {
      ctx.fillStyle = P.ink;
      ctx.fillRect(x0, top, x1 - x0, Render.h - top + 10);
      // parapet + rooftop kit so it reads as a building, not a slab
      rect(ctx, E.doorX - 14, E.y - 304, E.wall.x + E.wall.w - E.doorX + 14, 6);
      rect(ctx, E.doorX + 60, E.y - 330, 30, 26); rect(ctx, E.doorX + 140, E.y - 318, 8, 14);
      ctx.fillStyle = 'rgba(150,170,190,0.16)';
      for (let yy = E.y - 280; yy < E.y - 100; yy += 42) for (let xx = E.doorX + 56; xx < E.wall.x + E.wall.w - 20; xx += 46) rect(ctx, xx, yy, 18, 22);
      // lit doorway + light pool on the roof
      const lit = 1 - shut * 0.85;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx(E.doorX + E.doorW / 2), fy - 34 * z, 0, sx(E.doorX + E.doorW / 2), fy - 34 * z, 120 * z);
      g.addColorStop(0, 'rgba(255,236,200,' + (0.7 * lit) + ')'); g.addColorStop(1, 'rgba(255,236,200,0)');
      ctx.fillStyle = g; ctx.fillRect(sx(E.doorX - 130), fy - 150 * z, 300 * z, 160 * z);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,246,228,' + (0.95 * lit + 0.05) + ')';
      rect(ctx, E.doorX, E.y - E.doorH, E.doorW, E.doorH);
      return;
    }
    // front: door panel sliding down over the opening, frame, EXIT sign
    if (shut > 0) {
      ctx.fillStyle = P.ink;
      rect(ctx, E.doorX, E.y - E.doorH, E.doorW, E.doorH * shut);
      ctx.fillStyle = 'rgba(150,170,190,0.25)';
      for (let k = 6; k < E.doorH * shut; k += 7) rect(ctx, E.doorX + 2, E.y - E.doorH + k, E.doorW - 4, 1);
    }
    ctx.fillStyle = P.ink;
    rect(ctx, E.doorX - 6, E.y - E.doorH - 6, E.doorW + 12, 6);
    rect(ctx, E.doorX - 6, E.y - E.doorH, 6, E.doorH);
    const blink = shut > 0 ? 1 : 0.75 + 0.25 * Math.sin(Render.time * 5);
    ctx.fillStyle = 'rgba(120,255,170,' + (0.9 * blink) + ')';
    rect(ctx, E.doorX + 4, E.y - E.doorH - 20, 26, 10);
    ctx.fillStyle = P.ink;
    ctx.font = '700 ' + Math.max(6, Math.round(8 * z)) + 'px "Barlow Condensed", system-ui, sans-serif';
    ctx.fillText('EXIT', sx(E.doorX + 7.5), sy(E.y - E.doorH - 12));
  }

  /** Hunter view: where the next trap will spring, charging with the button. */
  function drawTrapMarks(ctx, world) {
    const T = world.traps;
    if (!T) return;
    const z = Render.cam.z;
    for (const kind of ['gate', 'collapse']) {
      const t = T[kind];
      if (!t || !t.site || !t.owned || t.charge <= 0) continue;
      const x = sx(t.x);
      const fy = sy(t.y);
      const pulse = t.peak ? 0.6 + 0.4 * Math.sin(Render.time * 14) : 1;
      if (x < -80) continue;
      if (x > Render.w - 20) {
        // off-screen ahead: a charge badge pinned to the right edge at the site's height
        const by = clamp(fy - 95 * z, 70, Render.h - 150), bx = Render.w - 64;
        ctx.save();
        ctx.globalAlpha = t.ready ? pulse : 0.55;
        ctx.fillStyle = 'rgba(10,12,16,0.6)';
        ctx.beginPath(); ctx.arc(bx, by, 15, 0, 6.29); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(bx, by, 15, 0, 6.29); ctx.stroke();
        ctx.strokeStyle = t.ready ? '#ffb36b' : 'rgba(255,200,150,0.9)';
        ctx.beginPath(); ctx.arc(bx, by, 15, -Math.PI / 2, -Math.PI / 2 + 6.283 * t.charge); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(kind === 'gate' ? '⊞' : '↯', bx, by + 5);
        ctx.beginPath(); ctx.moveTo(bx + 20, by - 6); ctx.lineTo(bx + 27, by); ctx.lineTo(bx + 20, by + 6); ctx.fill();
        ctx.textAlign = 'left';
        ctx.restore();
        continue;
      }
      const col = t.ready ? 'rgba(255,150,60,' : 'rgba(255,200,150,';
      const a = (t.ready ? 0.95 : 0.35 + 0.4 * t.charge) * pulse;
      ctx.save();
      if (kind === 'gate') {
        const h = 92 * z, w = Math.max(18, t.w) * z;
        ctx.strokeStyle = col + a + ')'; ctx.lineWidth = 1.6 * z; ctx.setLineDash([4 * z, 3 * z]);
        ctx.strokeRect(x, fy - 30 * z - h, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = col + (0.22 * a) + ')';
        ctx.fillRect(x, fy - 30 * z - h, w, h * t.charge);
        ctx.fillStyle = col + a + ')';
        ctx.fillRect(x - 4 * z, fy - 30 * z - h - 4 * z, w + 8 * z, 3 * z);
      } else {
        const w = t.w * z;
        ctx.strokeStyle = col + a + ')'; ctx.lineWidth = 2 * z;
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) { const xx = x + (w * i) / 10, yy = fy + 2 * z + ((i % 2) ? 3 : -1) * z; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.stroke();
        ctx.fillStyle = col + (0.25 * a) + ')';
        ctx.fillRect(x, fy - 6 * z, w * t.charge, 4 * z);
      }
      if (t.ready) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * pulse) + ')';
        ctx.font = '600 ' + Math.round(9 * Math.max(1, z)) + 'px "Barlow Condensed", system-ui, sans-serif';
        ctx.fillText(t.peak ? 'NOW' : kind.toUpperCase(), x - 2 * z, fy - (kind === 'gate' ? 132 : 14) * z);
      }
      ctx.restore();
    }
  }

  function drawProp(ctx, pr, P) {
    const z = Render.cam.z * (pr.s || 1);
    const x = sx(pr.x), y = sy(pr.y);
    if (x < -260 * z || x > Render.w + 260 * z) return;
    ctx.save();
    ctx.translate(x, y); ctx.scale(z, z);
    ctx.fillStyle = P.ink; ctx.strokeStyle = P.ink; ctx.lineCap = 'round';
    if (pr.type === 'watertower') {
      // legs with cross bracing, tank with bands, conical roof, ladder
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-20, -70); ctx.moveTo(26, 0); ctx.lineTo(20, -70);
      ctx.moveTo(-6, 0); ctx.lineTo(-6, -70); ctx.moveTo(6, 0); ctx.lineTo(6, -70); ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { const a = -k * 23, b = a - 23; ctx.moveTo(-24 + k * 2, a); ctx.lineTo(22 - k * 2, b); ctx.moveTo(24 - k * 2, a); ctx.lineTo(-22 + k * 2, b); }
      ctx.stroke();
      ctx.fillRect(-28, -74, 56, 5);
      ctx.beginPath(); ctx.moveTo(-26, -74); ctx.lineTo(-26, -128); ctx.quadraticCurveTo(0, -134, 26, -128); ctx.lineTo(26, -74); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-29, -128); ctx.lineTo(0, -150); ctx.lineTo(29, -128); ctx.closePath(); ctx.fill();
      ctx.fillRect(-1, -158, 2, 10);
      ctx.fillStyle = 'rgba(160,185,205,0.18)';
      for (let yy = -120; yy < -78; yy += 10) ctx.fillRect(-26, yy, 52, 1);
      ctx.fillStyle = P.ink;
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(30, -126); ctx.moveTo(35, 0); ctx.lineTo(35, -126);
      for (let yy = -6; yy > -126; yy -= 7) { ctx.moveTo(30, yy); ctx.lineTo(35, yy); } ctx.stroke();
    } else if (pr.type === 'crane') {
      ctx.lineWidth = 2;
      // mast lattice
      ctx.fillRect(-8, -260, 3, 260); ctx.fillRect(5, -260, 3, 260);
      ctx.beginPath(); for (let yy = 0; yy > -260; yy -= 16) { ctx.moveTo(-6, yy); ctx.lineTo(6, yy - 16); ctx.moveTo(6, yy); ctx.lineTo(-6, yy - 16); } ctx.stroke();
      // jib and counter-jib
      ctx.fillRect(-90, -266, 330, 4); ctx.fillRect(-90, -252, 330, 2);
      ctx.beginPath(); for (let xx = -90; xx < 240; xx += 14) { ctx.moveTo(xx, -262); ctx.lineTo(xx + 14, -252); } ctx.stroke();
      ctx.fillRect(-86, -262, 30, 22);
      ctx.beginPath(); ctx.moveTo(0, -300); ctx.lineTo(-80, -264); ctx.moveTo(0, -300); ctx.lineTo(200, -264); ctx.stroke();
      ctx.fillRect(-3, -306, 6, 46);
      ctx.fillRect(-12, -250, 20, 16);
      // hook
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(150, -252); ctx.lineTo(150, -150); ctx.stroke(); ctx.fillRect(145, -152, 10, 8);
    } else if (pr.type === 'antenna') {
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -120); ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -120); ctx.lineTo(-30, 0); ctx.moveTo(0, -120); ctx.lineTo(30, 0);
      for (let yy = -100; yy < 0; yy += 30) { ctx.moveTo(-12, yy); ctx.lineTo(12, yy); } ctx.stroke();
      ctx.beginPath(); ctx.ellipse(10, -80, 12, 15, -0.6, 0, 6.29); ctx.fill();
      ctx.fillStyle = 'rgba(255,60,40,' + (0.5 + 0.5 * Math.sin(Render.time * 3)) + ')';
      ctx.beginPath(); ctx.arc(0, -122, 2.5, 0, 6.29); ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ cues

  function drawCue(ctx, wx, wy, dir, alpha, active) {
    const z = Render.cam.z;
    const x = sx(wx), y = sy(wy);
    const s = 13 * z * (active ? 1.08 + 0.06 * Math.sin(Render.time * 12) : 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 2.6);
    g.addColorStop(0, 'rgba(80,220,255,0.55)'); g.addColorStop(1, 'rgba(80,220,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - s * 3, y - s * 3, s * 6, s * 6);
    ctx.globalCompositeOperation = 'source-over';
    // holographic tile
    ctx.fillStyle = 'rgba(70,200,240,0.22)';
    ctx.strokeStyle = 'rgba(150,240,255,0.95)';
    ctx.lineWidth = 1.4 * z;
    const r = s * 0.35;
    ctx.beginPath();
    ctx.moveTo(x - s + r, y - s); ctx.lineTo(x + s - r, y - s); ctx.quadraticCurveTo(x + s, y - s, x + s, y - s + r);
    ctx.lineTo(x + s, y + s - r); ctx.quadraticCurveTo(x + s, y + s, x + s - r, y + s); ctx.lineTo(x - s + r, y + s);
    ctx.quadraticCurveTo(x - s, y + s, x - s, y + s - r); ctx.lineTo(x - s, y - s + r); ctx.quadraticCurveTo(x - s, y - s, x - s + r, y - s);
    ctx.fill(); ctx.stroke();
    // scanlines
    ctx.fillStyle = 'rgba(180,245,255,0.18)';
    for (let yy = y - s + 3; yy < y + s - 2; yy += 3 * z) ctx.fillRect(x - s + 2, yy, 2 * s - 4, 0.8);
    // chevron
    ctx.strokeStyle = '#e8fdff'; ctx.lineWidth = 2.4 * z; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.save(); ctx.translate(x, y); ctx.rotate(dir === 'down' ? Math.PI : dir === 'diag' ? Math.PI / 4 : 0);
    ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.2); ctx.lineTo(0, -s * 0.28); ctx.lineTo(s * 0.45, s * 0.2); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  function zoneStrip(ctx, x0, x1, y, alpha) {
    const z = Render.cam.z;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(sx(x0), 0, sx(x1), 0);
    g.addColorStop(0, 'rgba(80,220,255,0)'); g.addColorStop(0.6, 'rgba(80,220,255,' + 0.45 * alpha + ')'); g.addColorStop(1, 'rgba(150,240,255,' + 0.9 * alpha + ')');
    ctx.fillStyle = g;
    ctx.fillRect(sx(x0), sy(y) - 1.5 * z, (x1 - x0) * z, 2.2 * z);
    const g2 = ctx.createLinearGradient(0, sy(y) - 14 * z, 0, sy(y));
    g2.addColorStop(0, 'rgba(80,220,255,0)'); g2.addColorStop(1, 'rgba(80,220,255,' + 0.16 * alpha + ')');
    ctx.fillStyle = g2; ctx.fillRect(sx(x0), sy(y) - 14 * z, (x1 - x0) * z, 14 * z);
    ctx.restore();
  }

  function drawCues(ctx, world) {
    const L = local(world);
    if (world.over || L.state === 'move' || !L.onGround) return;
    const PH = Phys();
    const z = PH.zoneAhead(world, L, 360);
    if (!z) return;
    const fx = L.x + L.w / 2, feet = L.y + L.h;
    const fade = clamp(1 - (z.dist - 120) / 240, 0, 1);
    if (fade <= 0) return;
    const act = !!z.active;
    if (z.kind === 'gap') {
      zoneStrip(ctx, z.edge - PH.EDGE_ZONE, z.edge, feet, fade * (act ? 1 : 0.6));
      drawCue(ctx, z.edge - 30, feet - 58, 'up', fade, act);
    } else if (z.kind === 'vault' || z.kind === 'kong') {
      zoneStrip(ctx, z.s.x - 84, z.s.x, feet, fade * (act ? 1 : 0.6));
      drawCue(ctx, z.s.x + z.s.w / 2, z.s.y - 30, 'up', fade, act);
    } else if (z.kind === 'climb') {
      zoneStrip(ctx, z.s.x - 100, z.s.x, feet, fade * (act ? 1 : 0.6));
      drawCue(ctx, z.s.x - 22, Math.max(z.s.y - 24, feet - 90), 'up', fade, act);
    } else if (z.kind === 'duck') {
      zoneStrip(ctx, z.s.x - 110, z.s.x, feet, fade * (act ? 1 : 0.6));
      drawCue(ctx, z.s.x - 26, feet - 26, 'down', fade, act);
    } else if (z.kind === 'wallrun' && L.role === 'runner' && PH.hasSkill(L.loadout, 'wallrun')) {
      drawCue(ctx, z.s.x - 26, Math.max(z.s.y + 10, feet - 70), 'diag', fade, act);
    }
  }

  // ------------------------------------------------------------------ characters

  const XFADE = 0.16;
  Render.BODY_SCALE = 1.25;
  function drawChar(ctx, c, world) {
    if (c.inside && (world.exitT || 0) > 0.3) return;
    const R = Rig();
    const key = c.role;
    const a = Render.anim[key] || (Render.anim[key] = { prev: null, cur: null, tag: '', t: 1 });
    const target = R.targetPose(c, { time: Render.time });
    const tag = c.state + '|' + (c.move ? c.move.type : '') + '|' + (c.onGround ? 1 : 0);
    if (tag !== a.tag) {
      a.prev = a.cur || target; a.t = 0; a.tag = tag;
    }
    a.t = Math.min(1, a.t + Render.dt / XFADE);
    let p = target;
    if (a.prev && a.t < 1) {
      const sm = a.t * a.t * (3 - 2 * a.t);
      p = R.blend(a.prev, target, sm);
      p.ik = target.ik; p.ground = target.ground;
    }
    a.cur = p;
    const S = Render.BODY_SCALE * (c.role === 'hunter' ? 1.04 : 1);
    const ax = c.x + c.w / 2, ay = c.y + c.h;
    const extra = c.move ? { hand: c.move.hand, faceX: c.move.faceX } : null;
    const j = R.solve(c, p, ax, ay, S, extra);
    R.draw(ctx, c, p, j, S, { x: sx, y: sy, z: Render.cam.z }, { ink: pal(world).ink });
    Render.debug[key] = { hand0: j.hand0, ankle0: j.ankle0, toe0: j.toe0, toe1: j.toe1, ankle1: j.ankle1, hip: j.hip, pose: tag };
  }

  // ------------------------------------------------------------------ particles

  function drawDust(ctx, world) {
    const z = Render.cam.z;
    for (const d of world.dust || []) {
      const k = d.t / 0.6;
      const n = d.big ? 7 : 4;
      for (let i = 0; i < n; i++) {
        const dir = (i / (n - 1) - 0.5) * 2;
        const x = sx(d.x + dir * (10 + 40 * k) * (d.big ? 1.3 : 1)), y = sy(d.y - 3 - 10 * k * Math.abs(dir) - 6 * k);
        ctx.fillStyle = 'rgba(205,215,225,' + (0.45 * (1 - k)) + ')';
        ctx.beginPath(); ctx.arc(x, y, (2 + 6 * k) * z, 0, 6.29); ctx.fill();
      }
    }
  }

  function drawBirds(ctx, world, P) {
    if (!Render.birds) return;
    ctx.fillStyle = P.ink; ctx.strokeStyle = 'rgba(20,28,36,0.75)';
    for (const b of Render.birds) {
      const x = ((b.x + Render.time * b.v - Render.cam.x * 0.25) % 2400 + 2400) % 2400 - 300;
      if (x < -20 || x > Render.w + 20) continue;
      const y = b.y + Math.sin(Render.time * 0.7 + b.ph) * 8;
      const f = Math.sin(Render.time * 9 + b.ph) * 4 * b.s;
      ctx.lineWidth = 1.4 * b.s;
      ctx.beginPath(); ctx.moveTo(x - 6 * b.s, y - f); ctx.quadraticCurveTo(x - 2 * b.s, y - 1, x, y + 1); ctx.quadraticCurveTo(x + 2 * b.s, y - 1, x + 6 * b.s, y - f); ctx.stroke();
    }
  }

  function drawSpeed(ctx, world) {
    const L = local(world);
    const sp = Math.abs(L.vx) / 261;
    if (sp < 0.92 || world.over) return;
    const a = clamp((sp - 0.92) / 0.25, 0, 1) * 0.35;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const yy = ((i * 97.3) % Render.h);
      const ph = ((Render.time * (900 + i * 70)) + i * 211) % (Render.w + 400);
      const x = Render.w + 200 - ph;
      const len = 60 + (i % 3) * 40;
      const g = ctx.createLinearGradient(x, 0, x + len, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,' + a + ')');
      ctx.fillStyle = g; ctx.fillRect(x, yy, len, 1);
    }
    ctx.restore();
  }

  function drawRain(ctx, world) {
    ctx.save();
    ctx.strokeStyle = 'rgba(210,225,240,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 90; i++) {
      const x = ((i * 137.7 + Render.time * 260 - Render.cam.x * 0.6) % (Render.w + 60) + Render.w + 60) % (Render.w + 60) - 30;
      const y = ((i * 71.3 + Render.time * 900) % (Render.h + 40)) - 20;
      ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 16);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawIndicator(ctx, world) {
    const O = other(world), L = local(world);
    if (O.downed || world.over) return;
    const ox = sx(O.x + O.w / 2), oy = sy(O.y + O.h * 0.5);
    if (ox > -8 && ox < Render.w + 8 && oy > -8 && oy < Render.h + 8) return;
    const left = ox < 0;
    const x = left ? 30 : Render.w - 30, y = clamp(oy, 70, Render.h - 60);
    const hunter = O.role === 'hunter';
    ctx.save();
    ctx.fillStyle = 'rgba(245,250,252,0.92)';
    ctx.beginPath(); ctx.arc(x, y, 15, 0, 6.29); ctx.fill();
    ctx.beginPath();
    if (left) { ctx.moveTo(x - 15, y - 7); ctx.lineTo(x - 25, y); ctx.lineTo(x - 15, y + 7); }
    else { ctx.moveTo(x + 15, y - 7); ctx.lineTo(x + 25, y); ctx.lineTo(x + 15, y + 7); }
    ctx.fill();
    ctx.fillStyle = '#07090c';
    ctx.beginPath(); ctx.arc(x, y - 3, 4.5, 0, 6.29); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y + 8, 8, 6, 0, Math.PI, 0); ctx.fill();
    if (hunter) { ctx.fillStyle = '#ff4a30'; ctx.fillRect(x - 1, y - 4, 5, 1.6); }
    const m = Math.round(Math.abs((O.x - L.x)) / 29);
    ctx.fillStyle = 'rgba(245,250,252,0.95)';
    ctx.font = '600 11px "Barlow Condensed", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m + ' M', x, y + 30);
    ctx.restore();
  }

  // ------------------------------------------------------------------ frame

  Render.draw = function (world, opts) {
    opts = opts || {};
    const ctx = Render.ctx;
    const W = Render.w, H = Render.h;
    const now = performance.now() / 1000;
    Render.dt = Math.min(0.05, Render._last ? now - Render._last : 0.016);
    Render._last = now;
    Render.time += Render.dt * (world.scale || 1);
    ensureLayers(world);
    const Ls = Render.layers, P = Ls.P, cam = Render.cam;
    const zb = baseZoom();
    const zr = cam.z / zb;

    // sky, rays, clouds
    ctx.drawImage(Render.fx.sky.c, 0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.9;
    drawStrip(ctx, Ls.clouds, cam.x * 0.03 + Render.time * 4, H * 0.62, 1);
    ctx.restore();
    // horizon reference: where the world ground (y ~ 300) sits on screen, with parallax
    const ground = sy(300);
    const horizon = (f) => H * 0.78 + (ground - H * 0.7) * f;
    drawStrip(ctx, Ls.far, cam.x * 0.06, horizon(0.08) + 10, 1 + (zr - 1) * 0.1);
    drawBirds(ctx, world, P);
    drawStrip(ctx, Ls.mid, cam.x * 0.15, horizon(0.18) + 30, 1 + (zr - 1) * 0.2);
    // haze between layers
    const hz = ctx.createLinearGradient(0, H * 0.3, 0, H);
    hz.addColorStop(0, 'rgba(255,255,255,0)'); hz.addColorStop(1, P.haze);
    ctx.globalAlpha = 0.45; ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    drawStrip(ctx, Ls.near, cam.x * 0.38, horizon(0.4) + 70 * zr, 1 + (zr - 1) * 0.45);
    // god rays over the background only (the black foreground cuts them)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
    ctx.drawImage(Render.fx.rays.c, -((cam.x * 0.02) % 40), 0, W, H);
    ctx.restore();

    // world: props, geometry, gates
    for (const pr of (world.track.props || [])) drawProp(ctx, pr, P);
    const PH = Phys();
    const geo = world.geo || PH.buildGeo(world.track);
    for (const W2 of geo.walls) drawWall(ctx, W2, P);
    const plats = PH.platforms(world);
    for (const p of plats) drawPlatform(ctx, p, P, world.wet, hashStr(p.id || (p.x + ':' + p.y)));
    for (const o of geo.obstacles) {
      let gone = false;
      for (const hole of world.collapsed) if (Math.abs(o.base - hole.y) < 8 && o.x + o.w > hole.x - 6 && o.x < hole.x + hole.w + 6) gone = true;
      if (!gone) drawObstacle(ctx, o, P, Render.time);
    }
    for (const p of geo.pipes) drawPipe(ctx, p, P);
    for (const g of world.gates) drawGate(ctx, g, P);
    // collapse scars
    ctx.fillStyle = P.ink;
    for (const hole of world.collapsed) {
      for (let k = 0; k < 6; k++) {
        rect(ctx, hole.x - 6 + k * 2, hole.y + k * 3, 3, 3);
        rect(ctx, hole.x + hole.w + 4 - k * 2, hole.y + k * 3, 3, 3);
      }
    }
    drawExit(ctx, world, P, 'back');
    if (!opts.title && Render.localRole === 'hunter') drawTrapMarks(ctx, world);

    if (!opts.title) drawCues(ctx, world);

    // debris
    ctx.fillStyle = P.ink;
    for (const d of world.debris) {
      ctx.save(); ctx.translate(sx(d.x), sy(d.y)); ctx.rotate(d.rot);
      ctx.fillRect(-d.w / 2 * cam.z, -d.h / 2 * cam.z, d.w * cam.z, d.h * cam.z);
      ctx.restore();
    }
    drawDust(ctx, world);

    // characters: the other one first, local on top
    if (opts.title) drawChar(ctx, world.runner, world);
    else {
      const first = Render.localRole === 'hunter' ? world.runner : world.hunter;
      const second = Render.localRole === 'hunter' ? world.hunter : world.runner;
      drawChar(ctx, first, world);
      drawChar(ctx, second, world);
    }

    drawExit(ctx, world, P, 'front');
    if (P.rain) drawRain(ctx, world);
    if (!opts.title) drawSpeed(ctx, world);

    // bloom-ish sun glare + vignette
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const sg = ctx.createRadialGradient(W * 0.2, -H * 0.05, 0, W * 0.2, -H * 0.05, H * 0.8);
    sg.addColorStop(0, P.sun + '0.35)'); sg.addColorStop(1, P.sun + '0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.drawImage(Render.fx.vig.c, 0, 0, W, H);

    if (world.scale < 0.9 && !world.over) {
      ctx.fillStyle = 'rgba(8,12,18,0.18)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '500 15px "Barlow Condensed", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N E A R   M I S S', W / 2, 92);
      ctx.textAlign = 'left';
    }
    if (!opts.title) drawIndicator(ctx, world);
  };

  root.ChaseRender = Render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
