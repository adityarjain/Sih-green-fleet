"""SIH26138 prototype: fuel prediction + quantum-inspired multi-objective green fleet optimisation.

Run:  .venv/bin/python fleet.py        -> writes frontend/src/data/results.json
      cd frontend && npm run dev          -> portal UI
"""
import json
import time
from pathlib import Path

import numpy as np
from joblib import Parallel, delayed
from sklearn.ensemble import GradientBoostingRegressor

OUT = Path(__file__).parent

# ---------------------------------------------------------------- domain data
# ponytail: illustrative figures (FuelEU Maritime Annex II style WtW factors, 2025-ish prices); cite/verify before quoting.
# name, capacity TEU, design speed kn, design fuel t/day (VLSFO-eq), charter $/day, ships available
VESSELS = [
    ("Feeder 1,000 TEU", 1000, 16.0, 22, 9_000, 14),
    ("Feeder 1,700 TEU", 1700, 18.0, 33, 12_500, 10),
    ("Feedermax 2,800 TEU", 2800, 19.5, 48, 17_000, 8),
    ("Panamax 4,500 TEU", 4500, 21.0, 75, 25_000, 6),
]
# name, well-to-wake gCO2e/MJ, price $/GJ, max sea days per bunkering, ship capex multiplier, supply cap PJ/yr
FUELS = [
    ("VLSFO", 91.7, 14.5, 60, 1.00, np.inf),
    ("LNG", 80.0, 12.0, 30, 1.15, np.inf),
    ("Bio-LNG", 30.0, 34.0, 30, 1.15, 1.5),
    ("B30 biofuel", 70.0, 19.0, 60, 1.00, 4.0),
    ("Grey methanol", 100.0, 24.0, 25, 1.10, np.inf),
    ("Bio-methanol", 20.0, 48.0, 25, 1.10, 2.0),
    ("Green ammonia", 12.0, 55.0, 20, 1.25, 1.5),
    ("Green hydrogen", 5.0, 50.0, 4, 1.40, 0.3),
]
# Indian case study: name, one-way nm, weekly TEU each way, max transit days, mean Beaufort
LANES = [
    ("JNPT - Colombo", 890, 3000, 3.0, 4.5),
    ("Chennai - Singapore", 1590, 2500, 5.0, 4.0),
    ("Kolkata - Chittagong", 450, 800, 2.0, 3.5),
    ("Mundra - Jebel Ali", 1100, 4000, 4.0, 5.0),
    ("Cochin - Colombo", 330, 700, 1.5, 4.0),
    ("Visakhapatnam - Port Klang", 1500, 1500, 5.0, 4.0),
    ("Tuticorin - Colombo", 150, 600, 1.0, 3.5),
    ("JNPT - Mundra", 480, 1500, 2.0, 4.5),
]
SPEEDS = np.array([10, 11.5, 13, 14.5, 16, 17.5, 19, 20.5])
V_CAP, V_SPEED, V_FD, V_RATE, V_AVAIL = (np.array([v[i] for v in VESSELS], float) for i in range(1, 6))
F_WTW, F_PRICE, F_RANGE, F_CAPEX, F_SUPPLY = (np.array([f[i] for f in FUELS], float) for i in range(1, 6))
LHV = 41.0  # GJ per tonne VLSFO-eq
UTIL, PORT_DAY, AUX_FRAC, AUX_EFF = 0.85, 1.0, 0.12, 0.42
ELEC_PRICE, SHORE_FIXED = 30.6, 150_000  # $/GJ electricity (~$0.11/kWh), $/yr per lane shore connection
CAPS = {"none": None, "2030": 85.69, "2035": 77.94}  # FuelEU-style GHG intensity limits, g/MJ
GENES = 9  # per lane: vessel 2 bits, speed 3 bits, fuel 3 bits, shore power 1 bit

# ---------------------------------------------------------------- fuel prediction
FEAT = ["vessel type", "design fuel", "design speed", "speed", "load", "Beaufort", "head sea", "hull fouling"]


def voyages(n, rng):
    v = rng.integers(0, len(VESSELS), n)
    spd = np.minimum(rng.uniform(9, 22, n), V_SPEED[v] + 1)
    X = np.column_stack([v, V_FD[v], V_SPEED[v], spd, rng.uniform(0.35, 1, n),
                         rng.gamma(4, 1.1, n).clip(0, 9), rng.random(n), rng.uniform(0, 720, n)])
    # ponytail: synthetic ground truth; replace with noon reports / EU MRV data when available
    n_exp = 2.8 + 0.12 * X[:, 0]
    wind = 1 + 0.012 * X[:, 5] ** 2 * (0.3 + 0.7 * X[:, 6]) * np.sqrt(12 / X[:, 3])
    y = X[:, 1] * (X[:, 3] / X[:, 2]) ** n_exp * (0.5 + 0.5 * X[:, 4]) ** (2 / 3) * wind * (1 + 0.00035 * X[:, 7])
    return X, y * rng.lognormal(0, 0.05, n)


def physics(X):  # admiralty law: F = Fd * (v/vd)^3 * displacement^(2/3)
    return X[:, 1] * (X[:, 3] / X[:, 2]) ** 3 * (0.5 + 0.5 * X[:, 4]) ** (2 / 3)


def gbm():
    return GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, random_state=0)


DEFAULT = dict(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=1.0)
ALL = np.ones(len(FEAT), bool)


def fit_hybrid(X, y, mask, params):
    """Physics baseline times a GBM correction learned on the selected features."""
    m = GradientBoostingRegressor(random_state=0, **params).fit(X[:, mask], np.log(y / physics(X)))
    return (lambda Z: physics(Z) * np.exp(m.predict(Z[:, mask]))), m


def fit_models(X, y):
    ml = gbm().fit(X, np.log(y))
    return {"Physics (admiralty)": physics,
            "Pure ML (GBM)": lambda Z: np.exp(ml.predict(Z)),
            "Hybrid physics + ML": fit_hybrid(X, y, ALL, DEFAULT)[0]}


# ---------------------------------------------------------------- quantum-inspired model design
# genome (15 bits): feature mask (8), n_estimators (2), max_depth (2), learning_rate (2), subsample (1)
N_EST, DEPTH, LRATE, SUBS = [100, 200, 300, 500], [2, 3, 4, 5], [0.03, 0.06, 0.1, 0.2], [0.7, 1.0]


def decode_model(g):
    b = [int(v) for v in g]
    two = lambda i: b[i] * 2 + b[i + 1]
    return np.array(b[:8], bool), dict(n_estimators=N_EST[two(8)], max_depth=DEPTH[two(10)],
                                      learning_rate=LRATE[two(12)], subsample=SUBS[b[14]])


def model_search_problem(X, y):
    """Objectives: validation MAPE (%) and features used. An empty feature set is infeasible."""
    idx = np.random.default_rng(7).permutation(len(y))
    tr, va = idx[:3000], idx[3000:]
    cache = {}

    def val_mape(mask, params):
        f, _ = fit_hybrid(X[tr], y[tr], mask, params)
        return float(np.mean(np.abs(f(X[va]) - y[va]) / y[va]) * 100)

    def score(g):
        mask, params = decode_model(g)
        return (val_mape(mask, params), int(mask.sum()), 0.0) if mask.any() else (0.0, 0, 1.0)

    def fn(G, P, sc):
        todo = {g.tobytes(): g for g in G if g.tobytes() not in cache}
        cache.update(zip(todo, Parallel(n_jobs=-1)(delayed(score)(g) for g in todo.values())))
        R = np.array([cache[g.tobytes()] for g in G])
        return R[:, :2], R[:, 2]

    return {"L": 15}, fn, val_mape


def model_search(X, y, budget=200, seeds=3):
    P, fn, val_mape = model_search_problem(X, y)
    out, best = {}, None
    for name, algo in (("QIEA (quantum-inspired)", qiea), ("Random search", random_search)):
        runs = [algo(P, None, budget, s, N=20, fn=fn) for s in range(seeds)]
        finals = [F[V == 0][:, 0].min() for _, F, V, _ in runs]
        AX, AF, AV, hist = runs[int(np.argmin(finals))]
        ok = AV == 0
        front = AF[ok][np.argsort(AF[ok][:, 1])]
        out[name] = {"evals": [e for e, _ in hist], "best_mean": float(np.mean(finals)), "best_std": float(np.std(finals)),
                     "curve": np.round(np.nanmean([[f[:, 0].min() if len(f) else np.nan for _, f in h] for *_, h in runs], 0), 3).tolist(),
                     "front": np.round(front, 3).tolist()}
        if best is None:
            best = AX[ok][np.argmin(AF[ok][:, 0])]
    mask, params = decode_model(best)
    out["chosen"] = {"features": [f for f, m in zip(FEAT, mask) if m], "dropped": [f for f, m in zip(FEAT, mask) if not m],
                     "params": params, "val_mape": round(float(val_mape(mask, params)), 3),
                     "default_val_mape": round(val_mape(ALL, DEFAULT), 3), "default_params": DEFAULT,
                     "budget": budget, "seeds": seeds}
    return out, mask, params


def score(pred, y):
    return {"mape": float(np.mean(np.abs(pred - y) / y) * 100), "mae": float(np.mean(np.abs(pred - y)))}


def prediction_study(rng):
    X, y = voyages(6000, rng)
    idx = rng.permutation(len(y))
    tr, cal, te = idx[:4000], idx[4000:5000], idx[5000:]
    tuning, mask, params = model_search(X[tr], y[tr])  # validation split lives inside the training rows
    models = fit_models(X[tr], y[tr])
    hyb, qm = fit_hybrid(X[tr], y[tr], mask, params)
    models["QI-tuned hybrid"] = hyb
    interp = {k: score(m(X[te]), y[te]) for k, m in models.items()}

    slow = X[:, 3] <= 15  # history is slow steaming; planner asks about faster sailings
    m_ex = fit_models(X[slow], y[slow])
    m_ex["QI-tuned hybrid"] = fit_hybrid(X[slow], y[slow], mask, params)[0]
    ex = ~slow
    extrap = {k: score(m(X[ex]), y[ex]) for k, m in m_ex.items()}
    pick = np.flatnonzero(ex)[:300]
    scatter = {k: np.round(np.column_stack([y[pick], m_ex[k](X[pick])]), 2).tolist()
               for k in ["Pure ML (GBM)", "QI-tuned hybrid"]}

    # split-conformal 90% interval on the tuned hybrid
    r = np.sort(np.abs(np.log(y[cal] / hyb(X[cal]))))
    q = float(r[int(np.ceil(0.9 * (len(r) + 1))) - 1])
    cover = float(np.mean(np.abs(np.log(y[te] / hyb(X[te]))) <= q) * 100)

    importance = dict.fromkeys(FEAT, 0.0)
    importance.update(zip(np.array(FEAT)[mask], np.round(qm.feature_importances_, 4).tolist()))
    report = {"interp": interp, "extrap": extrap, "scatter": scatter, "importance": importance, "tuning": tuning,
              "conformal": {"coverage": cover, "halfwidth_pct": (np.exp(q) - 1) * 100}}
    return hyb, q, report


# ---------------------------------------------------------------- real-ship validation (EU MRV public data)
MRV_FILE = OUT / "data" / "mrv" / "mrv_2024.xlsx"
MRV_COLS = ["Ship type", "Total fuel consumption [m tonnes]", "Time spent at sea [hours]",
            "Fuel consumption per distance [kg / n mile]", "Fuel consumption per transport work (mass) [g / m tonnes · n miles]"]
CARGO_T_PER_TEU, LOADED_T_PER_TEU = 8.5, 12.0  # ponytail: rough average cargo mass per nominal TEU; refine with a TEU register


def load_mrv_containers(path):
    import warnings
    import openpyxl
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        ws = openpyxl.load_workbook(path, read_only=True).worksheets[0]
    rows = ws.iter_rows(values_only=True)
    next(rows), next(rows)
    h = list(next(rows))
    i = [h.index(c) for c in MRV_COLS]

    def num(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return np.nan

    return np.array([[num(r[k]) for k in i[1:]] for r in rows if r[i[0]] == "Container ship"])


def mrv_validation(hyb):
    """Match EU MRV container ships to our vessel classes by average cargo carried, compare predicted fuel per
    mile, and fit a per-class calibration fuel = a * predicted + b (b soaks up auxiliary and at-berth fuel).
    Calibration is fitted on half the ships and scored on the other half."""
    if not MRV_FILE.exists():
        return None, hyb
    raw = load_mrv_containers(MRV_FILE)
    fc, hrs, kgnm, tw = raw.T
    with np.errstate(divide="ignore", invalid="ignore"):
        spd = fc * 1000 / kgnm / hrs
        cargo = kgnm * 1000 / tw
    centers = V_CAP * CARGO_T_PER_TEU
    ok = np.isfinite(raw).all(1) & (hrs > 500) & (kgnm > 0) & (tw > 0)
    ok &= (spd >= 8) & (spd <= 24) & (cargo >= centers[0] / 1.3) & (cargo <= centers[-1] * 1.3)
    spd, cargo, kgnm = spd[ok], cargo[ok], kgnm[ok]
    v = np.searchsorted(np.sqrt(centers[:-1] * centers[1:]), cargo)
    load = np.clip(cargo / (V_CAP[v] * LOADED_T_PER_TEU), 0.35, 1)
    X = np.column_stack([v, V_FD[v], V_SPEED[v], spd, load, np.full(len(v), 4.4), np.full(len(v), 0.5), np.full(len(v), 180)])
    actual = kgnm * spd * 24 / 1000  # t per sea day, as reported (includes a share of berth fuel)
    pred = hyb(X)

    def fit(idx):
        ab = np.zeros((len(VESSELS), 2))
        for k in range(len(VESSELS)):
            s = idx[v[idx] == k]
            ab[k] = np.linalg.lstsq(np.column_stack([pred[s], np.ones(len(s))]), actual[s], rcond=None)[0]
        return ab

    idx = np.random.default_rng(11).permutation(len(v))
    half = fit(idx[: len(v) // 2])
    test = idx[len(v) // 2:]
    cal = half[v, 0] * pred + half[v, 1]
    err = lambda p, s: {"mape": float(np.mean(np.abs(p[s] - actual[s]) / actual[s]) * 100),
                        "median_ratio": float(np.median(actual[s] / p[s])),
                        "within_25": float(np.mean(np.abs(p[s] - actual[s]) / actual[s] <= 0.25) * 100)}
    slope = lambda y: float(np.linalg.lstsq(np.column_stack([np.log(spd), np.eye(len(VESSELS))[v]]), np.log(y), rcond=None)[0][0])
    AB = fit(idx)
    pick = test[:400]
    report = {"source": "EU MRV 2024 public emission report (EMSA THETIS-MRV)", "container_rows": int(len(raw)), "used": int(len(v)),
              "per_class": [int((v == k).sum()) for k in range(len(VESSELS))],
              "raw": err(pred, test), "calibrated": err(cal, test),
              "exponent": {"real": slope(actual), "model": slope(pred)},
              "calibration": [{"vessel": VESSELS[k][0], "a": round(float(AB[k, 0]), 3), "b": round(float(AB[k, 1]), 2)} for k in range(len(VESSELS))],
              "scatter": np.round(np.column_stack([kgnm[pick], pred[pick] * 1000 / 24 / spd[pick], cal[pick] * 1000 / 24 / spd[pick], v[pick], spd[pick]]), 2).tolist()}
    calibrated = lambda Z: np.maximum(AB[Z[:, 0].astype(int), 0] * hyb(Z) + AB[Z[:, 0].astype(int), 1], 0.5)
    return report, calibrated


def fuel_tables(lanes, hyb, q, bf_add=0.0):
    """Predicted fuel t/day for each (lane, vessel, speed); optimiser reads this instead of calling the model."""
    rows = [[v, V_FD[v], V_SPEED[v], s, 0.85, ln[4] + bf_add, 0.5, 180]
            for ln in lanes for v in range(len(VESSELS)) for s in SPEEDS]
    t = hyb(np.array(rows, float)).reshape(len(lanes), len(VESSELS), len(SPEEDS))
    return t, t * np.exp(q)


# ---------------------------------------------------------------- fleet model
def problem(lanes, hyb, q):
    nl = len(lanes)
    t, t_hi = fuel_tables(lanes, hyb, q)
    scale = nl / len(LANES)
    return {"nl": nl, "L": nl * GENES, "lanes": [ln[0] for ln in lanes],
            "dist": np.array([ln[1] for ln in lanes], float), "demand": np.array([ln[2] for ln in lanes], float),
            "tmax": np.array([ln[3] for ln in lanes], float), "fuel": t, "fuel_hi": t_hi,
            "fuel_rough": fuel_tables(lanes, hyb, q, 3.0)[0],  # cyclone: +3 Beaufort
            "avail": np.ceil(V_AVAIL * scale), "supply": F_SUPPLY * scale}


def problem_json(P):
    """Everything the in-browser optimiser needs to reproduce evaluate()."""
    r = lambda a: np.round(a, 5).tolist()
    return {"speeds": SPEEDS.tolist(), "lhv": LHV, "util": UTIL, "port_day": PORT_DAY, "aux_frac": AUX_FRAC,
            "aux_eff": AUX_EFF, "elec_price": ELEC_PRICE, "shore_fixed": SHORE_FIXED, "genes": GENES,
            "v_cap": V_CAP.tolist(), "v_speed": V_SPEED.tolist(), "v_fd": V_FD.tolist(), "v_rate": V_RATE.tolist(),
            "avail": P["avail"].tolist(), "f_wtw": F_WTW.tolist(), "f_price": F_PRICE.tolist(), "f_range": F_RANGE.tolist(),
            "f_capex": F_CAPEX.tolist(), "supply": [None if np.isinf(s) else float(s) for s in P["supply"]],
            "lanes": P["lanes"], "dist": P["dist"].tolist(), "demand": P["demand"].tolist(), "tmax": P["tmax"].tolist(),
            "fuel": r(P["fuel"]), "fuel_hi": r(P["fuel_hi"]), "fuel_rough": r(P["fuel_rough"])}


# FuelEU Maritime GHG-intensity targets (g CO2e/MJ) and penalty: EUR 2,400 per t VLSFO-eq (41,000 MJ) of deficit energy
FUELEU = {2025: 89.34, 2030: 85.69, 2035: 77.94, 2040: 62.90, 2045: 34.64, 2050: 18.23}
EUR_USD = 1.08


def fueleu_target(year):
    return FUELEU[max(k for k in FUELEU if k <= year)]


def fueleu_penalty_musd(intensity, energy_pj, target):
    deficit_g = max(0.0, (intensity - target) * energy_pj * 1e9)
    return deficit_g / (intensity * 41_000) * 2_400 * EUR_USD / 1e6


def decode(X, nl):
    B = X.reshape(len(X), nl, GENES).astype(int)
    return (B[..., 0] * 2 + B[..., 1], B[..., 2] * 4 + B[..., 3] * 2 + B[..., 4],
            B[..., 5] * 4 + B[..., 6] * 2 + B[..., 7], B[..., 8])


def encode(v, s, f, sh):
    return np.array([v >> 1 & 1, v & 1, s >> 2 & 1, s >> 1 & 1, s & 1, f >> 2 & 1, f >> 1 & 1, f & 1, sh], np.int8)


def lanes_eval(X, P, sc):
    nl = P["nl"]
    v, s, f, sh = decode(X, nl)
    spd = SPEEDS[s]
    sea = P["dist"] / (spd * 24)
    voy = np.ceil(P["demand"] / (V_CAP[v] * UTIL))  # round trips per week
    ships = np.ceil(voy * (2 * sea + 2 * PORT_DAY) / 7)
    fday = (P["fuel_hi"] if sc["robust"] else P["fuel"])[np.arange(nl), v, s]
    aux = voy * 52 * 2 * PORT_DAY * AUX_FRAC * V_FD[v] * LHV
    fuel_gj = voy * 52 * 2 * sea * fday * LHV + aux * (1 - sh)
    elec_gj = aux * sh * AUX_EFF
    co2 = (fuel_gj * F_WTW[f] + elec_gj * sc["grid"] * 1000 / 3.6) / 1000  # tonnes CO2e
    cost = {"fuel": fuel_gj * F_PRICE[f] + elec_gj * ELEC_PRICE, "carbon": co2 * sc["carbon"],
            "ships": ships * V_RATE[v] * F_CAPEX[f] * 365, "shore": sh * SHORE_FIXED}
    viol = (np.maximum(0, spd - V_SPEED[v] - 1) / 5 + np.maximum(0, sea - P["tmax"]) / P["tmax"]
            + np.maximum(0, sea - F_RANGE[f]) / F_RANGE[f]).sum(1)
    for k in range(len(VESSELS)):
        viol += np.maximum(0, (ships * (v == k)).sum(1) - P["avail"][k]) / P["avail"][k]
    for j in np.flatnonzero(np.isfinite(P["supply"])):
        viol += np.maximum(0, (fuel_gj * (f == j)).sum(1) / 1e6 - P["supply"][j]) / P["supply"][j]
    intensity = co2.sum(1) * 1e3 / (fuel_gj + elec_gj).sum(1)  # g/MJ
    if sc["cap"]:
        viol += np.maximum(0, intensity - sc["cap"]) / sc["cap"]
    return dict(v=v, s=s, f=f, sh=sh, speed=spd, sea=sea, ships=ships, fuel_gj=fuel_gj, elec_gj=elec_gj,
                co2=co2, cost=cost, viol=viol, intensity=intensity)


def evaluate(X, P, sc):
    d = lanes_eval(X, P, sc)
    total = sum(d["cost"].values()).sum(1)
    fuel_kt = d["fuel_gj"].sum(1) / LHV / 1e3
    return np.column_stack([total / 1e6, d["co2"].sum(1) / 1e3, fuel_kt]), d["viol"]  # $M/yr, kt CO2e/yr, kt VLSFO-eq/yr


# ---------------------------------------------------------------- multi-objective machinery
def eff(F, V):  # constraint domination: any feasible beats any infeasible; infeasible ranked by violation
    return np.where(V[:, None] > 0, 1e9 + V[:, None], F)


def nd_sort(F):
    dom = np.all(F[:, None] <= F[None], 2) & np.any(F[:, None] < F[None], 2)
    rank, c, r = np.full(len(F), -1), dom.sum(0), 0
    front = np.flatnonzero(c == 0)
    while front.size:
        rank[front], c[front] = r, -1
        c -= dom[front].sum(0)
        front, r = np.flatnonzero(c == 0), r + 1
    return rank


def crowding(F):
    d = np.zeros(len(F))
    if len(F) <= 2:
        return np.full(len(F), np.inf)
    for m in range(F.shape[1]):
        o = np.argsort(F[:, m])
        f = F[o, m]
        d[o[[0, -1]]] = np.inf
        d[o[1:-1]] += (f[2:] - f[:-2]) / ((f[-1] - f[0]) or 1)
    return d


def select(E, N):
    rank, idx = nd_sort(E), []
    for r in range(rank.max() + 1):
        fr = np.flatnonzero(rank == r)
        if len(idx) + len(fr) > N:
            idx.extend(fr[np.argsort(-crowding(E[fr]))[:N - len(idx)]])
            break
        idx.extend(fr)
    return np.array(idx)


def archive(X, F, V, A):
    X, u = np.unique(X, axis=0, return_index=True)
    F, V = F[u], V[u]
    keep = nd_sort(eff(F, V)) == 0
    X, F, V = X[keep], F[keep], V[keep]
    if len(X) > A:
        k = np.argsort(-crowding(F))[:A]
        X, F, V = X[k], F[k], V[k]
    return X, F, V


def feasible(F, V):
    return F[V == 0]


def qiea(P, sc, budget, seed, N=20, A=60, dtheta=0.05 * np.pi, fn=None):
    """Quantum-inspired EA. Each bit is a Q-bit angle, P(1)=sin^2(theta). Superposition recombination:
    Q-bits are prepared from two archive parents (agree -> near-certain, disagree -> |+>), a rotation gate
    biases toward the first parent, a NOT gate adds diversity, angle bounds keep every bit observable."""
    rng, fn = np.random.default_rng(seed), fn or evaluate
    L, lo = P["L"], 0.02 * np.pi
    th = np.full((N, L), np.pi / 4)
    AX, AF, AV = np.empty((0, L), np.int8), None, np.empty(0)
    evals, hist = 0, []
    while evals + N <= budget:
        X = (rng.random(th.shape) < np.sin(th) ** 2).astype(np.int8)
        F, V = fn(X, P, sc)
        evals += N
        AF = F[:0] if AF is None else AF
        AX, AF, AV = archive(np.vstack([AX, X]), np.vstack([AF, F]), np.concatenate([AV, V]), A)
        cd = crowding(eff(AF, AV))
        a, b, c, d = rng.integers(0, len(AF), (4, N))
        G1, G2 = AX[np.where(cd[a] >= cd[b], a, b)], AX[np.where(cd[c] >= cd[d], c, d)]
        th = np.where(G1 == G2, np.where(G1 == 1, np.pi / 2 - lo, lo), np.pi / 4)
        th += dtheta * np.where(G1 == 1, 1, -1) * (G1 != G2)
        th = np.where(rng.random(th.shape) < 1 / L, np.pi / 2 - th, th).clip(lo, np.pi / 2 - lo)
        hist.append((evals, feasible(AF, AV)))
    return AX, AF, AV, hist


def nsga2(P, sc, budget, seed, N=100):
    rng = np.random.default_rng(seed)
    L = P["L"]
    X = rng.integers(0, 2, (N, L)).astype(np.int8)
    F, V = evaluate(X, P, sc)
    evals, hist = N, []
    while evals + N <= budget:
        E = eff(F, V)
        rank = nd_sort(E)
        cd = np.zeros(N)
        for r in np.unique(rank):
            cd[rank == r] = crowding(E[rank == r])
        a, b = rng.integers(0, N, (2, N))
        win = np.where((rank[a] < rank[b]) | ((rank[a] == rank[b]) & (cd[a] >= cd[b])), a, b)
        Pa, Pb = X[win[::2]], X[win[1::2]]
        mask = (rng.random(Pa.shape) < 0.5) & (rng.random((len(Pa), 1)) < 0.9)
        C = np.vstack([np.where(mask, Pb, Pa), np.where(mask, Pa, Pb)])
        C ^= (rng.random(C.shape) < 1 / L).astype(np.int8)
        FC, VC = evaluate(C, P, sc)
        evals += N
        X, F, V = np.vstack([X, C]), np.vstack([F, FC]), np.concatenate([V, VC])
        k = select(eff(F, V), N)
        X, F, V = X[k], F[k], V[k]
        front = nd_sort(eff(F, V)) == 0
        hist.append((evals, feasible(F[front], V[front])))
    front = nd_sort(eff(F, V)) == 0
    return X[front], F[front], V[front], hist


def random_search(P, sc, budget, seed, N=100, fn=None):
    rng, fn = np.random.default_rng(seed), fn or evaluate
    AX, AF, AV = np.empty((0, P["L"]), np.int8), None, np.empty(0)
    evals, hist = 0, []
    while evals + N <= budget:
        X = rng.integers(0, 2, (N, P["L"])).astype(np.int8)
        F, V = fn(X, P, sc)
        evals += N
        AF = F[:0] if AF is None else AF
        AX, AF, AV = archive(np.vstack([AX, X]), np.vstack([AF, F]), np.concatenate([AV, V]), 100)
        hist.append((evals, feasible(AF, AV)))
    return AX, AF, AV, hist


ALGOS = {"QIEA (quantum-inspired)": qiea, "NSGA-II": nsga2, "Random search": random_search}


def hv2d(F, ref=(1.1, 1.1)):
    F = F[np.all(F < ref, 1)]
    hv, prev = 0.0, ref[1]
    for x, y in F[np.argsort(F[:, 0])]:
        if y < prev:
            hv, prev = hv + (ref[0] - x) * (prev - y), y
    return hv


def hv3d(F, ref=(1.1, 1.1, 1.1)):
    """Exact hypervolume by slicing along the third objective: sum of 2-D areas times slab depth."""
    F = F[np.all(F < ref, 1)]
    F = F[np.argsort(F[:, 2])]
    zs = np.append(F[:, 2], ref[2])
    return sum(hv2d(F[:k + 1, :2], ref[:2]) * (zs[k + 1] - zs[k]) for k in range(len(F)))


# ---------------------------------------------------------------- experiments
def benchmark(P, sc, budget, seeds):
    runs = {name: [] for name in ALGOS}
    for name, algo in ALGOS.items():
        for sd in range(seeds):
            t0 = time.perf_counter()
            *_, hist = algo(P, sc, budget, sd)
            runs[name].append((time.perf_counter() - t0, hist))
    allF = np.vstack([h[-1][1] for rs in runs.values() for _, h in rs if len(h[-1][1])] or [np.zeros((1, 3))])
    ref_front = allF[nd_sort(allF) == 0]
    lo, hi = ref_front.min(0), ref_front.max(0)
    norm = lambda F: (F - lo) / np.where(hi > lo, hi - lo, 1)
    grid = np.linspace(budget / 30, budget, 30)
    out = {}
    for name, rs in runs.items():
        curves = np.array([[hv3d(norm(next((f for e, f in reversed(h) if e <= g), np.empty((0, 3))))) for g in grid]
                           for _, h in rs])
        final = curves[:, -1]
        best = int(np.argmax(final))
        out[name] = {"hv_mean": float(final.mean()), "hv_std": float(final.std()),
                     "feasible_runs": int(sum(len(h[-1][1]) > 0 for _, h in rs)),
                     "time_s": float(np.mean([t for t, _ in rs])),
                     "curve": np.round(np.median(curves, 0), 4).tolist(),
                     "front": np.round(rs[best][1][-1][1][np.argsort(rs[best][1][-1][1][:, 0])], 3).tolist()}
    target = 0.95 * max(o["hv_mean"] for o in out.values())
    for name, o in out.items():
        hit = [g for g, c in zip(grid, o["curve"]) if c >= target]
        o["evals_to_95"] = int(hit[0]) if hit else None
    return {"grid": grid.astype(int).tolist(), "algos": out, "budget": budget, "seeds": seeds}


def plan_json(x, P, sc):
    d = lanes_eval(x[None], P, sc)
    g = lambda a: a[0]
    fuel_mix = {FUELS[j][0]: float(g(d["fuel_gj"])[g(d["f"]) == j].sum() / 1e6) for j in range(len(FUELS))}
    fuel_mix = {k: round(v, 3) for k, v in fuel_mix.items() if v > 0}
    if g(d["elec_gj"]).sum() > 0:
        fuel_mix["Shore power (grid)"] = round(float(g(d["elec_gj"]).sum() / 1e6), 3)
    lanes = [{"lane": P["lanes"][i], "vessel": VESSELS[g(d["v"])[i]][0], "ships": int(g(d["ships"])[i]),
              "speed": float(g(d["speed"])[i]), "transit_days": round(float(g(d["sea"])[i]), 2),
              "fuel": FUELS[g(d["f"])[i]][0], "shore_power": bool(g(d["sh"])[i]),
              "co2_kt": round(float(g(d["co2"])[i] / 1e3), 2)} for i in range(P["nl"])]
    return {"cost_musd": round(float(sum(c.sum() for c in d["cost"].values()) / 1e6), 2),
            "cost_breakdown": {k: round(float(c.sum() / 1e6), 2) for k, c in d["cost"].items()},
            "co2_kt": round(float(d["co2"].sum() / 1e3), 2),
            "energy_pj": round(float((d["fuel_gj"].sum() + d["elec_gj"].sum()) / 1e6), 3),
            "fuel_kt_vlsfo_eq": round(float(d["fuel_gj"].sum() / LHV / 1e3), 2),
            "intensity": round(float(d["intensity"][0]), 2), "feasible": bool(d["viol"][0] == 0),
            "fuel_mix_pj": fuel_mix, "lanes": lanes, "genome": "".join(map(str, x.tolist()))}


def conventional(P, sc):
    """Typical practice: VLSFO, no shore power, each lane on its cheapest vessel sailed near design speed."""
    genes = []
    for i in range(P["nl"]):
        best = None
        for v in range(len(VESSELS)):
            s = int(np.argmin(np.abs(SPEEDS - V_SPEED[v])))
            x = np.tile(encode(v, s, 0, 0), P["nl"])
            d = lanes_eval(x[None], P, {**sc, "carbon": 0, "cap": None})
            ok = d["sea"][0, i] <= P["tmax"][i]
            c = sum(cc[0, i] for cc in d["cost"].values())
            if ok and (best is None or c < best[0]):
                best = (c, v, s)
        genes.append(encode(best[1], best[2], 0, 0))
    return np.concatenate(genes)


def scenarios(P, budget):
    out, conv = {}, None
    for carbon in (0, 100, 200):
        for cap in CAPS:
            for grid in (0.71, 0.05):
                for robust in (False, True):
                    sc = {"carbon": carbon, "cap": CAPS[cap], "grid": grid, "robust": robust}
                    conv = conventional(P, sc) if conv is None else conv
                    X, F, V, _ = qiea(P, sc, budget, 0)
                    key = f"{carbon}|{cap}|{grid}|{int(robust)}"
                    ok = V == 0
                    if not ok.any():
                        out[key] = {"feasible": False, "conventional": plan_json(conv, P, sc)}
                        continue
                    X, F = X[ok], F[ok]
                    o = np.argsort(F[:, 0])
                    X, F = X[o], F[o]
                    n = (F - F.min(0)) / np.where(np.ptp(F, 0) > 0, np.ptp(F, 0), 1)
                    picks = {"cheapest": 0, "balanced": int(np.argmin(np.linalg.norm(n, axis=1))),
                             "greenest": int(np.argmin(F[:, 1])), "leanest": int(np.argmin(F[:, 2]))}
                    out[key] = {"feasible": True, "front": np.round(F, 3).tolist(),
                                "picks": {k: {"i": i, **plan_json(X[i], P, sc)} for k, i in picks.items()},
                                "conventional": plan_json(conv, P, sc)}
    return out


def roadmap(P, budget=8000):
    """Cheapest FuelEU-compliant plan per year vs business-as-usual (VLSFO at design speed, paying penalties).
    ponytail: ramps are linear illustrative assumptions (carbon $80->200/t, green-fuel supply x0.5->x2, grid 0.71->0.45)."""
    out = []
    for i, year in enumerate(range(2025, 2036)):
        f = i / 10
        sc = {"carbon": 80 + 120 * f, "cap": fueleu_target(year), "grid": 0.71 - 0.26 * f, "robust": False}
        Py = {**P, "supply": P["supply"] * (0.5 + 1.5 * f)}
        X, F, V, _ = qiea(Py, sc, budget, 0)
        ok = V == 0
        x = X[ok][np.argmin(F[ok][:, 0])] if ok.any() else X[np.argmin(V)]
        plan, conv = plan_json(x, Py, sc), plan_json(conventional(Py, sc), Py, sc)
        out.append({"year": year, "target": sc["cap"], "carbon": round(sc["carbon"]), "grid": round(sc["grid"], 3),
                    "supply_mult": round(0.5 + 1.5 * f, 2), "feasible": bool(ok.any()),
                    "plan": {k: plan[k] for k in ("cost_musd", "co2_kt", "energy_pj", "intensity", "fuel_mix_pj", "cost_breakdown")},
                    "lanes": [{k: l[k] for k in ("lane", "fuel", "vessel", "speed", "ships")} for l in plan["lanes"]],
                    "bau": {"cost_musd": conv["cost_musd"], "co2_kt": conv["co2_kt"], "intensity": conv["intensity"],
                            "penalty_musd": round(fueleu_penalty_musd(conv["intensity"], conv["energy_pj"], sc["cap"]), 2)}})
    return out


def scaled_lanes(n, rng):
    return [(f"{LANES[i % 8][0]} #{i // 8 + 1}", LANES[i % 8][1] * rng.uniform(0.8, 1.2),
             LANES[i % 8][2] * rng.uniform(0.7, 1.3), LANES[i % 8][3], LANES[i % 8][4]) for i in range(n)]


def selfcheck(P):
    mask, params = decode_model(np.ones(15, np.int8))
    assert mask.all() and params == dict(n_estimators=500, max_depth=5, learning_rate=0.2, subsample=1.0)
    assert hv2d(np.array([[0, 1], [1, 0]]), (2, 2)) == 3
    assert hv3d(np.array([[0, 0, 1], [1, 1, 0]]), (2, 2, 2)) == 4 + 1 * 1 * 2 - 1  # union of a 2x2x1 and a 1x1x2 box
    assert nd_sort(np.array([[1, 1], [2, 2], [1, 2]])).tolist() == [0, 2, 1]
    x = np.tile(encode(3, 5, 7, 1), P["nl"])
    assert decode(x[None], P["nl"])[2].tolist() == [[7] * P["nl"]]
    slow_h2 = np.tile(encode(0, 0, 7, 0), P["nl"])  # hydrogen at 10 kn cannot reach Singapore on one tank
    assert evaluate(slow_h2[None], P, {"carbon": 0, "cap": None, "grid": 0.71, "robust": False})[1][0] > 0


def main():
    rng = np.random.default_rng(42)
    hyb, q, pred = prediction_study(rng)
    print("prediction MAPE %  interp:", {k: round(v["mape"], 2) for k, v in pred["interp"].items()})
    print("prediction MAPE %  extrap:", {k: round(v["mape"], 2) for k, v in pred["extrap"].items()})
    print("conformal 90% coverage:", round(pred["conformal"]["coverage"], 1))
    tu = pred["tuning"]
    print("model search best val MAPE:", {k: round(v["best_mean"], 3) for k, v in tu.items() if k != "chosen"},
          "default:", tu["chosen"]["default_val_mape"], "chosen:", tu["chosen"]["features"], tu["chosen"]["params"])

    mrv, hyb = mrv_validation(hyb)  # optimiser uses the MRV-calibrated fuel model when data is present
    if mrv:
        print(f"MRV: {mrv['used']} container ships {mrv['per_class']}, raw MAPE {mrv['raw']['mape']:.1f}% "
              f"(actual/pred {mrv['raw']['median_ratio']:.2f}) -> calibrated {mrv['calibrated']['mape']:.1f}%, "
              f"speed exponent real {mrv['exponent']['real']:.2f} vs model {mrv['exponent']['model']:.2f}", mrv["calibration"])
    P = problem(LANES, hyb, q)
    selfcheck(P)
    base_sc = {"carbon": 100, "cap": CAPS["2030"], "grid": 0.71, "robust": False}
    bench = benchmark(P, base_sc, 6000, 10)
    for k, o in bench["algos"].items():
        print(f"{k:26s} HV {o['hv_mean']:.4f} ± {o['hv_std']:.4f}  feasible {o['feasible_runs']}/10  "
              f"to95 {o['evals_to_95']}  {o['time_s']:.2f}s")

    scale = {}
    for n in (8, 16, 32):
        Pn = P if n == 8 else problem(scaled_lanes(n, np.random.default_rng(n)), hyb, q)
        b = benchmark(Pn, base_sc, 750 * n, 5)
        scale[n] = {k: {m: o[m] for m in ("hv_mean", "hv_std", "time_s", "feasible_runs")} for k, o in b["algos"].items()}
        print("lanes", n, {k: round(o["hv_mean"], 3) for k, o in b["algos"].items()})

    scen = scenarios(P, 8000)
    print("scenarios feasible:", sum(s["feasible"] for s in scen.values()), "/", len(scen))
    road = roadmap(P)
    print("roadmap:", [(r["year"], r["plan"]["intensity"], r["target"], r["feasible"]) for r in road])

    g = np.random.default_rng(3).integers(0, 2, (6, P["L"])).astype(np.int8)
    g[0] = np.array(list(scen["100|2030|0.71|0"]["picks"]["balanced"]["genome"]), dtype=np.int8)
    CF, CV = evaluate(g, P, base_sc)
    check = {"sc": base_sc, "genomes": ["".join(map(str, x)) for x in g.tolist()], "F": CF.tolist(), "V": CV.tolist()}

    data = {"problem": problem_json(P), "check": check, "roadmap": road, "mrv": mrv,
            "fueleu": {"targets": FUELEU, "eur_usd": EUR_USD, "eur_per_t": 2400, "mj_per_t": 41000},
            "prediction": pred, "benchmark": bench, "scalability": scale, "scenarios": scen,
            "fuels": [{"name": f[0], "wtw": f[1], "price": f[2], "range_days": f[3], "capex_mult": f[4],
                       "supply_pj": None if np.isinf(f[5]) else f[5]} for f in FUELS],
            "vessels": [{"name": v[0], "teu": v[1], "design_speed": v[2], "fuel_tpd": v[3], "rate": v[4],
                         "available": v[5]} for v in VESSELS],
            "lanes": [{"name": l[0], "nm": l[1], "teu_week": l[2], "max_transit_days": l[3]} for l in LANES]}
    out = OUT / "frontend" / "src" / "data" / "results.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data))
    print("wrote", out.relative_to(OUT))


if __name__ == "__main__":
    main()
