/**
 * CHASE LINE renderer — dawn city, silhouettes, red hunter, parallax.
 */
(function (root) {
  const Render = {
    canv: null, ctx: null, dpr: 1, w: 0, h: 0,
    camX: 0, camY: 0, shakeX: 0, shakeY: 0,
    cityLayers: null,
  };

  Render.init = function (canvas) {
    Render.canv = canvas;
    Render.ctx = canvas.getContext('2d');
  };

  Render.resize = function (cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (Render.w === cssW && Render.h === cssH && Render.dpr === dpr && Render.canv.width) return;
    Render.dpr = dpr;
    Render.w = cssW;
    Render.h = cssH;
    Render.canv.width = Math.round(cssW * dpr);
    Render.canv.height = Math.round(cssH * dpr);
    Render.canv.style.width = cssW + 'px';
    Render.canv.style.height = cssH + 'px';
    Render.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Render.cityLayers = null;
  };

  function makeCityLayer(w, h, seed, color, density, minH, maxH) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    let rng = seed;
    function rnd() { rng = (rng * 16807 + 0) % 2147483647; return rng / 2147483647; }
    let x = 0;
    while (x < w) {
      const bw = minH * 0.3 + rnd() * 40;
      const bh = minH + rnd() * (maxH - minH);
      ctx.fillRect(x, h - bh, bw - 1, bh);
      if (rnd() > 0.6) {
        ctx.fillRect(x + 4, h - bh - 10 - rnd() * 16, 6, 12 + rnd() * 16);
      }
      x += bw + rnd() * density;
    }
    return c;
  }

  function ensureCity(sky) {
    if (Render.cityLayers) return;
    const w = 1800, h = 280;
    if (sky === 'monsoon') {
      Render.cityLayers = [
        makeCityLayer(w, h, 11, 'rgba(70,80,95,0.35)', 8, 40, 110),
        makeCityLayer(w, h, 23, 'rgba(50,58,70,0.5)', 6, 50, 140),
        makeCityLayer(w, h, 47, 'rgba(36,42,52,0.75)', 4, 70, 180),
      ];
    } else {
      Render.cityLayers = [
        makeCityLayer(w, h, 11, 'rgba(140,155,175,0.45)', 8, 40, 120),
        makeCityLayer(w, h, 23, 'rgba(100,115,135,0.55)', 6, 50, 150),
        makeCityLayer(w, h, 47, 'rgba(70,80,100,0.7)', 4, 80, 190),
      ];
    }
  }

  function skyGradient(ctx, w, h, sky, t) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (sky === 'monsoon') {
      g.addColorStop(0, '#6a7380');
      g.addColorStop(0.5, '#8a8f97');
      g.addColorStop(1, '#b7b3aa');
    } else {
      g.addColorStop(0, '#d7c4b0');
      g.addColorStop(0.4, '#e6c9a8');
      g.addColorStop(0.62, '#f0d0a8');
      g.addColorStop(0.78, '#c9c4c0');
      g.addColorStop(1, '#9aa3b0');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // sun glow
    if (sky !== 'monsoon') {
      const sx = w * 0.62, sy = h * 0.52, r = h * 0.35;
      const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, r);
      sg.addColorStop(0, 'rgba(255,210,140,0.55)');
      sg.addColorStop(1, 'rgba(255,210,140,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  Render.follow = function (world, dt) {
    const r = world.runner, h = world.hunter;
    const mid = (r.x + h.x) / 2;
    const span = Math.abs(r.x - h.x);
    const look = r.x + 220 + r.vx * 0.12;
    let tx = (span < 420 ? (look + mid) / 2 : look) - Render.w * 0.38;
    tx = Math.max(-40, tx);
    Render.camX += (tx - Render.camX) * Math.min(1, 0.1 + (dt || 0.016) * 4);
    const ty = Math.min(r.y, h.y) - 140;
    Render.camY += (ty - Render.camY) * 0.08;
    Render.camY = Math.max(-80, Math.min(80, Render.camY));
    if (world.shake > 0.4) {
      Render.shakeX = (Math.random() - 0.5) * world.shake;
      Render.shakeY = (Math.random() - 0.5) * world.shake * 0.6;
    } else { Render.shakeX = 0; Render.shakeY = 0; }
  };

  function wx(x) { return x - Render.camX + Render.shakeX; }
  function wy(y) { return y - Render.camY + Render.shakeY; }

  function drawWaterTower(ctx, x, y, s) {
    const b = y;
    ctx.strokeStyle = '#2a3038';
    ctx.fillStyle = '#3a424c';
    ctx.lineWidth = 2;
    const tw = 36 * s, th = 28 * s, hh = 70 * s;
    // legs
    ctx.beginPath();
    ctx.moveTo(x - tw * 0.45, b);
    ctx.lineTo(x - tw * 0.25, b - hh);
    ctx.moveTo(x + tw * 0.45, b);
    ctx.lineTo(x + tw * 0.25, b - hh);
    ctx.moveTo(x - tw * 0.15, b);
    ctx.lineTo(x, b - hh);
    ctx.moveTo(x + tw * 0.15, b);
    ctx.lineTo(x, b - hh);
    ctx.stroke();
    // tank
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(x - tw / 2, b - hh - th, tw, th);
    ctx.strokeRect(x - tw / 2, b - hh - th, tw, th);
    ctx.beginPath();
    ctx.arc(x, b - hh - th, tw * 0.5, Math.PI, 0);
    ctx.fill(); ctx.stroke();
  }

  function drawCrane(ctx, x, y, s) {
    ctx.strokeStyle = '#4a5560';
    ctx.lineWidth = 3 * s;
    const h = 160 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x + 110 * s, y - h + 8);
    ctx.moveTo(x, y - h + 30);
    ctx.lineTo(x + 80 * s, y - h + 34);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 100 * s, y - h + 8);
    ctx.lineTo(x + 100 * s, y - 40);
    ctx.stroke();
    ctx.fillStyle = '#3a424c';
    ctx.fillRect(x - 8, y - 18, 16, 18);
  }

  function drawAntenna(ctx, x, y) {
    ctx.strokeStyle = '#2a3038';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 54);
    ctx.moveTo(x - 8, y - 30);
    ctx.lineTo(x + 8, y - 30);
    ctx.stroke();
    ctx.fillStyle = '#c45';
    ctx.beginPath();
    ctx.arc(x, y - 54, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlatform(ctx, p, wet) {
    const x = wx(p.x), y = wy(p.y), w = p.w, h = p.h;
    if (x + w < -20 || x > Render.w + 20) return;
    // facade
    ctx.fillStyle = '#2c333c';
    ctx.fillRect(x, y, w, Math.min(h + 80, Render.h - y + 20));
    // roof cap
    ctx.fillStyle = wet ? '#3a4450' : '#3e4752';
    ctx.fillRect(x - 4, y - 7, w + 8, 8);
    ctx.fillStyle = wet ? '#4a5664' : '#4a5460';
    ctx.fillRect(x, y - 10, w, 5);
    // windows
    ctx.fillStyle = 'rgba(20,22,28,0.7)';
    const cols = Math.max(1, Math.floor(w / 28));
    for (let i = 0; i < cols; i++) {
      for (let r = 0; r < 3; r++) {
        const wxo = x + 8 + i * 28;
        const wyo = y + 16 + r * 26;
        if (wxo + 12 < x + w - 6) ctx.fillRect(wxo, wyo, 12, 16);
      }
    }
  }

  function drawObstacle(ctx, o) {
    const x = wx(o.x), y = wy(o.y);
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(x, y - o.h, o.w, o.h);
    ctx.strokeStyle = '#1a1e24';
    ctx.strokeRect(x, y - o.h, o.w, o.h);
    if (o.type === 'ac') {
      ctx.fillStyle = '#3a424c';
      ctx.fillRect(x + 4, y - o.h + 4, o.w - 8, 6);
    }
  }

  function drawGate(ctx, g) {
    const gh = g.h * (1 - g.open);
    const x = wx(g.x), y = wy(g.y);
    ctx.fillStyle = '#1c2228';
    ctx.strokeStyle = '#d8dce0';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y - gh, g.w, gh);
    ctx.strokeRect(x, y - gh, g.w, gh);
    const bars = 5;
    ctx.beginPath();
    for (let i = 0; i < bars; i++) {
      const bx = x + 4;
      const by = y - gh + 8 + i * ((gh - 10) / bars);
      ctx.moveTo(bx, by);
      ctx.lineTo(x + g.w - 4, by);
    }
    ctx.stroke();
  }

  function limb(ctx, x1, y1, x2, y2, width) {
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function poseOf(c, t) {
    const st = c.state;
    const ph = c.phase || 0;
    const swing = Math.sin(ph * 6.2);
    const swing2 = Math.sin(ph * 6.2 + Math.PI);
    let pose = {
      lean: 0.25,
      head: 0,
      lu: 0.6 * swing, ll: 0.5 * swing,
      ru: 0.6 * swing2, rl: 0.5 * swing2,
      la: -0.7 * swing, ra: -0.7 * swing2,
      tuck: 0,
    };
    if (st === 'jump' || st === 'precision') {
      const apex = c.vy < 0 ? 0.3 : 0.6;
      pose.tuck = c.vy < 0 ? 0.2 : 0.55;
      pose.lu = -0.2 - pose.tuck; pose.ll = 0.8;
      pose.ru = 0.9; pose.rl = 1.2;
      pose.la = 1.1; pose.ra = 0.2;
      pose.lean = 0.15;
    }
    if (st === 'slide') {
      pose.lean = 1.2;
      pose.lu = 1.4; pose.ll = 0.2;
      pose.ru = 1.5; pose.rl = 0.1;
      pose.la = 0.2; pose.ra = 1.4;
    }
    if (st === 'roll') {
      const spin = (c.stateT || 0) * 16;
      pose.spin = spin;
      pose.tuck = 1;
      pose.lu = 1.2; pose.ru = 1.2; pose.la = 1.4; pose.ra = 1.4;
    }
    if (st === 'vault' || st === 'kong') {
      pose.lean = 0.6;
      pose.la = -0.4; pose.ra = -0.5;
      pose.lu = 0.8; pose.ru = 1.3;
      pose.ll = 0.4; pose.rl = 0.9;
    }
    if (st === 'wallrun') {
      pose.lean = -0.2;
      pose.lu = 0.4 * swing; pose.ru = 0.4 * swing2;
      pose.la = 1.2; pose.ra = 0.4;
    }
    if (st === 'dive') {
      pose.lean = 1.3;
      pose.la = 1.6; pose.ra = 1.5;
      pose.lu = 0.2; pose.ru = 0.3;
    }
    if (st === 'stumble') {
      pose.lean = 0.5;
      pose.la = 0.8; pose.ra = -0.4;
    }
    if (st === 'hang') {
      pose.lean = 0;
      pose.la = -1.6; pose.ra = -1.5;
      pose.lu = 0.4; pose.ru = 0.5;
    }
    if (st === 'grab') {
      pose.la = 0.8; pose.ra = 1.2;
      pose.lean = 0.4;
    }
    return pose;
  }

  function drawSilhouette(ctx, c, hunter) {
    if (c.ragdoll) {
      drawRagdoll(ctx, c, hunter);
      return;
    }
    const x = wx(c.x + c.w / 2);
    const y = wy(c.y);
    const p = poseOf(c);
    ctx.save();
    ctx.translate(x, y + (c.h * 0.15));
    if (p.spin) ctx.rotate(p.spin);
    const scale = 1;
    ctx.scale(c.facing || 1, 1);

    const col = hunter ? '#1a0a0a' : '#0c0c0e';
    const outline = hunter ? '#e22b2b' : null;

    function body(stroke, widthMul) {
      ctx.strokeStyle = stroke;
      ctx.fillStyle = stroke;
      const shX = 2, shY = 8;
      const hipX = -2, hipY = 28;
      const headX = 4, headY = -6;
      if (!hunter) {
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(headX - 5, headY + 3);
        const ph = c.phase || 0;
        for (let i = 1; i <= 5; i++) {
          ctx.lineTo(-6 - i * 5 - Math.sin(ph * 2 + i) * 2.5, headY + 4 + i * 3.2 + Math.cos(ph * 1.7 + i) * 1.5);
        }
        ctx.stroke();
      }
      // torso
      limb(ctx, shX, shY, hipX, hipY, 7 * widthMul);
      // head
      ctx.beginPath();
      ctx.arc(headX, headY, 7 * widthMul, 0, Math.PI * 2);
      ctx.fill();
      // cap brim
      ctx.lineWidth = 2.5 * widthMul;
      ctx.beginPath();
      ctx.moveTo(headX - 8, headY - 1);
      ctx.lineTo(headX + 10, headY + 1);
      ctx.stroke();
      // arms
      const lax = shX + Math.cos(p.la + 0.4) * 16;
      const lay = shY + Math.sin(p.la + 0.4) * 16;
      const rax = shX + Math.cos(p.ra + 0.4) * 16;
      const ray = shY + Math.sin(p.ra + 0.4) * 16;
      limb(ctx, shX, shY, lax, lay, 4 * widthMul);
      limb(ctx, shX, shY, rax, ray, 4 * widthMul);
      // legs
      const lkx = hipX + Math.sin(p.lu) * 14;
      const lky = hipY + Math.cos(p.lu) * 12;
      const rkx = hipX + Math.sin(p.ru) * 14;
      const rky = hipY + Math.cos(p.ru) * 12;
      limb(ctx, hipX, hipY, lkx, lky, 5 * widthMul);
      limb(ctx, lkx, lky, lkx + Math.sin(p.ll) * 12, lky + Math.cos(p.ll) * 12, 4.5 * widthMul);
      limb(ctx, hipX, hipY, rkx, rky, 5 * widthMul);
      limb(ctx, rkx, rky, rkx + Math.sin(p.rl) * 12, rky + Math.cos(p.rl) * 12, 4.5 * widthMul);
    }

    if (outline) {
      ctx.save();
      ctx.shadowColor = 'rgba(226,43,43,0.65)';
      ctx.shadowBlur = 12;
      body(outline, 1.35);
      ctx.restore();
    }
    body(col, 1);
    ctx.restore();
  }

  function drawRagdoll(ctx, c, hunter) {
    const r = c.ragdoll;
    if (!r) return;
    const col = hunter ? '#1a0a0a' : '#0c0c0e';
    const get = (id) => r.pts.find((p) => p.id === id);
    ctx.strokeStyle = hunter ? '#e22b2b' : col;
    ctx.fillStyle = col;
    ctx.lineCap = 'round';
    function link(a, b, w) {
      const A = get(a), B = get(b);
      if (!A || !B) return;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(wx(A.x), wy(A.y));
      ctx.lineTo(wx(B.x), wy(B.y));
      ctx.stroke();
    }
    if (hunter) {
      ctx.shadowColor = 'rgba(226,43,43,0.6)';
      ctx.shadowBlur = 10;
    }
    link('head', 'neck', 6);
    link('neck', 'hip', 7);
    link('neck', 'lhand', 4);
    link('neck', 'rhand', 4);
    link('hip', 'lfoot', 5);
    link('hip', 'rfoot', 5);
    const hd = get('head');
    if (hd) {
      ctx.beginPath();
      ctx.arc(wx(hd.x), wy(hd.y), 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  Render.draw = function (world, fx) {
    const ctx = Render.ctx;
    const w = Render.w, h = Render.h;
    const sky = world.track.sky || 'dawn';
    ensureCity(sky);
    skyGradient(ctx, w, h, sky, world.elapsed);

    // parallax city
    const layers = [0.15, 0.32, 0.5];
    Render.cityLayers.forEach((img, i) => {
      const par = layers[i];
      const ox = -((Render.camX * par) % img.width);
      const oy = h * 0.26 + i * 8 - Render.camY * par * 0.12;
      ctx.drawImage(img, ox, oy);
      ctx.drawImage(img, ox + img.width, oy);
    });

    // haze
    const hg = ctx.createLinearGradient(0, h * 0.4, 0, h * 0.7);
    hg.addColorStop(0, 'rgba(200,190,180,0)');
    hg.addColorStop(1, 'rgba(180,175,170,0.18)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, w, h);

    // props behind some roofs
    for (const pr of (world.track.props || [])) {
      const x = wx(pr.x), y = wy(pr.y);
      if (x < -80 || x > w + 80) continue;
      if (pr.type === 'watertower') drawWaterTower(ctx, x, y, pr.s || 1);
      if (pr.type === 'crane') drawCrane(ctx, x, y, pr.s || 1);
      if (pr.type === 'antenna') drawAntenna(ctx, x, y);
    }

    // platforms
    const plats = (root.ChasePhysics && root.ChasePhysics.platforms) ? root.ChasePhysics.platforms(world) : world.track.platforms;
    for (const p of plats) drawPlatform(ctx, p, world.wet);
    for (const o of (world.track.obstacles || [])) drawObstacle(ctx, o);
    for (const pipe of (world.track.pipes || [])) {
      ctx.fillStyle = '#2a3038';
      ctx.fillRect(wx(pipe.x), wy(pipe.y), pipe.w, pipe.h);
    }
    for (const g of world.gates) drawGate(ctx, g);

    // finish line
    const fx0 = wx(world.finishX);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(fx0, 0, 4, h);
    ctx.fillStyle = 'rgba(20,24,32,0.6)';
    ctx.font = 'bold 13px "Barlow Condensed", sans-serif';
    ctx.fillText('FINISH', fx0 + 8, wy((world.track.platforms[world.track.platforms.length - 1] || { y: 230 }).y) - 16);

    // debris
    ctx.fillStyle = '#2a3038';
    for (const d of world.debris) {
      ctx.save();
      ctx.translate(wx(d.x), wy(d.y));
      ctx.rotate(d.rot);
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.restore();
    }

    // characters: hunter then runner (runner in front)
    drawSilhouette(ctx, world.hunter, true);
    drawSilhouette(ctx, world.runner, false);

    // speed lines
    const spd = Math.max(world.runner.vx, world.hunter.vx);
    if (spd > 360) {
      ctx.strokeStyle = 'rgba(20,20,24,' + ((spd - 360) / 400) + ')';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const yy = 40 + (i * 37 + (world.elapsed * 200) % 30);
        const len = 20 + (spd - 360) * 0.12;
        ctx.beginPath();
        ctx.moveTo(w * 0.3, yy);
        ctx.lineTo(w * 0.3 + len, yy);
        ctx.stroke();
      }
    }

    // slow-mo vignette
    if (world.scale < 0.9) {
      const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(10,8,20,0.38)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.font = 'italic 16px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NEAR MISS', w / 2, 86);
      ctx.textAlign = 'left';
    }
  };

  root.ChaseRender = Render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
