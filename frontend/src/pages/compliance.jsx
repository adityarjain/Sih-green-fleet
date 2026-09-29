import { Activity, ArrowDown, Atom, BarChart3, BookOpen, CheckCircle2, Cpu, Database, Gauge, Leaf, Network, RefreshCw, Scale, ShieldCheck, Sparkles, Table2, Target, Timer, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { CAPS, R, useLanguage, useScenario } from '../context';
import { axis, CapBadge, dot, fmt, FuelChip, grid, legend, PageHeader, Panel, pct, PrimaryButton, ScenarioStrip, Stat, tip, usePalette } from '../ui';

const CAP_LABEL = { none: 'No cap', 2030: 'FuelEU 2030', 2035: 'FuelEU 2035' };
const CARBON = ['0', '100', '200'];
const CAP_KEYS = ['none', '2030', '2035'];

/* ================================================================ compliance overview */
export const ComplianceDashboard = ({ onNavigate }) => {
  const { s, setMany, plan, conv, cap } = useScenario();
  const { t } = useLanguage();
  const p = usePalette();
  const sc = (c, k) => R.scenarios[`${c}|${k}|${s.grid}|${s.robust}`];
  const costData = CAP_KEYS.map((k) => ({ name: CAP_LABEL[k], cost: sc(s.carbon, k).picks.cheapest.cost_musd }));
  const laneData = plan.lanes.map((l, i) => ({ name: l.lane, Conventional: conv.lanes[i].co2_kt, Recommended: l.co2_kt }));
  const convOk = !cap || conv.intensity <= cap;
  return (
    <div className="space-y-6">
      <PageHeader title={t('complianceOverview', 'Compliance Overview')} subtitle="Well-to-wake GHG intensity against FuelEU-style caps, carbon exposure and emissions by lane">
        <PrimaryButton icon={Atom} onClick={() => onNavigate('benchmark')}>Audit the optimiser</PrimaryButton>
      </PageHeader>
      <ScenarioStrip />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="Plan intensity" value={`${fmt(plan.intensity)} g/MJ`} icon={Gauge} tone="text-emerald-600 dark:text-emerald-400"
          sub={cap ? <CapBadge ok={plan.intensity <= cap}>{plan.intensity <= cap ? 'Compliant' : 'Breach'} · cap {cap}</CapBadge> : 'No cap applied'} />
        <Stat label="Conventional plan" value={`${fmt(conv.intensity)} g/MJ`} icon={ShieldCheck} tone="text-slate-500"
          sub={cap ? <CapBadge ok={convOk}>{convOk ? 'Compliant' : 'Breach'} · cap {cap}</CapBadge> : 'VLSFO at design speed'} />
        <Stat label="CO2e avoided" value={`${fmt(conv.co2_kt - plan.co2_kt, 0)} kt`} sub={`${fmt(-pct(plan.co2_kt, conv.co2_kt), 0)}% below conventional per year`} icon={Leaf} tone="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Carbon cost" value={`$${fmt(plan.cost_breakdown.carbon)}M`} sub={`vs $${fmt(conv.cost_breakdown.carbon)}M conventional`} icon={Wallet} />
      </div>

      <Panel icon={Table2} title="Compliance matrix" pad={false}
        note={`Recommended ${s.pick} plan in each policy combination. Click a cell to make it the active scenario.`}>
        <div className="overflow-x-auto">
          <table className="mac-table">
            <thead><tr><th>GHG cap</th>{CARBON.map((c) => <th key={c}>Carbon ${c}/t</th>)}</tr></thead>
            <tbody>
              {CAP_KEYS.map((k) => (
                <tr key={k}>
                  <td className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">{CAP_LABEL[k]}{CAPS[k] && <span className="block text-[10px] font-mono text-slate-500">{CAPS[k]} g/MJ</span>}</td>
                  {CARBON.map((c) => {
                    const pl = sc(c, k).picks[s.pick];
                    const on = s.carbon === c && s.cap === k;
                    const ok = !CAPS[k] || pl.intensity <= CAPS[k];
                    return (
                      <td key={c}>
                        <button type="button" onClick={() => setMany({ carbon: c, cap: k })} aria-pressed={on}
                          className={`w-full text-left p-2 rounded-lg border transition-all ${on ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-white/[0.06]' : 'border-transparent hover:border-slate-300 dark:hover:border-white/[0.15]'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold text-slate-900 dark:text-white">{fmt(pl.intensity)} g/MJ</span>
                            <CapBadge ok={ok}>{ok ? 'OK' : 'Breach'}</CapBadge>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">${fmt(pl.cost_musd)}M · {fmt(pl.co2_kt, 0)} kt</div>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">
          The conventional plan runs every lane on VLSFO at {fmt(conv.intensity)} g/MJ, so it breaches both the 2030 and 2035 caps in every column.
        </p>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel icon={Scale} title="Cost of compliance" note={`Cheapest feasible plan under each cap at $${s.carbon}/t carbon. Dashed line is the conventional plan.`}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={costData} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...grid(p)} />
              <XAxis dataKey="name" {...axis(p)} />
              <YAxis {...axis(p)} width={52} tickFormatter={(v) => `$${v}M`} />
              <Tooltip {...tip(p)} formatter={(v) => [`$${fmt(v)}M / yr`, 'Cheapest plan']} />
              <ReferenceLine y={conv.cost_musd} ifOverflow="extendDomain" stroke={p.muted} strokeDasharray="4 4" label={{ value: `Conventional $${fmt(conv.cost_musd, 0)}M`, position: 'insideTopRight', fill: p.ink2, fontSize: 11 }} />
              <Bar dataKey="cost" fill={p.s[0]} radius={[4, 4, 0, 0]} maxBarSize={56}>
                <LabelList dataKey="cost" position="top" formatter={(v) => `$${fmt(v, 0)}M`} fill={p.ink2} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel icon={BarChart3} title="Emissions by lane" note="Annual well-to-wake CO2e, conventional vs recommended.">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={laneData} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke={p.grid} horizontal={false} />
              <XAxis type="number" {...axis(p)} tickFormatter={(v) => `${v} kt`} />
              <YAxis type="category" dataKey="name" {...axis(p)} width={150} tick={{ fill: p.muted, fontSize: 10 }} />
              <Tooltip {...tip(p)} formatter={(v, n) => [`${fmt(v)} kt/yr`, n]} />
              <Legend {...legend(p)} />
              <Bar dataKey="Conventional" fill={p.axis} radius={[0, 3, 3, 0]} maxBarSize={9} />
              <Bar dataKey="Recommended" fill={p.s[0]} radius={[0, 3, 3, 0]} maxBarSize={9} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
};

/* ================================================================ benchmark */
const ALGO_COLOR = { 'QIEA (quantum-inspired)': 0, 'NSGA-II': 1, 'Random search': 2 };

export const Benchmark = () => {
  const { t } = useLanguage();
  const p = usePalette();
  const B = R.benchmark;
  const algos = Object.keys(B.algos);
  const QI = B.algos['QIEA (quantum-inspired)'], NS = B.algos['NSGA-II'];
  const q = B.grid.findLastIndex((g) => g <= B.budget / 4);
  const sizes = Object.keys(R.scalability);
  const big = sizes[sizes.length - 1];
  const conv = B.grid.map((g, i) => ({ evals: g, ...Object.fromEntries(algos.map((a) => [a, B.algos[a].curve[i]])) }));
  const scale = sizes.map((n) => ({ lanes: n, ...Object.fromEntries(algos.map((a) => [a, R.scalability[n][a].hv_mean])) }));
  return (
    <div className="space-y-6">
      <PageHeader title={t('optimizerBenchmark', 'Optimiser Benchmark')}
        subtitle={`Quantum-inspired EA vs NSGA-II vs random search: 8-lane case, $100/t carbon, FuelEU 2030 cap, ${B.seeds} seeds, ${B.budget.toLocaleString()} evaluations each`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="HV at 25% budget" value={fmt(QI.curve[q], 3)} icon={Timer} tone="text-macblue-500"
          sub={<>NSGA-II <span className="font-mono">{fmt(NS.curve[q], 3)}</span> · {fmt(QI.curve[q] / NS.curve[q])}x faster start</>} />
        <Stat label="Final HV · 8 lanes" value={fmt(QI.hv_mean, 3)} sub={<>NSGA-II <span className="font-mono">{fmt(NS.hv_mean, 3)}</span> (±{fmt(NS.hv_std, 3)})</>} icon={Target} />
        <Stat label={`Final HV · ${big} lanes`} value={fmt(R.scalability[big]['QIEA (quantum-inspired)'].hv_mean, 3)} icon={Network} tone="text-emerald-600 dark:text-emerald-400"
          sub={<>NSGA-II <span className="font-mono">{fmt(R.scalability[big]['NSGA-II'].hv_mean, 3)}</span></>} />
        <Stat label="Runtime per run" value={`${fmt(QI.time_s, 2)} s`} sub={`${QI.feasible_runs}/${B.seeds} runs feasible`} icon={Cpu} />
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <Panel icon={Activity} title="Convergence" note="Median normalised hypervolume vs evaluations; higher is better.">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={conv} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...grid(p)} />
              <XAxis dataKey="evals" {...axis(p)} tickFormatter={(v) => `${v / 1000}k`} />
              <YAxis {...axis(p)} width={36} domain={[0, 1]} />
              <Tooltip {...tip(p)} labelFormatter={(v) => `${v.toLocaleString()} evaluations`} formatter={(v, n) => [fmt(v, 3), n]} />
              <Legend {...legend(p)} />
              {algos.map((a) => <Line key={a} dataKey={a} stroke={p.s[ALGO_COLOR[a]]} strokeWidth={2} dot={false} type="monotone" />)}
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel icon={Target} title="Best fronts found" note="Best run per algorithm; lower-left is better.">
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={p.grid} />
              <XAxis type="number" dataKey="x" name="Cost" {...axis(p)} domain={['dataMin - 5', 'dataMax + 5']} tickFormatter={(v) => `$${Math.round(v)}M`} />
              <YAxis type="number" dataKey="y" name="CO2e" {...axis(p)} width={48} tickFormatter={(v) => `${Math.round(v)}kt`} />
              <Tooltip {...tip(p)} cursor={{ strokeDasharray: '3 3', stroke: p.axis }} formatter={(v, n) => (n === 'Cost' ? [`$${fmt(v)}M`, n] : [`${fmt(v, 0)} kt`, n])} />
              <Legend {...legend(p)} />
              {algos.map((a) => (
                <Scatter key={a} name={a} data={B.algos[a].front.map(([x, y]) => ({ x, y }))} fill={p.s[ALGO_COLOR[a]]} shape={dot(3.5, p.s[ALGO_COLOR[a]], p.surface)} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </Panel>
        <Panel icon={Network} title="Scalability" note="Final hypervolume as lanes grow (budget 750 evaluations per lane).">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={scale} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...grid(p)} />
              <XAxis dataKey="lanes" {...axis(p)} tickFormatter={(v) => `${v} lanes`} />
              <YAxis {...axis(p)} width={36} domain={[0, 1]} />
              <Tooltip {...tip(p)} labelFormatter={(v) => `${v} lanes`} formatter={(v, n) => [fmt(v, 3), n]} />
              <Legend {...legend(p)} />
              {algos.map((a) => <Line key={a} dataKey={a} stroke={p.s[ALGO_COLOR[a]]} strokeWidth={2} dot={{ r: 4, fill: p.s[ALGO_COLOR[a]] }} />)}
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <Panel icon={Table2} title="Scorecard" pad={false}>
        <div className="overflow-x-auto">
          <table className="mac-table">
            <thead>
              <tr><th>Algorithm</th><th className="text-right">Final HV</th><th className="text-right">HV @ {B.grid[q].toLocaleString()}</th><th className="text-right">Evals to 95%</th>
                <th className="text-right">Runtime</th><th className="text-right">Feasible</th>{sizes.map((n) => <th key={n} className="text-right">HV {n} lanes</th>)}</tr>
            </thead>
            <tbody>
              {algos.map((a) => {
                const o = B.algos[a];
                return (
                  <tr key={a}>
                    <td className="font-semibold text-slate-900 dark:text-white whitespace-nowrap"><span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: p.s[ALGO_COLOR[a]] }} />{a}</td>
                    <td className="text-right font-mono whitespace-nowrap">{fmt(o.hv_mean, 3)} ± {fmt(o.hv_std, 3)}</td>
                    <td className="text-right font-mono">{fmt(o.curve[q], 3)}</td>
                    <td className="text-right font-mono">{o.evals_to_95 ? o.evals_to_95.toLocaleString() : 'not reached'}</td>
                    <td className="text-right font-mono">{fmt(o.time_s, 2)} s</td>
                    <td className="text-right font-mono">{o.feasible_runs}/{B.seeds}</td>
                    {sizes.map((n) => <td key={n} className="text-right font-mono">{fmt(R.scalability[n][a].hv_mean, 3)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">
          Fairness: QIEA settings were tuned on seeds 0 to 4; NSGA-II uses textbook settings (population 100, uniform crossover, 1/L bit-flip mutation). Both get identical budgets and the same constraint-domination rule. Hypervolume is normalised per problem size against the combined best front.
        </p>
      </Panel>
    </div>
  );
};

/* ================================================================ method */
const SPEEDS = [10, 11.5, 13, 14.5, 16, 17.5, 19, 20.5];
const bits = (n, w) => n.toString(2).padStart(w, '0').split('');

const Step = ({ n, icon: Icon, title, children, tone }) => (
  <div className={`w-full max-w-xl p-4 rounded-xl border text-center ${tone}`}>
    <div className="font-extrabold text-xs uppercase tracking-wide flex items-center justify-center gap-1.5"><Icon size={14} />{n}. {title}</div>
    <div className="text-[11px] mt-1.5 opacity-90 leading-relaxed">{children}</div>
  </div>
);
const Down = () => <ArrowDown size={18} className="text-slate-400 dark:text-slate-500" />;

export const Method = () => {
  const { t } = useLanguage();
  const { plan } = useScenario();
  const lane = plan.lanes[0];
  const groups = [
    ['Vessel', bits(R.vessels.findIndex((v) => v.name === lane.vessel), 2), lane.vessel],
    ['Speed', bits(SPEEDS.indexOf(lane.speed), 3), `${fmt(lane.speed)} kn`],
    ['Fuel', bits(R.fuels.findIndex((f) => f.name === lane.fuel), 3), lane.fuel],
    ['Shore', [lane.shore_power ? '1' : '0'], lane.shore_power ? 'On' : 'Off'],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title={t('methodAssumptions', 'Method & Assumptions')} subtitle="How a voyage record becomes a recommended fleet plan, and every number the model assumes" />
      <div className="grid lg:grid-cols-5 gap-5">
        <Panel className="lg:col-span-3" icon={RefreshCw} title="Prediction-to-plan pipeline">
          <div className="flex flex-col items-center gap-2.5 text-slate-900 dark:text-white">
            <Step n={1} icon={Database} title="Voyage data" tone="bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-950 dark:border-white">
              Speed, load, Beaufort, head-sea angle and hull fouling per voyage (synthetic training data), calibrated against real EU MRV container-ship reports
            </Step>
            <Down />
            <Step n={2} icon={Gauge} title="Hybrid fuel predictor" tone="bg-slate-100 border-slate-300 dark:bg-white/[0.06] dark:border-white/[0.12]">
              Admiralty law gives the physics baseline; gradient boosting learns only the correction. The quantum-inspired search picks its inputs and settings, and split-conformal gives a 90% interval.
            </Step>
            <Down />
            <Step n={3} icon={Table2} title="Fuel lookup table" tone="bg-slate-100 border-slate-300 dark:bg-white/[0.06] dark:border-white/[0.12]">
              Tonnes per day for every lane × vessel × speed, expected and cautious (P90)
            </Step>
            <Down />
            <Step n={4} icon={Atom} title="Quantum-inspired search" tone="bg-blue-50/90 border-blue-200 text-blue-950 dark:bg-blue-950/30 dark:border-blue-800/60 dark:text-blue-100">
              Each decision bit is a Q-bit angle. Superposition recombination prepares Q-bits from two archive parents, a rotation gate biases them, a NOT gate keeps diversity.
            </Step>
            <Down />
            <div className="w-full max-w-xl p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/60 text-center space-y-2.5">
              <span className="font-extrabold text-amber-950 dark:text-amber-200 block text-xs uppercase">5. All constraints satisfied?</span>
              <div className="text-[11px] text-amber-900/80 dark:text-amber-200/80">Transit time • speed limit • bunkering range • fleet size • fuel supply • GHG cap</div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 font-bold text-[11px] flex items-center justify-center gap-1.5">
                  <CheckCircle2 size={14} />Yes → Pareto archive
                </div>
                <div className="p-2.5 rounded-lg bg-orange-100 dark:bg-orange-950/60 border border-orange-300 dark:border-orange-800 text-orange-950 dark:text-orange-200 font-bold text-[11px] flex items-center justify-center gap-1.5">
                  <RefreshCw size={14} />No → ranked by violation
                </div>
              </div>
            </div>
            <Down />
            <div className="w-full max-w-xl p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border-2 border-dashed border-emerald-400 dark:border-emerald-700 text-center">
              <div className="font-extrabold text-emerald-950 dark:text-emerald-200 text-xs uppercase flex items-center justify-center gap-1.5"><Sparkles size={14} />6. Pareto front → recommendation</div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">Cheapest, balanced (knee point) and greenest plans, each with a plain-language explanation</p>
            </div>
          </div>
        </Panel>
        <div className="lg:col-span-2 space-y-5">
          <Panel icon={Cpu} title="Q-bit genome of one lane" note={`${lane.lane} in the recommended plan. 9 Q-bits per lane, 72 for the fleet: about 4.7 × 10²¹ possible plans.`}>
            <div className="grid grid-cols-4 gap-2">
              {groups.map(([name, bs, val]) => (
                <div key={name} className="rounded-lg border border-slate-200 dark:border-white/[0.08] p-2 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{name}</div>
                  <div className="flex justify-center gap-1 my-1.5">
                    {bs.map((b, i) => (
                      <span key={i} className={`h-6 w-5 rounded font-mono text-xs font-bold flex items-center justify-center ${b === '1' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400'}`}>{b}</span>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight">{val}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
              During search each bit is a superposition: P(1) = sin²θ. Observing the population collapses the angles into concrete plans; the rotation gate then nudges θ toward good archive members.
            </p>
          </Panel>
          <Panel icon={BookOpen} title="Honest limits">
            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
              <li>The fuel model is trained on synthetic voyages, then calibrated per vessel class against real EU MRV 2024 container ships; fuel prices and emission factors are illustrative and must be cited before quoting.</li>
              <li>"Quantum-inspired" means classical algorithms borrowing Q-bit ideas; no quantum hardware is used.</li>
              <li>FuelEU caps are applied to Indian lanes as a compliance scenario, not as current law.</li>
            </ul>
          </Panel>
        </div>
      </div>

      <Panel icon={Table2} title="Fuels" pad={false}>
        <div className="overflow-x-auto">
          <table className="mac-table">
            <thead><tr><th>Fuel</th><th className="text-right">WtW gCO2e/MJ</th><th className="text-right">Price $/GJ</th><th className="text-right">Range (sea days)</th><th className="text-right">Ship cost ×</th><th className="text-right">Supply PJ/yr</th></tr></thead>
            <tbody>
              {R.fuels.map((f) => (
                <tr key={f.name}>
                  <td><FuelChip name={f.name} /></td><td className="text-right font-mono">{fmt(f.wtw)}</td><td className="text-right font-mono">{fmt(f.price)}</td>
                  <td className="text-right font-mono">{f.range_days}</td><td className="text-right font-mono">{fmt(f.capex_mult, 2)}</td><td className="text-right font-mono">{f.supply_pj ?? 'Unlimited'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel icon={Table2} title="Vessels" pad={false}>
          <div className="overflow-x-auto">
            <table className="mac-table">
              <thead><tr><th>Vessel</th><th className="text-right">Design speed</th><th className="text-right">Fuel t/day</th><th className="text-right">Charter $/day</th><th className="text-right">Fleet</th></tr></thead>
              <tbody>{R.vessels.map((v) => (
                <tr key={v.name}><td className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">{v.name}</td><td className="text-right font-mono">{fmt(v.design_speed)} kn</td>
                  <td className="text-right font-mono">{v.fuel_tpd}</td><td className="text-right font-mono">{v.rate.toLocaleString()}</td><td className="text-right font-mono">{v.available}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
        <Panel icon={Table2} title="Lanes" pad={false}>
          <div className="overflow-x-auto">
            <table className="mac-table">
              <thead><tr><th>Lane</th><th className="text-right">Distance</th><th className="text-right">TEU / week</th><th className="text-right">Max transit</th></tr></thead>
              <tbody>{R.lanes.map((l) => (
                <tr key={l.name}><td className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">{l.name}</td><td className="text-right font-mono">{l.nm.toLocaleString()} nm</td>
                  <td className="text-right font-mono">{l.teu_week.toLocaleString()}</td><td className="text-right font-mono">{fmt(l.max_transit_days)} d</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
};
