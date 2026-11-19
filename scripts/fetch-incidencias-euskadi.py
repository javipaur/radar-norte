#!/usr/bin/env python3
"""
Descarga incidencias de tráfico de Euskadi (API Open Data Euskadi) y genera GeoJSON.
"""
import json
import urllib.request
import ssl
from datetime import date
from pathlib import Path

from common import write_geojson


def main():
    root = Path(__file__).resolve().parent.parent
    raw_dir = root / "data" / "raw"
    processed_dir = root / "data" / "processed"
    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)

    today = date.today()
    url = f"https://api.euskadi.eus/traffic/v1.0/incidences/byDate/{today.year}/{today.month:02d}/{today.day:02d}"

    ctx = ssl.create_default_context()
    print(f"Descargando incidencias Euskadi desde {url}...")
    try:
        with urllib.request.urlopen(url, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"Error: {e}")
        return

    (raw_dir / "incidencias-euskadi.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    incidences = data.get("incidences", [])
    features = []
    for inc in incidences:
        try:
            lat = float(inc.get("latitude", 0) or 0)
            lon = float(inc.get("longitude", 0) or 0)
            if lat == 0 and lon == 0:
                continue
            props = {
                "source": "euskadi",
                "title": inc.get("incidenceType", "Incidencia"),
                "location": f"{inc.get('cityTown', '')} ({inc.get('province', '')})",
                "date": inc.get("startDate", ""),
                "severity": inc.get("incidenceLevel", ""),
                "effect": inc.get("cause", ""),
                "category": inc.get("incidenceType", ""),
                "road": inc.get("road", ""),
                "pkStart": inc.get("pkStart", ""),
                "pkEnd": inc.get("pkEnd", ""),
                "direction": inc.get("direction", ""),
            }
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": props,
            })
        except Exception as e:
            continue

    out = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "Open Data Euskadi - API de tráfico",
            "url": url,
            "total_features": len(features),
        },
        "features": features,
    }
    processed, published = write_geojson("incidencias-euskadi.geojson", out)
    print(f"Guardado: {processed} ({len(features)} incidencias)")
    print(f"Publicado: {published}")


if __name__ == "__main__":
    main()
