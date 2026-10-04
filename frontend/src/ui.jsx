import { ArrowRight, AlertCircle, CheckCircle2, Fuel, Gauge, Leaf, PlugZap, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { R, useLanguage, useScenario, useTheme } from './context';

/* ---------- palette (dataviz reference palette, light/dark steps) ---------- */
const LIGHT = { s: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#0a6b2b', '#4a3aa7', '#e34948'],
  ink: '#0b0b0b', ink2: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', surface: '#ffffff',
  sea: '#f1f6fb', land: '#e7e6e0', india: '#d6d3c8', border: '#9c998e', dim: 0.4, ref: '#c3c2b7', bioLng: '#0aa2c0' };
const DARK = { s: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#1f9a45', '#9085e9', '#e66767'],
  ink: '#ffffff', ink2: '#c3c2b7', muted: '#898781', grid: '#2c2c2a', axis: '#383835', surface: '#11141b',
  sea: '#0a1119', land: '#22262d', india: '#30353e', border: '#6b6e75', dim: 0.6, ref: '#6f6e68', bioLng: '#1aa3c2' };
export const usePalette = () => (useTheme().isDark ? DARK : LIGHT);

const FUEL_INDEX = Object.fromEntries(R.fuels.map((f, i) => [f.name, i]));
// Bio-LNG overrides its series slot so it can't be confused with Bio-methanol's green.
export const fuelColor = (p, name) => (name === 'Bio-LNG' ? p.bioLng : name in FUEL_INDEX ? p.s[FUEL_INDEX[name]] : p.ref);
export const fuelOrder = (a, b) => (FUEL_INDEX[a] ?? 99) - (FUEL_INDEX[b] ?? 99);

import { fmt, pct } from './format';
export { fmt, pct };

/* ---------- recharts styling ---------- */
export const axis = (p) => ({ tick: { fill: p.muted, fontSize: 11 }, stroke: p.axis, tickLine: false });
export const grid = (p) => ({ stroke: p.grid, vertical: false });
export const tip = (p) => ({
  contentStyle: { background: p.surface, border: `1px solid ${p.axis}`, borderRadius: 8, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,.18)' },
  labelStyle: { color: p.ink2, fontWeight: 600 }, itemStyle: { color: p.ink }, cursor: { fill: p.grid, opacity: 0.35 },
});
export const legend = (p) => ({ iconType: 'circle', iconSize: 8, wrapperStyle: { fontSize: 11 }, formatter: (v) => <span style={{ color: p.ink2 }}>{v}</span> });
export const dot = (r, fill, stroke) => (pr) => <circle cx={pr.cx} cy={pr.cy} r={r} fill={fill} stroke={stroke} strokeWidth={stroke ? 1 : 0} />;

/* ---------- layout primitives ---------- */
export const PageHeader = ({ title, subtitle, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-slate-200/80 dark:border-white/[0.08] pb-3">
    <div>
      <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
    </div>
    {children}
  </div>
);

export const PrimaryButton = ({ icon: Icon, children, onClick }) => (
  <button type="button" onClick={onClick}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 text-xs font-semibold transition-colors shadow-2xs self-start sm:self-auto">
    {Icon && <Icon size={13} className="text-macblue-500" />}
    <span>{children}</span>
    <ArrowRight size={13} />
  </button>
);

export const LinkButton = ({ children, onClick }) => (
  <button type="button" onClick={onClick} className="text-[11px] text-macblue-500 hover:underline font-semibold shrink-0">{children}</button>
);

export const Panel = ({ icon: Icon, title, note, action, children, className = '', pad = true }) => (
  <div className={`mac-panel overflow-hidden min-w-0 ${className}`}>
    {title && (
      <div className="mac-panel-header">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={14} className="text-slate-400 shrink-0" />}
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white truncate">{title}</h3>
        </div>
        {action}
      </div>
    )}
    <div className={pad ? 'p-4' : ''}>
      {note && <p className={`text-[11px] text-slate-500 dark:text-slate-400 ${pad ? 'mb-3' : 'px-4 pt-3 pb-1'}`}>{note}</p>}
      {children}
    </div>
  </div>
);

export const Stat = ({ label, value, sub, icon: Icon, tone = 'text-slate-700 dark:text-slate-300' }) => (
  <div className="unicolor-card flex items-start justify-between gap-3 min-w-0">
    <div className="min-w-0">
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block leading-tight">{label}</span>
      <span className="text-lg sm:text-2xl font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">{value}</span>
      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block mt-0.5">{sub}</span>
    </div>
    {Icon && <div className={`hidden sm:block p-2.5 rounded-md bg-slate-100 dark:bg-white/[0.06] shrink-0 ${tone}`}><Icon size={18} /></div>}
  </div>
);

export const Seg = ({ label, options, value, onChange }) => (
  <div>
    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">{label}</span>
    <div role="group" aria-label={label} className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]">
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-macblue-500 ${value === v
            ? 'bg-white text-slate-900 shadow-2xs dark:bg-white/[0.14] dark:text-white'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>
          {text}
        </button>
      ))}
    </div>
  </div>
);

export const CapBadge = ({ ok, children }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${ok
    ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60'
    : 'bg-red-50 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60'}`}>
    {ok ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
    <span>{children}</span>
  </span>
);

export const FuelChip = ({ name }) => {
  const p = usePalette();
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-700 border border-slate-200 dark:bg-white/[0.04] dark:text-slate-300 dark:border-white/[0.08] whitespace-nowrap">
      <span className="h-2 w-2 rounded-full" style={{ background: fuelColor(p, name) }} />
      {name}
    </span>
  );
};

/* ---------- scenario controls & summaries ---------- */
const CONTROLS = [
  ['carbon', 'carbonPrice', 'Carbon price / t CO2e', [['0', '$0'], ['100', '$100'], ['200', '$200']]],
  ['cap', 'ghgCap', 'GHG intensity cap', [['none', 'None'], ['2030', 'FuelEU 2030'], ['2035', 'FuelEU 2035']]],
  ['grid', 'shoreSource', 'Shore power source', [['0.71', 'India grid'], ['0.05', 'Renewable PPA']]],
  ['robust', 'fuelForecast', 'Fuel forecast', [['0', 'Expected'], ['1', 'Cautious (P90)']]],
  ['pick', 'recommend', 'Recommend', [['cheapest', 'Cheapest'], ['balanced', 'Balanced'], ['greenest', 'Greenest'], ['leanest', 'Fuel-saver'], ['express', 'Express']]],
];
const label = (k, v) => CONTROLS.find((c) => c[0] === k)[3].find((o) => o[0] === v)[1];

export const ScenarioControls = () => {
  const { s, set } = useScenario();
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      {CONTROLS.map(([k, key, fb, opts]) => (
        <Seg key={k} label={t(key, fb)} value={s[k]} onChange={(v) => set(k, v)}
          options={k === 'pick' ? opts.map(([v, x]) => [v, t(v, x)]) : opts} />
      ))}
    </div>
  );
};

export const ScenarioStrip = ({ onEdit }) => {
  const { s } = useScenario();
  const { t } = useLanguage();
  const chips = [`$${s.carbon}/t CO2e`, s.cap === 'none' ? 'No cap' : `FuelEU ${s.cap}`, label('grid', s.grid), `${label('robust', s.robust)} forecast`, `${t(s.pick, label('pick', s.pick))} plan`];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">{t('activeScenario', 'Active scenario')}</span>
      {chips.map((c) => (
        <span key={c} className="px-2 py-0.5 rounded-md font-mono text-[11px] bg-white text-slate-700 border border-slate-200 dark:bg-white/[0.05] dark:text-slate-300 dark:border-white/[0.08]">{c}</span>
      ))}
      {onEdit && <LinkButton onClick={onEdit}>{t('change', 'Change')}</LinkButton>}
    </div>
  );
};

const Delta = ({ a, b }) => {
  const { t } = useLanguage();
  const d = pct(a, b);
  return (
    <>
      <span className={d <= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
        {d > 0 ? '+' : ''}{fmt(d, 0)}%
      </span>{' '}{t('vsConventional', 'vs conventional')}
    </>
  );
};

export const PlanKpis = () => {
  const { plan, conv, cap } = useScenario();
  const { t } = useLanguage();
  const ok = !cap || plan.intensity <= cap;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      <Stat label={t('annualCost', 'Annual Cost')} value={`$${fmt(plan.cost_musd)}M`} sub={<Delta a={plan.cost_musd} b={conv.cost_musd} />} icon={Wallet} />
      <Stat label={t('wtwCo2', 'Well-to-Wake CO2e')} value={`${fmt(plan.co2_kt, 0)} kt`} sub={<Delta a={plan.co2_kt} b={conv.co2_kt} />} icon={Leaf} tone="text-emerald-600 dark:text-emerald-400" />
      <Stat label={t('fuelEnergy', 'Fuel Energy')} value={`${fmt(plan.energy_pj, 2)} PJ`} sub={<Delta a={plan.energy_pj} b={conv.energy_pj} />} icon={Fuel} tone="text-macblue-500" />
      <Stat label={t('ghgIntensity', 'GHG Intensity')} value={`${fmt(plan.intensity)}`} icon={Gauge}
        sub={cap ? <CapBadge ok={ok}>{ok ? t('meetsCap', 'Meets cap') : t('breachesCap', 'Breaches cap')} {cap} g/MJ</CapBadge> : `g/MJ · ${t('noCap', 'No cap applied')}`} />
    </div>
  );
};

/* ---------- shared charts & tables ---------- */
export const FuelMixChart = ({ height = 230 }) => {
  const { plan, conv } = useScenario();
  const p = usePalette();
  const fuels = [...new Set([...Object.keys(conv.fuel_mix_pj), ...Object.keys(plan.fuel_mix_pj)])].sort(fuelOrder);
  const row = (name, mix) => Object.fromEntries([['name', name], ...fuels.map((f) => [f, mix[f] || 0])]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={[row('Conventional', conv.fuel_mix_pj), row('Recommended', plan.fuel_mix_pj)]} layout="vertical" margin={{ left: 4, right: 12 }} barCategoryGap="30%">
        <CartesianGrid stroke={p.grid} horizontal={false} />
        <XAxis type="number" {...axis(p)} tickFormatter={(v) => `${v} PJ`} />
        <YAxis type="category" dataKey="name" {...axis(p)} width={92} />
        <Tooltip {...tip(p)} formatter={(v, n) => [`${fmt(v, 2)} PJ`, n]} />
        <Legend {...legend(p)} />
        {fuels.map((f) => <Bar key={f} dataKey={f} stackId="mix" fill={fuelColor(p, f)} stroke={p.surface} strokeWidth={1} />)}
      </BarChart>
    </ResponsiveContainer>
  );
};

export const LaneTable = ({ lanes, onSelect, selected }) => {
  const p = usePalette();
  const max = Math.max(...lanes.map((l) => l.co2_kt));
  return (
    <div className="overflow-x-auto">
      <table className="mac-table">
        <thead>
          <tr>
            <th>Lane</th><th>Vessel</th><th className="text-right">Ships</th><th className="text-right">Speed</th>
            <th className="text-right">Transit</th><th>Fuel</th><th>Shore power</th><th className="min-w-[140px]">CO2e (kt/yr)</th>
          </tr>
        </thead>
        <tbody>
          {lanes.map((l) => (
            <tr key={l.lane} onClick={onSelect && (() => onSelect(l.lane))}
              className={`${onSelect ? 'cursor-pointer' : ''} ${selected === l.lane ? 'bg-slate-50 dark:bg-white/[0.05]' : ''}`}>
              <td className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">{l.lane}</td>
              <td className="whitespace-nowrap text-slate-600 dark:text-slate-400">{l.vessel}</td>
              <td className="text-right font-mono">{l.ships}</td>
              <td className="text-right font-mono whitespace-nowrap">{fmt(l.speed)} kn</td>
              <td className="text-right font-mono whitespace-nowrap">{fmt(l.transit_days, 2)} d</td>
              <td><FuelChip name={l.fuel} /></td>
              <td>{l.shore_power
                ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-macblue-500"><PlugZap size={12} />Connected</span>
                : <span className="text-[11px] text-slate-400">Aux engines</span>}</td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(l.co2_kt / max) * 100}%`, background: p.s[0] }} />
                  </div>
                  <span className="font-mono w-10 text-right">{fmt(l.co2_kt)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
