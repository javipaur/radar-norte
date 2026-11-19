#!/usr/bin/env python3
"""Trazar los tramos INVIVE sobre la carretera real de OpenStreetMap.

La DGT solo publica los dos extremos de cada tramo; con eso la línea sale recta
y no sigue la vía (p. ej. la NA-2410 no pasa por Uharte Arakil). Aquí se descargan
los ways de OSM con el mismo `ref`, se traza el camino entre extremos y se guarda
la geometría resultante. Si no hay camino, se conserva la recta original.

Los ways se cachean en data/raw/invive-osm-ways.json para no depender de la red
en ejecuciones posteriores. Las propiedades originales nunca se eliminan: los
extremos DGT se guardan además en `dgt_extremos`.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from common import PROCESSED_DIR, RAW_DIR, write_geojson
from invive_geometry import build_road_graph, is_plausible_trace, simplify_path, trace_road_path

RADAR_NAME = "radares-pais-vasco-navarra-aragon.geojson"
CACHE_NAME = "invive-osm-ways.json"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
CHUNK_SIZE = 15
SIMPLIFY_KM = 0.03
MAX_SNAP_KM = 2.0


def _fetch_ways(refs, bbox):
    """Descarga de Overpass los ways con `ref` en el grupo y dentro de bbox."""
    patron = "^(" + "|".join(re.escape(ref) for ref in refs) + ")$"
    south, west, north, east = bbox
    query = (
        f"[out:json][timeout:180];way[\"highway\"][\"ref\"~\"{patron}\"]"
        f"({south},{west},{north},{east});out geom;"
    )
    url = OVERPASS_URL + "?" + urllib.parse.urlencode({"data": query})
    request = urllib.request.Request(url, headers={"User-Agent": "radar-norte/0.2.0"})
    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                data = json.load(response)
            return data.get("elements", [])
        except Exception as exc:  # Overpass devuelve 502 cuando está saturado
            last_error = exc
            if attempt < 2:
                time.sleep(3 * (attempt + 1))
    raise last_error


def _load_cache():
    path = RAW_DIR / CACHE_NAME
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"updated_at": None, "ways": {}}


def _save_cache(cache):
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / CACHE_NAME).write_text(
        json.dumps(cache, ensure_ascii=False), encoding="utf-8"
    )


def _bbox(features):
    lats = []
    lons = []
    for feature in features:
        for lon, lat in feature["geometry"]["coordinates"]:
            lats.append(lat)
            lons.append(lon)
    margin = 0.3
    return (
        min(lats) - margin,
        min(lons) - margin,
        max(lats) + margin,
        max(lons) + margin,
    )


def main():
    collection = json.loads((PROCESSED_DIR / RADAR_NAME).read_text(encoding="utf-8"))
    invive = [
        f for f in collection["features"]
        if f.get("properties", {}).get("source") == "dgt_invive"
    ]
    if not invive:
        print("No hay tramos INVIVE; no hay nada que trazar.")
        return 0

    refs = sorted({f["properties"]["road"] for f in invive if f["properties"].get("road")})
    cache = _load_cache()
    ways_by_ref = cache.setdefault("ways", {})

    pendientes = [ref for ref in refs if ref not in ways_by_ref]
    if pendientes:
        bbox = _bbox(invive)
        for offset in range(0, len(pendientes), CHUNK_SIZE):
            chunk = pendientes[offset:offset + CHUNK_SIZE]
            print(f"Descargando trazado OSM ({offset + 1}-{offset + len(chunk)} de {len(pendientes)})...")
            try:
                ways = _fetch_ways(chunk, bbox)
            except Exception as exc:  # conserva la caché anterior ante fallos de red
                print(f"  Aviso: fallo al descargar {', '.join(chunk)}: {exc}")
                continue
            by_ref = {ref: [] for ref in chunk}
            for way in ways:
                ref = (way.get("tags") or {}).get("ref")
                if ref in by_ref:
                    by_ref[ref].append(way)
            ways_by_ref.update(by_ref)
            time.sleep(2)
        cache["updated_at"] = datetime.now(timezone.utc).isoformat()
        _save_cache(cache)

    graphs = {ref: build_road_graph(ways_by_ref.get(ref, [])) for ref in refs}
    trazados = 0
    rechazados_desvio = 0
    # La recta DGT une solo los extremos; una carretera real puede curvarse lejos
    # de ella. Solo se rechaza un trazado si rodea >2x la distancia en recta,
    # que es lo que delata un salto a un trozo de vía desconectado.
    for feature in invive:
        props = feature["properties"]
        extremos = [list(p) for p in (props.get("dgt_extremos") or feature["geometry"]["coordinates"])]
        props["dgt_extremos"] = extremos
        if len(extremos) < 2:
            props["geometry_source"] = "dgt_extremos"
            continue
        path = trace_road_path(
            graphs.get(props.get("road"), {"nodes": {}, "adj": {}}),
            extremos[0],
            extremos[-1],
            max_snap_km=MAX_SNAP_KM,
        )
        if path and len(path) >= 2:
            feature["geometry"]["coordinates"] = simplify_path(path, SIMPLIFY_KM)
            props["geometry_source"] = "osm_road_trace"
            trazados += 1
        else:
            props["geometry_source"] = "dgt_extremos"

    write_geojson(RADAR_NAME, collection)
    print(f"Tramos INVIVE: {len(invive)} · trazados por carretera (OSM): {trazados} · sin trazado (recta DGT): {len(invive) - trazados}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
