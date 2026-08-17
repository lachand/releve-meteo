#!/usr/bin/env python3
"""Generate src/domain/franceBoundary.ts from Natural Earth admin-0 countries.

One-off generation script, not part of the application build. Re-run only
if the simplification epsilon needs to change.

Source: Natural Earth 1:10m cultural vectors, admin-0 countries layer
(public domain, https://www.naturalearthdata.com/about/terms-of-use/),
fetched from the geojson mirror at github.com/nvkelso/natural-earth-vector.

domain/ has no fetch and no build-time data loading of its own, so the
boundary is baked into a TypeScript constant rather than loaded from
public/ like coastline-fr.json: isWithinMetropolitanFrance(lat, lon) takes
no data parameter per ARCHITECTURE.md, so the data must live in the module.

Usage:
    curl -o /tmp/ne_10m_admin_0_countries.geojson \
        https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson
    python3 scripts/generate-france-boundary.py /tmp/ne_10m_admin_0_countries.geojson
"""

import json
import math
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "domain" / "franceBoundary.ts"

# Metropolitan France + Corsica sit within this rough Europe bounding box;
# France's overseas departments (Guadeloupe, Martinique, Guyane, Reunion,
# Mayotte) are separate rings in the same MultiPolygon feature, far outside
# it, and must be excluded rather than baked into the boundary check.
EUROPE_LON = (-6, 11)
EUROPE_LAT = (40, 52)

# Roughly 1 km: keeps small bays and harbours recognisable while cutting
# the raw ring point count by about 3x.
SIMPLIFY_EPSILON_DEG = 0.01


def ring_bbox(ring):
    lons = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    return min(lons), max(lons), min(lats), max(lats)


def perpendicular_distance(pt, a, b):
    (x, y), (ax, ay), (bx, by) = pt, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(x - ax, y - ay)
    t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)
    px, py = ax + t * dx, ay + t * dy
    return math.hypot(x - px, y - py)


def rdp(points, epsilon):
    if len(points) < 3:
        return points
    dmax, index = 0.0, 0
    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], points[0], points[-1])
        if d > dmax:
            dmax, index = d, i
    if dmax > epsilon:
        left = rdp(points[: index + 1], epsilon)
        right = rdp(points[index:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


def main() -> None:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <ne_10m_admin_0_countries.geojson>", file=sys.stderr)
        raise SystemExit(1)

    with open(sys.argv[1]) as f:
        data = json.load(f)

    france = next(f for f in data["features"] if f["properties"].get("NAME") == "France")
    polys = france["geometry"]["coordinates"]

    metro_rings = []
    for poly in polys:
        ring = poly[0]
        lon_min, lon_max, lat_min, lat_max = ring_bbox(ring)
        if EUROPE_LON[0] <= lon_min and lon_max <= EUROPE_LON[1] and EUROPE_LAT[0] <= lat_min and lat_max <= EUROPE_LAT[1]:
            metro_rings.append(ring)

    simplified_rings = [rdp([(lon, lat) for lon, lat in ring], SIMPLIFY_EPSILON_DEG) for ring in metro_rings]
    total = sum(len(r) for r in simplified_rings)
    print(f"{len(simplified_rings)} rings, {total} points after simplification", file=sys.stderr)

    lines = [
        "/**",
        " * Polygone (mainland + Corse + petites iles proches) simplifie depuis",
        " * Natural Earth 1:10m admin-0 countries (domaine public), Douglas-Peucker",
        " * epsilon 0.01 degre. Regenerer avec scripts/generate-france-boundary.py.",
        " * Paires [longitude, latitude].",
        " */",
        "export const METROPOLITAN_FRANCE_RINGS: readonly (readonly (readonly [number, number])[])[] = [",
    ]
    for ring in simplified_rings:
        coords = ",".join(f"[{round(lon, 4)},{round(lat, 4)}]" for lon, lat in ring)
        lines.append(f"  [{coords}],")
    lines.append("];")

    OUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
