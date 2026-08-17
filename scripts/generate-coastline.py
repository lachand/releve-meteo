#!/usr/bin/env python3
"""Generate public/data/coastline-fr.json from Natural Earth coastline data.

One-off generation script, not part of the application build. Re-run only
when the bounding box or target sampling spacing needs to change.

Source: Natural Earth 1:10m physical vectors, coastline layer (public
domain, https://www.naturalearthdata.com/about/terms-of-use/), fetched from
the geojson mirror at github.com/nvkelso/natural-earth-vector.

Usage:
    curl -o /tmp/ne_10m_coastline.geojson \
        https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson
    python3 scripts/generate-coastline.py /tmp/ne_10m_coastline.geojson
"""

import json
import math
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "coastline-fr.json"

# Bounding box covering metropolitan France's coastline and Corsica, with
# margin so cross-border locations (Menton, Hendaye) still find nearby
# coastline points even if technically on the neighbouring country's side.
LAT_MIN, LAT_MAX = 41.0, 51.5
LON_MIN, LON_MAX = -5.5, 9.9

TARGET_SPACING_KM = 2.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def in_bbox(lon: float, lat: float) -> bool:
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def main() -> None:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <ne_10m_coastline.geojson>", file=sys.stderr)
        raise SystemExit(1)

    with open(sys.argv[1]) as f:
        data = json.load(f)

    # Collect coordinates from LineStrings falling in the bounding box,
    # keeping line continuity so resampling only measures distance within a
    # single original line segment, never bridging two unrelated coastlines.
    raw_lines = []
    for feature in data["features"]:
        geom = feature["geometry"]
        if geom["type"] != "LineString":
            continue
        coords = [(lat, lon) for lon, lat in geom["coordinates"] if in_bbox(lon, lat)]
        if coords:
            raw_lines.append(coords)

    # Resample each line to roughly one point every TARGET_SPACING_KM,
    # walking consecutive vertices and emitting a point whenever
    # accumulated distance crosses the threshold. Keeps the first and last
    # point of every line.
    sampled: list[tuple[float, float]] = []
    for line in raw_lines:
        if not line:
            continue
        sampled.append(line[0])
        accumulated = 0.0
        for (lat1, lon1), (lat2, lon2) in zip(line, line[1:]):
            accumulated += haversine_km(lat1, lon1, lat2, lon2)
            if accumulated >= TARGET_SPACING_KM:
                sampled.append((lat2, lon2))
                accumulated = 0.0
        if sampled[-1] != line[-1]:
            sampled.append(line[-1])

    points = [{"lat": round(lat, 4), "lon": round(lon, 4)} for lat, lon in sampled]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(points, f, separators=(",", ":"))

    print(f"{len(points)} points written to {OUT}")


if __name__ == "__main__":
    main()
