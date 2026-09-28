#!/usr/bin/env python3
"""Genere public/data/stations-fr.json : stations Meteostat de France
metropolitaine qui publient reellement des observations.

Meteostat melange dans ses fichiers horaires des observations (METAR,
rapports DWD POI) et des valeurs prevues (MOSMIX du DWD, prevision MET
Norway) qui bouchent les trous. Une station n'est retenue que si au moins
MIN_COVERAGE des heures des WINDOW_DAYS derniers jours ont une temperature
de source observee. Les memes sources que OBSERVATION_SOURCES dans
src/data/clients/meteostat.ts.

Usage : python3 scripts/generate-stations.py
A relancer de temps en temps (stations ouvertes ou fermees).
"""

import csv
import datetime
import gzip
import io
import json
import pathlib
import urllib.request
from concurrent.futures import ThreadPoolExecutor

STATIONS_URL = "https://bulk.meteostat.net/v2/stations/lite.json.gz"
HOURLY_URL = "https://data.meteostat.net/hourly/{year}/{id}.csv.gz"
OBSERVATION_SOURCES = {"metar", "dwd_poi", "synop", "isd_lite", "dwd_hourly", "dwd_synop"}
WINDOW_DAYS = 30
MIN_COVERAGE = 0.6
OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "data" / "stations-fr.json"


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def coverage(station_id: str, today: datetime.date) -> float:
    start = today - datetime.timedelta(days=WINDOW_DAYS)
    observed = 0
    for year in sorted({start.year, today.year}):
        try:
            raw = fetch(HOURLY_URL.format(year=year, id=station_id))
        except Exception:  # noqa: BLE001 - station sans fichier cette annee
            continue
        rows = csv.DictReader(io.StringIO(gzip.decompress(raw).decode("utf-8")))
        for row in rows:
            day = datetime.date(int(row["year"]), int(row["month"]), int(row["day"]))
            if start <= day < today and row.get("temp") and row.get("temp_source") in OBSERVATION_SOURCES:
                observed += 1
    return observed / (WINDOW_DAYS * 24)


def main() -> None:
    today = datetime.date.today()
    stations = json.loads(gzip.decompress(fetch(STATIONS_URL)))
    metro = [
        s
        for s in stations
        if s.get("country") == "FR"
        and 41.0 <= s["location"]["latitude"] <= 51.6
        and -5.6 <= s["location"]["longitude"] <= 10.0
    ]
    with ThreadPoolExecutor(max_workers=8) as pool:
        coverages = list(pool.map(lambda s: coverage(s["id"], today), metro))
    kept = []
    for station, cov in zip(metro, coverages):
        if cov < MIN_COVERAGE:
            continue
        location = station["location"]
        kept.append(
            {
                "id": station["id"],
                "name": station["name"].get("fr") or station["name"]["en"],
                "latitude": round(location["latitude"], 4),
                "longitude": round(location["longitude"], 4),
                "elevation": location.get("elevation"),
            }
        )
    kept.sort(key=lambda s: s["id"])
    OUTPUT.write_text(json.dumps(kept, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(kept)} stations retenues sur {len(metro)} ({today.isoformat()})")


if __name__ == "__main__":
    main()
