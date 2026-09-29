// npm run check: the JS engine must reproduce fleet.py evaluate() on the exported reference genomes.
import assert from 'node:assert/strict';
import R from './src/data/results.json' with { type: 'json' };
import { bitsOf, createQiea, evaluate, recommend } from './src/engine.js';

const close = (a, b) => Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b));
R.check.genomes.forEach((genome, i) => {
  const { F, V } = evaluate(bitsOf(genome), R.problem, R.check.sc);
  assert.ok(close(F[0], R.check.F[i][0]) && close(F[1], R.check.F[i][1]), `objectives differ for genome ${i}: ${F} vs ${R.check.F[i]}`);
  assert.ok(close(V, R.check.V[i]), `violation differs for genome ${i}: ${V} vs ${R.check.V[i]}`);
});

const q = createQiea(R.problem, R.check.sc, { seed: 3 });
for (let k = 0; k < 150; k++) q.step();
assert.ok(recommend(q.archive), 'live QIEA found no feasible plan in 3,000 evaluations');
console.log(`engine OK: ${R.check.genomes.length} reference genomes match; live QIEA front has ${recommend(q.archive).front.length} plans`);
