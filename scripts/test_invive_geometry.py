"""Tests del trazado de los tramos INVIVE sobre la carretera real (OSM)."""
import unittest

from invive_geometry import (
    build_road_graph,
    is_plausible_trace,
    simplify_path,
    trace_road_path,
)


def way(points):
    """Puntos [lon, lat] -> way de Overpass."""
    return {"geometry": [{"lon": lon, "lat": lat} for lon, lat in points]}


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


class SimplifyPathTests(unittest.TestCase):
    def test_reduce_puntos_pero_conserva_extremos(self):
        coords = [[-2.0 + i / 1000, 42.0] for i in range(101)]
        simple = simplify_path(coords, tolerance_km=0.02)
        self.assertLess(len(simple), len(coords))
        self.assertEqual(simple[0], coords[0])
        self.assertEqual(simple[-1], coords[-1])


if __name__ == "__main__":
    unittest.main()
