/**
 * CHASE LINE tracks. District 1 (Rooftops) has three handcrafted lines,
 * each with a safe/slow path and a risky/fast path. Other districts are
 * listed for the select screen; Monsoon City is playable with wet physics.
 */
(function (root) {
  function plat(x, y, w, h, tags) {
    return { x, y, w, h: h || 170, tags: tags || [] };
  }
  function wall(x, y, w, h, face, tags) {
    return { x, y, w: w || 18, h, face: face || 'L', tags: tags || [] };
  }
  function obst(x, y, w, h, type, tags) {
    return { x, y, w, h, type: type || 'vent', tags: tags || [] };
  }
  function prop(type, x, y, s) {
    return { type, x, y, s: s || 1 };
  }

  const DISTRICTS = [
    { id: 'rooftops', name: 'Rooftops', kicker: 'District 1', unlocked: true, blurb: 'Dawn over the old water towers.' },
    { id: 'construction', name: 'Construction', kicker: 'District 2', unlocked: false, blurb: 'Cranes, planks, and unfinished floors.' },
    { id: 'monsoon', name: 'Monsoon City', kicker: 'District 3', unlocked: true, blurb: 'Wet slate. Long slides, short grip.' },
    { id: 'metro', name: 'Metro Yard', kicker: 'District 4', unlocked: false, blurb: 'Carriages, rails, and low tunnels.' },
    { id: 'nightmarket', name: 'Night Market', kicker: 'District 5', unlocked: false, blurb: 'Awnings, stalls, neon puddles.' },
    { id: 'factory', name: 'Factory', kicker: 'District 6', unlocked: false, blurb: 'Pipes, catwalks, a long drop to the floor.' },
    { id: 'skyline', name: 'Skyline', kicker: 'District 7', unlocked: false, blurb: 'The high route. Not yet open.' },
  ];

  function rooftopsA() {
    // Water Towers — teach jump, vault, roll; wall-run shortcut; precision gap.
    const platforms = [
      plat(0, 260, 1100, 200),
      plat(1220, 250, 720, 200),
      plat(2060, 270, 640, 200), // after medium gap
      // safe lower route
      plat(2780, 360, 900, 160, ['safe']),
      plat(3760, 350, 620, 160, ['safe']),
      // risky high after precision gap from 2060 roof (end ~2700) to thin ledge
      plat(2920, 200, 70, 140, ['precision', 'risky']),
      plat(3080, 190, 520, 180, ['risky']),
      // merge
      plat(4480, 240, 980, 200, ['collapse']),
      plat(5500, 100, 900, 24, ['wallrun-dest', 'risky']),
      plat(5580, 360, 720, 150, ['safe']),
      plat(6380, 250, 860, 200),
      plat(7360, 320, 520, 160, ['safe']), // safe drop
      plat(7420, 200, 80, 120, ['precision', 'risky']),
      plat(7600, 210, 700, 200, ['risky']),
      plat(8420, 230, 1200, 200),
      plat(9740, 240, 900, 200),
    ];
    return {
      id: 'water-towers',
      name: 'Water Towers',
      district: 'rooftops',
      length: 10640,
      finishX: 10400,
      sky: 'dawn',
      wet: false,
      platforms,
      walls: [
        wall(5448, 70, 22, 120, 'L', ['wallrun']),
      ],
      obstacles: [
        obst(1480, 250, 54, 34, 'vent', ['vault']),
        obst(2300, 270, 52, 32, 'ac', ['vault']),
        obst(4700, 240, 86, 40, 'ac', ['kong']),
        obst(6600, 250, 50, 30, 'vent', ['vault']),
        obst(8800, 230, 80, 38, 'ac', ['kong']),
      ],
      gateSlots: [{ x: 6500, y: 250, w: 24, h: 120 }],
      collapse: [{ x: 5000, w: 280, plat: 7 }],
      props: [
        prop('watertower', 320, 260, 1),
        prop('watertower', 9800, 240, 1.1),
        prop('crane', 8200, 230, 1),
        prop('antenna', 3200, 190, 1),
      ],
      blurb: 'A run across the old tanks. The thin ledges are faster. The wall is a door if you can run it.',
    };
  }

  function rooftopsB() {
    // Crane Row — longer gaps, a slide tunnel, gate corridor, collapse mid.
    const platforms = [
      plat(0, 250, 900, 200),
      plat(1060, 270, 640, 200),
      plat(1860, 220, 860, 200),
      plat(2860, 340, 780, 160, ['safe']),
      plat(2920, 180, 90, 130, ['precision', 'risky']),
      plat(3120, 170, 480, 200, ['risky']),
      plat(3800, 250, 1260, 200, ['collapse', 'gate']),
      plat(5200, 260, 800, 200),
      plat(6140, 200, 640, 200),
      plat(6960, 80, 740, 22, ['wallrun-dest', 'risky']),
      plat(6900, 350, 700, 150, ['safe']),
      plat(7680, 230, 920, 200),
      plat(8720, 280, 600, 180),
      plat(9460, 240, 1400, 200),
    ];
    return {
      id: 'crane-row',
      name: 'Crane Row',
      district: 'rooftops',
      length: 10860,
      finishX: 10700,
      sky: 'dawn',
      wet: false,
      platforms,
      walls: [wall(6920, 70, 22, 90, 'L', ['wallrun'])],
      obstacles: [
        obst(1280, 270, 50, 32, 'vent', ['vault']),
        obst(2200, 220, 88, 42, 'ac', ['kong']),
        obst(4300, 250, 56, 34, 'vent', ['vault']),
        obst(5400, 260, 90, 44, 'ac', ['kong']),
        obst(8360, 230, 52, 30, 'vent', ['vault']),
      ],
      pipes: [{ x: 8000, y: 175, w: 260, h: 16 }], // slide under on the 7680/8720 corridor
      gateSlots: [{ x: 4500, y: 250, w: 24, h: 130 }, { x: 7900, y: 230, w: 24, h: 120 }],
      collapse: [{ x: 4550, w: 260 }],
      props: [
        prop('crane', 2400, 220, 1.3),
        prop('crane', 9000, 280, 1.1),
        prop('watertower', 600, 250, 0.9),
        prop('antenna', 3300, 170, 1),
      ],
      blurb: 'Cranes lean over a long corridor. A gate here is a problem. The high wall skips the jog.',
    };
  }

  function rooftopsC() {
    // The Ledger — tight ledges, a big drop that wants a roll, two mid routes.
    const platforms = [
      plat(0, 230, 800, 200),
      plat(920, 240, 720, 200),
      plat(1520, 240, 500, 200),
      plat(2120, 160, 64, 140, ['precision', 'risky']),
      plat(2280, 170, 480, 180, ['risky']),
      plat(2100, 340, 860, 140, ['safe']), // drop + roll
      plat(2880, 220, 860, 200),
      plat(3880, 210, 720, 200, ['collapse']),
      plat(4740, 280, 200, 160),
      plat(5060, 200, 700, 200),
      plat(5900, 140, 70, 120, ['precision', 'risky']),
      plat(6080, 150, 640, 200, ['risky']),
      plat(5880, 330, 900, 150, ['safe']),
      plat(6860, 230, 900, 200),
      plat(7900, 250, 800, 200, ['gate']),
      plat(8860, 210, 1100, 200),
      plat(10100, 230, 800, 200),
    ];
    return {
      id: 'the-ledger',
      name: 'The Ledger',
      district: 'rooftops',
      length: 10900,
      finishX: 10740,
      sky: 'dawn',
      wet: false,
      platforms,
      walls: [wall(5560, 70, 22, 70, 'L', ['wallrun'])],
      obstacles: [
        obst(1100, 240, 50, 30, 'vent', ['vault']),
        obst(2500, 170, 84, 40, 'ac', ['kong']),
        obst(3300, 220, 52, 32, 'vent', ['vault']),
        obst(7200, 230, 88, 42, 'ac', ['kong']),
        obst(9200, 210, 54, 34, 'vent', ['vault']),
      ],
      gateSlots: [{ x: 8200, y: 250, w: 24, h: 130 }],
      collapse: [{ x: 4100, w: 240 }],
      props: [
        prop('watertower', 400, 230, 1),
        prop('antenna', 2320, 170, 1),
        prop('crane', 8600, 210, 1.15),
        prop('watertower', 10400, 230, 1),
      ],
      blurb: 'The book of ledges. A long drop wants a roll. Two lines meet at the last corridor.',
    };
  }

  function monsoonA() {
    const platforms = [
      plat(0, 250, 960, 200, ['slip']),
      plat(1120, 270, 700, 200, ['slip']),
      plat(1980, 230, 820, 200, ['slip']),
      plat(2960, 330, 740, 150, ['safe', 'slip']),
      plat(3040, 180, 80, 130, ['precision', 'risky', 'slip']),
      plat(3240, 190, 680, 200, ['risky', 'slip']),
      plat(4080, 250, 1000, 200, ['collapse', 'slip']),
      plat(5240, 240, 860, 200, ['slip']),
      plat(6260, 200, 700, 200, ['slip']),
      plat(7120, 310, 640, 160, ['safe', 'slip']),
      plat(7200, 140, 70, 120, ['precision', 'risky', 'slip']),
      plat(7380, 175, 820, 200, ['risky', 'slip']),
      plat(8360, 230, 1400, 200, ['slip']),
    ];
    return {
      id: 'monsoon-alley',
      name: 'Monsoon Alley',
      district: 'monsoon',
      length: 9760,
      finishX: 9600,
      sky: 'monsoon',
      wet: true,
      platforms,
      walls: [wall(5860, 90, 22, 70, 'L', ['wallrun'])],
      obstacles: [
        obst(1400, 270, 52, 30, 'vent', ['vault']),
        obst(2300, 230, 86, 40, 'ac', ['kong']),
        obst(4500, 250, 54, 32, 'vent', ['vault']),
        obst(6400, 200, 84, 40, 'ac', ['kong']),
      ],
      pipes: [{ x: 5600, y: 185, w: 260, h: 16 }],
      gateSlots: [{ x: 4700, y: 250, w: 24, h: 120 }],
      collapse: [{ x: 4480, w: 260 }],
      props: [
        prop('watertower', 500, 250, 1),
        prop('antenna', 3300, 190, 1),
        prop('crane', 8000, 230, 1),
      ],
      blurb: 'The slate is wet. Speed is harder to keep, and a slide runs long.',
    };
  }

  function hashSeed(n) {
    let x = (n | 0) >>> 0;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17; x >>>= 0;
      x ^= x << 5; x >>>= 0;
      return (x >>> 0) / 4294967296;
    };
  }

  function dateKey(d) {
    const dt = d || new Date();
    return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
  }

  function dailyRemix(date) {
    const base = rooftopsA();
    const rnd = hashSeed(dateKey(date) ^ 0xC1A5E);
    const platforms = base.platforms.map((p) => {
      const q = Object.assign({}, p, { tags: (p.tags || []).slice() });
      if (q.w > 80) {
        const jitter = Math.round((rnd() - 0.5) * 40);
        q.w = Math.max(60, q.w + jitter);
      }
      if (q.tags.indexOf('precision') >= 0) {
        q.w = 56 + Math.round(rnd() * 24);
      }
      q.y = q.y + Math.round((rnd() - 0.5) * 16);
      return q;
    });
    // stretch a couple of gaps
    if (platforms[1]) platforms[1].x += Math.round(rnd() * 40);
    return Object.assign({}, base, {
      id: 'daily-' + dateKey(date),
      name: 'Daily Chase',
      district: 'rooftops',
      daily: true,
      dateKey: dateKey(date),
      platforms,
      blurb: 'Today’s remix of the water towers. The gaps have moved.',
      finishX: base.finishX,
      length: base.length,
    });
  }

  const HANDCRAFTED = [rooftopsA(), rooftopsB(), rooftopsC(), monsoonA()];

  function get(id) {
    if (id && String(id).indexOf('daily') === 0) return dailyRemix();
    return HANDCRAFTED.find((t) => t.id === id) || null;
  }

  function listForSelect() {
    const daily = dailyRemix();
    return {
      districts: DISTRICTS,
      tracks: [daily].concat(HANDCRAFTED),
    };
  }

  const api = { DISTRICTS, HANDCRAFTED, plat, get, listForSelect, dailyRemix, dateKey, rooftopsA, rooftopsB, rooftopsC, monsoonA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChaseTracks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
