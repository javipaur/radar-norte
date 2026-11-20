# Radar Norte

Aplicación web (React + Vite + Leaflet) para visualizar radares e incidencias de tráfico en **País Vasco, Navarra y Aragón** (con datos adicionales de Vitoria-Gasteiz descargados automáticamente).

> **Aviso importante**: Esta es una aplicación **informativa e independiente**, no oficial. No sustituye a la señalización vial ni a las indicaciones oficiales. Los datos pueden estar desactualizados o incompletos. Úsala bajo tu responsabilidad.

## Qué muestra
- Radares fijos y zonas de vigilancia intensificada (INVIVE)
- Posibles radares mapeados en OpenStreetMap (no verificados)
- Incidencias de tráfico (Navarra y Euskadi)
- Ubicaciones de radares móviles y foto-rojo publicadas por el Ayuntamiento de Vitoria-Gasteiz (datos descargados automáticamente del visor GeoVitoria)

## Avisos por voz y sonido
El botón **🔔 Alertas** activa avisos por proximidad usando la geolocalización del dispositivo (sin enviar la posición a ningún servidor):

- **Acercamiento** (menos de 1500 m): chime suave y voz con vía, pk y distancia.
- **Dentro de un tramo** (menos de 60 m): aviso tenue al entrar, que no se repite hasta salir y volver a entrar.
- Si varios elementos disparan a la vez, solo se anuncia **el más cercano**. Las zonas posibles, históricas, inactivas o caducadas se indican como «no certificadas».
- El botón **Probar aviso** comprueba sonido y voz sin necesidad de geolocalización.

Los avisos funcionan con la pantalla encendida. Los navegadores móviles **no garantizan** audio ni geolocalización en segundo plano o con la pantalla apagada. Si el navegador no soporta síntesis de voz, se usan solo los chimes.

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

## Despliegue en Dokploy (GitHub + Nixpacks)

La app es **estática**: se compila con Vite y se sirve con Caddy. El repositorio incluye `nixpacks.toml` y `engines.node` en `package.json` para fijar **Node 22** (Vite 8 requiere Node ≥ 20.19; el valor por defecto de Nixpacks es Node 18 y hace fallar el build). Nixpacks detecta automáticamente el build (`npm ci` + `npm run build`) y el arranque con Caddy sirviendo `dist/`.

Pasos en Dokploy:

1. Crea una nueva **Application** y conecta el repositorio `https://github.com/javipaur/radar-norte.git`, rama `main`.
2. En **Build**, selecciona **Nixpacks** como *Build Type*.
3. Si Dokploy te pide un *Publish Directory* / *Output Directory*, indícalo: `dist`.
4. No hace falta configurar variables de entorno ni un puerto especial: Nixpacks detecta Vite, genera `dist/` y lo sirve con Caddy en el puerto 80.
5. Configura el dominio (o usa el que genera Dokploy) y despliega.

> Si vuelves a ver el error `The requested module 'node:util' does not provide an export named 'styleText'`, significa que el build está usando Node 18: comprueba que `package.json` tiene `"engines": { "node": ">=22.12.0" }`, que `nixpacks.toml` está en la raíz del repo y que Dokploy está desplegando la rama `main` con esos cambios ya pusheados.

## Fuentes de datos y licencias (resumen)
- **Radares Anunciados** (feed agregado): https://geiserx.github.io/radares-anunciados-ha/  
  Incluye datos de DGT, gobiernos autonómicos, ayuntamientos y OpenStreetMap. Licencia del feed: **ODbL 1.0** (incluye OSM). Datos de organismos públicos: reutilización según **Ley 37/2007** (citar fuente, no alterar valores).
- **DGT (NAP)**: radares fijos/tramos (DATEX II), licencia **CC BY 4.0**.
- **OpenStreetMap**: datos bajo **ODbL 1.0** (© OpenStreetMap contributors).
- **Gobierno de Navarra** (incidencias): datos abiertos de Navarra, reutilización conforme a condiciones del portal.
- **Open Data Euskadi** (incidencias): API/datos de tráfico, reutilización conforme a condiciones del portal.
- **Ayuntamiento de Vitoria-Gasteiz (GeoVitoria)**: datos de ubicaciones/radares/foto-rojo descargados automáticamente desde el visor público. Se usan conforme a las condiciones de uso del portal municipal.

**Siempre cita las fuentes originales** cuando redistribuyas o reutilices estos datos.

## Limitaciones y avisos legales
- **No hay posición oficial en tiempo real de radares móviles**. Se muestran tramos INVIVE y ubicaciones anunciadas publicadas por administraciones; pueden no reflejar la ubicación actual.
- La app es **informativa**. No garantizamos exactitud, actualidad ni cobertura completa. **Respeta siempre la señalización vial y la normativa vigente**.
- El uso de esta app es bajo tu responsabilidad. Los autores no se responsabilizan de sanciones, accidentes o daños derivados de su uso.
- Algunas jurisdicciones regulan el uso de avisadores de radares; verifica la legalidad en tu caso.

## Actualizar datos
Todo el pipeline se lanza con un solo comando (descarga de fuentes + procesado + publicación):
```bash
npm run update-data
```
Esto ejecuta `scripts/update_all.py`, que descarga el feed de radares, las incidencias de Navarra y Euskadi y las capas de GeoVitoria, valida cada GeoJSON y publica siempre el resultado en `public/data/processed/` (además de la copia local en `data/processed/`). Escribe también `last-update.json` con la hora de la última actualización.

- **Requisito Python**: `pyproj` (necesario para convertir las coordenadas de Navarra a WGS84). Instalable con `python -m pip install pyproj`.
- Si una fuente remota falla (p. ej. GeoVitoria), se conserva el último fichero bueno en lugar de borrarlo: el aviso se imprime y el resto de fuentes se actualiza igualmente.
- No se añaden fuentes nuevas sin revisar licencias y este README.

### Scripts individuales
Por si se quiere refrescar solo una fuente (también publican en `public/data/processed/`):
```bash
python scripts/fetch-radares.py
python scripts/fetch-incidencias-navarra.py
python scripts/fetch-incidencias-euskadi.py
python scripts/fetch-vitoria.py
python scripts/process-vitoria-ayto.py
python scripts/process-vitoria-extra.py
```

### Pruebas
```bash
npm test
```
Ejecuta las pruebas JS (`tests/`) y Python (`scripts/test_*.py`): comprueban la fusión sin pérdida de duplicados, que no se fusionen entidades distintas que comparten coordenadas, el popup completo, los tramos completos, el encuadre del mapa (para que la A-10 y el resto de Navarra/Aragón no queden fuera de pantalla) y la frescura de los datos.

### Actualización automática (GitHub Actions)
`.github/workflows/update-data.yml` ejecuta `npm run update-data` cada día a las 06:00 UTC y permite lanzarlo a mano desde la pestaña **Actions** (`workflow_dispatch`). Cuando hay cambios, hace commit de `public/data/processed/`.

> **Prerrequisito**: el repositorio debe estar subido a GitHub y tener configurado el `remote` (`git remote -v`). Mientras no exista ese remote, el workflow no puede hacer `git push`. Para habilitarlo: crea el repo en GitHub y ejecuta `git remote add origin <URL> && git push -u origin main`.

Ver `AGENTS.md` para más detalle sobre fuentes y decisiones de datos.

## Licencia del código
El código de esta aplicación se distribuye bajo licencia **MIT** (ver archivo LICENSE si se añade). Los datos tienen sus propias licencias (ver arriba).

## Contribuir / contacto
Proyecto personal/experimental. Si encuentras errores en datos o quieres aportar, abre un issue o contacta al mantenedor.
