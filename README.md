# Radar Norte

Aplicación web (React + Vite + Leaflet) para visualizar radares e incidencias de tráfico en **País Vasco, Navarra y Aragón** (con datos adicionales manuales de Vitoria-Gasteiz).

> **Aviso importante**: Esta es una aplicación **informativa e independiente**, no oficial. No sustituye a la señalización vial ni a las indicaciones oficiales. Los datos pueden estar desactualizados o incompletos. Úsala bajo tu responsabilidad.

## Qué muestra
- Radares fijos y zonas de vigilancia intensificada (INVIVE)
- Posibles radares mapeados en OpenStreetMap (no verificados)
- Incidencias de tráfico (Navarra y Euskadi)
- Ubicaciones de radares móviles y foto-rojo publicadas por el Ayuntamiento de Vitoria-Gasteiz (datos descargados manualmente del visor GeoVitoria)

## Stack
- React 19 + Vite + react-leaflet / Leaflet
- Datos en GeoJSON estáticos (generados por scripts Python en `scripts/`)

## Ejecución (desarrollo)
```bash
npm install
npm run dev
```
Abre la URL que indique Vite (normalmente http://localhost:5173).

## Build
```bash
npm run build
npm run preview
```
Salida en `dist/`.

## Fuentes de datos y licencias (resumen)
- **Radares Anunciados** (feed agregado): https://geiserx.github.io/radares-anunciados-ha/  
  Incluye datos de DGT, gobiernos autonómicos, ayuntamientos y OpenStreetMap. Licencia del feed: **ODbL 1.0** (incluye OSM). Datos de organismos públicos: reutilización según **Ley 37/2007** (citar fuente, no alterar valores).
- **DGT (NAP)**: radares fijos/tramos (DATEX II), licencia **CC BY 4.0**.
- **OpenStreetMap**: datos bajo **ODbL 1.0** (© OpenStreetMap contributors).
- **Gobierno de Navarra** (incidencias): datos abiertos de Navarra, reutilización conforme a condiciones del portal.
- **Open Data Euskadi** (incidencias): API/datos de tráfico, reutilización conforme a condiciones del portal.
- **Ayuntamiento de Vitoria-Gasteiz (GeoVitoria)**: datos de ubicaciones/radares/foto-rojo descargados manualmente desde el visor público. Se usan conforme a las condiciones de uso del portal municipal.

**Siempre cita las fuentes originales** cuando redistribuyas o reutilices estos datos.

## Limitaciones y avisos legales
- **No hay posición oficial en tiempo real de radares móviles**. Se muestran tramos INVIVE y ubicaciones anunciadas publicadas por administraciones; pueden no reflejar la ubicación actual.
- La app es **informativa**. No garantizamos exactitud, actualidad ni cobertura completa. **Respeta siempre la señalización vial y la normativa vigente**.
- El uso de esta app es bajo tu responsabilidad. Los autores no se responsabilizan de sanciones, accidentes o daños derivados de su uso.
- Algunas jurisdicciones regulan el uso de avisadores de radares; verifica la legalidad en tu caso.

## Actualizar datos
Ver `AGENTS.md` para detalles. Scripts principales:
```bash
python scripts/fetch-radares.py
python scripts/fetch-incidencias-navarra.py
python scripts/fetch-incidencias-euskadi.py
python scripts/process-vitoria-ayto.py
python scripts/process-vitoria-extra.py
```

## Licencia del código
El código de esta aplicación se distribuye bajo licencia **MIT** (ver archivo LICENSE si se añade). Los datos tienen sus propias licencias (ver arriba).

## Contribuir / contacto
Proyecto personal/experimental. Si encuentras errores en datos o quieres aportar, abre un issue o contacta al mantenedor.
