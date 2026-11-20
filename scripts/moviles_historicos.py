#!/usr/bin/env python3
"""Localizaciones de radares móviles que deben sobrevivir a cualquier actualización.

El feed de "Radares Anunciados" publica tramos INVIVE (solo los dos extremos) y
puede retirar o mover puntos sin previo aviso. Esta semilla guarda las zonas
donde se ha visto un radar móvil —aunque no estén certificadas— para que una
actualización del servicio no borre una localización que ya tuvimos.

Cada entrada es un Feature de Point. `source=historico_movil` y
`kind=mobile_recurring` hacen que la app lo pinte como Móvil (no como Fijo).
Se integra en `fetch-radares.py` con `merge_preserved_features`, que ya conserva
todo lo que desaparece del feed actual.
"""

# Extremo norte del tramo DGT NA-2410 km 0-36.72: cruce de Uharte Arakil,
# donde la v0.1.0 mostraba un punto de radar móvil (el usuario lo verificó en
# el mapa). Se conserva como "posible / no certificado", no como dato oficial.
MOVILES_HISTORICOS = [
    {
        "type": "Feature",
        "id": "movil-historico-uharte-arakil",
        "geometry": {"type": "Point", "coordinates": [-1.82876, 42.91911]},
        "properties": {
            "name": "Radar móvil posible · Uharte Arakil (NA-2410)",
            "source": "historico_movil",
            "kind": "mobile_recurring",
            "road": "NA-2410",
            "km": 0.0,
            "province": "31",
            "active": False,
            "certified": False,
            "historical": True,
            "first_seen": "v0.1.0",
            "historical_note": (
                "Zona de radar móvil vista en v0.1.0 en el cruce de Uharte Arakil; "
                "conservada aunque el servicio ya no publique esa localización. "
                "No certificada: puede que el radar no esté presente ahora."
            ),
            "attribution": (
                "Localización histórica de Radar Norte; extremo del tramo INVIVE de la "
                "DGT (CC BY 4.0); carretera: © OpenStreetMap contributors (ODbL 1.0)"
            ),
            "url": "https://nap.dgt.es/datex2/dgt/PredefinedLocationsPublication/tramos_invive/content.xml",
        },
    },
]


def historical_mobile_features():
    """Copia las semillas para que nadie pueda mutar el módulo en caliente."""
    import json

    return json.loads(json.dumps(MOVILES_HISTORICOS, ensure_ascii=False))
