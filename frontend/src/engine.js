// In-browser port of fleet.py evaluate() and the quantum-inspired EA, for live runs and disruption replanning.
// Kept free of React so `npm run check` can verify it against the Python reference values.

export const cloneProblem = (base) => structuredClone(base);

export function evaluate(g, P, sc, detail = false) {
  const nl = P.lanes.length, G = P.genes;
  const table = sc.robust ? P.fuel_hi : P.fuel;
  const grid = (sc.grid * 1000) / 3.6;
  const shipsBy = P.v_cap.map(() => 0), fuelBy = P.f_wtw.map(() => 0);
  const vb = { speed: 0, transit: 0, range: 0, fleet: 0, supply: 0, cap: 0 };
  let cost = 0, co2Tot = 0, energy = 0;
  const lanes = [];
  for (let i = 0; i < nl; i++) {
    const b = i * G;
    const v = g[b] * 2 + g[b + 1], s = g[b + 2] * 4 + g[b + 3] * 2 + g[b + 4], f = g[b + 5] * 4 + g[b + 6] * 2 + g[b + 7], sh = g[b + 8];
    const spd = P.speeds[s];
    const sea = P.dist[i] / (spd * 24);
    const voy = Math.ceil(P.demand[i] / (P.v_cap[v] * P.util));
    const ships = Math.ceil((voy * (2 * sea + 2 * P.port_day)) / 7);
    const aux = voy * 52 * 2 * P.port_day * P.aux_frac * P.v_fd[v] * P.lhv;
    const fuel = voy * 52 * 2 * sea * table[i][v][s] * P.lhv + aux * (1 - sh);
    const elec = aux * sh * P.aux_eff;
    const co2 = (fuel * P.f_wtw[f] + elec * grid) / 1000;
    cost += fuel * P.f_price[f] + elec * P.elec_price + co2 * sc.carbon + ships * P.v_rate[v] * P.f_capex[f] * 365 + sh * P.shore_fixed;
    vb.speed += Math.max(0, spd - P.v_speed[v] - 1) / 5;
    vb.transit += Math.max(0, sea - P.tmax[i]) / P.tmax[i];
    vb.range += Math.max(0, sea - P.f_range[f]) / P.f_range[f];
    shipsBy[v] += ships;
    fuelBy[f] += fuel;
    co2Tot += co2;
    energy += fuel + elec;
    if (detail) lanes.push({ lane: P.lanes[i], v, s, f, sh, speed: spd, sea, ships, fuel_gj: fuel, co2_kt: co2 / 1000 });
  }
  shipsBy.forEach((n, k) => { vb.fleet += Math.max(0, n - P.avail[k]) / P.avail[k]; });
  P.supply.forEach((cap, j) => { if (cap != null) vb.supply += Math.max(0, fuelBy[j] / 1e6 - cap) / cap; });
  const intensity = (co2Tot * 1e3) / energy;
  if (sc.cap) vb.cap = Math.max(0, intensity - sc.cap) / sc.cap;
  const V = vb.speed + vb.transit + vb.range + vb.fleet + vb.supply + vb.cap;
  const F = [cost / 1e6, co2Tot / 1e3];
  return detail ? { F, V, intensity, energy_pj: energy / 1e6, lanes, shipsBy, violations: vb } : { F, V };
}

/* ---------- multi-objective helpers (same rules as fleet.py) ---------- */
const eff = (o) => (o.V > 0 ? [1e9 + o.V, 1e9 + o.V] : o.F);
const dominates = (a, b) => a[0] <= b[0] && a[1] <= b[1] && (a[0] < b[0] || a[1] < b[1]);

function crowding(pts) {
  const n = pts.length, d = pts.map(() => 0);
  if (n <= 2) return d.fill(Infinity);
  for (let m = 0; m < 2; m++) {
    const o = [...pts.keys()].sort((a, b) => pts[a][m] - pts[b][m]);
    const span = pts[o[n - 1]][m] - pts[o[0]][m] || 1;
    d[o[0]] = d[o[n - 1]] = Infinity;
    for (let k = 1; k < n - 1; k++) d[o[k]] += (pts[o[k + 1]][m] - pts[o[k - 1]][m]) / span;
  }
  return d;
}

function updateArchive(archive, cands, A) {
  const byKey = new Map();
  for (const o of [...archive, ...cands]) byKey.set(o.key, o);
  const all = [...byKey.values()], E = all.map(eff);
  let keep = all.filter((_, i) => !E.some((e, j) => j !== i && dominates(e, E[i])));
  if (keep.length > A) {
    const cd = crowding(keep.map((o) => o.F));
    keep = [...keep.keys()].sort((a, b) => cd[b] - cd[a]).slice(0, A).map((i) => keep[i]);
  }
  return keep;
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quantum-inspired EA with superposition recombination, rotation gate and NOT gate (mirrors fleet.qiea). */
export function createQiea(P, sc, { N = 20, A = 60, dtheta = 0.05 * Math.PI, seed = 1 } = {}) {
  const L = P.lanes.length * P.genes, lo = 0.02 * Math.PI, rand = mulberry32(seed);
  const th = new Float64Array(N * L).fill(Math.PI / 4);
  let archive = [], evals = 0, gen = 0;
  const rint = (n) => Math.floor(rand() * n);

  function step() {
    const cands = [];
    for (let n = 0; n < N; n++) {
      const g = new Uint8Array(L);
      for (let l = 0; l < L; l++) g[l] = rand() < Math.sin(th[n * L + l]) ** 2 ? 1 : 0;
      cands.push({ g, key: g.join(''), ...evaluate(g, P, sc) });
    }
    evals += N;
    gen += 1;
    archive = updateArchive(archive, cands, A);
    const cd = crowding(archive.map(eff));
    const pick = () => { const a = rint(archive.length), b = rint(archive.length); return archive[cd[a] >= cd[b] ? a : b].g; };
    for (let n = 0; n < N; n++) {
      const G1 = pick(), G2 = pick();
      for (let l = 0; l < L; l++) {
        let t = G1[l] === G2[l] ? (G1[l] ? Math.PI / 2 - lo : lo) : Math.PI / 4 + (G1[l] ? dtheta : -dtheta);
        if (rand() < 1 / L) t = Math.PI / 2 - t;
        th[n * L + l] = Math.min(Math.PI / 2 - lo, Math.max(lo, t));
      }
    }
  }

  /** Mean P(1) = sin^2(theta) per bit across the Q-population: the "superposition" the next generation samples from. */
  function probs() {
    const p = new Float64Array(L);
    for (let n = 0; n < N; n++) for (let l = 0; l < L; l++) p[l] += Math.sin(th[n * L + l]) ** 2 / N;
    return p;
  }

  return { step, probs, get archive() { return archive; }, get evals() { return evals; }, get gen() { return gen; } };
}

/** Cheapest, knee-point (balanced) and greenest feasible plans from an archive. */
export function recommend(archive) {
  const ok = archive.filter((o) => o.V === 0).sort((a, b) => a.F[0] - b.F[0]);
  if (!ok.length) return null;
  const lo = [0, 1].map((m) => Math.min(...ok.map((o) => o.F[m]))), hi = [0, 1].map((m) => Math.max(...ok.map((o) => o.F[m])));
  const n = (o, m) => (o.F[m] - lo[m]) / (hi[m] - lo[m] || 1);
  const knee = ok.reduce((best, o) => (Math.hypot(n(o, 0), n(o, 1)) < Math.hypot(n(best, 0), n(best, 1)) ? o : best));
  return { cheapest: ok[0], balanced: knee, greenest: ok.reduce((b, o) => (o.F[1] < b.F[1] ? o : b)), front: ok };
}

export const bitsOf = (genome) => Uint8Array.from(genome, Number);
