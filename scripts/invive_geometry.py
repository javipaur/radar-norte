#!/usr/bin/env python3
"""Trazado de los tramos INVIVE sobre la carretera real de OpenStreetMap.

La fuente DGT (DATEX2 y el feed GeoJSON) solo publica los dos extremos del
tramo, así que dibujarlos como una recta no sigue la carretera. Aquí reconstruimos
el camino entre ambos extremos usando los ways de OSM con el mismo `ref`.

Funciones puras: reciben los ways ya descargados, sin red. La descarga y la
cached se hacen en `fetch-invive-geometry.py`.
"""
import heapq
import math

EARTH_RADIUS_KM = 6371.0088


def _key(point):
    """Clave estable para un nodo OSM (lat, lon)."""
    lat, lon = point
    return (round(lat, 6), round(lon, 6))


def haversine_km(a, b):
    """Distancia en km entre (lat, lon) y (lat, lon)."""
    lat1, lon1 = a
    lat2, lon2 = b
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def path_length_km(coords):
    """Longitud total de una polilínea [lon, lat], en km."""
    if not coords or len(coords) < 2:
        return 0.0
    return sum(
        haversine_km((a[1], a[0]), (b[1], b[0]))
        for a, b in zip(coords, coords[1:])
    )


def build_road_graph(ways):
    """Grafo no dirigido de los ways de Overpass (campo `geometry`)."""
    nodes = {}
    adj = {}
    for way in ways or []:
        geometry = way.get("geometry") or []
        points = [(_key((p["lat"], p["lon"])), (p["lat"], p["lon"])) for p in geometry]
        for key, coord in points:
            nodes.setdefault(key, coord)
            adj.setdefault(key, [])
        for (key_a, coord_a), (key_b, coord_b) in zip(points, points[1:]):
            if key_a == key_b:
                continue
            distance = haversine_km(coord_a, coord_b)
            adj[key_a].append((key_b, distance))
            adj[key_b].append((key_a, distance))

    # Un mismo `ref` puede tener trozos sueltos. Saber qué nodos están conectados
    # permite probar un candidato de snap por componente en vez de los N nodos
    # más cercanos (que pueden pertenecer todos a un trozo aislado).
    return {"nodes": nodes, "adj": adj, "component": _components(adj)}


def _components(adj):
    """Etiqueta el componente conexo de cada nodo del grafo."""
    component = {}
    for index, node in enumerate(adj):
        if node in component:
            continue
        component[node] = index
        pending = [node]
        while pending:
            current = pending.pop()
            for neighbor, _ in adj[current]:
                if neighbor not in component:
                    component[neighbor] = index
                    pending.append(neighbor)
    return component


def connect_nearby_components(graph, max_gap_km=0.5):
    """Une trozos sueltos de la misma vía separados por un hueco corto.

    Los ways de OSM con el mismo `ref` no siempre comparten nodos: hay trozos
    partidos por una obra, un cambio de denominación o un error de importación.
    Si el hueco es pequeño, unirlos con una arista del tamaño real del hueco
    permite trazar el tramo completo en vez de dibujar una recta. Devuelve un
    grafo nuevo; el original queda intacto.
    """
    nodes = graph.get("nodes") or {}
    if max_gap_km <= 0 or not nodes:
        return graph

    adj = {key: list(neighbors) for key, neighbors in graph.get("adj", {}).items()}
    # Solo se unen trozos SUELTOS (componentes distintos). Puentear nodos que
    # ya están conectados crea atajos: Dijkstra recorta las curvas y la línea
    # dibujada se sale de la carretera (caso real: NA-2410 en Uharte Arakil).
    component = graph.get("component") or _components(adj)
    lat0 = sum(coord[0] for coord in nodes.values()) / len(nodes)
    km_por_lat = 110.57
    km_por_lon = max(111.32 * math.cos(math.radians(lat0)), 1e-6)
    tam_celda = max(max_gap_km / km_por_lat, max_gap_km / km_por_lon)

    celdas = {}
    for key, coord in nodes.items():
        celda = (math.floor(coord[0] / tam_celda), math.floor(coord[1] / tam_celda))
        celdas.setdefault(celda, []).append(key)

    for celda, keys in celdas.items():
        x, y = celda
        vecinas = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                vecinas.extend(celdas.get((x + dx, y + dy), ()))
        for key in keys:
            for other in vecinas:
                if other <= key:
                    continue  # cada par se evalúa una sola vez
                if component.get(key) == component.get(other):
                    continue  # ya hay carretera entre ellos: sería un atajo
                distancia = haversine_km(nodes[key], nodes[other])
                if distancia > max_gap_km:
                    continue
                adj[key].append((other, distancia))
                adj[other].append((key, distancia))

    return {"nodes": nodes, "adj": adj, "component": _components(adj)}


def _nearest_nodes(graph, lonlat, limit=8):
    """Nodos más cercanos, ordenados por distancia (desempate por clave)."""
    lat, lon = lonlat[1], lonlat[0]
    candidates = [
        (haversine_km((lat, lon), coord), key)
        for key, coord in graph["nodes"].items()
    ]
    candidates.sort(key=lambda item: (item[0], item[1]))
    return candidates[:limit]


def _nearest_node(graph, lonlat):
    candidates = _nearest_nodes(graph, lonlat, limit=1)
    return candidates[0] if candidates else (None, float("inf"))


def _snap_candidates(graph, lonlat, limit=12):
    """Un candidato por componente conexo, ordenados por distancia al extremo."""
    lat, lon = lonlat[1], lonlat[0]
    best_by_component = {}
    for key, coord in graph["nodes"].items():
        distance = haversine_km((lat, lon), coord)
        component = graph["component"].get(key, key)
        current = best_by_component.get(component)
        if current is None or distance < current[0]:
            best_by_component[component] = (distance, key)
    return sorted(best_by_component.values(), key=lambda item: (item[0], item[1]))[:limit]


def _dijkstra(graph, start):
    """Distancias y predecesores desde `start` sobre el grafo de la vía."""
    best = {start: 0.0}
    previous = {}
    queue = [(0.0, start)]
    while queue:
        distance, key = heapq.heappop(queue)
        if distance > best.get(key, float("inf")):
            continue
        for neighbor, weight in graph["adj"].get(key, []):
            candidate = distance + weight
            if candidate < best.get(neighbor, float("inf")):
                best[neighbor] = candidate
                previous[neighbor] = key
                heapq.heappush(queue, (candidate, neighbor))
    return best, previous


def _dressed_path(graph, start, end, previous, start_lonlat, end_lonlat):
    """Cadena de nodos convertida a [lon, lat] con los extremos DGT exactos."""
    if start == end:
        return [[start_lonlat[0], start_lonlat[1]], [end_lonlat[0], end_lonlat[1]]]
    chain = [end]
    while chain[-1] != start:
        chain.append(previous[chain[-1]])
    chain.reverse()

    coords = [[graph["nodes"][key][1], graph["nodes"][key][0]] for key in chain]
    coords[0] = [start_lonlat[0], start_lonlat[1]]
    coords[-1] = [end_lonlat[0], end_lonlat[1]]
    # Elimina puntos repetidos consecutivos (mismo nodo o extremo DGT duplicado).
    result = []
    for point in coords:
        if not result or point != result[-1]:
            result.append(point)
    return result


def trace_road_path(graph, start_lonlat, end_lonlat, max_snap_km=1.0):
    """Devuelve [lon, lat] siguiendo la carretera, o None si no hay camino.

    Los extremos son los puntos exactos de la DGT; los intermedios vienen de OSM.
    Se prueban varios nodos de snap porque una misma vía puede tener trozos
    sueltos (componentes desconectados) junto a uno de los extremos.
    """
    if not graph["nodes"]:
        return None

    starts = [(d, key) for d, key in _snap_candidates(graph, start_lonlat) if d <= max_snap_km]
    ends = [(d, key) for d, key in _snap_candidates(graph, end_lonlat) if d <= max_snap_km]
    if not starts or not ends:
        return None

    end_snap = {key: distance for distance, key in ends}
    mejor = None  # (coste, start, end, previous)
    for start_snap, start in starts:
        best, previous = _dijkstra(graph, start)
        for end, end_snap_km in end_snap.items():
            if start == end or end not in best:
                continue  # el mismo nodo no da un tramo; mejor conservar la recta DGT
            # Con snap amplio importa también lo lejos que cae cada extremo.
            coste = best[end] + start_snap + end_snap_km
            if mejor is None or coste < mejor[0]:
                mejor = (coste, start, end, previous)
    if mejor is None:
        return None
    _, start, end, previous = mejor
    return _dressed_path(graph, start, end, previous, start_lonlat, end_lonlat)


def _perp_distance_km(point, a, b, lat0):
    """Distancia de `point` al segmento a-b en km (proyección equirectangular)."""
    kx = 111.32 * math.cos(math.radians(lat0))
    ky = 110.57
    px, py = point[0] * kx, point[1] * ky
    ax, ay = a[0] * kx, a[1] * ky
    bx, by = b[0] * kx, b[1] * ky
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    if length2 == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify_path(coords, tolerance_km=0.02):
    """Ramer-Douglas-Peucker: menos puntos, sin perder los extremos."""
    if len(coords) <= 2:
        return list(coords)
    lat0 = sum(p[1] for p in coords) / len(coords)
    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    stack = [(0, len(coords) - 1)]
    while stack:
        first, last = stack.pop()
        max_distance = 0.0
        index = None
        for i in range(first + 1, last):
            distance = _perp_distance_km(coords[i], coords[first], coords[last], lat0)
            if distance > max_distance:
                max_distance = distance
                index = i
        if index is not None and max_distance > tolerance_km:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))
    return [point for point, selected in zip(coords, keep) if selected]


def max_deviation_from_straight_km(coords, start_lonlat, end_lonlat):
    """Máxima desviación de cualquier punto intermedio respecto al segmento recto DGT (km)."""
    if len(coords) <= 2:
        return 0.0
    lat0 = (start_lonlat[1] + end_lonlat[1]) / 2.0
    a = (start_lonlat[1], start_lonlat[0])  # (lat, lon)
    b = (end_lonlat[1], end_lonlat[0])
    max_dev = 0.0
    for p in coords[1:-1]:
        dev = _perp_distance_km((p[1], p[0]), a, b, lat0)
        if dev > max_dev:
            max_dev = dev
    return max_dev


def path_length_ratio(path, start_lonlat, end_lonlat):
    """Cuánto más largo es el trazado que la recta entre los extremos DGT.

    La recta DGT no es la carretera real, solo sus dos extremos: una vía curva
    puede apartarse varios km de esa recta y seguir siendo correcta. Lo que sí
    delata un salto a un trozo de vía lejano es un rodeo desproporcionado.
    """
    if not path or len(path) < 2:
        return float("inf")
    recta = haversine_km(
        (start_lonlat[1], start_lonlat[0]), (end_lonlat[1], end_lonlat[0])
    )
    if recta <= 0:
        return float("inf")
    curva = sum(
        haversine_km((a[1], a[0]), (b[1], b[0])) for a, b in zip(path, path[1:])
    )
    return curva / recta


def is_plausible_trace(path, start_lonlat, end_lonlat, max_ratio=2.0):
    """Acepta el trazado OSM salvo que rodee demasiado respecto a la recta DGT."""
    return path_length_ratio(path, start_lonlat, end_lonlat) <= max_ratio
