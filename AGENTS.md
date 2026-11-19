# AGENTS.md — Radar Norte (memoria del proyecto)

## Propósito
Aplicación web (React + Vite + Leaflet) para avisar/mostrar radares e incidencias de tráfico en **País Vasco, Navarra y Aragón**. Enfoque inicial: mapa + alertas por voz (Web Speech API) con geolocalización. No es un servicio oficial.

## Stack
- **Frontend**: React 19, Vite 8, react-leaflet + Leaflet
- **Datos**: GeoJSON estáticos descargados por scripts Python (en `scripts/`)
- **Sin backend** en esta fase (todo estático en `public/data/processed/`)

## Estructura (raíz)
```
radar-norte/
├── index.html
├── package.json, vite.config.js
├── src/                # App React (App.jsx, App.css, main.jsx, index.css)
├── public/
│   └── data/processed/ # GeoJSON servidos por Vite (radares, incidencias)
├── scripts/
│   ├── common.py                  # Validación GeoJSON, CSV Navarra y publicación en public/
│   ├── update_all.py              # Orquestador: descarga + procesa + publica TODO
│   ├── fetch-radares.py           # Descarga feed Radares Anunciados y filtra PV/NV/AR
│   ├── fetch-incidencias-navarra.py
│   ├── fetch-incidencias-euskadi.py
│   └── fetch-vitoria.py           # Descarga 3 capas de GeoVitoria con reintentos
├── data/               # raw/ y processed/ (copias/descargas locales)
├── docs/
└── README.md, AGENTS.md
```

## Fuentes de datos
- **Radares (principal)**: Feed "Radares Anunciados" (GeoJSON) https://geiserx.github.io/radares-anunciados-ha/feed.geojson (ODbL 1.0). Incluye DGT, Euskadi, Navarra, OSM, INVIVE (`dgt_invive` = tramos de vigilancia intensificada), etc.
- **Incidencias Navarra**: API/CSV datosabiertos.navarra.es (convertido a GeoJSON WGS84 con `pyproj`).
- **Incidencias Euskadi**: API Open Data Euskadi `https://api.euskadi.eus/traffic/v1.0/incidences/byDate/YYYY/MM/DD` (JSON→GeoJSON).
- **Vitoria-Gasteiz (GeoVitoria)**: 3 capas (radares ayto., móviles y foto-rojo) descargadas automáticamente por `fetch-vitoria.py`. Si una falla, se conserva el raw anterior.
- **Aragón**: pendiente de integrar (VISINCAR/GA_OD_Core no trivial).

## Actualizar datos (ejecutar desde raíz)
```bash
npm run update-data   # = python scripts/update_all.py
npm test              # 8 tests JS + 7 tests Python
```
- El orquestador descarga todas las fuentes, valida los GeoJSON y **publica siempre en `public/data/processed/`** (además de `data/processed/`). Escribe `last-update.json` y `status.json`.
- Requiere `pyproj` para la conversión de coordenadas de Navarra (`python -m pip install pyproj`).
- Los scripts individuales también publican en `public/`: `fetch-radares.py`, `fetch-incidencias-navarra.py`, `fetch-incidencias-euskadi.py`, `fetch-vitoria.py`, `process-vitoria-ayto.py`, `process-vitoria-extra.py`.
- **Ya no hay copia manual**: esa tarea está resuelta (antes estaba en "ideas pendientes").

## Cómo ejecutar (desarrollo)
```bash
cd C:\ProyectosGit\radar-norte
npm install
npm run dev
```
Abre http://localhost:5173 (o el puerto que indique Vite).

## Build
```bash
npm run build
npm run preview
```
Salida en `dist/` (archivos estáticos). Para publicar, subir `dist/` a tu hosting web.

## Estado actual (implementado)
- Mapa Leaflet con 5 categorías: **Fijos** (rojo, incluye tramos INVIVE), **Móviles** (naranja), **Semáforos**, **Posibles** (gris, OSM), **Incidencias** (rojo oscuro).
- **Vista inicial con `fitBounds` de todos los elementos** (una sola vez): antes arrancaba en Vitoria/zoom 12 y la incidencia de A-10 quedaba a ~3300 px fuera de pantalla. El refresco cada 10 min NO reencuadra.
- Leyenda interactiva aprobada: tocar un tipo filtra el mapa. Filtros por categoría, no checkboxes.
- Los 199 `LineString` se dibujan con `Polyline` completa (no solo su punto medio): 189 en Fijos + 10 en Posibles.
- Popup genérico con **todas** las propiedades de cada elemento (`collectPopupRows` en `src/data-utils.js`).
- 47 duplicados reales de Vitoria se fusionan **sin perder datos** (source/notes se conservan como arrays). **No** se deduplica por coordenadas: hay incidencias y tramos distintos que comparten punto.
- Botón “📍 Mi ubicación” (usa `mapRef` de MapContainer) y botón de voz (Web Speech API).
- Alertas por voz al acercarse a un radar (umbral ~1500m, cooldown 30s). **Pendiente de reverificar** tras la refactorización de datos.
- Datos cargados desde `/data/processed/*.geojson`. Estado final verificado: 764 raw → 717 visibles (518 marcadores + 199 tramos), 0 errores de consola.

## Limitaciones conocidas
- Radares móviles en tiempo real: **no existen fuentes oficiales**. Se muestran tramos INVIVE y puntos OSM (no verificados).
- Alertas en segundo plano/pantalla apagada: no fiables en web móvil (limitación del navegador). Mejor uso con pantalla encendida.
- Android Auto / publicación en Google Play: requiere app nativa (Car App Library) y hay políticas restrictivas sobre apps de radares; no implementado.
- Incidencias Aragón: pendiente.
- Alertas por voz sin reverificar tras la última refactorización (verificado el mapa, no la voz).
- Copia manual a `public/`: **RESUELTA** (el pipeline ya publica automáticamente).
- Actualización diaria por GitHub Actions configurada en `.github/workflows/update-data.yml`, pero **requiere subir el repo a GitHub y configurar `remote`** (`git remote -v` está vacío; sin eso no hay `git push`).

## Decisiones importantes
- Stack elegido: **React + Vite** por modernidad y facilidad de build estático.
- Proyecto unificado en raíz (se migró desde `frontend/`).
- No se usa backend; datos estáticos regenerados con scripts Python.
- Geolocalización y voz solo en cliente.
- **No deduplicar por coordenadas**: dos incidencias de Navarra distintas y varios tramos comparten punto. Solo se fusionan duplicados reales (47 de Vitoria, que difieren únicamente en `source`/`notes`).
- `featureIdentity` ignora solo `source`, `sources` y `notes`; fecha/efecto/gravedad/PK/vía sí distinguen entidades. Los 2 pares de accidentes de Euskadi con misma posición y título pero distinta fecha/efecto siguen siendo 2 marcadores.
- `source` se mantiene escalar para `getCategory()`; los valores distintos se conservan en `sources` y arrays de propiedades.

## Ideas pendientes / próximos pasos
- Integrar incidencias de Aragón.
- **Reverificar las alertas por voz** tras la refactorización de fusión de datos (el mapa ya está verificado).
- Subir el repo a GitHub para activar el workflow de actualización diaria (bloqueante actual).
- Opción de refrescar datos desde la UI (el pipeline ya funciona por comando/CI).
- Evaluar PWA (service worker) para caché offline básico.
- Preparar despliegue (GitHub Pages / Netlify / hosting propio) y documentar.
- Considerar versión nativa solo si se necesita segundo plano real o Android Auto (fuera de alcance actual).

## Resueltos (no repetir)
- Copia automática a `public/data/processed/` ✅
- Leyenda interactiva y filtro de incidencias ✅
- Dibujo de tramos completos (`LineString` → `Polyline`) ✅
- Popup con todas las propiedades ✅
- Fusión de los 47 duplicados de Vitoria sin pérdida ✅
- Encuadre inicial del mapa: A-10 y Navarra/Aragón visibles al cargar ✅

## Notas legales/licencias
- Radares Anunciados: ODbL 1.0 (incluye OSM). DGT: CC BY 4.0. Datos públicos bajo Ley 37/2007 (citar fuente, no alterar). Mostrar siempre disclaimers.