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
│   ├── fetch-radares.py           # Descarga feed Radares Anunciados y filtra PV/NV/AR
│   ├── fetch-incidencias-navarra.py
│   └── fetch-incidencias-euskadi.py
├── data/               # raw/ y processed/ (copias/descargas locales)
├── docs/
└── README.md, AGENTS.md
```

## Fuentes de datos
- **Radares (principal)**: Feed "Radares Anunciados" (GeoJSON) https://geiserx.github.io/radares-anunciados-ha/feed.geojson (ODbL 1.0). Incluye DGT, Euskadi, Navarra, OSM, INVIVE (`dgt_invive` = tramos de vigilancia intensificada), etc.
- **Incidencias Navarra**: API/CSV datosabiertos.navarra.es (convertido a GeoJSON WGS84 con `pyproj`).
- **Incidencias Euskadi**: API Open Data Euskadi `https://api.euskadi.eus/traffic/v1.0/incidences/byDate/YYYY/MM/DD` (JSON→GeoJSON).
- **Aragón**: pendiente de integrar (VISINCAR/GA_OD_Core no trivial).

## Scripts (ejecutar desde raíz)
```bash
python scripts/fetch-radares.py
python scripts/fetch-incidencias-navarra.py
python scripts/fetch-incidencias-euskadi.py
```
- `fetch-radares.py` escribe en `data/processed/` y debe copiarse a `public/data/processed/` (actualmente hay copia manual; mejorar script si hace falta).
- `fetch-incidencias-navarra.py` y `fetch-incidencias-euskadi.py` ya copian a `src/data/processed/` y también se deben copiar a `public/data/processed/` para el build/dev (verificar rutas).

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
- Mapa Leaflet con capas: radares fijos (rojo), zonas móviles INVIVE (naranja), posibles OSM (gris), incidencias Navarra/Euskadi (rojo oscuro).
- Filtros por tipo (checkboxes). Leyenda visible.
- Botón “📍 Mi ubicación” (usa `mapRef` de MapContainer).
- Alertas por voz (Web Speech API) al acercarse a un radar (umbral ~1500m, cooldown 30s). No alerta por incidencias.
- Datos cargados desde `/data/processed/*.geojson`.

## Limitaciones conocidas
- Radares móviles en tiempo real: **no existen fuentes oficiales**. Se muestran tramos INVIVE y puntos OSM (no verificados).
- Alertas en segundo plano/pantalla apagada: no fiables en web móvil (limitación del navegador). Mejor uso con pantalla encendida.
- Android Auto / publicación en Google Play: requiere app nativa (Car App Library) y hay políticas restrictivas sobre apps de radares; no implementado.
- Incidencias Aragón: pendiente.
- Los scripts de fetch no actualizan automáticamente `public/data/processed/` en todos los casos (revisar/copiar manualmente si hace falta).

## Decisiones importantes
- Stack elegido: **React + Vite** por modernidad y facilidad de build estático.
- Proyecto unificado en raíz (se migró desde `frontend/`).
- No se usa backend; datos estáticos regenerados con scripts Python.
- Geolocalización y voz solo en cliente.

## Ideas pendientes / próximos pasos
- Integrar incidencias de Aragón.
- Mejorar scripts para copiar automáticamente a `public/data/processed/`.
- Añadir filtro de incidencias, leyenda más detallada, y opción de refrescar datos en la UI.
- Evaluar PWA (service worker) para caché offline básico.
- Preparar despliegue (GitHub Pages / Netlify / hosting propio) y documentar.
- Considerar versión nativa solo si se necesita segundo plano real o Android Auto (fuera de alcance actual).

## Notas legales/licencias
- Radares Anunciados: ODbL 1.0 (incluye OSM). DGT: CC BY 4.0. Datos públicos bajo Ley 37/2007 (citar fuente, no alterar). Mostrar siempre disclaimers.