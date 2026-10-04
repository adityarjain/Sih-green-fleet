import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Atom, BadgeCheck, BookOpen, CalendarRange, CloudLightning, Coins, Compass, FileDown, FileSpreadsheet, Gauge, Globe, LayoutDashboard, LogOut, Moon, Route, ShieldCheck, Ship, SlidersHorizontal, Sun, Zap } from 'lucide-react';
import { PORTALS, Providers, useAuth, useLanguage, useScenario, useTheme } from './context';
import { fmt } from './format';
import { Report } from './Report';
import { Landing } from './pages/Landing';
// Portal pages (and the chart library they use) load on first visit, so the landing page stays light.
const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const fleet = () => import('./pages/fleet'), compliance = () => import('./pages/compliance');
const live = () => import('./pages/live'), strategy = () => import('./pages/strategy');
const FleetDashboard = page(fleet, 'FleetDashboard'), LaneNetwork = page(fleet, 'LaneNetwork'), Planner = page(fleet, 'Planner'), Prediction = page(fleet, 'Prediction');
const Benchmark = page(compliance, 'Benchmark'), ComplianceDashboard = page(compliance, 'ComplianceDashboard'), Method = page(compliance, 'Method');
const Disruption = page(live, 'Disruption'), LiveOptimizer = page(live, 'LiveOptimizer');
const FuelEU = page(strategy, 'FuelEU'), Roadmap = page(strategy, 'Roadmap'), Validation = page(strategy, 'Validation');
const FleetUpload = page(() => import('./pages/upload'), 'FleetUpload');

const PAGES = {
  [PORTALS.FLEET]: [
    { id: 'fleet-dashboard', key: 'fleetDashboard', label: 'Dashboard', icon: LayoutDashboard, Page: FleetDashboard },
    { id: 'planner', key: 'scenarioPlanner', label: 'Scenario Planner', icon: SlidersHorizontal, Page: Planner, badge: '36' },
    { id: 'live', key: 'liveOptimizer', label: 'Live Optimiser', icon: Zap, Page: LiveOptimizer, badge: 'LIVE' },
    { id: 'disruption', key: 'disruptionReplanning', label: 'Disruption Replanning', icon: CloudLightning, Page: Disruption },
    { id: 'upload', key: 'fleetUpload', label: 'Your Fleet Data', icon: FileSpreadsheet, Page: FleetUpload, badge: 'CSV' },
    { id: 'lanes', key: 'laneNetwork', label: 'Lane Network', icon: Route, Page: LaneNetwork, badge: '8' },
    { id: 'prediction', key: 'fuelPrediction', label: 'Fuel Prediction', icon: Gauge, Page: Prediction },
  ],
  [PORTALS.COMPLIANCE]: [
    { id: 'compliance', key: 'complianceOverview', label: 'Compliance Overview', icon: ShieldCheck, Page: ComplianceDashboard },
    { id: 'fueleu', key: 'fueleuPooling', label: 'FuelEU Penalty & Pooling', icon: Coins, Page: FuelEU },
    { id: 'roadmap', key: 'transitionRoadmap', label: 'Transition Roadmap', icon: CalendarRange, Page: Roadmap },
    { id: 'validation', key: 'realShipValidation', label: 'Real-Ship Validation', icon: BadgeCheck, Page: Validation, badge: 'MRV' },
    { id: 'benchmark', key: 'optimizerBenchmark', label: 'Optimiser Benchmark', icon: Atom, Page: Benchmark, badge: 'QI' },
    { id: 'method', key: 'methodAssumptions', label: 'Method & Assumptions', icon: BookOpen, Page: Method },
  ],
};

const iconBtn = 'p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.12] border border-slate-200/60 dark:border-white/[0.06]';

export const Brand = ({ small }) => {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className={`${small ? 'h-8 w-8' : 'h-9 w-9'} rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center shadow-xs shrink-0`}>
        <Ship size={small ? 18 : 20} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 dark:text-white uppercase truncate">{t('systemTitle', 'Green Fleet Optimization System')}</h1>
          {!small && <span className="hidden lg:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-white/[0.06] dark:text-slate-400 dark:border-white/[0.08] whitespace-nowrap">
            {t('systemNotice', 'Maritime Decarbonisation • SIH26138')}</span>}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">{t('systemSubtitle', 'Quantum-Inspired Fuel Prediction & Fleet Planning')}</p>
      </div>
    </div>
  );
};

export const Toggles = () => {
  const { language, toggleLanguage } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  return (
    <>
      <button type="button" onClick={toggleLanguage} aria-label="Toggle language" title="Toggle Language / भाषा बदलें"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-800 transition-colors dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.12] border border-slate-200/60 dark:border-white/[0.06]">
        <Globe size={13} className="text-slate-500 dark:text-slate-400" />
        <span>{language === 'en' ? 'हिंदी' : 'English'}</span>
      </button>
      <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className={iconBtn}>
        {isDark ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-slate-600" />}
      </button>
    </>
  );
};

// Browsers name the saved PDF after document.title.
const printReport = () => {
  const title = document.title;
  document.title = `Green-Fleet-Plan-Report-${new Date().toISOString().slice(0, 10)}`;
  window.print();
  document.title = title;
};

const Header = () => {
  const { portal, user, logout } = useAuth();
  const { t } = useLanguage();
  const isFleet = portal === PORTALS.FLEET;
  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-black/55 backdrop-blur-2xl border-b border-slate-200/80 dark:border-white/[0.08] shadow-2xs">
      <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        <Brand />
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-white/[0.05] dark:text-slate-300 border border-slate-200/80 dark:border-white/[0.08]">
            {isFleet ? <Compass size={13} className="text-macblue-500" /> : <ShieldCheck size={13} className="text-macblue-500" />}
            <span>{isFleet ? t('fleetPortal', 'Fleet Operations Portal') : t('compliancePortal', 'Compliance & Analytics Portal')}</span>
          </div>
          <div className="hidden lg:block h-4 w-px bg-slate-200 dark:bg-white/[0.08]" />
          <button type="button" onClick={printReport} title={t('downloadReport', 'Download plan report (PDF)')} aria-label={t('downloadReport', 'Download plan report (PDF)')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 text-xs font-semibold transition-colors">
            <FileDown size={13} /><span className="hidden sm:inline">{t('report', 'Report')}</span>
          </button>
          <Toggles />
          <div className="hidden xl:block pl-2 border-l border-slate-200 dark:border-white/[0.08] text-xs leading-tight">
            <div className="font-semibold text-slate-900 dark:text-white">{user.name}</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">{user.designation}</div>
          </div>
          <button type="button" onClick={logout} aria-label={t('signOut', 'Sign Out')} title={t('signOut', 'Sign Out')}
            className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition-colors">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </header>
  );
};

const Sidebar = ({ pages, active, onChange }) => {
  const { portal } = useAuth();
  const { t } = useLanguage();
  const { plan } = useScenario();
  return (
    <aside className="hidden md:flex w-56 bg-white/70 dark:bg-black/45 backdrop-blur-2xl border-r border-slate-200/80 dark:border-white/[0.08] flex-col h-[calc(100vh-3.75rem)] sticky top-[3.75rem] select-none shrink-0">
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2.5 pb-1.5">
          {portal === PORTALS.FLEET ? t('fleetNav', 'Fleet Navigation') : t('complianceNav', 'Compliance Navigation')}
        </div>
        {pages.map(({ id, key, label, icon: Icon, badge }) => {
          const on = active === id;
          return (
            <button key={id} type="button" onClick={() => onChange(id)} aria-current={on ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${on
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 font-semibold shadow-2xs'
                : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}>
              <span className="flex items-center gap-2.5 truncate">
                <Icon size={15} className={on ? 'text-white dark:text-slate-950' : 'text-slate-400'} />
                <span className="truncate">{t(key, label)}</span>
              </span>
              {badge && !on && <span className="px-1.5 rounded-full text-[10px] font-mono font-medium bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">{badge}</span>}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-slate-200/70 dark:border-white/[0.07] text-[10px] text-slate-500 dark:text-slate-400 space-y-1.5">
        <div className="flex items-center justify-between font-medium">
          <span>{t('status', 'Solver status')}</span>
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />{t('frontReady', 'Pareto front ready')}
          </span>
        </div>
        <div className="flex items-center justify-between font-mono">
          <span>Plan intensity</span><span className="text-slate-700 dark:text-slate-300">{fmt(plan.intensity)} g/MJ</span>
        </div>
      </div>
    </aside>
  );
};

const MobileTabs = ({ pages, active, onChange }) => {
  const { t } = useLanguage();
  const nav = useRef(null);
  useEffect(() => {
    const b = nav.current?.querySelector('[aria-current="page"]');
    if (b) nav.current.scrollTo({ left: b.offsetLeft - 12, behavior: 'smooth' });
  }, [active]);
  return (
    <nav ref={nav} className="md:hidden flex gap-1 overflow-x-auto px-3 py-2 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-black/45 backdrop-blur-2xl">
      {pages.map(({ id, key, label, icon: Icon }) => (
        <button key={id} type="button" onClick={() => onChange(id)} aria-current={active === id ? 'page' : undefined}
          className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium ${active === id
            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 dark:text-slate-300'}`}>
          <Icon size={13} />{t(key, label)}
        </button>
      ))}
    </nav>
  );
};

function Main() {
  const { portal } = useAuth();
  const pages = portal ? PAGES[portal] : [];
  const [active, setActive] = useState(pages[0]?.id);
  useEffect(() => {
    if (portal && !PAGES[portal].some((p) => p.id === active)) setActive(PAGES[portal][0].id);
  }, [portal, active]);
  useEffect(() => { window.scrollTo(0, 0); }, [active]);
  useEffect(() => { // warm the page chunks while the visitor reads the landing page
    const id = setTimeout(() => { fleet(); compliance(); }, 1500);
    return () => clearTimeout(id);
  }, []);

  if (!portal) return <Landing />;
  const { Page } = pages.find((p) => p.id === active) || pages[0];
  return (
    <>
    <Report />
    <div className="print:hidden min-h-screen bg-[#F7F8FA] dark:bg-[#06080c] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.08),rgba(0,0,0,0))] flex flex-col">
      <Header />
      <MobileTabs pages={pages} active={active} onChange={setActive} />
      <div className="flex-1 flex min-w-0">
        <Sidebar pages={pages} active={active} onChange={setActive} />
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto min-w-0">
          <Suspense fallback={<div role="status" className="py-24 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>}>
            <Page onNavigate={setActive} />
          </Suspense>
        </main>
      </div>
    </div>
    </>
  );
}

export default function App() {
  return <Providers><Main /></Providers>;
}
