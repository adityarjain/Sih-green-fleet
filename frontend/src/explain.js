// Per-lane "why this choice": change one decision on one lane, re-evaluate the whole fleet, report what breaks or trades off.
import { evaluate } from './engine.js';

const laneOf = (g, P, i) => {
  const b = i * P.genes;
  return { v: g[b] * 2 + g[b + 1], s: g[b + 2] * 4 + g[b + 3] * 2 + g[b + 4], f: g[b + 5] * 4 + g[b + 6] * 2 + g[b + 7], sh: g[b + 8] };
};
const withLane = (g, P, i, { v, s, f, sh }) => {
  const x = Uint8Array.from(g), b = i * P.genes;
  [v >> 1 & 1, v & 1, s >> 2 & 1, s >> 1 & 1, s & 1, f >> 2 & 1, f >> 1 & 1, f & 1, sh].forEach((bit, k) => { x[b + k] = bit; });
  return x;
};

/** Every single-decision alternative for lane i, each with newly broken constraints and objective deltas [cost $M, CO2e kt, fuel kt]. */
export function whyLane(g, P, sc, i) {
  const base = evaluate(g, P, sc, true), cur = laneOf(g, P, i);
  const alt = (change) => {
    const d = evaluate(withLane(g, P, i, { ...cur, ...change }), P, sc, true);
    const broken = Object.keys(d.violations).filter((k) => d.violations[k] > base.violations[k] + 1e-9);
    return { change, broken, dF: d.F.map((x, m) => x - base.F[m]) };
  };
  const near = (x, n) => [x - 1, x + 1].filter((y) => y >= 0 && y < n);
  return {
    cur,
    fuel: P.f_wtw.map((_, f) => f).filter((f) => f !== cur.f).map((f) => alt({ f })),
    speed: near(cur.s, P.speeds.length).map((s) => alt({ s })),
    vessel: near(cur.v, P.v_cap.length).map((v) => alt({ v })),
    shore: [alt({ sh: 1 - cur.sh })],
  };
}

const BROKEN = {
  speed: "is above the vessel's safe speed",
  transit: (P, i) => `misses the ${P.tmax[i]}-day transit limit`,
  range: 'cannot reach the next bunkering port',
  fleet: 'needs more ships of a class than the fleet has',
  supply: 'runs past the available bunker supply',
  cap: 'pushes the fleet over the GHG cap',
};
const EPS = [0.05, 0.05, 0.05];
const part = (m, x) => [`$${Math.abs(x).toFixed(1)}M`, `${Math.abs(x).toFixed(1)} kt CO2e`, `${Math.abs(x).toFixed(1)} kt fuel`][m];
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

/** Plain-language consequence of one alternative. */
export function consequence(o, P, i) {
  if (o.broken.length) return list(o.broken.map((k) => (typeof BROKEN[k] === 'function' ? BROKEN[k](P, i) : BROKEN[k])));
  const gains = [], losses = [];
  o.dF.forEach((x, m) => { if (x < -EPS[m]) gains.push(part(m, x)); else if (x > EPS[m]) losses.push(part(m, x)); });
  if (!gains.length && !losses.length) return 'makes almost no difference';
  if (!gains.length) return `costs more on every count: +${list(losses)}`;
  if (!losses.length) return `would improve ${list(gains)}; a better plan exists here`;
  return `saves ${list(gains)}, but adds ${list(losses)}`;
}
