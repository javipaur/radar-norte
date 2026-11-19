#!/usr/bin/env python3
"""Utilidades compartidas por los scripts de actualización de datos.

Garantiza dos cosas:
  1. Ninguna fuente que devuelva 0 features puede sobrescribir datos buenos.
  2. Todo lo que se genera en data/processed/ se copia a public/data/processed/,
     que es lo que realmente sirve Vite (antes se copiaba solo a veces).
"""
import csv
import json
import math
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
PUBLIC_DIR = ROOT / "public" / "data" / "processed"

NAVARRA_CSV_URL = (
    "https://datosabiertos.navarra.es/es/dataset/f7cafe87-6a49-452e-b846-336c12d6a279"
    "/resource/9323f68f-9c8f-47e1-884c-d6985b957606/download/incidenciasdecarreteras.csv"
)


def validate_collection(obj, name, min_features=1):
    """Lanza ValueError si la respuesta no es un GeoJSON utilizable."""
    if not isinstance(obj, dict) or obj.get("type") != "FeatureCollection":
        raise ValueError(f"{name}: no es un FeatureCollection")
    features = obj.get("features")
    if not isinstance(features, list) or len(features) < min_features:
        raise ValueError(
            f"{name}: {0 if not features else len(features)} features "
            f"(mínimo {min_features}); se conserva el archivo anterior"
        )
    return obj


def write_geojson(name, obj):
    """Valida, escribe en data/processed y publica en public/data/processed."""
    validate_collection(obj, name)
    text = json.dumps(obj, ensure_ascii=False)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for target in (PROCESSED_DIR / name, PUBLIC_DIR / name):
        target.write_text(text, encoding="utf-8")
    return [PROCESSED_DIR / name, PUBLIC_DIR / name]


def sync_processed_to_public(processed=PROCESSED_DIR, public=PUBLIC_DIR):
    """Copia todos los GeoJSON procesados al directorio servido por Vite."""
    processed = Path(processed)
    public = Path(public)
    public.mkdir(parents=True, exist_ok=True)
    copied = []
    for src in sorted(processed.glob("*.geojson")):
        validate_collection(json.loads(src.read_text(encoding="utf-8")), src.name)
        shutil.copy2(src, public / src.name)
        copied.append(public / src.name)
    return copied


def parse_navarra_csv(content, transformer):
    """Convierte el CSV oficial de Navarra a features GeoJSON (WGS84).

    `transformer(x, y) -> (lon, lat)`. Se pasa como argumento para que la
    función sea pura y se pueda probar sin pyproj ni red.
    """
    features = []
    for row in csv.DictReader(content.splitlines()):
        try:
            x = float(row.get("Coord_X_en_EPSG_25830", "") or 0)
            y = float(row.get("Coord_Y_en_EPSG_25830", "") or 0)
            if x == 0 or y == 0:
                continue
            lon, lat = transformer(x, y)
            if not (math.isfinite(lon) and math.isfinite(lat)):
                continue
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
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
                },
            })
        except (TypeError, ValueError, OverflowError):
            continue
    return features
