#!/usr/bin/env python3
"""
Procesa el GeoJSON de radares/ubicaciones del Ayuntamiento de Vitoria (grupo 138)
a formato para Radar Norte.
"""
import json

from common import RAW_DIR, write_geojson


def main():
    src = RAW_DIR / "geoJSON_g_138.json"
    if not src.exists():
        print(f"No existe: {src}")
        return

    with open(src, "r", encoding="utf-8") as f:
        data = json.load(f)

    features_out = []
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        name = props.get("name") or props.get("titulo") or "Ubicación radar (Vitoria)"
        direccion = props.get("direccion") or ""
        features_out.append({
            "type": "Feature",
            "geometry": feat.get("geometry"),
            "properties": {
                "source": "vitoria_ayto",
                "name": name,
                "address": direccion,
                "kind": "mobile_location",
                "notes": "Ubicación anunciada por el Ayuntamiento de Vitoria-Gasteiz (radares móviles)",
            }
        })

    out = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "Ayuntamiento de Vitoria-Gasteiz (GeoVitoria)",
            "note": "Ubicaciones de radares móviles anunciadas",
            "total_features": len(features_out),
        },
        "features": features_out,
    }
    processed, published = write_geojson("radares-vitoria-ayto.geojson", out)
    print(f"Guardado: {processed} ({len(features_out)} features)")
    print(f"Publicado: {published}")


if __name__ == "__main__":
    main()
