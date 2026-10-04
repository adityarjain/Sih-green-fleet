import { useState } from 'react';
import { BadgeCheck, Banknote, CalendarRange, Coins, Database, Gauge, Leaf, Scale, Ship, Table2, Target, TrendingDown, Wrench } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { R, useLanguage, useScenario } from '../context';
import { axis, CapBadge, dot, fmt, fuelColor, fuelOrder, grid, legend, PageHeader, Panel, ScenarioStrip, Seg, Stat, tip, usePalette } from '../ui';

const FE = R.fueleu;
const YEARS = Object.keys(FE.targets);
const EUR_PER_T = (intensity) => FE.eur_per_t / ((intensity * FE.mj_per_t) / 1e6); // EUR per t CO2e of deficit
const REF = 91.16; // FuelEU reference intensity

/** FuelEU compliance balance for a plan: surplus (+) or deficit (-) in t CO2e, and money in $M. */
const balance = (p, target, poolShare) => {
  const cbT = ((target - p.intensity) * p.energy_pj * 1e9) / 1e6;
  const penalty = cbT < 0 ? (-cbT * EUR_PER_T(p.intensity) * FE.eur_usd) / 1e6 : 0;
  const pool = cbT > 0 ? (cbT * EUR_PER_T(REF) * poolShare * FE.eur_usd) / 1e6 : 0;
  return { cbT, penalty, pool, net: pool - penalty };
};

/* ================================================================ FuelEU penalty & pooling */
export const FuelEU = () => {
  const { plan, conv } = useScenario();
  const { t } = useLanguage();
  const p = usePalette();
  const [year, setYear] = useState('2030');
  const [share, setShare] = useState('0.5');
  const target = FE.targets[year];
  const P = balance(plan, target, +share), C = balance(conv, target, +share);
  const series = YEARS.map((y) => ({ year: y, Conventional: balance(conv, FE.targets[y], +share).net, Recommended: balance(plan, FE.targets[y], +share).net }));
  return (
    <div className="space-y-6">
      <PageHeader title={t('fueleuPooling', 'FuelEU Penalty & Pooling')} subtitle="Turns the GHG-intensity gap into money: penalties for a deficit, pooling value for a surplus">
        <div className="flex flex-wrap items-end gap-4">
          <Seg label="Target year" value={year} onChange={setYear} options={YEARS.map((y) => [y, y])} />
          <Seg label="Pool price (share of penalty)" value={share} onChange={setShare} options={[['0.25', '25%'], ['0.5', '50%'], ['0.75', '75%']]} />
        </div>
      </PageHeader>
      <ScenarioStrip />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label={`Target ${year}`} value={`${target} g/MJ`} sub={`${fmt((1 - target / REF) * 100, 0)}% below the 91.16 reference`} icon={Gauge} />
        <Stat label="Conventional penalty" value={`$${fmt(C.penalty)}M`} sub={<CapBadge ok={C.cbT >= 0}>{fmt(Math.abs(C.cbT) / 1000)} kt CO2e {C.cbT >= 0 ? 'surplus' : 'deficit'}</CapBadge>} icon={Banknote} tone="text-red-500" />
        <Stat label="Plan pooling value" value={`$${fmt(P.pool)}M`} sub={<CapBadge ok={P.cbT >= 0}>{fmt(Math.abs(P.cbT) / 1000)} kt CO2e {P.cbT >= 0 ? 'surplus' : 'deficit'}</CapBadge>} icon={Coins} tone="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Swing per year" value={`$${fmt(P.net - C.net)}M`} sub="pooling revenue plus penalty avoided" icon={TrendingDown} tone="text-macblue-500" />
      </div>
      <div className="grid lg:grid-cols-5 gap-5">
        <Panel className="lg:col-span-3" icon={Scale} title="Net FuelEU position by target year" note="Positive: surplus sold into a pool. Negative: penalty paid. $M per year at today's fleet plan.">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={3}>
              <CartesianGrid {...grid(p)} />
              <XAxis dataKey="year" {...axis(p)} />
              <YAxis {...axis(p)} width={56} tickFormatter={(v) => `$${Math.round(v)}M`} />
              <Tooltip {...tip(p)} formatter={(v, n) => [`${v >= 0 ? '+' : '−'}$${fmt(Math.abs(v))}M / yr`, n]} />
              <Legend {...legend(p)} />
              <ReferenceLine y={0} stroke={p.axis} />
              <Bar dataKey="Conventional" fill={p.ref} radius={[3, 3, 3, 3]} maxBarSize={22} />
              <Bar dataKey="Recommended" fill={p.s[0]} radius={[3, 3, 3, 3]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel className="lg:col-span-2" icon={Table2} title="How it is calculated">
          <ol className="space-y-3 text-xs text-slate-700 dark:text-slate-300 list-decimal pl-4">
            <li><b>Compliance balance</b> = (target − actual intensity) × energy used. Plan: <span className="font-mono">({target} − {fmt(plan.intensity)}) × {fmt(plan.energy_pj, 2)} PJ</span>.</li>
            <li><b>Penalty</b> = deficit ÷ (actual intensity × 41,000 MJ) × €2,400, about €{fmt(EUR_PER_T(conv.intensity), 0)} per t CO2e for VLSFO.</li>
            <li><b>Pooling</b>: a surplus can be pooled with non-compliant ships; priced here at {fmt(+share * 100, 0)}% of the penalty-equivalent (€{fmt(EUR_PER_T(REF) * +share, 0)}/t).</li>
            <li>Converted at {FE.eur_usd} USD per EUR.</li>
          </ol>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-4 leading-relaxed">
            Scenario assumptions: FuelEU applies to EU port calls; here it is applied to 100% of the Indian lanes' energy as a what-if. Consecutive-deficit escalation, banking and borrowing are not modelled.
          </p>
        </Panel>
      </div>
    </div>
  );
};

/* ================================================================ real-ship validation */
export const Validation = () => {
  const { t } = useLanguage();
  const p = usePalette();
  const M = R.mrv;
  if (!M) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('realShipValidation', 'Real-Ship Validation')} subtitle="Needs the EU MRV public emission report" />
        <Panel icon={Database} title="No MRV data loaded">
          <p className="text-xs text-slate-600 dark:text-slate-300">Download the annual public emission report from EMSA THETIS-MRV into <span className="font-mono">data/mrv/mrv_2024.xlsx</span> and re-run <span className="font-mono">fleet.py</span>.</p>
        </Panel>
      </div>
    );
  }
  const max = Math.max(...M.scatter.flatMap((r) => [r[0], r[1], r[2]]));
  const pts = (i) => M.scatter.map((r) => ({ x: r[0], y: r[i], cls: R.vessels[r[3]].name, spd: r[4] }));
  const perClass = R.vessels.map((v, k) => ({ name: v.name, ships: M.per_class[k] }));
  return (
    <div className="space-y-6">
      <PageHeader title={t('realShipValidation', 'Real-Ship Validation')} subtitle={`Fuel model checked against ${M.used.toLocaleString()} real container ships from the ${M.source}`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="Real ships matched" value={M.used.toLocaleString()} sub={`of ${M.container_rows.toLocaleString()} container ships reported for 2024`} icon={Ship} tone="text-macblue-500" />
        <Stat label="Before calibration" value={`${fmt(M.raw.mape, 0)}% error`} sub={`real ships burn ${fmt(M.raw.median_ratio)}x the synthetic model`} icon={Gauge} tone="text-amber-500" />
        <Stat label="After calibration" value={`${fmt(M.calibrated.mape, 1)}% error`} sub={`${fmt(M.calibrated.within_25, 0)}% of held-out ships within ±25%`} icon={BadgeCheck} tone="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Speed sensitivity" value={`v^${fmt(M.exponent.real, 2)}`} sub={`real fleet vs v^${fmt(M.exponent.model, 2)} in the model`} icon={TrendingDown} />
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <Panel className="lg:col-span-2" icon={Target} title="Predicted vs reported fuel per nautical mile" note="Held-out ships only (calibration fitted on the other half). Dashed line is perfect agreement.">
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={p.grid} />
              <XAxis type="number" dataKey="x" name="Reported" {...axis(p)} domain={[0, Math.ceil(max / 50) * 50]} tickFormatter={(v) => `${v}`} />
              <YAxis type="number" dataKey="y" name="Predicted" {...axis(p)} width={44} domain={[0, Math.ceil(max / 50) * 50]} />
              <Tooltip {...tip(p)} cursor={{ strokeDasharray: '3 3', stroke: p.axis }} formatter={(v, n) => [`${fmt(v, 0)} kg/nm`, n]} />
              <Legend {...legend(p)} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke={p.muted} strokeDasharray="4 4" />
              <Scatter name="Synthetic model (raw)" data={pts(1)} fill={p.s[1]} shape={dot(2.5, p.s[1])} />
              <Scatter name="MRV-calibrated model" data={pts(2)} fill={p.s[0]} shape={dot(2.5, p.s[0])} />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Axes: kg of fuel per nautical mile. Reported values come straight from the MRV report.</p>
        </Panel>
        <Panel icon={Database} title="Ships per vessel class" note="Matched by average cargo carried (fuel per mile ÷ fuel per tonne-mile).">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={perClass} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={p.grid} horizontal={false} />
              <XAxis type="number" {...axis(p)} />
              <YAxis type="category" dataKey="name" {...axis(p)} width={120} tick={{ fill: p.muted, fontSize: 10 }} />
              <Tooltip {...tip(p)} formatter={(v) => [`${v} ships`, 'Matched']} />
              <Bar dataKey="ships" fill={p.s[0]} radius={[0, 4, 4, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
          <table className="mac-table mt-3">
            <thead><tr><th>Class</th><th className="text-right">a</th><th className="text-right">b (t/day)</th></tr></thead>
            <tbody>{M.calibration.map((c) => (
              <tr key={c.vessel}><td className="whitespace-nowrap">{c.vessel}</td><td className="text-right font-mono">{fmt(c.a, 2)}</td><td className="text-right font-mono">{fmt(c.b)}</td></tr>
            ))}</tbody>
          </table>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Calibrated fuel/day = a × model + b. The optimiser now uses this calibrated model.</p>
        </Panel>
      </div>
      <Panel icon={Table2} title="Method and caveats">
        <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
          <li>Average sea speed = (total fuel ÷ fuel per mile) ÷ hours at sea; ships outside 8–24 kn or under 500 h at sea are dropped.</li>
          <li>Vessel class is inferred from average cargo mass, not a TEU register, so some ships are matched to a neighbouring class.</li>
          <li>MRV fuel includes auxiliary and at-berth consumption, which is why real fuel per mile is higher and less speed-sensitive than the engine-only synthetic model.</li>
          <li>Data covers voyages to, from and within EU/EEA ports in 2024; Indian coastal operations may differ.</li>
        </ul>
      </Panel>
    </div>
  );
};

/* ================================================================ transition roadmap */
const OIL = new Set(['VLSFO', 'B30 biofuel']);
const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0);

export const Roadmap = () => {
  const { t } = useLanguage();
  const p = usePalette();
  const road = R.roadmap;
  const fuels = [...new Set(road.flatMap((r) => Object.keys(r.plan.fuel_mix_pj)))].sort(fuelOrder);
  let cum = 0;
  const rows = road.map((r) => {
    const bau = r.bau.cost_musd + r.bau.penalty_musd;
    cum += bau - r.plan.cost_musd - r.capex_musd;
    return { ...r, bauTotal: bau, cum, alt: r.lanes.filter((l) => !OIL.has(l.fuel)).length };
  });
  const aware = { ships: sum(road, (r) => r.converted_ships), capex: sum(road, (r) => r.capex_musd), total: sum(road, (r) => r.plan.cost_musd + r.capex_musd) };
  const indep = { ships: sum(road, (r) => r.independent.converted_ships), capex: sum(road, (r) => r.independent.capex_musd), total: sum(road, (r) => r.independent.cost_musd + r.independent.capex_musd) };
  const mix = road.map((r) => ({ year: r.year, ...Object.fromEntries(fuels.map((f) => [f, r.plan.fuel_mix_pj[f] || 0])) }));
  const intensity = road.map((r) => ({ year: r.year, Target: r.target, Plan: r.plan.intensity, 'Business as usual': r.bau.intensity }));
  const savings = rows.map((r) => ({ year: r.year, 'Cumulative saving': r.cum }));
  const last = rows[rows.length - 1];
  const co2Saved = road.reduce((a, r) => a + r.bau.co2_kt - r.plan.co2_kt, 0);
  return (
    <div className="space-y-6">
      <PageHeader title={t('transitionRoadmap', 'Transition Roadmap 2025–2035')} subtitle="Cheapest FuelEU-compliant path from today's fleet, paying for every fuel-system conversion, as the cap tightens, carbon prices rise, green-fuel supply grows and the grid decarbonises" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="2035 intensity" value={fmt(last.plan.intensity)} sub={<CapBadge ok={last.plan.intensity <= last.target}>g/MJ · target {last.target}</CapBadge>} icon={Gauge} tone="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Saving vs business as usual" value={`$${fmt(last.cum, 0)}M`} sub="cumulative 2025–2035, after conversions, incl. avoided FuelEU penalties" icon={Banknote} tone="text-macblue-500" />
        <Stat label="CO2e avoided" value={`${fmt(co2Saved / 1000, 2)} Mt`} sub="cumulative well-to-wake, 11 years" icon={Leaf} tone="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Ships converted 2025–2035" value={aware.ships} sub={`$${fmt(aware.capex, 0)}M one-off; ${last.alt}/${last.lanes.length} lanes on a new fuel system by 2035`} icon={Ship} />
      </div>
      <Panel icon={Wrench} title="Planning the path vs planning each year"
        note="Same years, carbon prices and caps. Planning each year alone picks that year's cheapest fuel and ignores what converting ships costs.">
        <div className="overflow-x-auto">
          <table className="mac-table">
            <thead><tr><th>Approach</th><th className="text-right">Ships converted</th><th className="text-right">Conversion spend</th><th className="text-right">Operating cost, 11 years</th><th className="text-right">Total, 11 years</th></tr></thead>
            <tbody>
              {[['Transition-aware path (this roadmap)', aware], ['Each year optimised alone', indep]].map(([name, a], k) => (
                <tr key={name}>
                  <td className="font-semibold text-slate-900 dark:text-white">{name}</td>
                  <td className="text-right font-mono">{a.ships}</td>
                  <td className="text-right font-mono">${fmt(a.capex)}M</td>
                  <td className="text-right font-mono">${fmt(a.total - a.capex, 0)}M</td>
                  <td className={`text-right font-mono ${k === 0 ? 'font-semibold text-slate-900 dark:text-white' : ''}`}>${fmt(a.total, 0)}M</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
          {aware.total <= indep.total
            ? `The path converts ${indep.ships - aware.ships} fewer ships and costs $${fmt(indep.total - aware.total, 0)}M less over 11 years, while meeting every year's FuelEU target.`
            : `The path converts ${indep.ships - aware.ships} fewer ships but costs $${fmt(aware.total - indep.total, 0)}M more over 11 years; it trades some operating savings for a steadier fleet.`}
        </p>
      </Panel>
      <div className="grid lg:grid-cols-3 gap-5">
        <Panel className="lg:col-span-2" icon={CalendarRange} title="Fuel energy mix by year" note="PJ per year in the cheapest compliant plan.">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mix} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...grid(p)} />
              <XAxis dataKey="year" {...axis(p)} />
              <YAxis {...axis(p)} width={48} tickFormatter={(v) => `${v} PJ`} />
              <Tooltip {...tip(p)} formatter={(v, n) => [`${fmt(v, 2)} PJ`, n]} />
              <Legend {...legend(p)} />
              {fuels.map((f) => <Bar key={f} dataKey={f} stackId="m" fill={fuelColor(p, f)} stroke={p.surface} strokeWidth={1} maxBarSize={36} />)}
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel icon={Gauge} title="GHG intensity vs target" note="g CO2e/MJ; the dashed step is the FuelEU target.">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={intensity} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...grid(p)} />
              <XAxis dataKey="year" {...axis(p)} />
              <YAxis {...axis(p)} width={36} domain={[60, 95]} />
              <Tooltip {...tip(p)} formatter={(v, n) => [`${fmt(v)} g/MJ`, n]} />
              <Legend {...legend(p)} />
              <Line dataKey="Target" type="stepAfter" stroke={p.ink2} strokeDasharray="5 4" strokeWidth={1.5} dot={false} />
              <Line dataKey="Business as usual" stroke={p.ref} strokeWidth={2} dot={false} />
              <Line dataKey="Plan" stroke={p.s[0]} strokeWidth={2} dot={{ r: 3, fill: p.s[0] }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <Panel icon={Banknote} title="Cumulative saving" note="Business as usual (VLSFO at design speed, paying FuelEU penalties) minus the roadmap, $M.">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={savings} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...grid(p)} />
              <XAxis dataKey="year" {...axis(p)} />
              <YAxis {...axis(p)} width={52} tickFormatter={(v) => `$${Math.round(v)}M`} />
              <Tooltip {...tip(p)} formatter={(v) => [`$${fmt(v)}M`, 'Cumulative saving']} />
              <Bar dataKey="Cumulative saving" fill={p.s[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel className="lg:col-span-2" icon={Table2} title="Year-by-year plan" pad={false}>
          <div className="overflow-x-auto">
            <table className="mac-table">
              <thead><tr><th>Year</th><th className="text-right">Target</th><th className="text-right">Carbon</th><th className="text-right">Plan cost</th><th className="text-right">BAU + penalty</th><th className="text-right">Intensity</th><th className="text-right">New-fuel lanes</th><th className="text-right">Conversions</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.year}>
                    <td className="font-semibold text-slate-900 dark:text-white">{r.year}</td>
                    <td className="text-right font-mono">{r.target}</td><td className="text-right font-mono">${r.carbon}/t</td>
                    <td className="text-right font-mono">${fmt(r.plan.cost_musd)}M</td>
                    <td className="text-right font-mono whitespace-nowrap">${fmt(r.bau.cost_musd)}M + ${fmt(r.bau.penalty_musd)}M</td>
                    <td className="text-right font-mono">{fmt(r.plan.intensity)}</td>
                    <td className="text-right font-mono">{r.alt}/{r.lanes.length}</td>
                    <td className="text-right font-mono whitespace-nowrap">{r.converted_ships ? `${r.converted_ships} · $${fmt(r.capex_musd)}M` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">
            Illustrative ramps: carbon $80→$200/t, green-fuel supply ×0.5→×2, grid 0.71→0.45 kg CO2/kWh. "Conversions" are ships moving into a new fuel family (LNG, methanol, ammonia, hydrogen), charged a one-off illustrative cost ($8–20M per ship, scaled by engine size) in that year; drop-in B30 and moving back to oil are free. Each year's optimiser sees the conversion spread over 5 years, so it does not flip fuels for small yearly gains. It plans one year at a time, without foresight of later caps.
          </p>
        </Panel>
      </div>
    </div>
  );
};
