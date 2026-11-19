#!/usr/bin/env python3
"""Utilidades compartidas por los scripts de actualización de datos.

Garantiza dos cosas:
  1. Ninguna fuente que devuelva 0 features puede sobrescribir datos buenos.
  2. Todo lo que se genera en data/processed/ se copia a public/data/processed/,
     que es lo que realmente sirve Vite (antes se copiaba solo a veces).
"""
import csv
import hashlib
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


def merge_preserved_features(new_features, previous_features):
    """Conserva localizaciones ya guardadas que la fuente remota ya no incluye.

    Se empareja por `id` cuando existe; si no, por una clave estable de
    propiedades + geometría. Las features nuevas ganan sobre las antiguas, pero
    una retirada en la fuente nunca borra una localización que ya teníamos.
    Las conservadas se marcan como historical=True.
    """
    def key(feature):
        if feature.get("id") is not None:
            return ("id", str(feature["id"]))
        stable = json.dumps(
            {"properties": feature.get("properties", {}), "geometry": feature.get("geometry")},
            sort_keys=True,
            ensure_ascii=False,
        )
        return ("content", stable)

    merged = list(new_features)
    seen = {key(f) for f in merged}
    for feature in previous_features or []:
        identity = key(feature)
        if identity not in seen:
            # marcar como histórico (conservado)
            fcopy = json.loads(json.dumps(feature, ensure_ascii=False))
            props = fcopy.get("properties") or {}
            props["historical"] = True
            props["historical_note"] = "Conservado: ya no aparece en la fuente actual (histórico)."
            fcopy["properties"] = props
            merged.append(fcopy)
            seen.add(identity)
    return merged


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


def navarra_id(titulo, ubicacion, fecha, carretera, pk, tipo):
    """Id estable de una incidencia de Navarra (independiente de su 'updated')."""
    identidad = "|".join(str(x or "") for x in (titulo, ubicacion, fecha, carretera, pk, tipo))
    return "navarra-" + hashlib.sha1(identidad.encode("utf-8")).hexdigest()[:16]


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
            # No incluye `Ultima_actualizacion` ni `Otros_datos`: cambian sin que
            # la incidencia sea otra. Así se conserva una localización retirada
            # del CSV sin duplicar la que sigue activa.
            feature_id = navarra_id(
                row.get("Titulo"), row.get("Ubicacion"), row.get("Fecha_incidencia"),
                row.get("Carretera"), row.get("PK"), row.get("Tipo"),
            )
            features.append({
                "type": "Feature",
                "id": feature_id,
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
