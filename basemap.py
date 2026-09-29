"""Builds frontend/src/data/basemap.json from Natural Earth 1:50m (public domain).
India is drawn per the official Indian boundary: the NE India polygon plus the
J&K / Ladakh areas NE lists as claimed by India (Gilgit-Baltistan, PoK, Aksai Chin, Shaksgam, Siachen).
Usage: python basemap.py <ne_50m_admin_0_countries.geojson> <ne_50m_admin_0_breakaway_disputed_areas.geojson>"""
import json
import sys

VIEW = (48, 108, -4, 38)  # lon0, lon1, lat0, lat1
TOL = 0.04  # degrees, Douglas-Peucker tolerance


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0
    n = (dx * dx + dy * dy) ** 0.5 or 1e-12
    i, dmax = 0, 0.0
    for k in range(1, len(pts) - 1):
        d = abs(dy * (pts[k][0] - x0) - dx * (pts[k][1] - y0)) / n
        if d > dmax:
            i, dmax = k, d
    if dmax <= tol:
        return [pts[0], pts[-1]]
    return dp(pts[: i + 1], tol)[:-1] + dp(pts[i:], tol)


def rings(geom):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    for poly in polys:
        yield poly[0]  # outer ring only; lakes are irrelevant at this scale


def visible(r):
    xs, ys = [p[0] for p in r], [p[1] for p in r]
    return max(xs) >= VIEW[0] and min(xs) <= VIEW[1] and max(ys) >= VIEW[2] and min(ys) <= VIEW[3]


def pack(r):
    s = dp(r[:-1], TOL) if len(r) > 4 else r
    return [round(v, 2) for p in s for v in p] if len(s) >= 3 else None


def main(countries, disputed):
    india, land = [], []
    for f in json.load(open(countries))['features']:
        is_india = f['properties']['ADM0_A3'] == 'IND'
        for r in rings(f['geometry']):
            if visible(r) and (q := pack(r)):
                (india if is_india else land).append(q)
    for f in json.load(open(disputed))['features']:
        note = f['properties'].get('NOTE_BRK') or ''
        if 'India' in note or 'Siachen' in (f['properties'].get('NAME') or ''):
            india += [q for r in rings(f['geometry']) if (q := pack(r))]
    out = 'frontend/src/data/basemap.json'
    json.dump({'india': india, 'land': land}, open(out, 'w'), separators=(',', ':'))
    print(out, sum(map(len, india)) // 2, 'India pts,', sum(map(len, land)) // 2, 'other pts')


if __name__ == '__main__':
    main(*sys.argv[1:3])
