/**
 * CHASE LINE game shell — screens, input, match flow, net glue, save.
 */
(function () {
  const Prof = window.ChaseProfile;
  const Skills = window.ChaseSkills;
  const Tracks = window.ChaseTracks;
  const Phys = window.ChasePhysics;
  const Audio = window.ChaseAudio;
  const Render = window.ChaseRender;
  const AI = window.ChaseAI;
  const Net = window.ChaseNet;

  const $ = (id) => document.getElementById(id);

  const Game = {
    screen: 'title',
    mode: 'solo', // solo | host | guest | pass
    trackId: 'water-towers',
    world: null,
    acc: 0,
    last: 0,
    youAre: 'runner', // role this device controls this round
    series: { you: 0, them: 0, round: 0, firstRole: 'runner' },
    opp: { name: 'AI', rank: 'Bronze', unlocks: Prof.START_UNLOCKS, loadoutRunner: ['jump','slide','roll','vault'], loadoutChaser: ['sprint','grab','collapse'] },
    diff: 'normal',
    muted: false,
    passTurn: false,
    seq: 0,
    remoteInput: {},
    guestShadow: null,
    stylePopT: 0,
    daily: false,
    lastAward: null,
  };

  function show(name) {
    Game.screen = name;
    document.querySelectorAll('.screen').forEach((n) => n.classList.remove('is-on'));
    $('hud').classList.toggle('is-on', name === 'play' || name === 'cd');
    $('muteFab').style.display = (name === 'play' || name === 'cd') ? 'none' : '';
    const map = {
      title: 'titleScreen', name: 'nameScreen', mode: 'modeScreen', room: 'roomScreen',
      track: 'trackScreen', skills: 'skillScreen', loadout: 'loadoutScreen',
      cd: 'cdScreen', result: 'resultScreen',
    };
    if (map[name]) $(map[name]).classList.add('is-on');
    if (name === 'title') refreshProfileChip();
    if (name === 'skills') renderTrees();
    if (name === 'track') renderTracks();
    if (name === 'loadout') renderLoadout();
  }

  function refreshProfileChip() {
    const p = Prof.current();
    if (!p) { $('profileChip').textContent = ''; return; }
    const r = Prof.rankFor(p.xp);
    $('profileChip').textContent = p.name + '  ·  ' + r.name + '  ·  ' + p.xp + ' XP';
  }

  function needNameThen(next) {
    if (!Prof.current()) {
      Game._afterName = next;
      show('name');
      setTimeout(() => $('nameInput').focus(), 50);
      return false;
    }
    return true;
  }

  function formatTime(t) {
    const s = Math.max(0, Math.ceil(t));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function youProfile() { return Prof.publicView(); }

  function difficultyFor() {
    const p = Prof.current();
    if (!p) return 'normal';
    const r = Prof.rankFor(p.xp).id;
    if (r === 'bronze') return 'easy';
    if (r === 'platinum' || r === 'diamond' || r === 'legend') return 'hard';
    return 'normal';
  }

  function renderTracks() {
    const { districts, tracks } = Tracks.listForSelect();
    const root = $('trackGrid');
    root.innerHTML = '';
    districts.forEach((d) => {
      const h = document.createElement('div');
      h.style.gridColumn = '1 / -1';
      h.style.letterSpacing = '.16em';
      h.style.fontWeight = '700';
      h.style.margin = '6px 0 0';
      h.textContent = d.kicker + '  —  ' + d.name + (d.unlocked ? '' : '  ·  LOCKED');
      root.appendChild(h);
      const list = tracks.filter((t) => t.district === d.id);
      if (!list.length && !d.unlocked) {
        const c = document.createElement('button');
        c.className = 'card is-locked';
        c.type = 'button';
        c.innerHTML = '<h3>' + d.name + '</h3><p>' + d.blurb + '</p><div class="lock">LOCKED</div>';
        root.appendChild(c);
        return;
      }
      if (!d.unlocked) {
        const c = document.createElement('button');
        c.className = 'card is-locked';
        c.type = 'button';
        c.innerHTML = '<h3>' + d.name + '</h3><p>' + d.blurb + '</p><div class="lock">LOCKED</div>';
        root.appendChild(c);
        return;
      }
      list.forEach((t) => {
        const c = document.createElement('button');
        c.className = 'card' + (Game.trackId === t.id ? ' is-picked' : '');
        c.type = 'button';
        c.innerHTML = '<h3>' + t.name + '</h3><p>' + (t.blurb || d.blurb) + '</p>';
        c.addEventListener('click', () => {
          Game.trackId = t.id;
          Game.daily = !!t.daily;
          Audio.ui();
          show('loadout');
        });
        root.appendChild(c);
      });
    });
  }

  function renderTrees() {
    const p = Prof.current();
    if (!p) return;
    const rank = Prof.rankFor(p.xp);
    const next = Prof.nextRank(p.xp);
    $('skillXp').textContent = p.name + '  ·  ' + rank.name + '  ·  ' + p.xp + ' XP'
      + (next ? '  ·  ' + (next.xp - p.xp) + ' to ' + next.name : '')
      + '   ·   runner pool ' + p.runnerXp + '  ·  chaser pool ' + p.chaserXp;
    function fill(el, role) {
      el.innerHTML = '<h2>' + (role === 'runner' ? 'Runner' : 'Chaser') + '</h2>';
      let tier = 0;
      Skills.list(role).forEach((s) => {
        if (s.tier !== tier) {
          tier = s.tier;
          const lab = document.createElement('div');
          lab.className = 'tier';
          lab.textContent = tier <= 2 ? ('TIER ' + tier) : (tier === 3 ? 'TIER 3  ·  LOCKED' : 'TIER 4 / LEGEND  ·  LOCKED');
          el.appendChild(lab);
        }
        const owned = p.unlocks.indexOf(s.id) >= 0;
        const can = Skills.canUnlock(p, s.id);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'skill' + (owned ? ' is-owned' : '') + ((s.locked || (!owned && !can.ok && can.reason === 'locked-tier')) ? ' is-locked' : '') + (can.ok && !owned ? ' is-can' : '');
        const cost = s.cost ? (s.cost + ' XP') : 'STARTING';
        b.innerHTML = '<b>' + s.name + '</b>  ·  ' + cost + '<span>' + s.desc + (s.teaser ? ' ' + s.teaser : '') + (s.counter ? '  Countered by ' + (Skills.SKILLS[s.counter] ? Skills.SKILLS[s.counter].name : s.counter) + '.' : '') + '</span>';
        b.addEventListener('click', () => {
          if (owned || s.locked) return;
          const chk = Skills.canUnlock(Prof.current(), s.id);
          if (!chk.ok) {
            Audio.fail();
            return;
          }
          Prof.update((pr) => {
            pr.xp -= s.cost;
            if (s.role === 'runner') pr.runnerXp = Math.max(0, pr.runnerXp - Math.floor(s.cost * 0.25));
            else pr.chaserXp = Math.max(0, pr.chaserXp - Math.floor(s.cost * 0.25));
            if (pr.unlocks.indexOf(s.id) < 0) pr.unlocks.push(s.id);
          });
          Audio.ui();
          renderTrees();
        });
        el.appendChild(b);
      });
    }
    fill($('runnerTree'), 'runner');
    fill($('chaserTree'), 'chaser');
  }

  function renderLoadout() {
    const p = Prof.current();
    function fill(el, role, key) {
      el.innerHTML = '';
      const equipped = p[key].slice();
      Skills.list(role).filter((s) => !s.locked && p.unlocks.indexOf(s.id) >= 0).forEach((s) => {
        const on = equipped.indexOf(s.id) >= 0;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'skill' + (on ? ' is-owned' : '');
        b.innerHTML = '<b>' + s.name + '</b><span>' + (on ? 'Equipped' : 'Tap to equip') + '  ·  ' + s.desc + '</span>';
        b.addEventListener('click', () => {
          Prof.update((pr) => {
            const arr = pr[key];
            const i = arr.indexOf(s.id);
            if (i >= 0) {
              if (arr.length > 1) arr.splice(i, 1);
            } else {
              if (arr.length >= 4) arr.shift();
              arr.push(s.id);
            }
          });
          renderLoadout();
        });
        el.appendChild(b);
      });
    }
    fill($('loadR'), 'runner', 'loadoutRunner');
    fill($('loadC'), 'chaser', 'loadoutChaser');
  }

  function startRound() {
    const p = Prof.current();
    const track = Tracks.get(Game.trackId) || Tracks.dailyRemix();
    const you = youProfile();
    const opp = Game.opp;
    const runnerLoad = (Game.youAre === 'runner' ? you.loadoutRunner : opp.loadoutRunner).slice();
    const hunterLoad = (Game.youAre === 'hunter' ? you.loadoutChaser : opp.loadoutChaser).slice();
    // ensure movement basics
    ['jump', 'slide', 'roll', 'vault'].forEach((id) => { if (runnerLoad.indexOf(id) < 0 && (Game.youAre === 'runner' ? you.unlocks : opp.unlocks).indexOf(id) >= 0) runnerLoad.push(id); });
    Game.world = Phys.createWorld(track, { runnerLoadout: runnerLoad, hunterLoadout: hunterLoad });
    Game.acc = 0;
    Game.remoteInput = {};
    Game.guestShadow = null;
    const rn = Game.youAre === 'runner' ? (you.name + ' (YOU)') : (opp.name);
    const hn = Game.youAre === 'hunter' ? (you.name + ' (YOU)') : (opp.name);
    $('runnerLabel').textContent = 'RUNNER: ' + rn;
    $('hunterLabel').textContent = 'HUNTER: ' + hn;
    const canGate = hunterLoad.indexOf('gate') >= 0;
    const canCol = hunterLoad.indexOf('collapse') >= 0;
    $('btnGate').disabled = !canGate;
    $('btnCollapse').disabled = !canCol;
    $('traps').classList.toggle('is-on', Game.youAre === 'hunter');
    $('sprintBtn').classList.toggle('is-on', Game.youAre === 'hunter' && hunterLoad.indexOf('sprint') >= 0);
    countdownThenPlay();
  }

  function countdownThenPlay() {
    show('cd');
    const you = youProfile();
    $('cdRoles').textContent = (Game.youAre === 'runner' ? 'YOU RUN  ·  THEY HUNT' : 'YOU HUNT  ·  THEY RUN');
    let n = 3;
    $('cdBig').textContent = '3';
    Audio.unlock();
    const tick = () => {
      if (n <= 0) {
        show('play');
        Game.last = performance.now();
        return;
      }
      $('cdBig').textContent = String(n);
      n--;
      setTimeout(tick, 550);
    };
    tick();
  }

  function endRound() {
    const world = Game.world;
    if (!world || world._settled) return;
    world._settled = true;
    const escaped = world.result === 'escape';
    const youWinRound = (escaped && Game.youAre === 'runner') || (!escaped && Game.youAre === 'hunter');
    if (youWinRound) Game.series.you += 1; else Game.series.them += 1;
    Game.series.round += 1;

    const stylePts = world.style | 0;
    let xp = 40 + Math.min(80, stylePts);
    let kind = 'style';
    if (escaped && Game.youAre === 'runner') { xp += 140; kind = 'escape'; Prof.award('escape', 0); }
    if (!escaped && Game.youAre === 'hunter') { xp += 140; kind = 'catch'; Prof.award('catch', 0); }
    if (escaped && Game.youAre === 'hunter') { xp += 30; kind = 'chaser'; }
    if (!escaped && Game.youAre === 'runner') { xp += 30; kind = 'runner'; }
    const before = Prof.current().xp;
    Prof.award(kind, xp, stylePts);
    Prof.update((p) => { p.stats.matches += 1; });
    const after = Prof.current();
    const matchOver = Game.series.you >= 2 || Game.series.them >= 2 || Game.series.round >= 3;
    if (matchOver && Game.series.you > Game.series.them) Prof.award('win', 60);

    Game.lastAward = { xp, before, after: after.xp, style: stylePts, escaped, youWinRound, matchOver };
    if (escaped) Audio.escape(); else Audio.catch();
    setTimeout(() => showResults(), 700);
  }

  function showResults() {
    const a = Game.lastAward || { xp: 0, before: 0, after: 0, style: 0, escaped: false, youWinRound: false, matchOver: true };
    $('resKicker').textContent = 'ROUND ' + Game.series.round;
    $('resTitle').textContent = a.escaped ? 'ESCAPE' : 'CAUGHT';
    $('resLine').textContent = (a.youWinRound ? 'Your point. ' : 'Their point. ') + '+' + a.xp + ' XP  ·  ' + a.style + ' style';
    $('seriesLine').textContent = 'Series  ' + Game.series.you + '  —  ' + Game.series.them + (a.matchOver ? (Game.series.you > Game.series.them ? '  ·  You take the match.' : '  ·  They take the match.') : '  ·  Best of three.');
    const p = Prof.current();
    const rank = Prof.rankFor(p.xp);
    const nextR = Prof.nextRank(p.xp);
    const floor = rank.xp;
    const ceil = nextR ? nextR.xp : floor + 1;
    $('xpFill').style.width = Math.min(100, ((p.xp - floor) / (ceil - floor)) * 100) + '%';
    const teaser = Skills.nextTeaser(p, Game.youAre === 'runner' ? 'runner' : 'chaser') || Skills.nextTeaser(p, 'runner');
    if (teaser) {
      $('teaser').textContent = teaser.locked
        ? ('Next unlock teaser: ' + teaser.name + ' — still locked in a later tier.')
        : ('Next unlock: ' + teaser.name + '  ·  ' + teaser.cost + ' XP. ' + (teaser.teaser || teaser.desc));
    } else {
      $('teaser').textContent = rank.name + ' rank. The ladder climbs to Legend.';
    }
    $('btnSwap').style.display = a.matchOver ? 'none' : '';
    $('btnRematch').textContent = a.matchOver ? 'Rematch' : 'Next round';
    show('result');
    Audio.end();
  }

  function nextRound(swap) {
    if (swap || true) {
      // always swap roles between rounds of a series unless rematch of a finished match
    }
    const a = Game.lastAward;
    if (a && a.matchOver) {
      Game.series = { you: 0, them: 0, round: 0, firstRole: Game.youAre === 'runner' ? 'hunter' : 'runner' };
      Game.youAre = Game.series.firstRole;
    } else {
      Game.youAre = Game.youAre === 'runner' ? 'hunter' : 'runner';
    }
    if (Game.mode === 'host') Net.sendStart({ kind: 'next', youAreHost: Game.youAre, series: Game.series, trackId: Game.trackId });
    startRound();
  }

  function bindInputWorld(input, traps) {
    if (!Game.world) return;
    const local = Game.youAre === 'runner' ? Game.world.runner : Game.world.hunter;
    const remote = Game.youAre === 'runner' ? Game.world.hunter : Game.world.runner;
    Phys.applyInput(local, input);
    if (Game.mode === 'solo' || Game.mode === 'pass') {
      const aiIn = Game.youAre === 'runner' ? AI.thinkHunter(Game.world, Game.diff) : AI.thinkRunner(Game.world, Game.diff);
      const other = Game.youAre === 'runner' ? Game.world.hunter : Game.world.runner;
      Phys.applyInput(other, aiIn);
      if (aiIn.trapGate) Phys.dropGate(Game.world);
      if (aiIn.trapCollapse) Phys.dropCollapse(Game.world);
    } else if (Game.mode === 'host') {
      Phys.applyInput(remote, Game.remoteInput || {});
      if (Game.remoteInput && Game.remoteInput.trapGate) Phys.dropGate(Game.world);
      if (Game.remoteInput && Game.remoteInput.trapCollapse) Phys.dropCollapse(Game.world);
      Game.remoteInput = {};
    }
    if (traps && traps.gate) Phys.dropGate(Game.world);
    if (traps && traps.collapse) Phys.dropCollapse(Game.world);
  }

  let pending = {};
  let pendingTraps = {};

  function collectLocalInput() {
    const inp = Object.assign({}, pending);
    const traps = Object.assign({}, pendingTraps);
    pending = { sprint: pending.sprint, hold: pending.hold };
    pendingTraps = {};
    return { inp, traps };
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (Game.last || now)) / 1000);
    Game.last = now;
    const titleish = Game.screen === 'title' || Game.screen === 'mode' || Game.screen === 'track' || Game.screen === 'name';
    if (titleish) {
      // idle sky with a dummy cam
      if (!Game._titleWorld) {
        const t = Tracks.get('water-towers');
        Game._titleWorld = Phys.createWorld(t, {});
        Game._titleWorld.runner.x = 400;
        Game._titleWorld.hunter.x = 280;
      }
      Game._titleWorld.runner.phase += dt * 8;
      Game._titleWorld.hunter.phase += dt * 7.4;
      Game._titleWorld.t = 60;
      Render.resize($('app').clientWidth, $('app').clientHeight);
      Render.camX = 120; Render.camY = 0;
      Render.draw(Game._titleWorld);
    }
    if (Game.screen !== 'play' && Game.screen !== 'cd' && Game.screen !== 'result') return;
    if (!Game.world) return;
    Render.resize($('app').clientWidth, $('app').clientHeight);

    if (Game.screen === 'play' && !Game.world.over) {
      Game.acc += dt;
      const step = Phys.DT;
      while (Game.acc >= step) {
        if (Game.mode === 'guest') {
          const { inp, traps } = collectLocalInput();
          Game.seq++;
          Net.sendInput(Object.assign({}, inp, traps), Game.seq, Game.world.elapsed);
          // predict local
          const me = Game.youAre === 'runner' ? Game.world.runner : Game.world.hunter;
          Phys.applyInput(me, inp);
          if (traps.gate) Phys.dropGate(Game.world);
          if (traps.collapse) Phys.dropCollapse(Game.world);
          Phys.stepWorld(Game.world, step);
        } else {
          const { inp, traps } = collectLocalInput();
          bindInputWorld(inp, traps);
          Phys.stepWorld(Game.world, step);
          if (Game.mode === 'host' && Game.world.elapsed % 0.06 < step) {
            Net.sendState(Phys.snapshot(Game.world), Game.world.elapsed);
          }
        }
        Game.acc -= step;
      }
      sfxFromEvents(Game.world);
      if (Game.world.over) endRound();
    } else if (Game.screen === 'result' || (Game.world && Game.world.over)) {
      Game.acc += dt;
      while (Game.acc >= Phys.DT) {
        Phys.stepWorld(Game.world, Phys.DT);
        Game.acc -= Phys.DT;
      }
    }

    Render.follow(Game.world, dt);
    Render.draw(Game.world);
    updateHud();
    const spd = Game.world ? Math.max(Game.world.runner.vx, Game.world.hunter.vx) : 0;
    Audio.setWind(Math.min(1, spd / 580));
  }

  function sfxFromEvents(world) {
    const ev = world.events;
    if (!ev.length) return;
    for (const e of ev) {
      if (e.type === 'perfect' || e.type === 'vault') Audio.vault();
      if (e.type === 'land') Audio.land(false);
      if (e.type === 'hard-land' || e.type === 'stumble') Audio.land(true);
      if (e.type === 'roll') Audio.roll();
      if (e.type === 'gate' || e.type === 'gate-hit') Audio.gate();
      if (e.type === 'collapse') Audio.collapse();
      if (e.type === 'catch') Audio.catch();
      if (e.type === 'escape') Audio.escape();
      if (e.type === 'near-miss') Audio.nearMiss();
      if (e.type === 'style') popStyle(e.kind, e.pts);
    }
    world.events.length = 0;
  }

  function popStyle(kind, pts) {
    const el = $('stylePop');
    el.textContent = kind.toUpperCase() + '  +' + pts;
    el.classList.add('is-on');
    clearTimeout(Game.stylePopT);
    Game.stylePopT = setTimeout(() => el.classList.remove('is-on'), 700);
  }

  function updateHud() {
    if (!Game.world) return;
    $('timerPill').textContent = formatTime(Game.world.t);
    $('styleFill').style.width = Math.round(Game.world.boost * 100) + '%';
    const g = Game.world.cooldown.gate;
    const c = Game.world.cooldown.collapse;
    $('btnGate').classList.toggle('is-cd', g > 0);
    $('btnCollapse').classList.toggle('is-cd', c > 0);
    if (g > 0) $('btnGate').querySelector('.cd') || $('btnGate');
    $('sprintBtn').classList.toggle('is-hot', !!(Game.world.hunter.sprinting));
  }

  // Swipe controls
  const swipe = { on: false, x: 0, y: 0, sx: 0, sy: 0, t: 0 };
  function onDown(e) {
    Audio.unlock();
    if (Game.screen !== 'play') return;
    swipe.on = true;
    swipe.sx = swipe.x = e.clientX;
    swipe.sy = swipe.y = e.clientY;
    swipe.t = performance.now();
    pending.hold = true;
  }
  function onMove(e) {
    if (!swipe.on) return;
    swipe.x = e.clientX; swipe.y = e.clientY;
  }
  function onUp(e) {
    if (!swipe.on) return;
    swipe.on = false;
    pending.hold = false;
    if (Game.screen !== 'play') return;
    const dx = (e.clientX || swipe.x) - swipe.sx;
    const dy = (e.clientY || swipe.y) - swipe.sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 28) {
      if (Game.youAre === 'hunter') pending.grab = true;
      return;
    }
    if (Math.abs(dy) >= Math.abs(dx)) {
      if (dy < 0) { pending.jump = true; pending.vault = true; pending.wallrun = true; pending.kong = true; pending.precision = true; Audio.jump(); }
      else { pending.slide = true; pending.roll = true; }
    } else if (Game.youAre === 'hunter' && dx > 0) {
      pending.dive = true;
    }
  }

  function toggleMute() {
    Audio.unlock();
    Game.muted = Audio.toggleMute();
    $('muteFab').textContent = Game.muted ? 'MUTED' : 'SOUND';
  }

  function bind() {
    $('btnPlay').addEventListener('click', () => {
      Audio.unlock(); Audio.logo(); Audio.ui();
      if (!needNameThen(() => show('mode'))) return;
      show('mode');
    });
    $('btnSkills').addEventListener('click', () => {
      Audio.unlock(); Audio.ui();
      if (!needNameThen(() => show('skills'))) return;
      show('skills');
    });
    $('btnDaily').addEventListener('click', () => {
      Audio.unlock(); Audio.ui();
      if (!needNameThen(() => { Game.trackId = 'daily'; Game.daily = true; Game.mode = 'solo'; Game.diff = difficultyFor(); show('loadout'); })) return;
      Game.trackId = 'daily'; Game.daily = true; Game.mode = 'solo'; Game.diff = difficultyFor();
      show('loadout');
    });
    $('nameForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = $('nameInput').value.trim();
      if (!n) return;
      Prof.create(n);
      Audio.ui();
      const next = Game._afterName || (() => show('title'));
      Game._afterName = null;
      next();
    });
    $('btnModeBack').addEventListener('click', () => show('title'));
    $('btnSkillBack').addEventListener('click', () => show('title'));
    $('btnTrackBack').addEventListener('click', () => show('mode'));
    $('btnLoadBack').addEventListener('click', () => show('track'));
    $('btnSolo').addEventListener('click', () => {
      Audio.ui();
      Game.mode = 'solo';
      Game.diff = difficultyFor();
      Game.opp = { name: 'AI', rank: 'Bronze', unlocks: Prof.START_UNLOCKS.concat(Game.diff !== 'easy' ? ['dive', 'gate'] : []), loadoutRunner: ['jump','slide','roll','vault'], loadoutChaser: Game.diff === 'easy' ? ['sprint','grab','collapse'] : ['sprint','grab','collapse','dive','gate'] };
      Game.youAre = 'runner';
      Game.series = { you: 0, them: 0, round: 0, firstRole: 'runner' };
      show('track');
    });
    $('btnPass').addEventListener('click', () => {
      Audio.ui();
      Game.mode = 'pass';
      Game.opp = { name: 'GUEST', rank: 'Bronze', unlocks: Prof.START_UNLOCKS, loadoutRunner: ['jump','slide','roll','vault'], loadoutChaser: ['sprint','grab','collapse'] };
      Game.youAre = 'runner';
      Game.series = { you: 0, them: 0, round: 0, firstRole: 'runner' };
      show('track');
    });
    $('btnCreate').addEventListener('click', () => {
      Audio.ui();
      Game.mode = 'host';
      show('room');
      $('roomTitle').textContent = 'YOUR ROOM';
      $('joinForm').style.display = 'none';
      $('roomCode').textContent = '…';
      $('roomHint').textContent = 'Share this code. The other phone joins with their own skills. Similar ranks are a fairer chase.';
      $('roomStatus').textContent = 'Opening a line…';
      Net.onStatus = (s) => { $('roomStatus').textContent = s; };
      Net.onProfile = (pr) => {
        Game.opp = pr;
        $('roomStatus').textContent = 'Linked with ' + pr.name + '  ·  ' + pr.rank + '. Starting.';
        Net.sendProfile(youProfile());
        Game.youAre = 'runner';
        Game.series = { you: 0, them: 0, round: 0, firstRole: 'runner' };
        setTimeout(() => {
          Net.sendStart({ kind: 'go', trackId: Game.trackId || 'water-towers', youAreHost: 'runner', series: Game.series });
          show('track');
        }, 400);
      };
      Net.create((err, code) => {
        if (err) { $('roomStatus').textContent = 'Could not reach the relay. Play solo, or try again.'; return; }
        $('roomCode').textContent = code;
        $('roomStatus').textContent = 'Waiting for the other phone…';
      });
    });
    $('btnJoin').addEventListener('click', () => {
      Audio.ui();
      Game.mode = 'guest';
      show('room');
      $('roomTitle').textContent = 'JOIN';
      $('roomCode').style.display = 'none';
      $('joinForm').style.display = 'flex';
      $('roomHint').textContent = 'Enter the four-character code. You bring the skills saved on this phone.';
      $('roomStatus').textContent = '';
    });
    $('joinForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = $('joinInput').value.trim();
      if (code.length < 4) return;
      $('roomStatus').textContent = 'Looking for ' + code.toUpperCase() + '…';
      Net.onProfile = (pr) => { Game.opp = pr; $('roomStatus').textContent = 'Linked with ' + pr.name + '  ·  ' + pr.rank; };
      Net.onStart = (msg) => {
        Game.trackId = msg.trackId || 'water-towers';
        Game.youAre = msg.youAreHost === 'runner' ? 'hunter' : 'runner';
        Game.series = msg.series || Game.series;
        if (msg.kind === 'go' || msg.kind === 'next') startRound();
      };
      Net.onState = (msg) => {
        if (Game.mode !== 'guest' || !msg.state || !Game.world) return;
        const s = msg.state;
        Game.world.t = s.t;
        Game.world.style = s.style;
        Game.world.boost = s.boost;
        Game.world.over = s.over;
        Game.world.result = s.result;
        Game.world.gates = s.gates || Game.world.gates;
        Game.world.collapsed = s.collapsed || Game.world.collapsed;
        Game.world.cooldown = s.cooldown || Game.world.cooldown;
        // interpolate toward host
        function lerp(c, n) {
          if (!n) return;
          c.x += (n.x - c.x) * 0.45;
          c.y += (n.y - c.y) * 0.45;
          c.vx = n.vx; c.vy = n.vy; c.state = n.state; c.stateT = n.stateT;
          c.onGround = n.onGround; c.phase = n.phase; c.caught = n.caught; c.downed = n.downed;
          c.ragdoll = n.ragdoll; c.scarf = n.scarf || c.scarf; c.h = n.h; c.sprinting = n.sprinting;
        }
        lerp(Game.world.runner, s.runner);
        lerp(Game.world.hunter, s.hunter);
      };
      Net.onClose = () => { if (Game.screen === 'play') $('roomStatus').textContent = 'Connection closed.'; };
      Net.join(code, (err) => {
        if (err) { $('roomStatus').textContent = 'Could not join. Check the code, or play solo.'; return; }
        Net.sendProfile(youProfile());
        $('roomStatus').textContent = 'Linked. Waiting for the host to start…';
      });
    });
    $('btnRoomBack').addEventListener('click', () => { Net.destroy(); $('roomCode').style.display = ''; show('mode'); });
    $('btnGo').addEventListener('click', () => {
      Audio.ui();
      if (Game.mode === 'host') {
        Net.sendStart({ kind: 'go', trackId: Game.trackId, youAreHost: Game.youAre, series: Game.series });
      }
      startRound();
    });
    $('btnRematch').addEventListener('click', () => { Audio.ui(); nextRound(false); });
    $('btnSwap').addEventListener('click', () => { Audio.ui(); nextRound(true); });
    $('btnResSkills').addEventListener('click', () => { Audio.ui(); show('skills'); });
    $('btnResTitle').addEventListener('click', () => { Audio.ui(); Net.destroy(); show('title'); });
    $('btnGate').addEventListener('click', () => { pendingTraps.gate = true; });
    $('btnCollapse').addEventListener('click', () => { pendingTraps.collapse = true; });
    $('sprintBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); pending.sprint = true; });
    $('sprintBtn').addEventListener('pointerup', () => { pending.sprint = false; });
    $('sprintBtn').addEventListener('pointerleave', () => { pending.sprint = false; });
    $('muteFab').addEventListener('click', toggleMute);

    const view = $('view');
    view.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', () => { swipe.on = false; pending.hold = false; });
    window.addEventListener('keydown', (e) => {
      Audio.unlock();
      if (e.key === 'm') toggleMute();
      if (Game.screen !== 'play') return;
      if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w') { pending.jump = true; pending.vault = true; pending.wallrun = true; pending.kong = true; pending.precision = true; }
      if (e.key === 'ArrowDown' || e.key === 's') { pending.slide = true; pending.roll = true; }
      if (e.key === 'f' || e.key === 'Shift') pending.grab = true;
      if (e.key === 'd' || e.key === 'e') pending.dive = true;
      if (e.key === 'g') pendingTraps.gate = true;
      if (e.key === 'c') pendingTraps.collapse = true;
      if (e.key === 'Shift') pending.sprint = true;
    });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') pending.sprint = false; });
    window.addEventListener('resize', () => Render.resize($('app').clientWidth, $('app').clientHeight));
  }

  function boot() {
    Render.init($('view'));
    Render.resize($('app').clientWidth, $('app').clientHeight);
    bind();
    if (Prof.current()) refreshProfileChip();
    show('title');
    Game.last = performance.now();
    requestAnimationFrame(loop);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  window.ChaseGame = Game;
  window.__CHASELINE__ = {
    ready: true,
    Game, Prof, Skills, Tracks, Phys,
    show, startRound, startTrack(id, role) { Game.trackId = id; Game.mode = 'solo'; Game.youAre = role || 'runner'; Game.opp = { name: 'AI', rank: 'Bronze', unlocks: Prof.START_UNLOCKS, loadoutRunner: ['jump','slide','roll','vault'], loadoutChaser: ['sprint','grab','collapse'] }; Game.series = { you: 0, them: 0, round: 0, firstRole: Game.youAre }; if (!Prof.current()) Prof.create('TEST'); startRound(); },
    input(inp) { Object.assign(pending, inp || {}); },
    trap(name) { pendingTraps[name] = true; },
    world() { return Game.world; },
    screen() { return Game.screen; },
    skipCountdown() { show('play'); Game.last = performance.now(); },
    grantXp(n) { if (!Prof.current()) Prof.create('TEST'); Prof.award('runner', n); },
    forceNearMiss() {
      if (!Game.world) return;
      Game.world.scale = 0.32; Game.world.slowMo = 0.8; Game.world.nearMiss = 0.8;
      Game.world.events.push({ type: 'near-miss', why: 'debug' });
    },
    finish(kind) {
      if (!Game.world) return;
      Game.world.over = true; Game.world.result = kind || 'escape';
      endRound();
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
