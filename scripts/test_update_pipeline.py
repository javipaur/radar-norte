"""Tests del pipeline de actualización de datos (TDD)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402


CSV_HEADER = (
    "Ultima_actualizacion,Titulo,Ubicacion,Fecha_incidencia,Gravedad,Afeccion,"
    "Categoria,Tipo,Otros_datos,Coord_X_en_EPSG_25830,Coord_Y_en_EPSG_25830,Carretera,PK"
)

CSV_FIXTURE = CSV_HEADER + """
"19 Nov 2026 10:19","Carril izquierdo cortado","A-10 - IRURTZUN PK 2","19 Nov 2026","Leve","Corte de carril izquierdo","Obras","Trabajos de mantenimiento","Corte de carril izquierdo entre los PK 2 y 0, sentido Irurtzun, por limpieza de mediana","612345","4700000","A-10","2"
"16 Nov 2026 08:00","Reposición de bionda","A-10 - IRURTZUN PK 8","16 Nov 2026","Leve","Corte de carril derecho","Obras","Reposición de bionda","Corte de carril derecho","612400","4700100","A-10","8"
"""


class ParseNavarraTests(unittest.TestCase):
    def test_extrae_todos_los_campos_y_no_descarta_incidencias(self):
        transformer = lambda x, y: (-1.6 + x / 1_000_000, 42.8 + y / 1_000_000)
        features = common.parse_navarra_csv(CSV_FIXTURE, transformer)

        self.assertEqual(len(features), 2)
        new = next(f for f in features if f["properties"]["pk"] == "2")
        self.assertEqual(new["properties"]["date"], "19 Nov 2026")
        self.assertEqual(new["properties"]["title"], "Carril izquierdo cortado")
        self.assertEqual(new["properties"]["type"], "Trabajos de mantenimiento")
        self.assertEqual(new["properties"]["road"], "A-10")
        self.assertIn("limpieza de mediana", new["properties"]["details"])
        self.assertEqual(new["geometry"]["type"], "Point")
        self.assertTrue(new.get("id"), "cada incidencia necesita un id estable")

    def test_id_no_cambia_si_solo_cambia_la_ultima_actualizacion(self):
        transformer = lambda x, y: (-1.6 + x / 1_000_000, 42.8 + y / 1_000_000)
        actualizado = CSV_FIXTURE.replace("19 Nov 2026 10:19", "19 Nov 2026 12:45")
        original = common.parse_navarra_csv(CSV_FIXTURE, transformer)
        posterior = common.parse_navarra_csv(actualizado, transformer)

        self.assertEqual(original[0]["id"], posterior[0]["id"])
        self.assertEqual(len(posterior), len(original), "no debe duplicar por el cambio de fecha")

    def test_id_desde_propiedades_coincide_con_el_del_csv(self):
        transformer = lambda x, y: (-1.6 + x / 1_000_000, 42.8 + y / 1_000_000)
        feature = common.parse_navarra_csv(CSV_FIXTURE, transformer)[0]
        p = feature["properties"]
        self.assertEqual(
            feature["id"],
            common.navarra_id(p["title"], p["location"], p["date"], p["road"], p["pk"], p["type"]),
        )

    def test_no_borra_una_incidencia_retirada_del_csv(self):
        anterior = [{"type": "Feature", "id": "navarra-1", "geometry": None, "properties": {"source": "navarra"}}]
        nuevo = [{"type": "Feature", "id": "navarra-2", "geometry": None, "properties": {"source": "navarra"}}]
        resultado = common.merge_preserved_features(nuevo, anterior)
        self.assertEqual({f["id"] for f in resultado}, {"navarra-1", "navarra-2"})


class ValidateTests(unittest.TestCase):
    def test_rechaza_coleccion_vacia(self):
        with self.assertRaises(ValueError):
            common.validate_collection(
                {"type": "FeatureCollection", "features": []}, "prueba"
            )

    def test_rechaza_json_que_no_es_featurecollection(self):
        with self.assertRaises(ValueError):
            common.validate_collection({"hello": "world"}, "prueba")

    def test_acepta_coleccion_con_datos(self):
        common.validate_collection(
            {"type": "FeatureCollection", "features": [{"type": "Feature"}]}, "prueba"
        )


class SyncTests(unittest.TestCase):
    def test_copia_todos_los_geojson_a_public(self):
        valid = '{"type":"FeatureCollection","features":[{"type":"Feature"}]}'
        with tempfile.TemporaryDirectory() as tmp:
            processed = Path(tmp) / "processed"
            public = Path(tmp) / "public"
            processed.mkdir()
            (processed / "a.geojson").write_text(valid, encoding="utf-8")
            (processed / "b.geojson").write_text(valid, encoding="utf-8")
            (processed / "status.json").write_text("{}", encoding="utf-8")

            copied = common.sync_processed_to_public(processed, public)

            self.assertEqual(len(copied), 2)
            self.assertEqual((public / "a.geojson").read_text(encoding="utf-8"), valid)
            self.assertFalse((public / "status.json").exists())

    def test_no_publica_un_geojson_vacio(self):
        with tempfile.TemporaryDirectory() as tmp:
            processed = Path(tmp) / "processed"
            public = Path(tmp) / "public"
            processed.mkdir()
            (processed / "vacio.geojson").write_text(
                '{"type":"FeatureCollection","features":[]}', encoding="utf-8"
            )
            with self.assertRaises(ValueError):
                common.sync_processed_to_public(processed, public)
            self.assertFalse((public / "vacio.geojson").exists())


class FreshnessTests(unittest.TestCase):
    """El GeoJSON servido debe conservar TODAS las localizaciones, nunca borrarlas."""

    @staticmethod
    def _keys(features):
        return {
            (
                f["properties"]["title"],
                f["properties"]["road"],
                f["properties"]["pk"],
                f["properties"]["date"],
            )
            for f in features
        }

    def test_public_navarra_incluye_todas_las_del_csv_local(self):
        """Falla si falta una localización; admite elementos extra (posibles).

        Se compara con el CSV crudo guardado, no con la red: una fuente que
        retira un aviso no debe borrar una localización que ya teníamos.
        """
        try:
            from pyproj import Transformer

            transformer = Transformer.from_crs(
                "EPSG:25830", "EPSG:4326", always_xy=True
            ).transform
        except ImportError:  # pragma: no cover - depende del entorno
            self.skipTest("pyproj no disponible")

        csv = (common.RAW_DIR / "incidencias-navarra.csv").read_text(encoding="utf-8")
        csv_keys = self._keys(common.parse_navarra_csv(csv, transformer))
        local = json.loads(
            (common.PUBLIC_DIR / "incidencias-navarra.geojson").read_text(encoding="utf-8")
        )
        missing = csv_keys - self._keys(local["features"])
        self.assertFalse(
            missing,
            f"faltan localizaciones del CSV en el GeoJSON servido: {sorted(missing)}",
        )

    def test_copias_processed_y_public_coinciden(self):
        """data/processed y public/data/processed deben tener los mismos elementos."""
        for name in (
            "incidencias-navarra.geojson",
            "incidencias-euskadi.geojson",
            "radares-pais-vasco-navarra-aragon.geojson",
            "radares-vitoria-ayto.geojson",
            "radares-vitoria-moviles-ayto.geojson",
            "radares-vitoria-fotorrojo.geojson",
        ):
            processed = json.loads((common.PROCESSED_DIR / name).read_text(encoding="utf-8"))
            public = json.loads((common.PUBLIC_DIR / name).read_text(encoding="utf-8"))
            serializado = lambda data: {
                json.dumps(f, sort_keys=True, ensure_ascii=False) for f in data["features"]
            }
            self.assertEqual(
                serializado(processed),
                serializado(public),
                f"las copias de {name} no coinciden",
            )


class RadarFeedTests(unittest.TestCase):
    """Una fuente que retira un aviso no debe borrar una localización guardada."""

    def test_el_mensaje_de_alerta_se_puede_imprimir_en_windows(self):
        # cp1252 (consola de Windows) no puede codificar el emoji ⚠️ y hacía
        # fallar el pipeline justo cuando más falta hacía el aviso.
        import importlib.util

        ruta = Path(__file__).resolve().parent / "fetch-radares.py"
        spec = importlib.util.spec_from_file_location("fetch_radares", ruta)
        fetch_radares = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fetch_radares)

        mensaje = fetch_radares.mensaje_alerta_perdida(12, 30)
        mensaje.encode("cp1252")
        self.assertIn("12", mensaje)
        self.assertIn("30", mensaje)

    def test_no_pierde_la_nota_de_una_zona_movil_historica(self):
        # La semilla de Uharte Arakil explica por qué se conserva; el merge
        # genérico no debe sobrescribir esa explicación con un texto genérico.
        historica = {
            "type": "Feature",
            "id": "movil-historico-uharte-arakil",
            "geometry": {"type": "Point", "coordinates": [-1.82876, 42.91911]},
            "properties": {
                "source": "historico_movil",
                "historical": True,
                "historical_note": "Vista en v0.1.0 en el cruce de Uharte Arakil",
            },
        }
        resultado = common.merge_preserved_features([], [historica])

        self.assertEqual(len(resultado), 1)
        self.assertEqual(
            resultado[0]["properties"]["historical_note"],
            "Vista en v0.1.0 en el cruce de Uharte Arakil",
        )
        self.assertTrue(resultado[0]["properties"]["historical"])

    def test_no_borra_localizaciones_del_feed_anterior(self):
        merge_preserved_features = common.merge_preserved_features

        anterior = [
            {"type": "Feature", "id": "A", "geometry": None, "properties": {"source": "dgt"}},
            {"type": "Feature", "id": "B", "geometry": None, "properties": {"source": "osm"}},
        ]
        nuevo = [
            {"type": "Feature", "id": "A", "geometry": None, "properties": {"source": "dgt", "name": "actualizado"}}
        ]
        resultado = merge_preserved_features(nuevo, anterior)
        ids = {f.get("id") for f in resultado}

        self.assertEqual(len(resultado), 2)
        self.assertIn("A", ids)
        self.assertIn("B", ids, "la localización B no debe desaparecer")
        self.assertEqual(resultado[0]["properties"]["name"], "actualizado")

    def test_no_duplica_features_presentes_en_ambas_fuentes(self):
        merge_preserved_features = common.merge_preserved_features

        feature = {"type": "Feature", "id": "A", "geometry": None, "properties": {"source": "dgt"}}
        resultado = merge_preserved_features([feature], [feature])
        self.assertEqual(len(resultado), 1)


if __name__ == "__main__":
    unittest.main()
