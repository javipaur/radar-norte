#!/usr/bin/env python3
"""
Descarga programática de las 3 capas de GeoVitoria usadas por la app.

Recetas verificadas en docs/investigacion-geovitoria-api.md:
  - g=138 y t=radar móvil: POST a capaAction.do (el visor genera el GeoJSON en cliente).
  - id=5052: detalleAction.do -> nombreKml -> KML -> puntos.

Es un contrato interno no documentado y el servidor es intermitente: se reintentan
3 veces y, si falla, se conserva el raw anterior (nunca se publica un archivo vacío).
"""
import json
import ssl
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from common import RAW_DIR

BASE = "https://www.vitoria-gasteiz.org"
CAPA_URL = f"{BASE}/j16-02w/capaAction.do?accion=CARGAR_ELEMENTOS_CAPA&idioma=es"
DETALLE_URL = f"{BASE}/j16-02w/detalleAction.do?id=5052&idioma=es"
KML_BASE = f"{BASE}/docs/j16/kml/"

CTX = ssl.create_default_context()
KML_NS = {"k": "http://www.opengis.net/kml/2.2"}


def get_bytes(url, data=None, attempts=3):
    last = None
    for _ in range(attempts):
        try:
            payload = urllib.parse.urlencode(data).encode("utf-8") if data else None
            req = urllib.request.Request(url, data=payload)
            with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
                return resp.read()
        except Exception as exc:  # servidor intermitente (ver docs §7.3)
            last = exc
    raise last


def get_json(url, data=None):
    # utf-8-sig por si el servidor añade BOM (docs §2).
    return json.loads(get_bytes(url, data).decode("utf-8-sig"))


def collection(elementos, source, note):
    features = []
    for element in elementos:
        if str(element.get("tipo")) not in ("1",):  # 1=punto; 5=calle, 6=WMS
            continue
        try:
            lon = float(element["longitud"])
            lat = float(element["latitud"])
        except (KeyError, TypeError, ValueError):
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "eid": element.get("id"),
                "name": element.get("nombre") or "",
                "direccion": element.get("direccion") or "",
                "descripcion": element.get("descripcion"),
                "id": element.get("id"),
                "tipo": element.get("tipo"),
            },
        })
    features.sort(key=lambda f: str(f["properties"]["id"]))
    return {
        "type": "FeatureCollection",
        "metadata": {"source": source, "note": note, "total_features": len(features)},
        "features": features,
    }


def fetch_coleccion(fields, raw_name):
    payload = {**fields, "app": "J16", "charset": "UTF-8"}
    col = get_json(CAPA_URL, payload)
    return collection(col.get("elementos", []), "Ayuntamiento de Vitoria-Gasteiz (GeoVitoria)", raw_name)


def fetch_foto_rojo():
    det = get_json(DETALLE_URL)
    kml_url = KML_BASE + det["nombreKml"]
    root = ET.fromstring(get_bytes(kml_url))
    features = []
    for placemark in root.findall(".//k:Placemark", KML_NS):
        coords = placemark.find(".//k:coordinates", KML_NS)
        if coords is None or not coords.text:
            continue
        parts = coords.text.strip().split(",")
        if len(parts) < 2:
            continue
        try:
            lon, lat = float(parts[0]), float(parts[1])
        except ValueError:
            continue
        name = placemark.findtext("k:name", default="", namespaces=KML_NS)
        desc = placemark.findtext("k:description", default="", namespaces=KML_NS)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": name,
                "descripcion": desc,
                "direccion": desc,
                "tipo": "4",
            },
        })
    return {
        "type": "FeatureCollection",
        "metadata": {"source": "Ayuntamiento de Vitoria-Gasteiz - Foto-rojo", "total_features": len(features)},
        "features": features,
    }


def fetch_all():
    """Descarga los raw; si falla una fuente conserva el fichero anterior."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    targets = [
        ("geoJSON_g_138.json", lambda: fetch_coleccion({"g": "138"}, "grupo 138")),
        ("geoJSON_t_radar_móvil.json", lambda: fetch_coleccion({"t": "radar móvil"}, "etiqueta radar móvil")),
        ("geoJSON_4_5052.json", fetch_foto_rojo),
    ]
    ok = 0
    for name, fetch in targets:
        try:
            data = fetch()
            if not data["features"]:
                raise ValueError("0 features: se conserva el raw anterior")
            (RAW_DIR / name).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            print(f"  RAW {name}: {len(data['features'])} entidades")
            ok += 1
        except Exception as exc:
            print(f"  AVISO no se pudo refrescar {name}: {exc} (se conserva el anterior)")
    return ok, len(targets)


if __name__ == "__main__":
    descargadas, totales = fetch_all()
    print(f"GeoVitoria: {descargadas}/{totales} fuentes refrescadas")
    # Si falla una fuente se conserva el raw anterior: no es un fallo del pipeline.
    sys.exit(0)
