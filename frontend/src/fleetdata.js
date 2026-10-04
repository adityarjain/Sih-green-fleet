// User fleet/lane CSVs -> edits on the optimisation problem. React-free so engine.check.mjs can test it.
import { cloneProblem } from './engine.js';

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((s) => s.trim())).filter((r) => r.some(Boolean));
}

const key = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// field: [column, problem array, label, integer?, lower bound]
const FLEET_FIELDS = [['available', 'avail', 'Ships available', true, 0], ['daily_rate_usd', 'v_rate', 'Charter rate ($/day)', false, 1],
  ['fuel_tpd', 'v_fd', 'Design fuel (t/day)', false, 1]];
const LANE_FIELDS = [['teu_week', 'demand', 'Weekly demand (TEU)', false, 1], ['distance_nm', 'dist', 'Distance (nm)', false, 1],
  ['max_transit_days', 'tmax', 'Max transit (days)', false, 0.1]];

export const fleetTemplate = (vessels) => ['vessel,teu,available,daily_rate_usd,fuel_tpd',
  ...vessels.map((v) => `"${v.name}",${v.teu},${v.available},${v.rate},${v.fuel_tpd}`)].join('\n');
export const laneTemplate = (lanes) => ['lane,teu_week,distance_nm,max_transit_days',
  ...lanes.map((l) => `"${l.name}",${l.teu_week},${l.nm},${l.max_transit_days}`)].join('\n');

/** Reads one CSV against the base problem. Returns the detected kind, cell-level edits and row errors. */
export function readTable(text, base) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { kind: null, edits: [], errors: ['The file needs a header row and at least one data row.'] };
  const head = rows[0].map(key);
  const col = (name) => head.indexOf(name);
  const kind = col('teu') >= 0 ? 'fleet' : col('lane') >= 0 ? 'lanes' : null;
  if (!kind) return { kind, edits: [], errors: ['Header must contain a "teu" column (fleet file) or a "lane" column (lane file). Download a template to start.'] };
  const fields = (kind === 'fleet' ? FLEET_FIELDS : LANE_FIELDS).filter(([c]) => col(c) >= 0);
  if (!fields.length) return { kind, edits: [], errors: [`No editable columns found. Use: ${(kind === 'fleet' ? FLEET_FIELDS : LANE_FIELDS).map((f) => f[0]).join(', ')}.`] };
  const edits = [], errors = [];
  rows.slice(1).forEach((r, n) => {
    const line = n + 2;
    const id = r[col(kind === 'fleet' ? 'teu' : 'lane')] ?? '';
    const idx = kind === 'fleet' ? base.v_cap.indexOf(Number(id)) : base.lanes.findIndex((l) => l.toLowerCase() === id.toLowerCase());
    if (idx < 0) {
      errors.push(kind === 'fleet'
        ? `Row ${line}: TEU "${id}" is not a modelled vessel class (${base.v_cap.join(', ')}).`
        : `Row ${line}: lane "${id}" is not one of the 8 modelled lanes; new lanes need the fuel model re-run in fleet.py.`);
      return;
    }
    for (const [c, arr, label, integer, min] of fields) {
      const raw = r[col(c)];
      if (raw === undefined || raw === '') continue;
      const v = Number(raw.replace(/[, ]/g, ''));
      if (!Number.isFinite(v) || v < min || (integer && !Number.isInteger(v))) {
        errors.push(`Row ${line}: ${label} "${raw}" must be ${integer ? 'a whole number' : 'a number'} of at least ${min}.`);
        continue;
      }
      if (v !== base[arr][idx]) edits.push({ kind, idx, arr, label, name: kind === 'fleet' ? id : base.lanes[idx], from: base[arr][idx], to: v });
    }
  });
  return { kind, edits, errors };
}

/** Applies edits to a copy of the problem. Fuel tables scale with design fuel, as in the admiralty baseline. */
export function applyEdits(base, edits) {
  const P = cloneProblem(base);
  for (const e of edits) {
    if (e.arr === 'v_fd') {
      const r = e.to / base.v_fd[e.idx];
      for (const t of ['fuel', 'fuel_hi', 'fuel_rough']) P[t].forEach((lane) => { lane[e.idx] = lane[e.idx].map((x) => x * r); });
    }
    // ponytail: a class with 0 ships becomes 1e-9 so the fleet-size penalty stays finite; any use of it is infeasible
    P[e.arr][e.idx] = e.arr === 'avail' ? Math.max(e.to, 1e-9) : e.to;
  }
  return P;
}
