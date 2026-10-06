import { useRef, useState } from 'react';
import { Activity, Anchor, BarChart3, CheckCircle2, ClipboardList, Cpu, Fuel, Gauge, Lightbulb, MapPinned, Pause, Play, Route, ShieldCheck, Ship, SlidersHorizontal, Target, TrendingUp, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { R, useLanguage, useScenario } from '../context';
import BASEMAP from '../data/basemap.json';
import { bitsOf } from '../engine';
import { consequence, whyLane } from '../explain';
import {
  axis, CapBadge, dot, fmt, FuelChip, fuelColor, FuelMixChart, fuelOrder, grid, LaneTable, legend, LinkButton, liveSc, PageHeader, Panel, pct, PlanKpis, PrimaryButton, ScenarioControls, ScenarioStrip, Stat, tip, usePalette,
} from '../ui';

const PICKS = ['cheapest', 'balanced', 'greenest', 'leanest', 'express'];
const leadFuel = (plan) => Object.entries(plan.fuel_mix_pj).sort((a, b) => b[1] - a[1])[0];
const totalShips = (plan) => plan.lanes.reduce((a, l) => a + l.ships, 0);
const DESIGN = Object.fromEntries(R.vessels.map((v) => [v.name, v.design_speed]));
const LANE_INFO = Object.fromEntries(R.lanes.map((l) => [l.name, l]));

/* ================================================================ dashboard */
export const FleetDashboard = ({ onNavigate }) => {
  const { plan } = useScenario();
  const { t } = useLanguage();
  const p = usePalette();
  const fleet = R.vessels.map((v) => ({ ...v, used: plan.lanes.filter((l) => l.vessel === v.name).reduce((a, l) => a + l.ships, 0) }));
  return (
    <div className="space-y-6">
      <PageHeader title={t('fleetDashboard', 'Fleet Dashboard')} subtitle="Recommended deployment for the active scenario across 8 Indian container lanes">
        <PrimaryButton icon={SlidersHorizontal} onClick={() => onNavigate('planner')}>Open Scenario Planner</PrimaryButton>
      </PageHeader>
      <ScenarioStrip onEdit={() => onNavigate('planner')} />
      <PlanKpis />
      <div className="grid lg:grid-cols-5 gap-5">
        <Panel className="lg:col-span-3" icon={Fuel} title="Fuel energy mix" note="Bar length is total energy per year, so a shorter bar means less fuel burned.">
          <FuelMixChart />
        </Panel>
        <Panel className="lg:col-span-2" icon={Ship} title="Fleet utilisation" note="Ships deployed against ships available by class.">
          <div className="space-y-3.5">
            {fleet.map((v) => (
              <div key={v.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{v.name}</span>
                  <span className="font-mono text-slate-500 dark:text-slate-400">{v.used} / {v.available}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(v.used / v.available) * 100}%`, background: p.s[0] }} />
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] flex justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Total ships deployed</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{totalShips(plan)}</span>
            </div>
          </div>
        </Panel>
      </div>
      <Panel icon={Route} title="Lane plan" pad={false} action={<LinkButton onClick={() => onNavigate('lanes')}>View network map</LinkButton>}>
        <LaneTable lanes={plan.lanes} />
      </Panel>
    </div>
  );
};

/* ================================================================ planner */
const ParetoChart = () => {
  const { sc, s, set, conv } = useScenario();
  const p = usePalette();
  const front = sc.front.map(([x, y]) => ({ x, y }));
  const picks = PICKS.map((k) => ({ x: sc.picks[k].cost_musd, y: sc.picks[k].co2_kt, k }));
  return (
    <ResponsiveContainer width="100%" height={330}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={p.grid} />
        <XAxis type="number" dataKey="x" name="Annual cost" domain={['dataMin - 5', 'dataMax + 5']} {...axis(p)} tickFormatter={(v) => `$${Math.round(v)}M`} />
        <YAxis type="number" dataKey="y" name="CO2e" {...axis(p)} width={56} tickFormatter={(v) => `${Math.round(v)} kt`} />
        <Tooltip {...tip(p)} cursor={{ strokeDasharray: '3 3', stroke: p.axis }}
          formatter={(v, n) => (n === 'Annual cost' ? [`$${fmt(v)}M`, n] : [`${fmt(v, 0)} kt/yr`, n])} />
        <Legend {...legend(p)} />
        <Scatter name="Pareto front" data={front} fill={p.s[0]} shape={dot(3, p.s[0])} />
        <Scatter name="Conventional plan" data={[{ x: conv.cost_musd, y: conv.co2_kt }]} fill={p.muted}
          shape={(pr) => <rect x={pr.cx - 6} y={pr.cy - 6} width={12} height={12} transform={`rotate(45 ${pr.cx} ${pr.cy})`} fill={p.muted} stroke={p.surface} strokeWidth={2} />} />
        <Scatter name="Recommended plans" data={picks} fill={p.ink}
          shape={(pr) => (
            <circle cx={pr.cx} cy={pr.cy} r={pr.payload.k === s.pick ? 8 : 5.5} fill={pr.payload.k === s.pick ? p.ink : p.surface}
              stroke={p.ink} strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => set('pick', pr.payload.k)} />
          )} />
      </ScatterChart>
    </ResponsiveContainer>
  );
};

const PickCards = () => {
  const { sc, s, set, cap } = useScenario();
  const { t } = useLanguage();
  return (
    <div className="space-y-2.5">
      {PICKS.map((k) => {
        const pl = sc.picks[k];
        const on = s.pick === k;
        const ok = !cap || pl.intensity <= cap;
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => set('pick', k)}
            className={`w-full text-left p-3 rounded-lg border transition-all ${on
              ? 'border-slate-900 ring-1 ring-slate-900 bg-slate-50 dark:border-white dark:ring-white dark:bg-white/[0.06]'
              : 'border-slate-200 hover:border-slate-400 dark:border-white/[0.08] dark:hover:border-white/[0.2]'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">{t(k)}</span>
              {on ? <CheckCircle2 size={15} className="text-macblue-500" /> : <CapBadge ok={ok}>{fmt(pl.intensity)} g/MJ</CapBadge>}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[['Cost', `$${fmt(pl.cost_musd)}M`], ['CO2e', `${fmt(pl.co2_kt, 0)} kt`], ['Fuel', `${fmt(pl.fuel_kt_vlsfo_eq, 0)} kt`]].map(([a, b]) => (
                <div key={a}><div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{a}</div><div className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{b}</div></div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
              <FuelChip name={leadFuel(pl)[0]} /> leads the mix
              <span className="ml-auto font-mono">avg transit {fmt(pl.lanes.reduce((a, l) => a + l.transit_days, 0) / pl.lanes.length, 2)} d</span>
            </div>
            {k === 'express' && (
              <div className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                {pl.limit_met ? "Sails as fast as today's fleet on every lane, with the best fuel mix at that speed." : "Today's speed can't meet this GHG cap; this is the fastest compliant plan."}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

const Why = () => {
  const { plan, conv, cap } = useScenario();
  const slow = plan.lanes.filter((l) => l.speed < DESIGN[l.vessel] - 0.5).length;
  const alt = plan.lanes.filter((l) => l.fuel !== 'VLSFO').length;
  const [lead, leadPj] = leadFuel(plan);
  const b = plan.cost_breakdown;
  const items = [
    [Gauge, `${slow} of ${plan.lanes.length} lanes sail below their vessel's design speed. Fuel per day falls roughly with the cube of speed, so slow steaming is the biggest single lever.`],
    [Fuel, `${alt} lanes move off VLSFO. ${lead} supplies ${fmt((leadPj / plan.energy_pj) * 100, 0)}% of the fleet's energy.`],
    [Ship, `${totalShips(plan)} ships are deployed against ${totalShips(conv)} in the conventional plan; slower sailing needs more hulls to keep weekly service.`],
    [Wallet, `Annual cost splits into fuel $${fmt(b.fuel)}M, carbon $${fmt(b.carbon)}M, ship charter $${fmt(b.ships)}M and shore power $${fmt(b.shore)}M.`],
    [ShieldCheck, cap ? `Fleet intensity ${fmt(plan.intensity)} g/MJ against a cap of ${cap}; the conventional plan sits at ${fmt(conv.intensity)} g/MJ.` : `No cap is applied; fleet intensity is ${fmt(plan.intensity)} g/MJ.`],
  ];
  return (
    <ul className="space-y-3">
      {items.map(([Icon, text]) => (
        <li key={text} className="flex gap-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          <span className="p-1.5 h-fit rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 shrink-0"><Icon size={13} /></span>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
};

export const Planner = () => {
  const { plan } = useScenario();
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <PageHeader title={t('scenarioPlanner', 'Scenario Planner')} subtitle="Pick policy and market settings; each of the 36 combinations was solved by the quantum-inspired optimiser" />
      <Panel icon={SlidersHorizontal} title="Scenario settings"><ScenarioControls /></Panel>
      <PlanKpis />
      <div className="grid lg:grid-cols-5 gap-5">
        <Panel className="lg:col-span-3" icon={Target} title="Cost vs emissions trade-off" note="Every point is a feasible fleet plan that no other plan beats on cost, CO2e and fuel together, shown here on cost and CO2e. Click a ringed point to select it.">
          <ParetoChart />
        </Panel>
        <Panel className="lg:col-span-2" icon={ClipboardList} title="Recommended plans"><PickCards /></Panel>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel icon={Fuel} title="Fuel energy mix"><FuelMixChart /></Panel>
        <Panel icon={Lightbulb} title="Why this plan"><Why /></Panel>
      </div>
      <Panel icon={Route} title="Lane-by-lane plan" pad={false}><LaneTable lanes={plan.lanes} /></Panel>
    </div>
  );
};

/* ================================================================ lane network */
const PORTS = {
  JNPT: [72.95, 18.95, -9, 4, 'end'], Colombo: [79.84, 6.94, 9, 12, 'start'], Chennai: [80.29, 13.08, 9, 4, 'start'],
  Singapore: [103.82, 1.26, -9, 12, 'end'], Kolkata: [88.3, 22.55, -9, -7, 'end'], Chittagong: [91.8, 22.33, 9, -6, 'start'],
  Mundra: [69.7, 22.75, -9, -7, 'end'], 'Jebel Ali': [55.06, 25.01, 0, 14, 'middle'], Cochin: [76.26, 9.97, -9, -1, 'end'],
  Visakhapatnam: [83.29, 17.69, 9, 4, 'start'], 'Port Klang': [101.39, 3.0, -9, -8, 'end'], Tuticorin: [78.18, 8.76, -9, 12, 'end'],
};
// Sea waypoints (lon, lat) so routes follow real shipping paths instead of crossing land.
const ROUTES = {
  'JNPT - Colombo': [[72.5, 18.6], [72.3, 16], [73.6, 12.5], [75.3, 9.5], [76.8, 8.0], [77.6, 7.5], [78.8, 7.0], [79.5, 6.95]],
  'Cochin - Colombo': [[76.0, 9.6], [76.7, 8.3], [77.6, 7.5], [78.8, 7.0], [79.5, 6.95]],
  'Tuticorin - Colombo': [[78.5, 8.4], [79.0, 7.6], [79.5, 7.05]],
  'Chennai - Singapore': [[81.0, 12.6], [86, 9.5], [92.5, 6.6], [95.8, 6.1], [97.8, 5.6], [99.9, 3.6], [101.3, 2.4], [102.8, 1.5], [103.5, 1.15]],
  'Visakhapatnam - Port Klang': [[84.0, 17.3], [88.5, 12.0], [92.6, 7.4], [94.5, 6.3], [96.5, 5.95], [97.8, 5.7], [99.8, 3.9], [100.9, 3.1]],
  'Kolkata - Chittagong': [[88.15, 22.0], [88.22, 21.5], [88.45, 20.9], [89.6, 20.95], [91.0, 21.5], [91.65, 22.1]],
  'Mundra - Jebel Ali': [[69.1, 22.65], [68.3, 22.7], [65.5, 23.6], [62, 24.4], [59, 24.8], [57.2, 25.5], [56.6, 26.45], [55.9, 26.25], [55.3, 25.45], [54.95, 25.1]],
  'JNPT - Mundra': [[72.6, 18.9], [72.1, 19.9], [71.3, 20.5], [70.2, 20.65], [69.3, 21.4], [68.85, 22.3], [69.1, 22.65]],
};
// Equirectangular, true scale at 15°N.
const LON0 = 50, LAT1 = 37.5, K = 1000 / 56;
const W = 1000, H = Math.round((LAT1 + 1.5) * K / Math.cos(Math.PI / 12));
const xy = ([lon, lat]) => [(lon - LON0) * K, ((LAT1 - lat) * K) / Math.cos(Math.PI / 12)];
const ring = (flat) => {
  let d = '';
  for (let i = 0; i < flat.length; i += 2) d += `${i ? 'L' : 'M'}${xy([flat[i], flat[i + 1]]).map((v) => v.toFixed(1)).join(',')}`;
  return `${d}Z`;
};
const LAND = BASEMAP.land.map(ring).join('');
const INDIA = BASEMAP.india.map(ring).join('');
const lanePath = (name) => {
  const [a, b] = name.split(' - ');
  const pts = [PORTS[a], ...ROUTES[name], PORTS[b]].map(xy);
  let d = `M${pts[0].join(',')}`;
  for (let i = 0; i < pts.length - 1; i++) { // Catmull-Rom -> cubic Bezier
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1.map((v) => v.toFixed(1))} ${c2.map((v) => v.toFixed(1))} ${p2.map((v) => v.toFixed(1))}`;
  }
  return d;
};

/* A container ship sailing out along the lane and back. SVG's rotate="auto" follows the path direction, not the direction
   of travel, so the outbound and return legs are two linked animations, each visible for half the round trip. */
const HULL = 'M-14,-5.5 L8,-5.5 L15,0 L8,5.5 L-14,5.5 Z';
const MapShip = ({ pathId, color, deck, dur, offset }) => {
  const legs = [['0;1;1', 'auto', 'visible;hidden'], ['1;1;0', 'auto-reverse', 'hidden;visible']];
  const begin = `${-offset * dur}s`;
  return legs.map(([kp, rot, vis]) => (
    <g key={rot} className="motion-reduce:hidden" visibility="hidden">
      <g transform="scale(1.35)">
        <path d={HULL} fill={deck} stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        <rect x={-10} y={-2.5} width={5} height={5} rx={1} fill={color} />
        <rect x={-3.5} y={-2.5} width={5} height={5} rx={1} fill={color} />
        <rect x={3} y={-1.75} width={3} height={3.5} rx={0.8} fill={color} />
      </g>
      <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite" keyPoints={kp} keyTimes="0;0.5;1" calcMode="linear" rotate={rot}>
        <mpath href={`#${pathId}`} />
      </animateMotion>
      <animate attributeName="visibility" values={vis} keyTimes="0;0.5" dur={`${dur}s`} begin={begin} repeatCount="indefinite" calcMode="discrete" />
    </g>
  ));
};

const LaneMap = ({ lanes, selected, onSelect }) => {
  const p = usePalette();
  const [hover, setHover] = useState(null);
  const [paused, setPaused] = useState(false);
  const svg = useRef(null);
  const toggle = () => {
    if (paused) svg.current.unpauseAnimations(); else svg.current.pauseAnimations();
    setPaused(!paused);
  };
  return (
    <div className="relative">
    <button type="button" onClick={toggle} aria-pressed={paused}
      className="motion-reduce:hidden absolute right-2 top-2 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-white/90 text-slate-700 border border-slate-200 hover:border-slate-400 dark:bg-slate-900/80 dark:text-slate-200 dark:border-white/[0.12]">
      {paused ? <Play size={12} /> : <Pause size={12} />}{paused ? 'Sail ships' : 'Pause ships'}
    </button>
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Lane network map from the Arabian Gulf to the Strait of Malacca">
      <rect width={W} height={H} fill={p.sea} />
      <path d={LAND} fill={p.land} stroke={p.sea} strokeWidth={1.2} strokeLinejoin="round" />
      {/* stroke then refill: keeps India's outer boundary and hides internal seams between merged J&K/Ladakh parts */}
      <path d={INDIA} fill={p.india} stroke={p.border} strokeWidth={3} strokeLinejoin="round" />
      <path d={INDIA} fill={p.india} />
      <text {...(([x, y]) => ({ x, y }))(xy([78.2, 22.5]))} fontSize={30} fontWeight={700} letterSpacing={8} textAnchor="middle" fill={p.border} opacity={0.55}>INDIA</text>
      {[0, 5, 10, 15, 20, 25, 30, 35].map((lat) => {
        const y = xy([0, lat])[1];
        return <g key={`la${lat}`}><line x1={0} x2={W} y1={y} y2={y} stroke={p.border} strokeOpacity={0.18} strokeWidth={1.5} /><text x={8} y={y - 6} fontSize={17} className="max-sm:text-[26px]" fill={p.muted} style={{ paintOrder: 'stroke', stroke: p.sea, strokeWidth: 4 }}>{lat}°N</text></g>;
      })}
      {[60, 70, 80, 90, 100].map((lon) => {
        const x = xy([lon, 0])[0];
        return <g key={`lo${lon}`}><line y1={0} y2={H} x1={x} x2={x} stroke={p.border} strokeOpacity={0.18} strokeWidth={1.5} /><text x={x + 6} y={H - 8} fontSize={17} className="max-sm:text-[26px]" fill={p.muted}>{lon}°E</text></g>;
      })}
      {lanes.map((l) => {
        const on = selected === l.lane || hover === l.lane;
        const w = 3.5 + LANE_INFO[l.lane].teu_week / 500;
        const id = `lane-${l.lane.replace(/\W+/g, '-')}`;
        return (
          <g key={l.lane} onClick={() => onSelect(l.lane)} onMouseEnter={() => setHover(l.lane)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
            <path id={id} d={lanePath(l.lane)} fill="none" stroke={fuelColor(p, l.fuel)} strokeWidth={on ? w + 4 : w} strokeLinecap="round"
              opacity={selected && !on ? p.dim : 1} />
            <path d={lanePath(l.lane)} fill="none" stroke="transparent" strokeWidth={30} />
            {Array.from({ length: Math.min(l.ships, 4) }, (_, k) => (
              <MapShip key={k} pathId={id} color={fuelColor(p, l.fuel)} deck={p.surface}
                dur={Math.max(5, l.transit_days * 4.4)} offset={k / Math.min(l.ships, 4)} />
            ))}
          </g>
        );
      })}
      {Object.entries(PORTS).map(([name, [lon, lat, dx, dy, anchor]]) => {
        const [x, y] = xy([lon, lat]);
        return (
          <g key={name}>
            <circle cx={x} cy={y} r={8} fill={p.surface} stroke={p.ink} strokeWidth={3} />
            <text x={x + dx * 1.8} y={y + dy * 1.8} fontSize={21} className="max-sm:text-[32px]" fontWeight={600} fill={p.ink2} textAnchor={anchor} style={{ paintOrder: 'stroke', stroke: p.surface, strokeWidth: 6 }}>{name}</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
};

const LaneWhy = ({ lane }) => {
  const { s, plan, cap } = useScenario();
  const i = R.problem.lanes.indexOf(lane);
  // Express plans are judged against the express transit limits they were optimised for.
  const P = s.pick === 'express' && plan.limit_met ? { ...R.problem, tmax: R.express_tmax } : R.problem;
  const w = whyLane(bitsOf(plan.genome), P, liveSc(s, cap), i);
  const l = plan.lanes[i];
  const byCost = (a, b) => (a.broken.length - b.broken.length) || (a.dF[0] - b.dF[0]);
  const groups = [
    ['Fuel', l.fuel, w.fuel.sort(byCost).map((o) => [R.fuels[o.change.f].name, o])],
    ['Speed', `${fmt(l.speed)} kn`, w.speed.map((o) => [`${fmt(P.speeds[o.change.s])} kn`, o])],
    ['Vessel', l.vessel, w.vessel.map((o) => [R.vessels[o.change.v].name, o])],
    ['Shore power', l.shore_power ? 'Connected' : 'Aux engines', w.shore.map((o) => [o.change.sh ? 'Connect shore power' : 'Run aux engines', o])],
  ];
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {groups.map(([title, now, rows]) => (
        <div key={title}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Chosen: {now}</div>
          <ul className="space-y-1.5">
            {rows.map(([name, o]) => (
              <li key={name} className="text-xs leading-snug text-slate-600 dark:text-slate-400 flex gap-2">
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${o.broken.length ? 'bg-rose-500' : 'bg-slate-400'}`} aria-hidden />
                <span><span className="font-medium text-slate-900 dark:text-white">{name}</span> {consequence(o, P, i)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export const LaneNetwork = () => {
  const { plan, conv } = useScenario();
  const { t } = useLanguage();
  const p = usePalette();
  const [sel, setSel] = useState(plan.lanes[0].lane);
  const l = plan.lanes.find((x) => x.lane === sel);
  const c = conv.lanes.find((x) => x.lane === sel);
  const info = LANE_INFO[sel];
  const fuels = [...new Set(plan.lanes.map((x) => x.fuel))].sort(fuelOrder);
  const rows = [
    ['Distance', `${fmt(info.nm, 0)} nm`], ['Weekly demand', `${fmt(info.teu_week, 0)} TEU each way`],
    ['Vessel', l.vessel], ['Ships on lane', l.ships], ['Cruising speed', `${fmt(l.speed)} kn (design ${fmt(DESIGN[l.vessel])})`],
    ['Transit', `${fmt(l.transit_days, 2)} d (${Math.round(l.transit_days * 24)} h), limit ${Math.round(info.max_transit_days * 24)} h`], ['Shore power', l.shore_power ? 'Connected at berth' : 'Auxiliary engines'],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title={t('laneNetwork', 'Lane Network')} subtitle="Arabian Gulf to the Strait of Malacca; line colour shows the fuel, thickness shows weekly demand" />
      <ScenarioStrip />
      <div className="grid lg:grid-cols-3 gap-5">
        <Panel className="lg:col-span-2" icon={MapPinned} title="Service network"
          action={<div className="hidden lg:flex flex-wrap gap-1.5 justify-end">{fuels.map((f) => <FuelChip key={f} name={f} />)}</div>}>
          <LaneMap lanes={plan.lanes} selected={sel} onSelect={setSel} />
          <div className="lg:hidden mt-3 flex flex-wrap gap-1.5">{fuels.map((f) => <FuelChip key={f} name={f} />)}</div>
        </Panel>
        <Panel icon={Anchor} title={sel}>
          <div className="flex items-center justify-between mb-3"><FuelChip name={l.fuel} /><span className="text-[11px] text-slate-500 dark:text-slate-400">Recommended plan</span></div>
          <dl className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
            {rows.map(([a, b]) => (
              <div key={a} className="flex justify-between gap-3 py-2"><dt className="text-slate-500 dark:text-slate-400">{a}</dt><dd className="font-medium text-right text-slate-900 dark:text-white">{b}</dd></div>
            ))}
          </dl>
          <div className="mt-4 p-3 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">CO2e on this lane</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{fmt(l.co2_kt)} kt</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{fmt(pct(l.co2_kt, c.co2_kt), 0)}%</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Conventional: {fmt(c.co2_kt)} kt on {c.fuel} at {fmt(c.speed)} kn</div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(l.co2_kt / c.co2_kt) * 100}%`, background: p.s[0] }} />
            </div>
          </div>
        </Panel>
      </div>
      <Panel icon={Lightbulb} title={`Why this plan on ${sel}`}
        note="Each line changes one decision on this lane, re-runs the fleet model and reports what breaks (red) or what you would trade.">
        <LaneWhy lane={sel} />
      </Panel>
      <Panel icon={Route} title="All lanes" note="Click a row or a route on the map to inspect it." pad={false}>
        <LaneTable lanes={plan.lanes} onSelect={setSel} selected={sel} />
      </Panel>
    </div>
  );
};

/* ================================================================ prediction */
const MODEL_COLOR = { 'QI-tuned hybrid': 0, 'Pure ML (GBM)': 1, 'Physics (admiralty)': 2, 'Hybrid physics + ML': 3 };
const SEARCH = ['QIEA (quantum-inspired)', 'Random search'];
const SEARCH_COLOR = { 'QIEA (quantum-inspired)': 0, 'Random search': 2 };

const ModelDesign = () => {
  const p = usePalette();
  const T = R.prediction.tuning;
  const C = T.chosen;
  const curve = T[SEARCH[0]].evals.map((e, i) => ({ evals: e, ...Object.fromEntries(SEARCH.map((a) => [a, T[a].curve[i]])) }));
  const params = [['Trees', C.params.n_estimators, C.default_params.n_estimators], ['Depth', C.params.max_depth, C.default_params.max_depth],
    ['Learning rate', C.params.learning_rate, C.default_params.learning_rate], ['Row sampling', C.params.subsample, C.default_params.subsample]];
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <Panel icon={Activity} title="Quantum-inspired model design"
        note={`Best validation error found vs evaluations (mean of ${C.seeds} runs, ${C.budget} model fits each). Dashed line is the hand-tuned default.`}>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={curve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...grid(p)} />
            <XAxis dataKey="evals" {...axis(p)} />
            <YAxis {...axis(p)} width={44} domain={['dataMin - 0.05', 'dataMax + 0.05']} tickFormatter={(v) => `${v.toFixed(2)}%`} />
            <Tooltip {...tip(p)} labelFormatter={(v) => `${v} model fits`} formatter={(v, n) => [`${fmt(v, 3)}%`, n]} />
            <Legend {...legend(p)} />
            <ReferenceLine y={C.default_val_mape} ifOverflow="extendDomain" stroke={p.muted} strokeDasharray="4 4" />
            {SEARCH.map((a) => <Line key={a} dataKey={a} stroke={p.s[SEARCH_COLOR[a]]} strokeWidth={2} dot={false} type="monotone" />)}
          </LineChart>
        </ResponsiveContainer>
      </Panel>
      <Panel icon={Target} title="Accuracy vs simplicity" note="Best design found for each number of input features; lower-left is better.">
        <ResponsiveContainer width="100%" height={250}>
          <ScatterChart margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={p.grid} />
            <XAxis type="number" dataKey="x" name="Features" {...axis(p)} domain={[0, 8]} ticks={[1, 2, 3, 4, 5, 6, 7, 8]} />
            <YAxis type="number" dataKey="y" name="Validation MAPE" {...axis(p)} width={44} domain={['auto', 'auto']} tickFormatter={(v) => `${v.toFixed(1)}%`} />
            <Tooltip {...tip(p)} cursor={{ strokeDasharray: '3 3', stroke: p.axis }} formatter={(v, n) => (n === 'Features' ? [v, n] : [`${fmt(v, 2)}%`, n])} />
            <Legend {...legend(p)} />
            {SEARCH.map((a) => (
              <Scatter key={a} name={a} data={T[a].front.map(([y, x]) => ({ x, y }))} fill={p.s[SEARCH_COLOR[a]]}
                line={{ stroke: p.s[SEARCH_COLOR[a]], strokeWidth: 1.5 }} shape={dot(4, p.s[SEARCH_COLOR[a]], p.surface)} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </Panel>
      <Panel icon={Cpu} title="Model chosen by the search">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{fmt(C.val_mape, 2)}%</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">validation error vs {fmt(C.default_val_mape, 2)}% hand-tuned</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Uses {C.features.length} of {C.features.length + C.dropped.length} inputs.</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {C.features.map((f) => <span key={f} className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-950">{f}</span>)}
          {C.dropped.map((f) => <span key={f} className="px-2 py-0.5 rounded text-[11px] font-medium line-through bg-slate-100 text-slate-400 dark:bg-white/[0.05] dark:text-slate-500">{f}</span>)}
        </div>
        <dl className="mt-4 divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
          {params.map(([k, v, d]) => (
            <div key={k} className="flex justify-between py-1.5"><dt className="text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="font-mono text-slate-900 dark:text-white">{v} <span className="text-slate-400">(default {d})</span></dd></div>
          ))}
        </dl>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
          Genome: 8 feature Q-bits + 7 hyperparameter Q-bits. Same quantum-inspired algorithm as the fleet optimiser, with objectives validation error and number of inputs.
        </p>
      </Panel>
    </div>
  );
};

export const Prediction = () => {
  const { t } = useLanguage();
  const p = usePalette();
  const P = R.prediction;
  const models = Object.keys(P.interp).sort((a, b) => MODEL_COLOR[a] - MODEL_COLOR[b]);
  const mape = [
    { name: 'Seen speeds', ...Object.fromEntries(models.map((m) => [m, P.interp[m].mape])) },
    { name: 'Faster than training', ...Object.fromEntries(models.map((m) => [m, P.extrap[m].mape])) },
  ];
  const max = Math.max(...Object.values(P.scatter).flat().flat());
  const imp = Object.entries(P.importance).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, v: v * 100 }));
  const H = P.interp['QI-tuned hybrid'], HX = P.extrap['QI-tuned hybrid'], MX = P.extrap['Pure ML (GBM)'];
  return (
    <div className="space-y-6">
      <PageHeader title={t('fuelPrediction', 'Fuel Prediction')} subtitle="Physics baseline, pure ML, and a hybrid whose ML correction is designed by the quantum-inspired search" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="QI-tuned hybrid error" value={`${fmt(H.mape)}%`} sub="MAPE on held-out voyages" icon={Target} tone="text-macblue-500" />
        <Stat label="Unseen speeds" value={`${fmt(HX.mape)}%`} sub={<>hybrid vs <span className="text-amber-600 dark:text-amber-400 font-semibold">{fmt(MX.mape)}%</span> pure ML</>} icon={Gauge} />
        <Stat label="90% interval" value={`±${fmt(P.conformal.halfwidth_pct)}%`} sub={`${fmt(P.conformal.coverage)}% empirical coverage`} icon={ShieldCheck} tone="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Top driver" value={imp[0].name} sub={`${fmt(imp[0].v, 0)}% of correction importance`} icon={TrendingUp} />
      </div>
      <ModelDesign />
      <div className="grid lg:grid-cols-3 gap-5">
        <Panel icon={Target} title="Mean absolute % error" note="Lower is better.">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={mape} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={3}>
              <CartesianGrid {...grid(p)} />
              <XAxis dataKey="name" {...axis(p)} />
              <YAxis {...axis(p)} width={40} tickFormatter={(v) => `${v}%`} />
              <Tooltip {...tip(p)} formatter={(v, n) => [`${fmt(v)}%`, n]} />
              <Legend {...legend(p)} />
              {models.map((m) => <Bar key={m} dataKey={m} fill={p.s[MODEL_COLOR[m]]} radius={[4, 4, 0, 0]} maxBarSize={22} />)}
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel icon={Gauge} title="Predicting faster sailings" note="Trained on voyages at 15 kn or less, tested above 15 kn. Dashed line is perfect prediction.">
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={p.grid} />
              <XAxis type="number" dataKey="x" name="Actual" {...axis(p)} domain={[0, Math.ceil(max / 20) * 20]} tickFormatter={(v) => `${v}t`} />
              <YAxis type="number" dataKey="y" name="Predicted" {...axis(p)} width={40} domain={[0, Math.ceil(max / 20) * 20]} tickFormatter={(v) => `${v}t`} />
              <Tooltip {...tip(p)} cursor={{ strokeDasharray: '3 3', stroke: p.axis }} formatter={(v, n) => [`${fmt(v)} t/day`, n]} />
              <Legend {...legend(p)} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke={p.muted} strokeDasharray="4 4" />
              {Object.entries(P.scatter).map(([m, pts]) => (
                <Scatter key={m} name={m} data={pts.map(([x, y]) => ({ x, y }))} fill={p.s[MODEL_COLOR[m]]} shape={dot(3, p.s[MODEL_COLOR[m]], p.surface)} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </Panel>
        <Panel icon={BarChart3} title="What drives deviation from physics" note="Feature importance of the hybrid correction model.">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={imp} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={p.grid} horizontal={false} />
              <XAxis type="number" {...axis(p)} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" {...axis(p)} width={92} />
              <Tooltip {...tip(p)} formatter={(v) => [`${fmt(v)}%`, 'Importance']} />
              <Bar dataKey="v" fill={p.s[0]} radius={[0, 4, 4, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <Panel icon={Target} title="Model scorecard" pad={false}>
        <div className="overflow-x-auto">
          <table className="mac-table">
            <thead><tr><th>Model</th><th className="text-right">MAPE seen</th><th className="text-right">MAE seen</th><th className="text-right">MAPE faster</th><th className="text-right">MAE faster</th></tr></thead>
            <tbody>
              {models.map((m) => (
                <tr key={m}>
                  <td className="font-semibold text-slate-900 dark:text-white"><span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: p.s[MODEL_COLOR[m]] }} />{m}</td>
                  <td className="text-right font-mono">{fmt(P.interp[m].mape)}%</td><td className="text-right font-mono">{fmt(P.interp[m].mae, 2)} t/d</td>
                  <td className="text-right font-mono">{fmt(P.extrap[m].mape)}%</td><td className="text-right font-mono">{fmt(P.extrap[m].mae, 2)} t/d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">
          Split-conformal 90% interval around the hybrid forecast; the planner's Cautious mode plans against its upper edge. Synthetic voyages stand in for noon reports or EU MRV data.
        </p>
      </Panel>
    </div>
  );
};
