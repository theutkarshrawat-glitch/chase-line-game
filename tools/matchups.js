const S = require('./sim.js'), T = require('../js/tracks.js');
const tracks = T.HANDCRAFTED.concat([T.dailyRemix(new Date(2026, 10, 13))]);
const HL = { easy: ['sprint', 'grab', 'collapse'], normal: ['sprint', 'grab', 'collapse', 'dive', 'gate'], hard: ['sprint', 'grab', 'collapse', 'dive', 'gate'] };
const cases = [
  ['passive runner vs hunter', { passive: true, hdiff: 'normal', hl: HL.normal }, 'catch'],
  ['perfect runner vs normal hunter', { rdiff: 'perfect', hdiff: 'normal', hl: HL.normal }, 'escape'],
  ['perfect runner vs hard hunter', { rdiff: 'perfect', hdiff: 'hard', hl: HL.hard }, 'escape'],
  ['perfect runner+skills vs hard', { rdiff: 'perfect', hdiff: 'hard', hl: HL.hard, rl: ['jump','slide','roll','vault','wallrun','kong','precision'] }, 'escape'],
  ['normal runner vs normal hunter', { rdiff: 'normal', hdiff: 'normal', hl: HL.normal }, null],
  ['easy runner vs normal hunter', { rdiff: 'easy', hdiff: 'normal', hl: HL.normal }, null],
  ['normal runner vs easy hunter', { rdiff: 'normal', hdiff: 'easy', hl: HL.easy }, null],
];
let fails = 0;
for (const [name, o, want] of cases) {
  const rows = tracks.map((t) => S.run(t, o));
  const res = rows.map((r) => r.result[0] + '@' + r.time + 's(lead ' + r.lead + ')').join(' ');
  const pen = Math.max(...rows.map((r) => r.maxPen));
  const stuck = Math.max(...rows.map((r) => Math.max(r.maxStuck.r, r.maxStuck.h)));
  const ok = (!want || rows.every((r) => r.result === want)) && pen <= 0.5 && stuck < 2;
  if (!ok) fails++;
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + name.padEnd(34) + ' pen=' + pen + ' stuck=' + stuck.toFixed(2) + ' ' + res);
  if (!ok) rows.forEach((r) => { if (r.maxPen > 0.5) console.log('   pen', r.track, r.penWhat); if (Math.max(r.maxStuck.r, r.maxStuck.h) >= 2) console.log('   stuck', r.track, JSON.stringify(r.maxStuck)); });
}
process.exit(fails ? 1 : 0);
