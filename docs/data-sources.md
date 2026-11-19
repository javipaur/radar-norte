# Fuentes de datos — Radar Norte

## Pipeline (resumen)
- Orquestador: `python scripts/update_all.py` (o `npm run update-data`). Descarga/actualiza todas las fuentes, valida GeoJSON y publica en `data/processed/` y `public/data/processed/`. Genera `public/data/processed/last-update.json`.
- Conservación histórica: el feed principal hace *merge* acumulando `data/history/*/processed/radares-pais-vasco-navarra-aragon.geojson` y marca como `historical: true` lo preservado. Se recomienda guardar snapshots en `data/history/` antes de cambios grandes (script `scripts/snapshot-history.py`).

## Radares

### Radares Anunciados (feed principal)
- URL feed: https://geiserx.github.io/radares-anunciados-ha/feed.geojson
- URL status: https://geiserx.github.io/radares-anunciados-ha/status.json
- Script: `scripts/fetch-radares.py`
- Formato: GeoJSON
- Licencia: ODbL 1.0 (incluye OSM). Datos públicos bajo Ley 37/2007 (citar fuente, no alterar). DGT también CC BY 4.0 según origen.

Fuentes incluidas en el feed (relevantes): `dgt`, `dgt_invive`, `euskadi`, `navarra`, `donostia`, `osm`, `osm_notes`, `madrid`, `salamanca`, etc.

### DGT (NAP)
- Radares fijos (referencia): https://nap.dgt.es/datex2/dgt/PredefinedLocationsPublication/radares/content.xml (DATEX II), CC BY 4.0. No cubre PV/Cataluña en el conjunto general.

### Vitoria-Gasteiz (GeoVitoria, manual/descargado vía script)
- Script descarga raw: `scripts/fetch-vitoria.py` (reintentos; si falla se conserva raw anterior). Procesado: `scripts/process-vitoria-ayto.py`, `scripts/process-vitoria-extra.py`.
- Salidas: `radares-vitoria-ayto.geojson`, `radares-vitoria-moviles-ayto.geojson`, `radares-vitoria-fotorrojo.geojson`.
- Fuente: Ayuntamiento de Vitoria-Gasteiz (visor GeoVitoria). Datos públicos municipales según condiciones del portal.

## Incidencias (integradas)
| Región | Fuente / script | Salida | Notas |
|--------|------------------|--------|-------|
| Navarra | `scripts/fetch-incidencias-navarra.py` (CSV datosabiertos.navarra.es, UTM 25830→WGS84 con pyproj) | `incidencias-navarra.geojson` | CSV oficial de incidencias de carreteras. |
| País Vasco (Euskadi) | `scripts/fetch-incidencias-euskadi.py` (API Open Data Euskadi por fecha) | `incidencias-euskadi.geojson` | `https://api.euskadi.eus/traffic/v1.0/incidences/byDate/YYYY/MM/DD` |
| Aragón | Pendiente | — | VISINCAR/GA_OD_Core no integrado aún. |

## Notas sobre radares móviles
- No existe fuente oficial pública en tiempo real de la posición de radares móviles en circulación.
- **INVIVE** (`dgt_invive`) son tramos/zonas de vigilancia intensificada anunciadas (DGT). La app los muestra como tramos y también como punto medio para visibilidad.
- Puntos **OSM** (`osm`/`osm_notes`) pueden ser reportes de mapeadores, **no verificados**.
- Los datos de Vitoria (Ayto.) son ubicaciones anunciadas descargadas del visor; pueden cambiar.
- Mostrar siempre disclaimers informativos en la app.