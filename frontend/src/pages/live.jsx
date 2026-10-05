import { useEffect, useRef, useState } from 'react';
import { Anchor, ArrowRight, CheckCircle2, CloudLightning, Cpu, Fuel, Gauge, Grid3x3, Play, RefreshCw, ShieldAlert, Square, Timer, TrendingUp, Wrench, Zap } from 'lucide-react';
import { CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { R, useLanguage, useScenario, useTheme } from '../context';
import { bitsOf, cloneProblem, createQiea, evaluate, recommend } from '../engine';
import { axis, CapBadge, dot, fmt, FuelChip, legend, PageHeader, Panel, pct, ScenarioStrip, Seg, Stat, tip, usePalette } from '../ui';

const PICKS = ['cheapest', 'balanced', 'greenest', 'leanest'];
const VESSEL = R.vessels.map((v) => v.name);
const FUEL = R.fuels.map((f) => f.name);
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------- live run hook: steps the quantum-inspired EA a few generations per animation frame ---------- */
function useLiveRun() {
  const [run, setRun] = useState(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const stop = () => { cancelAnimationFrame(raf.current); setRun((r) => r && { ...r, done: true }); };
  const reset = () => { cancelAnimationFrame(raf.current); setRun(null); };
  const start = (P, sc, budget) => {
    cancelAnimationFrame(raf.current);
    const q = createQiea(P, sc, { seed: Math.floor(Math.random() * 1e9) });
    const t0 = performance.now();
    const gens = Math.floor(budget / 20);
    const duration = reduceMotion() ? 0 : 2000 + budget / 4; // paced for viewing; the search itself takes ~0.1 s
    const tick = () => {
      const target = duration ? Math.min(gens, Math.ceil(((performance.now() - t0) / duration) * gens)) : gens;
      while (q.gen < target) q.step();
      const rec = recommend(q.archive);
      const done = q.evals >= budget;
      if (done && rec) { // Express: a quick extra search held to today's delivery speed (express_tmax)
        const qx = createQiea({ ...P, tmax: R.express_tmax }, sc, { seed: Math.floor(Math.random() * 1e9) });
        while (qx.evals < budget) qx.step();
        rec.express = recommend(qx.archive)?.balanced;
      }
      setRun({ gen: q.gen, evals: q.evals, budget, rec, probs: q.probs(), ms: performance.now() - t0, done });
      if (!done) raf.current = requestAnimationFrame(tick);
    };
    tick();
  };
  return { run, start, stop, reset };
}

const liveSc = (s, cap) => ({ carbon: +s.carbon, cap, grid: +s.grid, robust: s.robust === '1' });

/* ---------- Q-bit superposition grid ---------- */
const GROUPS = [['Vessel', 2], ['Speed', 3], ['Fuel', 3], ['Shore', 1]];

export const QbitGrid = ({ probs, lanes }) => {
  const { isDark } = useTheme();
  const ramp = isDark ? [...RAMP].reverse() : RAMP;
  const color = (p) => ramp[Math.round(p * (ramp.length - 1))];
  const settle = probs ? Array.from(probs).reduce((a, p) => a + 4 * p * (1 - p), 0) / probs.length : 1;
  const bit = (i) => (probs ? (probs[i] >= 0.5 ? 1 : 0) : 0);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-separate border-spacing-[3px]">
          <thead>
            <tr>
              <th />
              {GROUPS.map(([g, n]) => <th key={g} colSpan={n} className="font-semibold uppercase tracking-wider text-[9px] text-slate-500 dark:text-slate-400 text-center">{g}</th>)}
              <th className="text-left pl-3 font-semibold uppercase tracking-wider text-[9px] text-slate-500 dark:text-slate-400">Most likely</th>
            </tr>
          </thead>
          <tbody>
            {lanes.map((lane, r) => {
              const b = r * 9;
              const v = bit(b) * 2 + bit(b + 1), s = bit(b + 2) * 4 + bit(b + 3) * 2 + bit(b + 4), f = bit(b + 5) * 4 + bit(b + 6) * 2 + bit(b + 7);
              return (
                <tr key={lane}>
                  <td className="pr-2 whitespace-nowrap text-slate-600 dark:text-slate-300 font-medium">{lane}</td>
                  {Array.from({ length: 9 }, (_, c) => {
                    const p = probs ? probs[b + c] : 0.5;
                    return <td key={c} title={`P(1) = ${p.toFixed(2)}`} className="h-5 w-5 min-w-5 rounded-sm transition-colors duration-150" style={{ background: color(p) }} />;
                  })}
                  <td className="pl-3 whitespace-nowrap font-mono text-slate-700 dark:text-slate-300">
                    {VESSEL[v].split(' ')[0]} · {R.problem.speeds[s]} kn · {FUEL[f]}{bit(b + 8) ? ' · OPS' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-500 dark:text-slate-400">
        <span>P(1) = 0</span>
        <div className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(90deg, ${ramp.join(',')})` }} />
        <span>1</span>
        <span className="ml-auto font-mono">{fmt(settle * 100, 0)}% still in superposition</span>
      </div>
    </div>
  );
};

/* ---------- live front chart ---------- */
const LiveFront = ({ run, reference, height = 300 }) => {
  const p = usePalette();
  const live = run?.rec ? run.rec.front.map((o) => ({ x: o.F[0], y: o.F[1] })) : [];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={p.grid} />
        <XAxis type="number" dataKey="x" name="Annual cost" domain={['dataMin - 5', 'dataMax + 5']} {...axis(p)} tickFormatter={(v) => `$${Math.round(v)}M`} />
        <YAxis type="number" dataKey="y" name="CO2e" {...axis(p)} width={56} tickFormatter={(v) => `${Math.round(v)} kt`} />
        <Tooltip {...tip(p)} cursor={{ strokeDasharray: '3 3', stroke: p.axis }} formatter={(v, n) => (n === 'Annual cost' ? [`$${fmt(v)}M`, n] : [`${fmt(v, 0)} kt`, n])} />
        <Legend {...legend(p)} />
        {reference && <Scatter name={reference.name} data={reference.data} fill={p.ref} shape={dot(3, p.ref)} isAnimationActive={false} />}
        <Scatter name="Live front" data={live} fill={p.s[0]} shape={dot(3.5, p.s[0], p.surface)} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
};

const RunButtons = ({ running, onRun, onStop, label = 'Run optimiser' }) => (
  running
    ? <button type="button" onClick={onStop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-white/[0.15] text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><Square size={12} />Stop</button>
    : <button type="button" onClick={onRun} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 text-xs font-semibold shadow-2xs"><Play size={12} className="text-macblue-500" />{label}</button>
);

/* ================================================================ live optimiser */
export const LiveOptimizer = ({ onNavigate }) => {
  const { s, sc, cap } = useScenario();
  const { t } = useLanguage();
  const [budget, setBudget] = useState('8000');
  const { run, start, stop, reset } = useLiveRun();
  const key = `${s.carbon}|${s.cap}|${s.grid}|${s.robust}`;
  useEffect(() => { reset(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = run && !run.done;
  const offline = sc.front.map(([x, y]) => ({ x, y }));
  return (
    <div className="space-y-6">
      <PageHeader title={t('liveOptimizer', 'Live Optimiser')} subtitle="Runs the quantum-inspired search in your browser and shows the Pareto front forming and the Q-bits collapsing, generation by generation">
        <div className="flex items-end gap-4">
          <Seg label="Evaluation budget" value={budget} onChange={setBudget} options={[['4000', '4k'], ['8000', '8k'], ['16000', '16k']]} />
          <RunButtons running={running} onRun={() => start(R.problem, liveSc(s, cap), +budget)} onStop={stop} />
        </div>
      </PageHeader>
      <ScenarioStrip onEdit={() => onNavigate('planner')} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="Generation" value={run ? run.gen : 0} sub={`${run ? run.evals.toLocaleString() : 0} of ${(+budget).toLocaleString()} evaluations`} icon={Cpu} tone="text-macblue-500" />
        <Stat label="Plans on front" value={run?.rec ? run.rec.front.length : 0} sub={run?.rec ? 'feasible, mutually non-dominated' : 'no feasible plan yet'} icon={Grid3x3} />
        <Stat label="Best cost / lowest CO2e" value={run?.rec ? `$${fmt(run.rec.cheapest.F[0], 0)}M` : 'Not run'} sub={run?.rec ? `${fmt(run.rec.greenest.F[1], 0)} kt CO2e at the green end` : 'run the optimiser'} icon={Zap} tone="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Elapsed" value={run ? `${fmt(run.ms / 1000, 1)} s` : '0.0 s'} sub={run?.done ? 'finished' : running ? 'searching…' : 'idle'} icon={Timer} />
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel icon={Gauge} title="Pareto front forming" note="Blue: live browser run. Grey: the front computed offline by fleet.py for the same scenario.">
          <LiveFront run={run} reference={{ name: 'Offline front (Python)', data: offline }} />
        </Panel>
        <Panel icon={Grid3x3} title="Q-bit superposition" note="Each cell is one Q-bit, coloured by the population's probability of observing 1. Mid-blue means undecided; the search collapses them toward 0 or 1.">
          <QbitGrid probs={run?.probs} lanes={R.problem.lanes} />
        </Panel>
      </div>
      {run?.done && run.rec && (
        <Panel icon={CheckCircle2} title="Plans recommended by this run" pad={false}>
          <div className="overflow-x-auto">
            <table className="mac-table">
              <thead><tr><th>Plan</th><th className="text-right">Cost (live)</th><th className="text-right">Cost (offline)</th><th className="text-right">CO2e (live)</th><th className="text-right">CO2e (offline)</th><th>GHG cap</th></tr></thead>
              <tbody>
                {[...PICKS, 'express'].filter((k) => run.rec[k]).map((k) => {
                  const o = run.rec[k], off = sc.picks[k];
                  const d = evaluate(o.g, R.problem, liveSc(s, cap), true);
                  return (
                    <tr key={k}>
                      <td className="font-semibold text-slate-900 dark:text-white capitalize">{t(k, k)}</td>
                      <td className="text-right font-mono">${fmt(o.F[0])}M</td><td className="text-right font-mono text-slate-500">${fmt(off.cost_musd)}M</td>
                      <td className="text-right font-mono">{fmt(o.F[1], 0)} kt</td><td className="text-right font-mono text-slate-500">{fmt(off.co2_kt, 0)} kt</td>
                      <td>{cap ? <CapBadge ok={d.intensity <= cap}>{fmt(d.intensity)} g/MJ</CapBadge> : <span className="font-mono">{fmt(d.intensity)} g/MJ</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">Each run uses a fresh random seed, so live and offline results differ slightly; both come from the same algorithm and objectives. Express is a second quick search held to today's delivery speed. The browser engine is tested to reproduce the Python results exactly.</p>
        </Panel>
      )}
    </div>
  );
};

/* ================================================================ disruption replanning */
const idx = (P, name) => P.lanes.indexOf(name);
const fuelIdx = (name) => FUEL.indexOf(name);
const DISRUPTIONS = [
  { id: 'cyclone', icon: CloudLightning, title: 'Cyclone in the Bay of Bengal', desc: 'Sea state +3 Beaufort on the Chennai, Kolkata and Visakhapatnam lanes; fuel burn re-predicted by the model.',
    apply: (P) => ['Chennai - Singapore', 'Kolkata - Chittagong', 'Visakhapatnam - Port Klang'].forEach((n) => {
      const i = idx(P, n);
      P.fuel_hi[i] = P.fuel_hi[i].map((row, a) => row.map((x, b) => (x * P.fuel_rough[i][a][b]) / P.fuel[i][a][b]));
      P.fuel[i] = P.fuel_rough[i];
    }) },
  { id: 'chennai', icon: Anchor, title: 'Chennai port closed', desc: 'Chennai–Singapore cargo diverted through Visakhapatnam–Port Klang.',
    apply: (P) => { const a = idx(P, 'Chennai - Singapore'), b = idx(P, 'Visakhapatnam - Port Klang'); P.demand[b] += P.demand[a]; P.demand[a] = 0; } },
  { id: 'price', icon: TrendingUp, title: 'LNG & ammonia price shock', desc: 'LNG and Bio-LNG +60%, green ammonia +40%.',
    apply: (P) => { P.f_price[fuelIdx('LNG')] *= 1.6; P.f_price[fuelIdx('Bio-LNG')] *= 1.6; P.f_price[fuelIdx('Green ammonia')] *= 1.4; } },
  { id: 'offhire', icon: Wrench, title: 'Ships off-hire', desc: '2 Panamax and 2 Feedermax in unplanned dry dock.',
    apply: (P) => { P.avail[3] -= 2; P.avail[2] -= 2; } },
  { id: 'supply', icon: Fuel, title: 'Biofuel supply cut', desc: 'Bio-methanol and Bio-LNG bunker supply halved.',
    apply: (P) => { P.supply[fuelIdx('Bio-methanol')] *= 0.5; P.supply[fuelIdx('Bio-LNG')] *= 0.5; } },
];
const VIOLATION_LABEL = { speed: 'Speed limit', transit: 'Transit time', range: 'Bunkering range', fleet: 'Fleet size', supply: 'Fuel supply', cap: 'GHG cap' };

const FlowStep = ({ n, title, state, children }) => {
  const tone = { done: 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-800/60 dark:bg-emerald-950/30', warn: 'border-orange-300 bg-orange-50/80 dark:border-orange-800/60 dark:bg-orange-950/30',
    active: 'border-blue-300 bg-blue-50/80 dark:border-blue-800/60 dark:bg-blue-950/30', idle: 'border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03]' }[state];
  return (
    <div className={`flex-1 min-w-[180px] p-3 rounded-xl border ${tone}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Step {n}</div>
      <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{title}</div>
      <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{children}</div>
    </div>
  );
};

export const Disruption = () => {
  const { s, plan, cap } = useScenario();
  const { t } = useLanguage();
  const [chosen, setChosen] = useState(['cyclone', 'supply']);
  const { run, start, stop, reset } = useLiveRun();
  const key = `${s.carbon}|${s.cap}|${s.grid}|${s.robust}|${s.pick}|${chosen.join()}`;
  useEffect(() => { reset(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const sc = liveSc(s, cap);
  const P = cloneProblem(R.problem);
  DISRUPTIONS.filter((d) => chosen.includes(d.id)).forEach((d) => d.apply(P));
  const before = evaluate(bitsOf(plan.genome), P, sc, true);
  const broken = Object.entries(before.violations).filter(([, v]) => v > 1e-9);
  const after = run?.done && run.rec ? { o: run.rec[s.pick], d: evaluate(run.rec[s.pick].g, P, sc, true) } : null;
  const toggle = (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const running = run && !run.done;

  return (
    <div className="space-y-6">
      <PageHeader title={t('disruptionReplanning', 'Disruption Replanning')} subtitle="Inject an operational shock, check whether the current plan survives it, and re-optimise live if it does not" />
      <ScenarioStrip />
      <Panel icon={ShieldAlert} title="1. Choose disruptions">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {DISRUPTIONS.map(({ id, icon: Icon, title, desc }) => {
            const on = chosen.includes(id);
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => toggle(id)}
                className={`text-left p-3 rounded-lg border transition-all ${on ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-400 dark:border-orange-700 dark:bg-orange-950/30 dark:ring-orange-700' : 'border-slate-200 hover:border-slate-400 dark:border-white/[0.08] dark:hover:border-white/[0.2]'}`}>
                <Icon size={18} className={on ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'} />
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-2">{title}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">{desc}</div>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="flex flex-wrap items-stretch gap-2">
        <FlowStep n={1} title="Disruption applied" state={chosen.length ? 'done' : 'idle'}>{chosen.length ? `${chosen.length} active` : 'Select at least one'}</FlowStep>
        <ArrowRight className="self-center text-slate-400 hidden lg:block" size={16} />
        <FlowStep n={2} title="Current plan still valid?" state={!chosen.length ? 'idle' : broken.length ? 'warn' : 'done'}>
          {broken.length ? `No: breaks ${broken.map(([k]) => VIOLATION_LABEL[k]).join(', ')}` : 'Yes: plan stays feasible; costs update'}
        </FlowStep>
        <ArrowRight className="self-center text-slate-400 hidden lg:block" size={16} />
        <FlowStep n={3} title="Quantum-inspired re-optimisation" state={after ? 'done' : running ? 'active' : 'idle'}>
          {after ? `Done in ${fmt(run.ms / 1000, 1)} s` : running ? `Generation ${run.gen}…` : 'Press Replan'}
        </FlowStep>
        <ArrowRight className="self-center text-slate-400 hidden lg:block" size={16} />
        <FlowStep n={4} title="New plan approved" state={after ? 'done' : 'idle'}>{after ? `${t(s.pick, s.pick)} plan, all constraints satisfied` : 'Waiting for re-optimisation'}</FlowStep>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel icon={ShieldAlert} title="2. Current plan under disruption"
          action={<RunButtons running={running} onRun={() => start(P, sc, 8000)} onStop={stop} label="Replan" />}>
          <div className="grid grid-cols-3 gap-3 text-xs">
            {[['Cost', `$${fmt(before.F[0])}M`, pct(before.F[0], plan.cost_musd)], ['CO2e', `${fmt(before.F[1], 0)} kt`, pct(before.F[1], plan.co2_kt)], ['Intensity', `${fmt(before.intensity)} g/MJ`, pct(before.intensity, plan.intensity)]].map(([k, v, d]) => (
              <div key={k}><div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{k}</div>
                <div className="font-mono font-bold text-slate-900 dark:text-white text-base">{v}</div>
                <div className={`font-mono text-[11px] ${d > 0.05 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>{d >= 0 ? '+' : ''}{fmt(d)}% vs normal</div></div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {broken.length
              ? broken.map(([k, v]) => <CapBadge key={k} ok={false}>{VIOLATION_LABEL[k]} violated ({fmt(v * 100, 0)}%)</CapBadge>)
              : <CapBadge ok>All constraints still satisfied</CapBadge>}
          </div>
          <div className="mt-4"><LiveFront run={run} height={220} /></div>
        </Panel>
        <Panel icon={RefreshCw} title="3. Replanned vs original">
          {!after ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Press <b>Replan</b> to run the quantum-inspired search on the disrupted problem (8,000 evaluations, a few seconds).</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                {[['Cost', after.o.F[0], before.F[0], (v) => `$${fmt(v)}M`], ['CO2e', after.o.F[1], before.F[1], (v) => `${fmt(v, 0)} kt`], ['Intensity', after.d.intensity, before.intensity, (v) => `${fmt(v)} g/MJ`]].map(([k, a, b, f]) => (
                  <div key={k}><div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{k}</div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white text-base">{f(a)}</div>
                    <div className="font-mono text-[11px] text-slate-500">{f(b)} if unchanged</div></div>
                ))}
              </div>
              <div className="-mx-4">
                <table className="mac-table w-full table-fixed [&_td]:align-top [&_td]:leading-snug [&_td]:px-1.5 [&_th]:px-1.5 [&_td]:text-[11px] sm:[&_td]:px-4 sm:[&_th]:px-4 sm:[&_td]:text-xs">
                  <colgroup><col className="w-[30%] sm:w-[23%]" /><col className="w-[32%] sm:w-[28%]" /><col className="w-[38%] sm:w-[29%]" /><col className="w-0 sm:w-[20%]" /></colgroup>
                  <thead><tr><th>Lane</th><th>Before</th><th>After</th><th className="hidden sm:table-cell">Change</th></tr></thead>
                  <tbody>
                    {after.d.lanes.map((l, i) => {
                      const o = before.lanes[i];
                      const suspended = P.demand[i] === 0;
                      const tags = suspended ? ['Suspended'] : [o.v !== l.v && 'Vessel', o.s !== l.s && (l.speed < o.speed ? 'Slower' : 'Faster'), o.f !== l.f && 'Fuel', o.sh !== l.sh && 'Shore power'].filter(Boolean);
                      const tagEls = tags.length ? tags.map((x) => <span key={x} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-200">{x}</span>) : <span className="text-[10px] sm:text-[11px] text-slate-400">Unchanged</span>;
                      return (
                        <tr key={l.lane} className={tags.length ? 'bg-orange-50/50 dark:bg-orange-950/10' : ''}>
                          <td className="font-semibold text-slate-900 dark:text-white max-sm:[overflow-wrap:anywhere]">{l.lane}</td>
                          <td className="text-slate-500"><span className="sm:whitespace-nowrap">{VESSEL[o.v].split(' ')[0]} · {o.speed} kn</span><br />{FUEL[o.f]}</td>
                          <td>{suspended ? <span className="text-slate-500">No cargo: port closed</span>
                            : <><span className="sm:whitespace-nowrap text-slate-900 dark:text-white">{VESSEL[l.v].split(' ')[0]} · {l.speed} kn</span><div className="mt-1"><FuelChip name={FUEL[l.f]} /></div></>}
                            <div className="sm:hidden mt-1.5 flex flex-wrap gap-1">{tagEls}</div></td>
                          <td className="hidden sm:table-cell"><div className="flex flex-wrap gap-1">{tagEls}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3">The whole fleet is re-optimised, so unaffected lanes can also change when a better trade-off exists under the new conditions.</p>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
};
