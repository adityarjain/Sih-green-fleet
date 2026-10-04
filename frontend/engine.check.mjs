// npm run check: the JS engine must reproduce fleet.py evaluate() on the exported reference genomes.
import assert from 'node:assert/strict';
import R from './src/data/results.json' with { type: 'json' };
import { bitsOf, createQiea, evaluate, recommend } from './src/engine.js';
import { applyEdits, fleetTemplate, parseCsv, readTable } from './src/fleetdata.js';
import { consequence, whyLane } from './src/explain.js';

const close = (a, b) => Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b));
R.check.genomes.forEach((genome, i) => {
  const { F, V } = evaluate(bitsOf(genome), R.problem, R.check.sc);
  assert.ok(F.length === 3 && F.every((f, m) => close(f, R.check.F[i][m])), `objectives differ for genome ${i}: ${F} vs ${R.check.F[i]}`);
  assert.ok(close(V, R.check.V[i]), `violation differs for genome ${i}: ${V} vs ${R.check.V[i]}`);
});

const q = createQiea(R.problem, R.check.sc, { seed: 3 });
for (let k = 0; k < 150; k++) q.step();
assert.ok(recommend(q.archive), 'live QIEA found no feasible plan in 3,000 evaluations');
const fleetCsv = fleetTemplate(R.vessels).replace(/,6,25000,/, ',2,25000,');
assert.deepEqual(parseCsv('a,"b, c"\n1,"x ""y"""\n')[1], ['1', 'x "y"']);
const fl = readTable(fleetCsv, R.problem);
assert.ok(fl.kind === 'fleet' && fl.errors.length === 0 && fl.edits.length === 1 && fl.edits[0].to === 2, 'fleet CSV edit not read');
const bad = readTable('lane,teu_week\n"Mars - Venus",100\n"JNPT - Colombo",-5', R.problem);
assert.equal(bad.errors.length, 2, 'unknown lane and negative demand must both be rejected');
const P2 = applyEdits(R.problem, [{ arr: 'v_fd', idx: 0, to: R.problem.v_fd[0] * 2 }]);
assert.ok(close(P2.fuel[0][0][0], 2 * R.problem.fuel[0][0][0]) && R.problem.fuel[0][0][0] !== P2.fuel[0][0][0], 'fuel table must scale on a copy');
const plan = R.scenarios['100|2030|0.71|0'].picks.balanced;
const why = whyLane(bitsOf(plan.genome), R.problem, { carbon: 100, cap: 85.69, grid: 0.71, robust: false }, 1);
assert.equal(why.fuel.length, R.fuels.length - 1, 'every other fuel must be tried');
assert.ok(why.fuel.some((o) => o.broken.includes('range')), 'hydrogen on Chennai-Singapore must break bunkering range');
assert.ok(why.fuel.every((o) => o.broken.length || o.dF.some((x) => x > 0.05)), 'a feasible swap that beats the plan on every objective means the plan is dominated');
assert.match(consequence({ broken: [], dF: [-1, 2, 0] }, R.problem, 1), /^saves \$1\.0M, but adds 2\.0 kt CO2e$/);
for (const [key, sc] of Object.entries(R.scenarios)) {
  if (!sc.feasible) continue;
  const ex = sc.picks.express;
  assert.ok(ex && ex.feasible, `express plan missing or infeasible in ${key}`);
  if (ex.limit_met) ex.lanes.forEach((l, i) => assert.ok(l.transit_days <= R.express_tmax[i] + 1e-6, `${key} ${l.lane} slower than express limit`));
}
console.log(`express OK; explain OK; fleet CSV OK; engine OK: ${R.check.genomes.length} reference genomes match; live QIEA front has ${recommend(q.archive).front.length} plans`);
