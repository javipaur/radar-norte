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
    def test_public_navarra_coincide_con_csv_oficial(self):
        """Integración: falla si el GeoJSON servido está desactualizado."""
        import urllib.request

        try:
            with urllib.request.urlopen(common.NAVARRA_CSV_URL, timeout=30) as resp:
                remote = resp.read().decode("utf-8", errors="replace")
        except Exception as exc:  # pragma: no cover - depende de la red
            self.skipTest(f"sin red: {exc}")

        try:
            from pyproj import Transformer

            transformer = Transformer.from_crs(
                "EPSG:25830", "EPSG:4326", always_xy=True
            ).transform
        except ImportError:  # pragma: no cover - depende del entorno
            self.skipTest("pyproj no disponible")

        def keys(features):
            return {
                (
                    f["properties"]["title"],
                    f["properties"]["road"],
                    f["properties"]["pk"],
                    f["properties"]["date"],
                )
                for f in features
            }

        remote_keys = keys(common.parse_navarra_csv(remote, transformer))
        local = json.loads(
            (common.PUBLIC_DIR / "incidencias-navarra.geojson").read_text(encoding="utf-8")
        )
        self.assertEqual(
            keys(local["features"]),
            remote_keys,
            "el GeoJSON servido no coincide con el CSV oficial (datos desactualizados)",
        )


if __name__ == "__main__":
    unittest.main()
