#!/usr/bin/env python3
"""
Procesa los GeoJSON adicionales del Ayuntamiento de Vitoria:
- geoJSON_t_radar_móvil.json -> radares-vitoria-moviles-ayto.geojson
- geoJSON_4_5052.json -> radares-vitoria-fotorrojo.geojson
"""
import json
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent.parent
    raw = root / "data" / "raw"
    processed = root / "data" / "processed"
    pub = root / "public" / "data" / "processed"
    pub.mkdir(parents=True, exist_ok=True)

    # 1) Radar móvil (t)
    src1 = raw / "geoJSON_t_radar_móvil.json"
    if src1.exists():
        with open(src1, "r", encoding="utf-8") as f:
            data = json.load(f)
        features_out = []
        for feat in data.get("features", []):
            props = feat.get("properties", {})
            name = props.get("name") or props.get("titulo") or "Radar móvil (Vitoria)"
            direccion = props.get("direccion") or ""
            features_out.append({
                "type": "Feature",
                "geometry": feat.get("geometry"),
                "properties": {
                    "source": "vitoria_ayto_movil",
                    "name": name,
                    "address": direccion,
                    "kind": "mobile_location",
                    "notes": "Ubicación radar móvil (Ayto. Vitoria-Gasteiz)",
                }
            })
        out = {"type": "FeatureCollection", "metadata": {"source": "Ayto Vitoria", "total": len(features_out)}, "features": features_out}
        (processed / "radares-vitoria-moviles-ayto.geojson").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        (pub / "radares-vitoria-moviles-ayto.geojson").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        print(f"Procesado moviles: {len(features_out)}")

    # 2) Foto-rojo (4_5052)
    src2 = raw / "geoJSON_4_5052.json"
    if src2.exists():
        with open(src2, "r", encoding="utf-8") as f:
            data = json.load(f)
        features_out = []
        for feat in data.get("features", []):
            props = feat.get("properties", {})
            desc = props.get("descripcion") or props.get("name") or "Foto-rojo (Vitoria)"
            features_out.append({
                "type": "Feature",
                "geometry": feat.get("geometry"),
                "properties": {
                    "source": "vitoria_foto_rojo",
                    "name": "Foto-rojo",
                    "address": desc,
                    "kind": "photo_red",
                    "notes": "Detector de semáforo en rojo (Ayto. Vitoria-Gasteiz)",
                }
            })
        out = {"type": "FeatureCollection", "metadata": {"source": "Ayto Vitoria - Foto-rojo", "total": len(features_out)}, "features": features_out}
        (processed / "radares-vitoria-fotorrojo.geojson").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        (pub / "radares-vitoria-fotorrojo.geojson").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        print(f"Procesado foto-rojo: {len(features_out)}")


if __name__ == "__main__":
    main()
