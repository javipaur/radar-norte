"""Tests del histórico persistente de localizaciones de radares móviles."""
import unittest

from moviles_historicos import MOVILES_HISTORICOS, historical_mobile_features

from common import merge_preserved_features


class MovilesHistoricosTests(unittest.TestCase):
    def test_la_semilla_incluye_el_cruce_de_uharte_arakil(self):
        punto = next(
            p for p in MOVILES_HISTORICOS if p["id"] == "movil-historico-uharte-arakil"
        )

        self.assertEqual(punto["geometry"]["type"], "Point")
        # Extremo norte del tramo DGT NA-2410 (cruce de Uharte Arakil).
        self.assertEqual(punto["geometry"]["coordinates"], [-1.82876, 42.91911])
        props = punto["properties"]
        self.assertEqual(props["source"], "historico_movil")
        self.assertEqual(props["kind"], "mobile_recurring")
        self.assertTrue(props["historical"])
        self.assertEqual(props["road"], "NA-2410")
        self.assertIn("v0.1.0", props["historical_note"])

    def test_las_semillas_son_features_geojson_validas(self):
        features = historical_mobile_features()
        self.assertTrue(features)
        for feature in features:
            self.assertEqual(feature["type"], "Feature")
            self.assertTrue(feature.get("id"))
            self.assertEqual(feature["geometry"]["type"], "Point")
            lon, lat = feature["geometry"]["coordinates"]
            self.assertTrue(-180 <= lon <= 180 and -90 <= lat <= 90)

    def test_una_actualizacion_no_borra_la_semilla(self):
        feed = [
            {"type": "Feature", "id": "otro", "geometry": None, "properties": {"source": "dgt"}}
        ]
        resultado = merge_preserved_features(feed, historical_mobile_features())

        ids = {f.get("id") for f in resultado}
        self.assertIn("movil-historico-uharte-arakil", ids)
        conservada = next(
            f for f in resultado if f["id"] == "movil-historico-uharte-arakil"
        )
        self.assertTrue(conservada["properties"]["historical"])


if __name__ == "__main__":
    unittest.main()
