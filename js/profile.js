/**
 * CHASE LINE — per-device player profile, XP, ranks, loadouts.
 * Each phone keeps its own progress in localStorage.
 */
(function (root) {
  const KEY = 'chaseline-profile-v1';
  const SLOT_KEY = 'chaseline-profiles-v1';

  const RANKS = [
    { id: 'bronze', name: 'Bronze', xp: 0 },
    { id: 'silver', name: 'Silver', xp: 400 },
    { id: 'gold', name: 'Gold', xp: 1000 },
    { id: 'platinum', name: 'Platinum', xp: 2000 },
    { id: 'diamond', name: 'Diamond', xp: 3500 },
    { id: 'legend', name: 'Legend', xp: 6000 },
  ];

  const START_UNLOCKS = ['jump', 'slide', 'roll', 'vault', 'sprint', 'grab', 'collapse'];

  function uid() {
    return 'p-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  function blank(name) {
    return {
      v: 1,
      id: uid(),
      name: (name || 'RUNNER').toUpperCase().slice(0, 12),
      xp: 0,
      runnerXp: 0,
      chaserXp: 0,
      unlocks: START_UNLOCKS.slice(),
      loadoutRunner: ['jump', 'slide', 'roll', 'vault'],
      loadoutChaser: ['sprint', 'grab', 'collapse'],
      stats: { matches: 0, wins: 0, escapes: 0, catches: 0, style: 0, tumbles: 0 },
      seenHelp: false,
      created: Date.now(),
    };
  }

  function rankFor(xp) {
    let r = RANKS[0];
    for (const x of RANKS) if (xp >= x.xp) r = x;
    return r;
  }

  function nextRank(xp) {
    const cur = rankFor(xp);
    const i = RANKS.findIndex((r) => r.id === cur.id);
    return RANKS[i + 1] || null;
  }

  function migrate(p) {
    if (!p || typeof p !== 'object') return blank();
    const b = blank(p.name);
    const out = Object.assign(b, p);
    out.unlocks = Array.from(new Set((p.unlocks || START_UNLOCKS).concat(['jump', 'slide', 'roll', 'vault', 'sprint', 'grab'])));
    out.stats = Object.assign(b.stats, p.stats || {});
    out.loadoutRunner = (p.loadoutRunner && p.loadoutRunner.length) ? p.loadoutRunner.slice(0, 4) : b.loadoutRunner;
    out.loadoutChaser = (p.loadoutChaser && p.loadoutChaser.length) ? p.loadoutChaser.slice(0, 4) : b.loadoutChaser;
    return out;
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(SLOT_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.list) && data.list.length) {
          return { list: data.list.map(migrate), active: data.active || data.list[0].id };
        }
      }
      const one = localStorage.getItem(KEY);
      if (one) {
        const p = migrate(JSON.parse(one));
        return { list: [p], active: p.id };
      }
    } catch (e) { /* ignore */ }
    return { list: [], active: null };
  }

  function saveAll(store) {
    try {
      localStorage.setItem(SLOT_KEY, JSON.stringify({ v: 1, list: store.list, active: store.active }));
      const cur = store.list.find((p) => p.id === store.active);
      if (cur) localStorage.setItem(KEY, JSON.stringify(cur));
    } catch (e) { /* quota */ }
  }

  const Store = {
    list: [],
    active: null,
  };

  function boot() {
    const s = loadAll();
    Store.list = s.list;
    Store.active = s.active;
  }

  function current() {
    return Store.list.find((p) => p.id === Store.active) || null;
  }

  function setActive(id) {
    if (Store.list.some((p) => p.id === id)) Store.active = id;
    saveAll(Store);
    return current();
  }

  function create(name) {
    const p = blank(name);
    Store.list.push(p);
    Store.active = p.id;
    saveAll(Store);
    return p;
  }

  function update(mut) {
    const p = current();
    if (!p) return null;
    mut(p);
    saveAll(Store);
    return p;
  }

  function award(kind, amount, extra) {
    return update((p) => {
      const n = Math.max(0, amount | 0);
      p.xp += n;
      if (kind === 'runner' || kind === 'escape' || kind === 'style') p.runnerXp += n;
      if (kind === 'chaser' || kind === 'catch') p.chaserXp += n;
      if (kind === 'escape') p.stats.escapes += 1;
      if (kind === 'catch') p.stats.catches += 1;
      if (kind === 'style') p.stats.style += extra || n;
      if (kind === 'win') p.stats.wins += 1;
    });
  }

  function rename(name) {
    return update((p) => { p.name = String(name || 'RUNNER').toUpperCase().slice(0, 12); });
  }

  function unlock(id) {
    return update((p) => {
      if (p.unlocks.indexOf(id) < 0) p.unlocks.push(id);
    });
  }

  function has(id) {
    const p = current();
    return !!(p && p.unlocks.indexOf(id) >= 0);
  }

  function publicView(p) {
    const prof = p || current();
    if (!prof) return null;
    const rank = rankFor(prof.xp);
    return {
      id: prof.id,
      name: prof.name,
      xp: prof.xp,
      runnerXp: prof.runnerXp,
      chaserXp: prof.chaserXp,
      rank: rank.name,
      rankId: rank.id,
      unlocks: prof.unlocks.slice(),
      loadoutRunner: prof.loadoutRunner.slice(),
      loadoutChaser: prof.loadoutChaser.slice(),
      stats: Object.assign({}, prof.stats),
    };
  }

  boot();

  const api = {
    KEY, RANKS, START_UNLOCKS, Store,
    blank, migrate, rankFor, nextRank, boot,
    current, setActive, create, update, award, rename, unlock, has,
    publicView, saveAll, loadAll,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChaseProfile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
