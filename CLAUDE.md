# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

SIH 2026 prototype for problem statement SIH26138 (quantum-inspired fuel prediction and green fleet optimisation, 8 Indian container lanes). Live at https://sih-green-fleet.onrender.com/ (Render static site, `render.yaml`; every push to the repo redeploys).

## Commands

Frontend (run from `frontend/`):
- `npm run dev`: dev server. `.claude/launch.json` pins it to port 5174 (5173 is used by another local project).
- `npm run build`: production build into `frontend/dist`.
- `npm run lint`: oxlint.
- `npm run check`: parity test; `src/engine.js` must reproduce `fleet.py` objectives and violations on the reference genomes in `results.json`, and a live QIEA run must find a feasible plan.

Python pipeline (repo root, Python 3.12+, venv in `.venv`):
- `.venv/bin/pip install -r requirements.txt`
- `.venv/bin/python fleet.py`: about 3 minutes; runs `selfcheck()` asserts, then writes `frontend/src/data/results.json`. Always follow with `npm run check`.
- `data/mrv/mrv_2024.xlsx` (EU MRV 2024) is optional; without it MRV calibration is skipped.

There is no test suite beyond `selfcheck()` in `fleet.py` and `npm run check`.

## Architecture

No backend. Two halves joined by one JSON file:

1. `fleet.py` does everything offline: hybrid fuel model (admiralty physics × GBM correction, QI-tuned 15-bit model search, split-conformal P90), MRV calibration, the fleet `evaluate`, QIEA / NSGA-II / random search, hypervolume benchmark (8/16/32 lanes), 36 scenarios (carbon × FuelEU cap × grid × robust), 2025–2035 roadmap. Output: `frontend/src/data/results.json`, which is bundled at build time and must be committed after regenerating.
2. The React app (`frontend/src`) reads `results.json` via `context.jsx` (`R`). Scenario keys are `"{carbon}|{cap}|{grid}|{robust}"`, e.g. `100|2030|0.71|0` (the default and the source of all headline numbers).

Key invariants spanning files:
- `fleet.py::lanes_eval/evaluate` and `frontend/src/engine.js::evaluate` are the same model written twice (JS powers Live Optimiser and Disruption Replanning). Any change to costs, constraints, genes or objectives must be made in both, then `fleet.py` re-run and `npm run check` passed.
- Genome: 9 bits per lane (vessel 2, speed 3, fuel 3, shore power 1); 72 bits for 8 lanes.
- Objectives F = `[cost $M/yr, well-to-wake CO2e kt/yr, fuel kt VLSFO-eq/yr]`; hypervolume is 3-D (`hv3d`). Infeasible plans are handled by constraint domination (`eff`). The fuel-model search reuses `qiea` with its own 2-objective `fn`, so archives size their objective count from the first evaluation.
- Roadmap (`fleet.py::roadmap`) is sequential from the conventional fleet: each year's QIEA uses a wrapped `fn` adding `conversions()` capex / `AMORT_YEARS` to cost; it also stores an `independent` per-year solve for comparison. Fuel families: `FAMILY`, costs: `CONVERT_MUSD`.
- Recommendation picks per scenario: `cheapest`, `balanced` (knee), `greenest`, `leanest` (shown as "Fuel-saver"). Pick lists live in `ui.jsx` CONTROLS, `pages/fleet.jsx`, `pages/live.jsx`, `Report.jsx`, and labels in `i18n/translations.js`.

Frontend structure:
- `App.jsx`: portal shell (Fleet Operations / Compliance & Analytics), header, Report button (`window.print()` renders the print-only `Report.jsx`).
- `context.jsx`: theme, language, portal sign-in and scenario state. Storage values are raw strings (`sessionStorage gf_portal` = `FLEET` or `COMPLIANCE`; `localStorage gf_theme`, `gf_language`), not JSON.
- `ui.jsx`: shared components plus light/dark chart palettes (`usePalette`, `fuelColor`, `p.ref` for comparison marks).
- `i18n/translations.js`: `t(key, fallback)`; `en` holds only overrides, `hi` the Hindi strings.
- `fleetdata.js` + `pages/upload.jsx`: CSV fleet/lane upload. Edits only existing vessel classes (matched by TEU) and the 8 lanes (matched by name), because fuel tables are precomputed per lane × class × speed; design-fuel edits scale those tables. Tested in `engine.check.mjs`.
- `explain.js`: per-lane counterfactuals for the Lane Network "Why this plan" panel (swap one decision, re-evaluate with `engine.evaluate`, report broken constraints or objective deltas). Tested in `engine.check.mjs`.
- Lane map basemap `src/data/basemap.json` is generated once by `basemap.py` from Natural Earth GeoJSON.

## Working conventions

- Do not commit or push. The repo owner commits themselves; tell them what to commit and when.
- Numbers quoted in `README.md` and the pitch deck come from `results.json`; re-check them whenever `fleet.py` changes.
- Fuel prices and emission factors are illustrative; FuelEU caps on Indian lanes are a what-if scenario. Keep that framing in UI copy.
