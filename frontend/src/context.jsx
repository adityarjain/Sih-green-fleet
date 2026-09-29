import { createContext, useContext, useEffect, useState } from 'react';
import { TRANSLATIONS } from './i18n/translations';
import R from './data/results.json';

export { R };

const store = (k, fallback, s = localStorage) => {
  try { return s.getItem(k) ?? fallback; } catch { return fallback; }
};
const save = (k, v, s = localStorage) => {
  try {
    if (v == null) s.removeItem(k);
    else s.setItem(k, v);
  } catch { /* storage blocked: keep in memory only */ }
};

/* ---------- theme ---------- */
const ThemeCtx = createContext();
export const useTheme = () => useContext(ThemeCtx);

/* ---------- language ---------- */
const LangCtx = createContext();
export const useLanguage = () => useContext(LangCtx);

/* ---------- portal sign-in ---------- */
export const PORTALS = { FLEET: 'FLEET', COMPLIANCE: 'COMPLIANCE' };
const USERS = {
  FLEET: { name: 'Fleet Manager', designation: 'Coastal Container Services' },
  COMPLIANCE: { name: 'Sustainability Officer', designation: 'Decarbonisation & Compliance Cell' },
};
const AuthCtx = createContext();
export const useAuth = () => useContext(AuthCtx);

/* ---------- scenario ---------- */
export const CAPS = { none: null, 2030: 85.69, 2035: 77.94 };
const ScenarioCtx = createContext();
export const useScenario = () => useContext(ScenarioCtx);

export function Providers({ children }) {
  const [theme, setTheme] = useState(() => store('gf_theme', 'light'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    save('gf_theme', theme);
  }, [theme]);

  const [language, setLanguage] = useState(() => store('gf_language', 'en'));
  useEffect(() => save('gf_language', language), [language]);
  const t = (key, fallback) => TRANSLATIONS[language]?.[key] ?? fallback ?? key;

  const [portal, setPortal] = useState(() => store('gf_portal', null, sessionStorage));
  useEffect(() => save('gf_portal', portal, sessionStorage), [portal]);

  const [s, setS] = useState({ carbon: '100', cap: '2030', grid: '0.71', robust: '0', pick: 'balanced' });
  const sc = R.scenarios[`${s.carbon}|${s.cap}|${s.grid}|${s.robust}`];

  return (
    <ThemeCtx.Provider value={{ isDark: theme === 'dark', toggleTheme: () => setTheme((x) => (x === 'dark' ? 'light' : 'dark')) }}>
      <LangCtx.Provider value={{ language, t, toggleLanguage: () => setLanguage((x) => (x === 'en' ? 'hi' : 'en')) }}>
        <AuthCtx.Provider value={{ portal, user: portal && USERS[portal], login: setPortal, logout: () => setPortal(null) }}>
          <ScenarioCtx.Provider value={{
            s, sc, set: (k, v) => setS((x) => ({ ...x, [k]: v })), setMany: (o) => setS((x) => ({ ...x, ...o })),
            plan: sc.picks[s.pick], conv: sc.conventional, cap: CAPS[s.cap],
          }}>
            {children}
          </ScenarioCtx.Provider>
        </AuthCtx.Provider>
      </LangCtx.Provider>
    </ThemeCtx.Provider>
  );
}
