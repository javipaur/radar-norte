#!/usr/bin/env python3
"""
Descarga incidencias de carreteras de Navarra (CSV) y las convierte a GeoJSON (WGS84).
"""
import csv
import json
import urllib.request
import ssl
from pathlib import Path

try:
    from pyproj import Transformer
except ImportError:
    Transformer = None

# URL del CSV de incidencias (recurso público)
CSV_URL = "https://datosabiertos.navarra.es/es/dataset/f7cafe87-6a49-452e-b846-336c12d6a279/resource/9323f68f-9c8f-47e1-884c-d6985b957606/download/incidenciasdecarreteras.csv"


def main():
    root = Path(__file__).resolve().parent.parent
    raw_dir = root / "data" / "raw"
    processed_dir = root / "data" / "processed"
    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)

    ctx = ssl.create_default_context()
    print(f"Descargando incidencias Navarra desde {CSV_URL}...")
    try:
        with urllib.request.urlopen(CSV_URL, context=ctx, timeout=30) as resp:
            content = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"Error descargando: {e}")
        return

    (raw_dir / "incidencias-navarra.csv").write_text(content, encoding="utf-8")

    # Parse CSV
    reader = csv.DictReader(content.splitlines())
    features = []

    transformer = None
    if Transformer:
        # EPSG:25830 (ETRS89 / UTM zone 30N) -> EPSG:4326 (WGS84)
        transformer = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)

    for row in reader:
        try:
            x = float(row.get("Coord_X_en_EPSG_25830", "") or 0)
            y = float(row.get("Coord_Y_en_EPSG_25830", "") or 0)
            if x == 0 or y == 0:
                continue
            if transformer:
                lon, lat = transformer.transform(x, y)
            else:
                # Sin pyproj, saltar
                print("pyproj no disponible, no se pueden convertir coords")
                continue

            props = {
                "source": "navarra",
                "title": row.get("Titulo", ""),
                "location": row.get("Ubicacion", ""),
                "date": row.get("Fecha_incidencia", ""),
                "severity": row.get("Gravedad", ""),
                "effect": row.get("Afeccion", ""),
                "category": row.get("Categoria", ""),
                "type": row.get("Tipo", ""),
                "details": row.get("Otros_datos", ""),
                "road": row.get("Carretera", ""),
                "pk": row.get("PK", ""),
                "updated": row.get("Ultima_actualizacion", ""),
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
            "source": "Gobierno de Navarra - Incidencias de carreteras",
            "url": CSV_URL,
            "total_features": len(features),
        },
        "features": features,
    }
    out_path = processed_dir / "incidencias-navarra.geojson"
    out_path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"Guardado: {out_path} ({len(features)} incidencias)")

    # Copiar también a src/data/processed
    src_dir = root / "src" / "data" / "processed"
    src_dir.mkdir(parents=True, exist_ok=True)
    (src_dir / "incidencias-navarra.geojson").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"Copiado a src: {src_dir / 'incidencias-navarra.geojson'}")


if __name__ == "__main__":
    main()
