import { R, useScenario } from './context';
import { fmt, pct } from './format';

// Printable plan report: hidden on screen, the only thing on the page when printing (Save as PDF).
const GRID = { '0.71': 'India grid (0.71 kg CO2e/kWh)', '0.05': 'Renewable PPA (0.05 kg CO2e/kWh)' };
const PICK = { cheapest: 'Cheapest', balanced: 'Balanced', greenest: 'Greenest', leanest: 'Fuel-saver', express: 'Express' };

const H = ({ children }) => <h2 className="text-[13px] font-bold uppercase tracking-wider border-b border-slate-400 pb-1 mt-6 mb-2 break-after-avoid">{children}</h2>;
const Table = ({ head, rows, right = [] }) => (
  <table className="w-full text-[11px] border-collapse break-inside-avoid">
    <thead><tr>{head.map((h, i) => <th key={h} className={`border-b border-slate-400 py-1 pr-2 font-semibold ${right.includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, i) => <td key={i} className={`border-b border-slate-200 py-1 pr-2 ${right.includes(i) ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr>)}</tbody>
  </table>
);
const change = (a, b) => `${a >= b ? '+' : ''}${fmt(pct(a, b), 1)}%`;

export const Report = () => {
  const { s, sc, plan, conv, cap } = useScenario();
  const ok = !cap || plan.intensity <= cap;
  const fuels = [...new Set([...Object.keys(plan.fuel_mix_pj), ...Object.keys(conv.fuel_mix_pj)])];
  const QI = R.benchmark.algos['QIEA (quantum-inspired)'], NS = R.benchmark.algos['NSGA-II'];
  const q = R.benchmark.grid.findLastIndex((g) => g <= R.benchmark.budget / 4);
  const big = Object.keys(R.scalability).at(-1);
  const kpi = [
    ['Annual cost ($M)', plan.cost_musd, conv.cost_musd, 1],
    ['Well-to-wake CO2e (kt/yr)', plan.co2_kt, conv.co2_kt, 0],
    ['Fuel burned (kt VLSFO-equivalent/yr)', plan.fuel_kt_vlsfo_eq, conv.fuel_kt_vlsfo_eq, 1],
    ['Fuel energy (PJ/yr)', plan.energy_pj, conv.energy_pj, 2],
    ['GHG intensity (g CO2e/MJ)', plan.intensity, conv.intensity, 1],
  ];
  return (
    <div className="hidden print:block text-slate-900 bg-white text-[11px] leading-snug">
      <header className="flex justify-between items-end border-b-2 border-slate-900 pb-2">
        <div>
          <div className="text-[10px] font-mono text-slate-600">SIH 2026 · SIH26138 · Green Fleet Optimization System</div>
          <h1 className="text-lg font-bold">Fleet Deployment Plan Report</h1>
        </div>
        <div className="text-right text-[10px] text-slate-600">Generated {new Date().toLocaleString('en-IN')}<br />{PICK[s.pick]} plan · 8 Indian container lanes</div>
      </header>

      <H>Scenario</H>
      <Table head={['Setting', 'Value']} rows={[
        ['Carbon price', `$${s.carbon} per t CO2e`],
        ['GHG intensity cap', cap ? `FuelEU ${s.cap}: ${cap} g CO2e/MJ` : 'None'],
        ['Shore power source', GRID[s.grid]],
        ['Fuel forecast', s.robust === '1' ? 'Cautious: planned against the P90 fuel prediction' : 'Expected fuel prediction'],
        ['Recommendation', `${PICK[s.pick]} point of the cost, CO2e and fuel Pareto front (${sc.front.length} non-dominated plans)`],
      ]} />

      <H>Headline results vs conventional operation</H>
      <p className="mb-2 text-slate-600">Conventional: every lane on VLSFO at design speed, no shore power.</p>
      <Table head={['Metric', 'Recommended', 'Conventional', 'Change']} right={[1, 2, 3]}
        rows={kpi.map(([k, a, b, d]) => [k, fmt(a, d), fmt(b, d), change(a, b)])} />
      <p className="mt-2 font-semibold">{cap ? `Compliance: ${ok ? 'MEETS' : 'BREACHES'} the ${cap} g/MJ cap (plan ${fmt(plan.intensity)}, conventional ${fmt(conv.intensity)}).` : 'No GHG cap applied in this scenario.'}</p>

      <H>Annual cost breakdown ($M)</H>
      <Table head={['Component', 'Recommended', 'Conventional']} right={[1, 2]}
        rows={['fuel', 'carbon', 'ships', 'shore'].map((k) => [{ fuel: 'Fuel', carbon: 'Carbon', ships: 'Ship charter', shore: 'Shore power' }[k], fmt(plan.cost_breakdown[k]), fmt(conv.cost_breakdown[k])])} />

      <H>Fuel energy mix (PJ/yr)</H>
      <Table head={['Fuel', 'Recommended', 'Share', 'Conventional']} right={[1, 2, 3]}
        rows={fuels.map((f) => [f, fmt(plan.fuel_mix_pj[f] || 0, 2), `${fmt(((plan.fuel_mix_pj[f] || 0) / plan.energy_pj) * 100, 0)}%`, fmt(conv.fuel_mix_pj[f] || 0, 2)])} />

      <H>Fleet allocation by lane</H>
      <Table head={['Lane', 'Vessel', 'Ships', 'Speed (kn)', 'Transit (d)', 'Fuel', 'Shore power', 'CO2e (kt/yr)']} right={[2, 3, 4, 7]}
        rows={plan.lanes.map((l) => [l.lane, l.vessel, l.ships, fmt(l.speed), fmt(l.transit_days, 2), l.fuel, l.shore_power ? 'Connected' : 'Aux engines', fmt(l.co2_kt)])} />

      <H>Alternative plans on the same Pareto front</H>
      <Table head={['Plan', 'Cost ($M/yr)', 'CO2e (kt/yr)', 'Fuel (kt/yr)', 'Intensity (g/MJ)']} right={[1, 2, 3, 4]}
        rows={Object.entries(sc.picks).map(([k, p]) => [PICK[k] + (k === s.pick ? ' (selected)' : ''), fmt(p.cost_musd), fmt(p.co2_kt, 0), fmt(p.fuel_kt_vlsfo_eq, 0), fmt(p.intensity)])} />

      <H>Model evidence</H>
      <Table head={['Check', 'Result']} rows={[
        ['Fuel prediction error, held-out voyages (QI-tuned hybrid)', `${fmt(R.prediction.interp['QI-tuned hybrid'].mape)}% MAPE`],
        ['90% prediction interval (split-conformal)', `±${fmt(R.prediction.conformal.halfwidth_pct)}%, ${fmt(R.prediction.conformal.coverage)}% empirical coverage`],
        ...(R.mrv ? [[`Real-ship validation (${R.mrv.source})`, `${fmt(R.mrv.calibrated.mape)}% error on ${R.mrv.used} container ships after calibration`]] : []),
        ['Optimiser hypervolume at 25% of budget (early search)', `QIEA ${fmt(QI.curve[q], 3)} vs NSGA-II ${fmt(NS.curve[q], 3)}`],
        [`Optimiser hypervolume at full budget (${R.benchmark.budget.toLocaleString()} evaluations)`, `QIEA ${fmt(QI.hv_mean, 3)} vs NSGA-II ${fmt(NS.hv_mean, 3)}`],
        [`Optimiser hypervolume at ${big} lanes (scalability)`, `QIEA ${fmt(R.scalability[big]['QIEA (quantum-inspired)'].hv_mean, 3)} vs NSGA-II ${fmt(R.scalability[big]['NSGA-II'].hv_mean, 3)}`],
      ]} />

      <p className="mt-6 text-[10px] text-slate-500 border-t border-slate-300 pt-2">
        Fuel model trained on synthetic voyages and calibrated per vessel class against EU MRV 2024 container ships; fuel prices and emission factors are illustrative.
        FuelEU caps are applied to Indian lanes as a compliance scenario, not current law. Quantum-inspired means classical algorithms using Q-bit representations; no quantum hardware is used.
      </p>
    </div>
  );
};
