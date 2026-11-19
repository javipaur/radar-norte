# Fuentes de datos — Radar Norte

## Radares

### Radares Anunciados (feed principal)
- URL feed: https://geiserx.github.io/radares-anunciados-ha/feed.geojson
- URL status: https://geiserx.github.io/radares-anunciados-ha/status.json
- Formato: GeoJSON
- Actualización: cada 6 horas
- Licencia: ODbL 1.0 (incluye datos OSM). Datos de organismos públicos bajo Ley 37/2007.

Fuentes incluidas en el feed (relevantes): `dgt`, `dgt_invive`, `euskadi`, `navarra`, `donostia`, `osm`, `osm_notes`, `madrid`, `salamanca`, `murcia`, `leon`, `barcelona_multas`, `madrid_multas`.

### DGT (NAP)
- Radares fijos: https://nap.dgt.es/datex2/dgt/PredefinedLocationsPublication/radares/content.xml (DATEX II)
- Licencia: CC BY 4.0
- Nota: no incluye País Vasco ni Cataluña en el dataset general.

## Incidencias (pendiente de integrar)

| Región | URL | Formato | Notas |
|--------|-----|---------|-------|
| Navarra | https://datosabiertos.navarra.es (dataset "Información sobre el estado de las carreteras") | CSV/JSON/XML, API CKAN | Cada 15 min, coords EPSG:25830 |
| País Vasco | https://api.euskadi.eus/traffic/v1.0/incidences/byDate/{y}/{m}/{d} | JSON/XML | Tiempo real, WGS84 |
| Aragón | https://idearagon.aragon.es/visincar/ y GA_OD_Core | JSON | Tiempo real |

## Notas sobre radares móviles

- No existe fuente oficial en tiempo real de posición de radares móviles.
- Los **tramos INVIVE** (`dgt_invive`) indican zonas de vigilancia intensificada (oficial, DGT).
- Los puntos `osm` con `highway=speed_camera` pueden ser radares móviles reportados por mapeadores, pero no están verificados.
- Se debe mostrar siempre un disclaimer informativo.