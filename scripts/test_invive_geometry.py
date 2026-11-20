"""Tests del trazado de los tramos INVIVE sobre la carretera real (OSM)."""
import unittest

from invive_geometry import (
    _perp_distance_km,
    build_road_graph,
    connect_nearby_components,
    is_plausible_trace,
    path_length_km,
    simplify_path,
    trace_road_path,
)


def way(points):
    """Puntos [lon, lat] -> way de Overpass."""
    return {"geometry": [{"lon": lon, "lat": lat} for lon, lat in points]}


class LengthTests(unittest.TestCase):
    def test_path_length_km_suma_todos_los_tramos(self):
        # 1º de latitud son ~111 km; dos tramos de medio grado dan ~111 km.
        coords = [[-2.0, 42.0], [-2.0, 42.5], [-2.0, 43.0]]
        self.assertAlmostEqual(path_length_km(coords), 111.19, delta=0.5)

    def test_path_length_km_ignora_un_solo_punto(self):
        self.assertEqual(path_length_km([[-2.0, 42.0]]), 0.0)


class TraceRoadPathTests(unittest.TestCase):
    def test_sigue_la_caracteristica_y_no_corta_en_recta(self):
        # Carretera en L: de (42.0, -2.0) va al este y luego al norte.
        ways = [way([[-2.0, 42.0], [-1.9, 42.0], [-1.9, 42.1]])]
        graph = build_road_graph(ways)
        path = trace_road_path(graph, [-2.0, 42.0], [-1.9, 42.1])

        self.assertIsNotNone(path)
        self.assertEqual(path[0], [-2.0, 42.0], "el inicio debe ser el punto DGT exacto")
        self.assertEqual(path[-1], [-1.9, 42.1], "el fin debe ser el punto DGT exacto")
        self.assertIn([-1.9, 42.0], path, "debe pasar por el codo de la carretera")

    def test_sin_camino_devuelve_none(self):
        graph = build_road_graph([way([[-2.0, 42.0], [-1.9, 42.0]])])
        self.assertIsNone(trace_road_path(graph, [-2.0, 42.0], [-1.0, 43.0]))

    def test_no_salta_a_otra_via_si_estan_desconectadas(self):
        ways = [
            way([[-2.0, 42.0], [-1.9, 42.0]]),
            way([[-1.9, 42.0], [-1.9, 42.1]]),
        ]
        graph = build_road_graph(ways)
        path = trace_road_path(graph, [-2.0, 42.0], [-1.9, 42.1])
        self.assertIsNotNone(path, "dos ways que comparten nodo forman un camino")
        self.assertIn([-1.9, 42.0], path)

    def test_esquiva_un_componente_aislado_cerca_del_extremo(self):
        """Caso real de la NA-2410: un trozo suelto está más cerca del extremo.

        El nodo más cercano pertenece a un componente de 14 nodos sin salida;
        el nodo correcto de la carretera está unos metros más lejos. El trazado
        debe probar varios candidatos de snap en vez de quedarse en el primero.
        """
        ways = [
            way([[-2.0, 42.0], [-1.9, 42.0], [-1.9, 42.1]]),
            way([[-2.00004, 42.00004], [-2.00003, 42.00003]]),  # trozo aislado
        ]
        graph = build_road_graph(ways)
        path = trace_road_path(graph, [-2.00005, 42.00005], [-1.9, 42.1])

        self.assertIsNotNone(path, "no debe rendirse por el componente suelto")
        self.assertIn([-1.9, 42.0], path, "debe seguir la carretera real")

    def test_un_trozo_suelto_largo_no_oculta_el_componente_conectado(self):
        """Como la NA-2410: 20 nodos sueltos delante del nodo de la vía real."""
        sueltos = [[-2.005 + i * 0.00005, 42.0] for i in range(1, 21)]
        ways = [
            way([[-2.0, 42.0], [-1.9, 42.0], [-1.9, 42.1]]),
            way(sueltos),
        ]
        graph = build_road_graph(ways)
        path = trace_road_path(graph, [-2.005, 42.0], [-1.9, 42.1])

        self.assertIsNotNone(path)
        self.assertIn([-1.9, 42.0], path)

    def test_un_snap_amplio_no_devuelve_un_tramo_de_un_solo_punto(self):
        """Si ambos extremos caen en el mismo nodo, no se inventa una línea."""
        ways = [way([[-2.0, 42.0], [-1.99, 42.0]])]
        graph = build_road_graph(ways)
        path = trace_road_path(graph, [-2.0, 42.0], [-2.00001, 42.00001], max_snap_km=5.0)
        self.assertTrue(path is None or len(path) >= 2, "nunca un único punto")

    def test_acepta_un_extremo_a_varios_km_si_la_via_sigue_cerca(self):
        """Caso real: N-123a/NA-132B tienen un extremo a 3-4 km de la vía."""
        graph = build_road_graph([way([[-2.0, 42.0], [-1.8, 42.0]])])
        start, end = [-2.0, 41.967], [-1.8, 42.0]

        self.assertIsNone(trace_road_path(graph, start, end, max_snap_km=2.0))
        path = trace_road_path(graph, start, end, max_snap_km=5.0)
        self.assertIsNotNone(path, "con un snap mayor se aprovecha casi toda la vía")
        self.assertEqual(path[0], start, "el extremo DGT no se sustituye por el nodo OSM")
        self.assertTrue(is_plausible_trace(path, start, end, max_ratio=3.5))


class BridgeComponentsTests(unittest.TestCase):
    """Los trozos sueltos de un mismo `ref` deben unirse si el hueco es corto."""

    def test_puentea_un_hueco_corto_entre_componentes(self):
        ways = [
            way([[-2.0, 42.0], [-1.99, 42.0]]),
            way([[-1.989, 42.0], [-1.98, 42.0]]),  # hueco de ~0,08 km
        ]
        graph = build_road_graph(ways)
        self.assertIsNone(
            trace_road_path(graph, [-2.0, 42.0], [-1.98, 42.0], max_snap_km=0.01),
            "sin puente los dos trozos están desconectados",
        )

        bridged = connect_nearby_components(graph, max_gap_km=0.1)
        path = trace_road_path(bridged, [-2.0, 42.0], [-1.98, 42.0], max_snap_km=0.01)
        self.assertIsNotNone(path, "el puente permite seguir la carretera")
        self.assertIn([-1.99, 42.0], path)
        self.assertIn([-1.989, 42.0], path)

    def test_no_puentea_un_hueco_grande(self):
        ways = [
            way([[-2.0, 42.0], [-1.99, 42.0]]),
            way([[-1.5, 42.0], [-1.49, 42.0]]),  # hueco de ~40 km
        ]
        bridged = connect_nearby_components(build_road_graph(ways), max_gap_km=0.5)
        self.assertIsNone(trace_road_path(bridged, [-2.0, 42.0], [-1.49, 42.0]))

    def test_no_modifica_el_grafo_original(self):
        ways = [
            way([[-2.0, 42.0], [-1.99, 42.0]]),
            way([[-1.989, 42.0], [-1.98, 42.0]]),
        ]
        graph = build_road_graph(ways)
        antes = {key: list(value) for key, value in graph["adj"].items()}
        connect_nearby_components(graph, max_gap_km=0.1)
        self.assertEqual(graph["adj"], antes, "puentea una copia, no el original")

    def test_no_crea_atajos_dentro_del_mismo_componente(self):
        """NA-2410: puentear nodos ya conectados recorta curvas y sale de la vía.

        Una curva cerrada tiene nodos no consecutivos a menos de `max_gap_km`,
        pero están unidos por la carretera. Crear una arista directa entre ellos
        permite a Dijkstra saltarse el codo. El puente solo debe unir componentes
        distintos (trozos sueltos de la misma ref).
        """
        # Carretera en U: los extremos de la horquilla están a ~0,05 km, pero
        # entre ellos hay 0,4 km de carretera (el recodo).
        ways = [way([
            [-2.0, 42.0], [-2.001, 42.0005], [-2.001, 42.0], [-2.0, 42.0005],
        ])]
        graph = build_road_graph(ways)
        bridged = connect_nearby_components(graph, max_gap_km=0.1)

        original_edges = sum(len(v) for v in graph["adj"].values()) // 2
        bridged_edges = sum(len(v) for v in bridged["adj"].values()) // 2
        self.assertEqual(
            bridged_edges, original_edges,
            "no deben añadirse aristas entre nodos del mismo componente",
        )

    def test_dijkstra_no_recorta_el_codo_tras_puentear(self):
        """Con el fallback arreglado, la ruta sigue la carretera, no el atajo."""
        ways = [way([
            [-2.0, 42.0], [-2.001, 42.0005], [-2.001, 42.0], [-2.0, 42.0005],
        ])]
        bridged = connect_nearby_components(build_road_graph(ways), max_gap_km=0.1)
        path = trace_road_path(bridged, [-2.0, 42.0], [-2.0, 42.0005])

        self.assertIsNotNone(path)
        self.assertIn([-2.001, 42.0], path, "debe pasar por el fondo de la U")
        self.assertIn([-2.001, 42.0005], path, "debe pasar por la curva")


class PlausibleTraceTests(unittest.TestCase):
    """Una carretera real NO es una recta: hay que medir el rodeo, no el desvío."""

    def test_acepta_carretera_curva_cerca_de_la_recta_dgt(self):
        # Caso NA-2410: la vía se aparta 2-3 km de la recta de los extremos,
        # pero recorre casi la misma distancia (ratio ~1.1).
        start, end = [-2.0, 42.0], [-1.9, 42.0]
        path = [start, [-1.95, 42.03], end]
        self.assertTrue(is_plausible_trace(path, start, end))

    def test_rechaza_un_salto_a_un_troz_lejano(self):
        start, end = [-2.0, 42.0], [-1.9, 42.0]
        path = [start, [-2.0, 43.0], end]  # sube 111 km y vuelve
        self.assertFalse(is_plausible_trace(path, start, end))

    def test_recta_simple_es_plausible(self):
        start, end = [-2.0, 42.0], [-1.9, 42.0]
        self.assertTrue(is_plausible_trace([start, end], start, end))

    def test_tolerancia_3_5_no_rechaza_curvas_reales_ya_trazadas(self):
        """NA-2310 tiene ratio 2,98: un corte a 2,0 sería una regresión."""
        start, end = [-2.0, 42.0], [-1.9, 42.0]
        # Sube 5,5 km, cruza y baja: ~19,4 km de vía para 8,3 km en recta (2,3x).
        path = [start, [-2.0, 42.05], [-1.9, 42.05], end]
        self.assertFalse(is_plausible_trace(path, start, end, max_ratio=2.0))
        self.assertTrue(is_plausible_trace(path, start, end, max_ratio=3.5))


class SimplifyPathTests(unittest.TestCase):
    def test_reduce_puntos_pero_conserva_extremos(self):
        coords = [[-2.0 + i / 1000, 42.0] for i in range(101)]
        simple = simplify_path(coords, tolerance_km=0.02)
        self.assertLess(len(simple), len(coords))
        self.assertEqual(simple[0], coords[0])
        self.assertEqual(simple[-1], coords[-1])

    def test_la_simplificacion_no_se_aparta_mas_de_la_tolerancia(self):
        """Máxima precisión: ningún punto original queda lejos de la línea dibujada."""
        coords = [
            [-2.0, 42.0],
            [-2.0, 42.00015],
            [-2.0, 42.00030],  # curva de 15 m que no debe recortarse
            [-1.999, 42.00045],
            [-1.998, 42.00045],
        ]
        tolerance = 0.01
        simple = simplify_path(coords, tolerance)
        lat0 = sum(p[1] for p in coords) / len(coords)
        for point in coords[1:-1]:
            closest = min(
                _perp_distance_km(
                    (point[1], point[0]),
                    (a[1], a[0]),
                    (b[1], b[0]),
                    lat0,
                )
                for a, b in zip(simple, simple[1:])
            )
            self.assertLessEqual(closest, tolerance + 1e-6)

    def test_la_tolerancia_de_produccion_es_de_10_metros(self):
        import importlib.util
        from pathlib import Path

        ruta = Path(__file__).resolve().parent / "fetch-invive-geometry.py"
        spec = importlib.util.spec_from_file_location("fetch_invive_geometry", ruta)
        modulo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modulo)

        self.assertLessEqual(
            modulo.SIMPLIFY_KM,
            0.01,
            "el tramo NA-2410 debe dibujarse con precisión de ~10 m",
        )


if __name__ == "__main__":
    unittest.main()
