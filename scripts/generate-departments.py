#!/usr/bin/env python3
"""Genere public/data/departements-fr.json : contours simplifies des 96
departements metropolitains, pour retrouver hors ligne le departement d'un
lieu (vigilance Meteo-France, publiee par departement), meme quand le lieu
vient du GPS et n'a pas de nom de departement.

Source : france-geojson (gregoiredavid), converti des traces IGN Admin
Express COG, Licence Ouverte Etalab. Codes INSEE.

Simplification Douglas-Peucker a TOLERANCE_DEG (environ 1 km), puis
coordonnees arrondies a 4 decimales : largement assez pour savoir dans quel
departement tombe un point, sauf a environ un kilometre d'une
limite, ou le domaine se replie sur le departement le plus proche.

Usage : python3 scripts/generate-departments.py
"""

import json
import pathlib
import urllib.request

SOURCE_URL = (
    "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/"
    "departements-version-simplifiee.geojson"
)
TOLERANCE_DEG = 0.01
OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "data" / "departements-fr.json"


def perpendicular_distance(point, start, end):
    (x, y), (x1, y1), (x2, y2) = point, start, end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / (dx * dx + dy * dy) ** 0.5


def simplify(points, tolerance):
    """Douglas-Peucker iteratif (pas de recursion profonde)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        best, index = 0.0, -1
        for i in range(first + 1, last):
            distance = perpendicular_distance(points[i], points[first], points[last])
            if distance > best:
                best, index = distance, i
        if best > tolerance and index != -1:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))
    return [p for p, k in zip(points, keep) if k]


def rings_of(geometry):
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    rings = []
    for polygon in polygons:
        outer = simplify(polygon[0], TOLERANCE_DEG)
        # Un anneau degenere (ilot minuscule) n'apporte rien au test d'appartenance.
        if len(outer) >= 4:
            rings.append([[round(x, 4), round(y, 4)] for x, y in outer])
    return rings


def main():
    with urllib.request.urlopen(SOURCE_URL, timeout=60) as response:
        data = json.load(response)
    departments = []
    for feature in data["features"]:
        props = feature["properties"]
        departments.append(
            {"code": props["code"], "name": props["nom"], "rings": rings_of(feature["geometry"])}
        )
    departments.sort(key=lambda d: d["code"])
    OUTPUT.write_text(json.dumps(departments, ensure_ascii=False, separators=(",", ":")) + "\n")
    points = sum(len(r) for d in departments for r in d["rings"])
    print(f"{len(departments)} departements, {points} points, {OUTPUT.stat().st_size} octets")


if __name__ == "__main__":
    main()
