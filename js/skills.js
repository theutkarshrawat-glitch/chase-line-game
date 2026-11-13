/**
 * CHASE LINE skill trees. Tiers 1–2 are playable; 3–4 / Legend are shown locked.
 * New moves are high-risk / high-reward, not flat upgrades. Each has a counter.
 */
(function (root) {
  const SKILLS = {
    jump: {
      id: 'jump', role: 'runner', tier: 1, name: 'Jump',
      cost: 0, desc: 'Leave the roof. A longer run-up carries farther.',
      counter: 'dive',
    },
    slide: {
      id: 'slide', role: 'runner', tier: 1, name: 'Slide',
      cost: 0, desc: 'Drop low to slip under gates and pipes. Drains a little speed.',
      counter: 'grab',
    },
    roll: {
      id: 'roll', role: 'runner', tier: 1, name: 'Roll',
      cost: 0, desc: 'Time it on a hard landing to keep your speed. Mistime and you stumble.',
      counter: 'dive',
    },
    vault: {
      id: 'vault', role: 'runner', tier: 1, name: 'Vault',
      cost: 0, desc: 'A basic safety vault over vents and ledges.',
      counter: 'grab',
    },
    wallrun: {
      id: 'wallrun', role: 'runner', tier: 2, name: 'Wall-run',
      cost: 220, desc: 'Run the face of a wall to a higher roof. Fall if you linger.',
      counter: 'gate', teaser: 'Opens the upper shortcut on Water Towers and Crane Row.',
    },
    kong: {
      id: 'kong', role: 'runner', tier: 2, name: 'Kong vault',
      cost: 260, desc: 'Dive through a wide obstacle. Faster than a vault, easy to miss.',
      counter: 'collapse', teaser: 'Clears the wide AC units the basic vault cannot.',
    },
    precision: {
      id: 'precision', role: 'runner', tier: 2, name: 'Precision jump',
      cost: 300, desc: 'Commit to a thin ledge. Perfect footwork is a huge gain; a miss is a fall.',
      counter: 'collapse', teaser: 'The risky gaps become a faster line if you stick the landing.',
    },
    // Locked T3–T4
    wallflip: { id: 'wallflip', role: 'runner', tier: 3, name: 'Wall-flip', cost: 500, desc: 'Kick off a wall into a backflip. Style and height.', locked: true, counter: 'dive' },
    lazy: { id: 'lazy', role: 'runner', tier: 3, name: 'Lazy vault', cost: 480, desc: 'One-handed vault with a late, low exit. Hard to grab.', locked: true, counter: 'grab' },
    longslide: { id: 'longslide', role: 'runner', tier: 3, name: 'Long slide', cost: 520, desc: 'Hold a slide across wet or gravel for a full roof.', locked: true, counter: 'dive' },
    doublewall: { id: 'doublewall', role: 'runner', tier: 4, name: 'Double wall-run', cost: 700, desc: 'Chain two faces. The skyline routes open here.', locked: true, counter: 'gate' },
    catleap: { id: 'catleap', role: 'runner', tier: 4, name: 'Cat-leap', cost: 740, desc: 'Catch a far wall with your hands and climb.', locked: true, counter: 'grab' },
    wallback: { id: 'wallback', role: 'runner', tier: 4, name: 'Wall backflip', cost: 800, desc: 'Reverse kick off a wall over a hunter.', locked: true, counter: 'dive' },
    ghost: { id: 'ghost', role: 'runner', tier: 4, name: 'Ghost step', cost: 900, desc: 'A faint, brief sidestep that dodges a grab.', locked: true, counter: 'predict' },
    wireswing: { id: 'wireswing', role: 'runner', tier: 4, name: 'Wire swing', cost: 950, desc: 'Use a line between roofs as a pendulum.', locked: true, counter: 'drone' },

    sprint: {
      id: 'sprint', role: 'chaser', tier: 1, name: 'Sprint',
      cost: 0, desc: 'A burst of speed. Burns out if you hold it too long.',
      counter: 'precision',
    },
    grab: {
      id: 'grab', role: 'chaser', tier: 1, name: 'Grab',
      cost: 0, desc: 'When you are in reach, take them. Early is a miss; late is a miss.',
      counter: 'slide',
    },
    collapse: {
      id: 'collapse', role: 'chaser', tier: 1, name: 'Collapse',
      cost: 0, desc: 'Drop a marked roof segment ahead of the runner. Debris falls.',
      counter: 'precision',
    },
    dive: {
      id: 'dive', role: 'chaser', tier: 2, name: 'Dive tackle',
      cost: 240, desc: 'Leave your feet and dive. Huge grab window. Miss and you tumble.',
      counter: 'roll', teaser: 'Closes a gap the sprint cannot, if you read the jump.',
    },
    gate: {
      id: 'gate', role: 'chaser', tier: 2, name: 'Gate trap',
      cost: 260, desc: 'A gate slams shut ahead. They must slide or vault — or stop.',
      counter: 'slide', teaser: 'Cuts the long corridors on Crane Row and The Ledger.',
    },
    // Locked
    grapple: { id: 'grapple', role: 'chaser', tier: 3, name: 'Grapple', cost: 560, desc: 'Hook a crane arm and cut the corner.', locked: true, counter: 'wallflip' },
    collapseplus: { id: 'collapseplus', role: 'chaser', tier: 3, name: 'Collapse upgrade', cost: 600, desc: 'A wider, faster roof drop with more debris.', locked: true, counter: 'kong' },
    predict: { id: 'predict', role: 'chaser', tier: 3, name: 'Predict', cost: 640, desc: 'A brief ghost of their next landing.', locked: true, counter: 'ghost' },
    drone: { id: 'drone', role: 'chaser', tier: 4, name: 'Drone scout', cost: 820, desc: 'A high camera marks the runner through alleys.', locked: true, counter: 'wireswing' },
    walldash: { id: 'walldash', role: 'chaser', tier: 4, name: 'Wall dash', cost: 860, desc: 'A short wall-run of your own to stay on line.', locked: true, counter: 'doublewall' },
    slowgrab: { id: 'slowgrab', role: 'chaser', tier: 4, name: 'Slow-mo grab', cost: 980, desc: 'Time snaps when you are in reach. One chance.', locked: true, counter: 'lazy' },
  };

  const ORDER = {
    runner: ['jump', 'slide', 'roll', 'vault', 'wallrun', 'kong', 'precision', 'wallflip', 'lazy', 'longslide', 'doublewall', 'catleap', 'wallback', 'ghost', 'wireswing'],
    chaser: ['sprint', 'grab', 'collapse', 'dive', 'gate', 'grapple', 'collapseplus', 'predict', 'drone', 'walldash', 'slowgrab'],
  };

  function list(role) {
    return ORDER[role].map((id) => SKILLS[id]);
  }

  function canUnlock(profile, id) {
    const s = SKILLS[id];
    if (!s || s.locked) return { ok: false, reason: 'locked-tier' };
    if (s.cost <= 0) return { ok: true };
    if (profile.unlocks.indexOf(id) >= 0) return { ok: false, reason: 'owned' };
    const pool = s.role === 'runner' ? profile.runnerXp : profile.chaserXp;
    // Spend from total XP but require role XP to have been earned
    if (profile.xp < s.cost) return { ok: false, reason: 'xp' };
    if (pool < Math.floor(s.cost * 0.4)) return { ok: false, reason: 'role-xp' };
    return { ok: true };
  }

  function nextTeaser(profile, role) {
    const owned = new Set(profile.unlocks);
    for (const s of list(role)) {
      if (s.locked && !owned.has(s.id)) return s;
      if (!s.locked && !owned.has(s.id)) return s;
    }
    return null;
  }

  const api = { SKILLS, ORDER, list, canUnlock, nextTeaser };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChaseSkills = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
