# Green Fleet Optimization System (SIH26138)

Quantum-inspired fuel consumption prediction and green fleet optimisation for eight Indian container lanes
(Arabian Gulf to the Strait of Malacca). The system predicts fuel burn per vessel and sea state, then uses a
quantum-inspired evolutionary algorithm (QIEA) to choose vessel mix, cruising speed, alternative fuel and shore
power per lane, trading annual cost against well-to-wake CO2e under carbon-price and FuelEU-style GHG-cap scenarios.

## How it maps to the SIH26138 deliverables

| # | Deliverable | Where it lives |
|---|---|---|
| 1 | Fuel consumption prediction model | `fleet.py` (`physics`, `fit_hybrid`, `model_search`, `mrv_validation`); UI: **Fuel Prediction**, **Real-Ship Validation** |
| 2 | Mathematical optimisation formulation | `fleet.py` (`lanes_eval`, `evaluate`); UI: **Method & Assumptions** |
| 3 | Quantum-inspired optimisation algorithm | `fleet.py` (`qiea`), browser port in `frontend/src/engine.js`; UI: **Live Optimiser** (Q-bit grid) |
| 4 | Software platform / decision support | React portal in `frontend/`: 36 scenarios, lane map, disruption replanning, FuelEU penalty and pooling, 2025-2035 roadmap, **Report** button (PDF) |
| 5 | Demonstration | **Optimiser Benchmark** (vs NSGA-II and random search, 8/16/32 lanes), **Real-Ship Validation** (820 EU MRV container ships), this guide |

## Architecture

```
fleet.py  (Python: prediction, optimisation, benchmarks, 36 scenarios, roadmap)
   │  writes
   ▼
frontend/src/data/results.json  (precomputed results, ~360 KB)
   │  imported at build time
   ▼
frontend/  (React 19 + Vite + Tailwind + Recharts static site)
   └─ src/engine.js  QIEA + plan evaluator in JavaScript: Live Optimiser and Disruption Replanning run in the browser
```

There is no backend server. Everything the UI shows is either precomputed by `fleet.py` or computed in the browser
by `engine.js`, which `npm run check` verifies against the Python results.

## Repository layout

| Path | Purpose |
|---|---|
| `fleet.py` | Whole Python pipeline; `main()` writes `results.json` |
| `requirements.txt` | Python dependencies (numpy, scikit-learn, openpyxl) |
| `data/mrv/mrv_2024.xlsx` | EU MRV 2024 public emission report (optional input for real-ship calibration) |
| `basemap.py` | One-off script that built `frontend/src/data/basemap.json` from Natural Earth 1:50m |
| `frontend/src/pages/` | Portal pages: `fleet.jsx`, `live.jsx`, `compliance.jsx`, `strategy.jsx`, `Landing.jsx` |
| `frontend/src/Report.jsx` | Printable plan report behind the header **Report** button |
| `frontend/engine.check.mjs` | Parity check between `engine.js` and `fleet.py` |
| `render.yaml` | Render Blueprint (static site) |

## Quick start: run the portal

Requires Node 20+ (Render builds with Node 22).

```bash
cd frontend
npm ci
npm run dev
```

Open the printed local URL, pick a portal on the landing page, and sign in (demo roles, no password).

- **Fleet Operations portal**: Dashboard, Scenario Planner, Live Optimiser, Disruption Replanning, Lane Network, Fuel Prediction.
- **Compliance & Analytics portal**: Compliance Overview, FuelEU Penalty & Pooling, Transition Roadmap, Real-Ship Validation, Optimiser Benchmark, Method & Assumptions.
- **Report** (header, both portals): opens the print dialog for the active scenario's plan report; choose **Save as PDF**.

## Full pipeline: regenerate results

Requires Python 3.12+.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python fleet.py          # about 3 minutes; writes frontend/src/data/results.json
cd frontend && npm run check       # browser engine must reproduce fleet.py exactly
```

Real-ship calibration is optional: if `data/mrv/mrv_2024.xlsx` is missing, `fleet.py` skips it and the
Real-Ship Validation page shows download instructions instead. To enable it, download the 2024 public emission
report (Excel) from EMSA THETIS-MRV (https://mrv.emsa.europa.eu) and save it as `data/mrv/mrv_2024.xlsx`.

## Deploy (Render)

`render.yaml` defines a free static site: build `cd frontend && npm ci && npm run build`, publish `frontend/dist`.
In the Render dashboard choose **New → Blueprint**, select this repository and apply. Every push redeploys.
After re-running `fleet.py`, commit `frontend/src/data/results.json` so the deployed site picks up the new results.

## Method

**Fuel prediction.** Admiralty-law physics baseline (design fuel × (speed / design speed)³, scaled by load) multiplied
by a gradient-boosting correction that learns the effect of weather (Beaufort), head sea, hull fouling and residual
vessel effects. The correction's input features and hyperparameters are chosen by the same
quantum-inspired search (15-bit genome: 8 feature bits + 7 hyperparameter bits) with objectives validation error and
number of inputs. A split-conformal 90% interval gives the Cautious (P90) forecast. Benchmarked against pure ML and
physics-only models, including extrapolation to speeds not seen in training. Calibrated per vessel class against
EU MRV 2024 container ships (fitted on half, scored on the other half).

**Formulation.** Per lane decision genes: vessel class (2 bits, i.e. capacity 1,000 to 4,500 TEU), cruising speed
(3 bits, 10 to 20.5 kn), fuel (3 bits: VLSFO, LNG, Bio-LNG, B30 biofuel, grey methanol, bio-methanol, green ammonia,
green hydrogen) and shore power (1 bit), so 72 bits for 8 lanes.
Objectives: minimise annual cost ($M: fuel, carbon, ship charter, shore power) and well-to-wake CO2e (kt/yr).
Weekly cargo demand is met by construction: ship count per lane is sized from demand, capacity at 85% utilisation
and round-trip time. Constraints: vessel speed limit, maximum transit time (schedule), bunkering range, fleet size
per class, fuel supply caps, and the GHG intensity cap. Constraint domination ranks any feasible plan above any infeasible one.

**QIEA.** Each gene is a Q-bit angle θ with P(1) = sin²θ. Superposition recombination builds offspring Q-bits from two
archive parents (agreeing bits become near-certain, disagreeing bits return to θ = π/4), a rotation gate
(Δθ = 0.05π) pulls θ toward archive members, and a NOT gate mutates with rate 1/L. The Pareto archive (60 plans) is
pruned by crowding distance; population 20.

**Benchmark.** Hypervolume against NSGA-II and random search: 10 seeds × 6,000 evaluations on the 8-lane case, plus
scalability at 8, 16 and 32 lanes (5 seeds, 750 evaluations per lane). QIEA reaches a much higher hypervolume early (0.608 vs 0.192 at 25% of budget), finishes close to
NSGA-II on 8 lanes (0.675 vs 0.687) and edges it at 32 lanes (0.719 vs 0.716).

## Limits

- The fuel model is trained on synthetic voyages, then calibrated per vessel class on real EU MRV data; MRV covers EU voyages only and vessel class is inferred from cargo carried.
- Fuel prices and emission factors are illustrative (FuelEU Annex II style); verify before quoting.
- FuelEU caps are applied to Indian lanes as a what-if compliance scenario, not current law.
- Roadmap years are optimised independently; fleet transition costs between years are not modelled.
- "Quantum-inspired" means classical algorithms that borrow Q-bit representations; no quantum hardware is used.
