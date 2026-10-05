import { ArrowRight, Atom, CheckCircle2, Compass, Gauge, Leaf, ShieldCheck, Fuel } from 'lucide-react';
import { PORTALS, R, useAuth, useLanguage } from '../context';
import { Brand, Toggles } from '../App';
import { fmt, pct } from '../format';

const base = R.scenarios['100|2030|0.71|0'];
const B = R.benchmark.algos;
const firstHit = (a) => R.benchmark.grid[B[a].curve.findIndex((c) => c > 0)];
const HEADLINES = [
  { icon: Fuel, value: `${fmt(-pct(base.picks.balanced.energy_pj, base.conventional.energy_pj), 0)}%`, label: 'less fuel energy than design-speed VLSFO operation' },
  { icon: Leaf, value: `${fmt(-pct(base.picks.balanced.co2_kt, base.conventional.co2_kt), 0)}%`, label: 'lower well-to-wake CO2e in the balanced plan' },
  R.mrv
    ? { icon: Gauge, value: `${fmt(R.mrv.calibrated.mape)}%`, label: `fuel error on ${Math.floor(R.mrv.used / 2)} held-out real EU container ships (MRV 2024)` }
    : { icon: Gauge, value: `${fmt(R.prediction.extrap['QI-tuned hybrid'].mape)}%`, label: `fuel error on unseen speeds (pure ML: ${fmt(R.prediction.extrap['Pure ML (GBM)'].mape)}%)` },
  { icon: Atom, value: `${fmt(firstHit('NSGA-II') / firstHit('QIEA (quantum-inspired)'))}x`, label: 'faster than NSGA-II to reach the best-front region' },
];

const PortalCard = ({ n, icon: Icon, role, roleTone, title, desc, detailLabel, detail, features, cta, onClick }) => (
  <div className="unicolor-card p-6 flex flex-col justify-between hover:border-slate-400 dark:hover:border-white/[0.20] transition-all bg-white dark:bg-[#16191E] border border-slate-200/90 dark:border-white/[0.08] rounded-xl shadow-xs">
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="p-3 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-800 dark:text-white border border-slate-200/60 dark:border-white/[0.06]"><Icon size={24} /></div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Portal {n}</span>
      </div>
      <div>
        <div className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded border mb-1.5 ${roleTone}`}>ROLE: {role}</div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase">{title}</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{desc}</p>
      </div>
      <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-2 text-xs">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{detailLabel}</span>
          <div className="px-2.5 py-1.5 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.10] rounded-lg text-xs text-slate-700 dark:text-slate-300 font-mono">{detail}</div>
        </div>
        <div className="pt-1 space-y-1.5 text-slate-700 dark:text-slate-300">
          {features.map((f) => (
            <div key={f} className="flex items-center gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0" /><span>{f}</span></div>
          ))}
        </div>
      </div>
    </div>
    <button type="button" onClick={onClick}
      className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 text-xs font-bold uppercase tracking-wider transition-colors shadow-2xs">
      <span>{cta}</span><ArrowRight size={14} />
    </button>
  </div>
);

export const Landing = () => {
  const { login } = useAuth();
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0D0F12] flex flex-col text-slate-900 dark:text-[#EAECEF] antialiased">
      <header className="bg-white dark:bg-[#111419] border-b border-slate-200/80 dark:border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Brand small />
          <div className="flex items-center gap-2 shrink-0"><Toggles /></div>
        </div>
      </header>

      <main className="flex-1 w-full relative overflow-hidden">
        <div className="relative max-w-5xl mx-auto px-4 py-12 sm:py-16">
          <div className="text-center space-y-3 mb-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:border-white/[0.08] text-xs font-medium font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{t('systemNotice', 'Maritime Decarbonisation • SIH26138')}</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white uppercase max-w-3xl mx-auto">
              {t('systemTitle', 'Green Fleet Optimization System')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto font-medium">
              Predicts fuel burn per vessel and sea state, then uses a quantum-inspired search to choose vessel mix, cruising speed, alternative fuel and shore power for eight Indian container lanes.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-12">
            {HEADLINES.map(({ icon: Icon, value, label }) => (
              <div key={label} className="unicolor-card">
                <Icon size={16} className="text-macblue-500 mb-2" />
                <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{value}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 leading-snug">{label}</div>
              </div>
            ))}
          </div>

          <div className="text-center mb-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">{t('selectPortal', 'Select a portal to sign in')}</span>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <PortalCard n="01" icon={Compass} role="FLEET MANAGER"
              roleTone="bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40"
              title={t('fleetPortal', 'Fleet Operations Portal')}
              desc={t('fleetPortalDesc', 'For fleet managers and chartering teams. Plan vessel mix, cruising speed, fuel and shore power per lane under policy and market scenarios.')}
              detailLabel="Operating area:" detail="West & East coast feeder network • 8 lanes"
              features={['36 pre-solved policy & market scenarios', 'Lane network map & fuel prediction']}
              cta={t('signInFleet', 'Sign in to Fleet Operations')} onClick={() => login(PORTALS.FLEET)} />
            <PortalCard n="02" icon={ShieldCheck} role="SUSTAINABILITY OFFICER"
              roleTone="bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40"
              title={t('compliancePortal', 'Compliance & Analytics Portal')}
              desc={t('compliancePortalDesc', 'For sustainability and compliance officers. Track well-to-wake emissions against FuelEU-style caps and audit the optimiser and prediction models.')}
              detailLabel="Regulatory frame:" detail="FuelEU-style GHG intensity • 2030 / 2035"
              features={['Compliance matrix & cost of compliance', 'Quantum-inspired vs NSGA-II benchmark']}
              cta={t('signInCompliance', 'Sign in to Compliance')} onClick={() => login(PORTALS.COMPLIANCE)} />
          </div>
        </div>
      </main>

      <footer className="bg-white/60 dark:bg-[#111419]/60 border-t border-slate-200/80 dark:border-white/[0.08] py-4 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>Green Fleet Optimization System (SIH 2026 • SIH26138)</div>
          <div className="font-mono text-slate-400 dark:text-slate-500">Synthetic voyages • illustrative prices</div>
        </div>
      </footer>
    </div>
  );
};
