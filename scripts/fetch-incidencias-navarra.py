#!/usr/bin/env python3
"""
Descarga incidencias de carreteras de Navarra (CSV) y las convierte a GeoJSON (WGS84).
Publica siempre en public/data/processed/, que es lo que sirve Vite.
"""
import json
import ssl
import urllib.request

from common import (
    NAVARRA_CSV_URL,
    PROCESSED_DIR,
    RAW_DIR,
    merge_preserved_features,
    navarra_id,
    parse_navarra_csv,
    write_geojson,
)


def fetch_csv():
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(NAVARRA_CSV_URL, context=ctx, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def main():
    print(f"Descargando incidencias Navarra desde {NAVARRA_CSV_URL}...")
    content = fetch_csv()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / "incidencias-navarra.csv").write_text(content, encoding="utf-8")

    try:
        from pyproj import Transformer
    except ImportError as exc:
        raise RuntimeError("pyproj es necesario para convertir UTM 30N a WGS84") from exc

    transformer = Transformer.from_crs(
        "EPSG:25830", "EPSG:4326", always_xy=True
    ).transform
    features = parse_navarra_csv(content, transformer)

    # El CSV público cambia durante el día: una incidencia que desaparece de la
    # fuente no debe borrar una localización que ya teníamos guardada.
    previous_path = PROCESSED_DIR / "incidencias-navarra.geojson"
    previous = []
    if previous_path.exists():
        try:
            previous = json.loads(previous_path.read_text(encoding="utf-8")).get("features", [])
        except (ValueError, OSError) as exc:
            print(f"Aviso: no se pudo leer el GeoJSON anterior: {exc}")
    # Archivos generados antes de añadir ids: se calcula el mismo id estable
    # desde las propiedades para no duplicar las incidencias ya presentes.
    for feature in previous:
        if feature.get("id") is None:
            p = feature.get("properties", {})
            feature["id"] = navarra_id(
                p.get("title"), p.get("location"), p.get("date"),
                p.get("road"), p.get("pk"), p.get("type"),
            )
    conservadas = len(features)
    features = merge_preserved_features(features, previous)
    if len(features) > conservadas:
        print(f"Conservadas {len(features) - conservadas} incidencias que el CSV ya no incluye.")

    out = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "Gobierno de Navarra - Incidencias de carreteras",
            "url": NAVARRA_CSV_URL,
            "total_features": len(features),
        },
        "features": features,
    }
    processed, published = write_geojson("incidencias-navarra.geojson", out)
    print(f"Guardado: {processed} ({len(features)} incidencias)")
    print(f"Publicado: {published}")


if __name__ == "__main__":
    main()
