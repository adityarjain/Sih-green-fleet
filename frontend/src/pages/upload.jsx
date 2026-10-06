import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FlaskConical, Lock, Play, RotateCcw, Upload } from 'lucide-react';
import { R, useLanguage, useScenario } from '../context';
import { createQiea, evaluate, recommend } from '../engine';
import { applyEdits, fleetTemplate, laneTemplate, readTable } from '../fleetdata';
import {
  CapBadge, fmt, FuelChip, liveSc, PageHeader, Panel, ScenarioStrip, Seg, Stat, VIOLATION_LABEL,
} from '../ui';

const PICKS = ['cheapest', 'balanced', 'greenest', 'leanest'];
const VESSEL = R.vessels.map((v) => v.name);
const FUEL = R.fuels.map((f) => f.name);
const BUDGET = 8000;
const EXAMPLE = [
  'vessel,teu,available\n"Panamax 4,500 TEU",4500,3\n"Feedermax 2,800 TEU",2800,5',
  'lane,teu_week\n"JNPT - Colombo",4200\n"Mundra - Jebel Ali",4800',
];

const download = (name, text) => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
};

const Btn = ({ icon: Icon, children, onClick, primary, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${primary
      ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:border-white'
      : 'bg-white text-slate-800 border-slate-300 hover:border-slate-500 dark:bg-white/[0.04] dark:text-slate-200 dark:border-white/[0.12]'}`}>
    <Icon size={14} />{children}
  </button>
);

export const FleetUpload = ({ onNavigate }) => {
  const { t } = useLanguage();
  const { s, sc: offline, cap } = useScenario();
  const [files, setFiles] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('balanced');

  const load = (named) => { setFiles(named.map(([name, text]) => ({ name, ...readTable(text, R.problem) }))); setResult(null); };
  const onFiles = async (e) => load(await Promise.all([...e.target.files].map(async (f) => [f.name, await f.text()])));
  // later files win when two files edit the same cell
  const edits = [...new Map(files.flatMap((f) => f.edits).map((e) => [`${e.arr}:${e.idx}`, e])).values()];
  const errors = files.flatMap((f) => f.errors.map((m) => `${f.name}: ${m}`));
  const scLive = liveSc(s, cap);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const P = applyEdits(R.problem, edits);
      const q = createQiea(P, scLive, { seed: 7 });
      while (q.evals < BUDGET) q.step();
      const rec = recommend(q.archive);
      const worst = rec ? null : q.archive.reduce((b, o) => (o.V < b.V ? o : b));
      setResult({ P, rec, broken: worst && Object.entries(evaluate(worst.g, P, scLive, true).violations).filter(([, v]) => v > 1e-9) });
      setBusy(false);
    }, 30);
  };

  const plan = result?.rec?.[pick];
  const detail = plan && evaluate(plan.g, result.P, scLive, true);

  return (
    <div className="space-y-6">
      <PageHeader title={t('fleetUpload', 'Your Fleet Data')}
        subtitle="Upload your own fleet and lane numbers as CSV, then re-optimise the whole plan in your browser" />

      <div className="grid lg:grid-cols-5 gap-5">
        <Panel className="lg:col-span-3" icon={FileSpreadsheet} title="1. Load your data"
          note="Start from a template: edit only the numbers you know, delete the rest. Rows are matched by vessel TEU class or lane name.">
          <div className="flex flex-wrap gap-2">
            <Btn icon={Download} onClick={() => download('fleet_template.csv', fleetTemplate(R.vessels))}>Fleet template</Btn>
            <Btn icon={Download} onClick={() => download('lanes_template.csv', laneTemplate(R.lanes))}>Lane template</Btn>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 focus-within:ring-2 focus-within:ring-macblue-500">
              <Upload size={14} />Upload CSV
              <input type="file" accept=".csv,text/csv" multiple className="sr-only" onChange={onFiles} />
            </label>
            <Btn icon={FlaskConical} onClick={() => load([['example_fleet.csv', EXAMPLE[0]], ['example_lanes.csv', EXAMPLE[1]]])}>Try an example</Btn>
            {files.length > 0 && <Btn icon={RotateCcw} onClick={() => load([])}>Reset</Btn>}
          </div>
          <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
            <div><span className="font-mono">fleet:</span> vessel, teu, available, daily_rate_usd, fuel_tpd</div>
            <div><span className="font-mono">lanes:</span> lane, teu_week, distance_nm, max_transit_days</div>
          </div>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            <Lock size={12} aria-hidden />Your files never leave your browser: reading and optimising both run on this device.
          </p>
          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f) => (
                <span key={f.name} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono border border-slate-200 dark:border-white/[0.1]">
                  {f.errors.length ? <AlertTriangle size={12} className="text-amber-600" /> : <CheckCircle2 size={12} className="text-emerald-600" />}
                  {f.name} · {f.kind ?? 'unknown'} · {f.edits.length} change{f.edits.length === 1 ? '' : 's'}
                </span>
              ))}
            </div>
          )}
          {errors.length > 0 && (
            <ul role="alert" className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800/60 dark:text-amber-200 text-xs space-y-1">
              {errors.map((m) => <li key={m}>{m}</li>)}
            </ul>
          )}
        </Panel>

        <Panel className="lg:col-span-2" icon={Play} title="2. Re-optimise">
          <ScenarioStrip onEdit={() => onNavigate('planner')} />
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
            Runs the quantum-inspired optimiser on {edits.length ? `your ${edits.length} change${edits.length === 1 ? '' : 's'}` : 'the standard data'} for {BUDGET.toLocaleString()} evaluations.
            New lanes or vessel classes need the fuel model re-run in <span className="font-mono">fleet.py</span>.
          </p>
          <div className="mt-3"><Btn icon={Play} primary onClick={run} disabled={busy}>{busy ? 'Optimising…' : 'Optimise with my data'}</Btn></div>
        </Panel>
      </div>

      {edits.length > 0 && (
        <Panel icon={FileSpreadsheet} title="Changes from the standard data" pad={false}>
          <div className="overflow-x-auto">
            <table className="mac-table">
              <thead><tr><th>Item</th><th>Field</th><th className="text-right">Standard</th><th className="text-right">Yours</th></tr></thead>
              <tbody>
                {edits.map((e) => (
                  <tr key={`${e.arr}:${e.idx}`}>
                    <td className="font-semibold text-slate-900 dark:text-white">{e.kind === 'fleet' ? VESSEL[e.idx] : e.name}</td>
                    <td>{e.label}</td>
                    <td className="text-right font-mono text-slate-500">{fmt(e.from, e.from % 1 ? 1 : 0)}</td>
                    <td className="text-right font-mono font-semibold">{fmt(e.to, e.to % 1 ? 1 : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {result && !result.rec && (
        <Panel icon={AlertTriangle} title="No feasible plan with this data">
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">The closest plan still breaks:</p>
          <div className="flex flex-wrap gap-2">
            {result.broken.map(([k, v]) => <CapBadge key={k} ok={false}>{VIOLATION_LABEL[k]} ({fmt(v * 100, 0)}% over)</CapBadge>)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">Try more ships, longer transit limits or a looser GHG cap.</p>
        </Panel>
      )}

      {result?.rec && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {[['cost_musd', 0, 'Cost', (v) => `$${fmt(v)}M`], ['co2_kt', 1, 'CO2e', (v) => `${fmt(v, 0)} kt`], ['fuel_kt_vlsfo_eq', 2, 'Fuel', (v) => `${fmt(v, 0)} kt`]].map(([k, m, label, f]) => (
              <Stat key={k} label={`${label} · ${t(pick)}`} value={f(result.rec[pick].F[m])}
                sub={<>standard data {f(offline.picks[pick][k])}</>} />
            ))}
            <Stat label="Plans on front" value={result.rec.front.length} sub="feasible, mutually non-dominated" />
          </div>

          <Panel icon={CheckCircle2} title="Recommended plan with your data" pad={false}
            action={<Seg value={pick} onChange={setPick} options={PICKS.map((k) => [k, t(k)])} />}>
            <div className="overflow-x-auto">
              <table className="mac-table">
                <thead><tr><th>Lane</th><th>Vessel</th><th className="text-right">Ships</th><th className="text-right">Speed</th><th>Fuel</th><th>Shore power</th><th className="text-right">CO2e (kt/yr)</th></tr></thead>
                <tbody>
                  {detail.lanes.map((l) => (
                    <tr key={l.lane}>
                      <td className="font-semibold text-slate-900 dark:text-white">{l.lane}</td>
                      <td>{VESSEL[l.v]}</td>
                      <td className="text-right font-mono">{l.ships}</td>
                      <td className="text-right font-mono">{fmt(l.speed)} kn</td>
                      <td><FuelChip name={FUEL[l.f]} /></td>
                      <td>{l.sh ? 'Connected' : 'Aux engines'}</td>
                      <td className="text-right font-mono">{fmt(l.co2_kt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
              <span>GHG intensity {cap ? <CapBadge ok={detail.intensity <= cap}>{fmt(detail.intensity)} g/MJ</CapBadge> : <span className="font-mono">{fmt(detail.intensity)} g/MJ</span>}</span>
              <span>Ships used: {detail.shipsBy.map((n, k) => `${VESSEL[k].split(' ').slice(0, 2).join(' ')} ${n}/${result.P.avail[k] < 1 ? 0 : result.P.avail[k]}`).join(' · ')}</span>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
};
