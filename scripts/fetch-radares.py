#!/usr/bin/env python3
"""
Descarga el feed de Radares Anunciados y filtra para País Vasco, Navarra y Aragón.
Genera data/processed/radares-pais-vasco-navarra-aragon.geojson y status.json.
"""
import json
import urllib.request
import ssl
from pathlib import Path

FEED_URL = "https://geiserx.github.io/radares-anunciados-ha/feed.geojson"
STATUS_URL = "https://geiserx.github.io/radares-anunciados-ha/status.json"

# Códigos de provincia INE para las regiones objetivo
PROVINCIAS_PV = {"01", "48", "20"}  # Álava/Araba, Bizkaia, Gipuzkoa
PROVINCIAS_NA = {"31"}  # Navarra
PROVINCIAS_AR = {"22", "50", "44"}  # Huesca, Zaragoza, Teruel
PROVINCIAS_OBJETIVO = PROVINCIAS_PV | PROVINCIAS_NA | PROVINCIAS_AR

# Bounding box aproximado (WGS84): [minLon, minLat, maxLon, maxLat]
# PV, Navarra, Aragón
BBOX_OBJETIVO = [-2.5, 40.0, 0.8, 43.6]


def in_bbox(lon, lat, bbox):
    return bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]


def is_in_target_region(props, geom):
    """Determina si una feature pertenece a PV, Navarra o Aragón."""
    province = props.get("province", "")
    source = props.get("source", "")

    # Fuentes regionales directas
    if source in ("euskadi", "navarra", "donostia", "donostia_movil"):
        return True

    # Por código de provincia
    if province in PROVINCIAS_OBJETIVO:
        return True

    # Para tramos (LineString), verificar si algún punto está en bbox
    if geom and geom.get("type") == "LineString":
        coords = geom.get("coordinates", [])
        for coord in coords:
            if len(coord) >= 2 and in_bbox(coord[0], coord[1], BBOX_OBJETIVO):
                return True
    elif geom and geom.get("type") == "Point":
        coords = geom.get("coordinates", [])
        if len(coords) >= 2 and in_bbox(coords[0], coords[1], BBOX_OBJETIVO):
            return True

    return False


def main():
    root = Path(__file__).resolve().parent.parent
    raw_dir = root / "data" / "raw"
    processed_dir = root / "data" / "processed"
    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)

    ctx = ssl.create_default_context()

    print(f"Descargando feed desde {FEED_URL}...")
    with urllib.request.urlopen(FEED_URL, context=ctx, timeout=60) as resp:
        feed = json.loads(resp.read().decode("utf-8"))

    print(f"Descargando status desde {STATUS_URL}...")
    try:
        with urllib.request.urlopen(STATUS_URL, context=ctx, timeout=30) as resp:
            status = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"Warning: no se pudo descargar status: {e}")
        status = {"error": "no descargado", "generated": None}

    # Guardar raw
    (raw_dir / "feed.geojson").write_text(json.dumps(feed, ensure_ascii=False), encoding="utf-8")
    (raw_dir / "status.json").write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")

    # Filtrar
    features_in = feed.get("features", [])
    features_out = []
    for f in features_in:
        props = f.get("properties", {})
        geom = f.get("geometry")
        if is_in_target_region(props, geom):
            features_out.append(f)

    out = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "Radares Anunciados (https://geiserx.github.io/radares-anunciados-ha/)",
            "generated_at": status.get("generated"),
            "filtered_for": ["País Vasco", "Navarra", "Aragón"],
            "total_features": len(features_out),
        },
        "features": features_out,
    }

    out_path = processed_dir / "radares-pais-vasco-navarra-aragon.geojson"
    out_path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"Guardado: {out_path} ({len(features_out)} features)")

    # También guardar status filtrado
    status_out_path = processed_dir / "status.json"
    status_out_path.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Guardado: {status_out_path}")


if __name__ == "__main__":
    main()
