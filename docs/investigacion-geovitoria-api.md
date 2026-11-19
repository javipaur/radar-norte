# Investigación: API interna de GeoVitoria para descarga programática de GeoJSON

**Fecha:** 2026-11-19
**Alcance:** explicar cómo se generan los tres ficheros que hoy se descargan a mano desde el visor GeoVitoria (Ayuntamiento de Vitoria-Gasteiz) y dar recetas reproducibles.

> **Conclusión adelantada:** los tres GeoJSON **no son la respuesta cruda de un endpoint de GeoJSON**. El botón «Descargar» del visor construye en el navegador un `data:text/json;charset=utf-8,` con `JSON.stringify(...)` de la capa Leaflet ya transformada. Por eso los ficheros contienen propiedades de UI (`icono` con SVG inline, `popupContent`, `detalleContent`, `eid`, `parentId`, …). Para replicarlos hay que (a) obtener los datos de los endpoints internos y (b) aplicar la misma transformación, o aceptar un GeoJSON más limpio pero no byte-idéntico.

---

## 1. Fuentes primarias consultadas

| Fuente | URL | Uso |
|---|---|---|
| Bundle JS del visor | `https://www.vitoria-gasteiz.org/geovitoria/index.js` | Lógica de `get`, `getColeccion`, `getKml`, `getGeojson` y del botón de descarga. 2.608.772 bytes; offsets válidos para la copia descargada el 2026-11-19. |
| Variables globales | `https://www.vitoria-gasteiz.org/j16-02w/VariablesJs.do?parte=1&idioma=es&api=gasteiz` | Constantes de URLs e `idiomaUsuario`. |
| Página contenedora | `https://www.vitoria-gasteiz.org/geovitoria/geo` | Confirma que la página carga `/j16-02w/VariablesJs.do?parte=1&idioma=es&api=gasteiz` y `/geovitoria/index.js`. |

Citas del bundle (offsets en bytes dentro de `geovitoria-index.js`):

- **@943482** — `get(t)`: `GET /j16-02w/detalleAction.do?id=<t>&idioma=<idiomaUsuario>`; si `isUid(t)`, usa `capaAction.do?accion=CARGAR_ELEMENTOS_CAPA&uuid=<t>&app=j16&charset=UTF-8`.
- **@946686** — `getColeccion(t,r,o,a,c)`: `POST /j16-02w/capaAction.do?accion=CARGAR_ELEMENTOS_CAPA&idioma=<idioma>` con `FormData`: `g=<c>` / `t=<r>` / `c=<c>`, más `app=<o>` y `charset=UTF-8`.
- **@950849** — `getKml`: `fetch("/docs/j16/kml/".concat(e))`, donde `e = t.props.location` (el `nombreKml` del detalle).
- **@951294** — `getGeojson`: `c = t.props.location`; si `t.props.id != null && t.props.id > 0`, entonces `c = E(t.props.id)`; luego `fetch(c)`.
- **@952465** — `E(id)`: `constanteUrlGeojsonServlet + "?idioma=" + idiomaUsuario.toLowerCase() + "&id=" + id`.
- **@139900** — configuración: `prefix` → `4:"kml"`, `6:"wms"`, `7:"geojson"`, `8:"usuario"`; `tipos` → `7:"geojson"`; `groupLayers.prefix` → `grupo:"g"`, `etiqueta:"t"`, `calendario:"c"`.
- **@161845** — menú: `id 138` = «Radares de control de tráfico» (`tipo:"g"`), `id 10090` = «Radares de velocidad» (`tipo:"e"`, WMS), `t = {es:"radar móvil", …}` (`tipo:"t"`), `id 704` = incidencias (`tipo:"c"`).
- **@1292500** — `eid` de la capa: `` d = `${e.tipo}_${e.id ? e.id : e.capa.nombre}` ``, saneado con `.replaceAll(/[:; ]/g,"_").replaceAll(",","")`.
- **@1293479** — colecciones: `u = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(c))`.
- **@2070035 / @2070403** — botón: `n.setAttribute("download", "geoJSON_" + e.eid + ".json")`; para WMS (`Wt`) pone «copiar URL» en vez de descarga y para calle (`Ht`) no crea el enlace.
- **@2479806 / @2479991** — elementos: al añadir la capa, reemplaza el `href` por `data:text/json;charset=utf-8,` + `encodeURIComponent(JSON.stringify(e.layer.toGeoJSON()))`, salvo calle/WMS.
- **@2556054** — colecciones: `n = l.toGeoJSON()`; si `n.features.length > 0`, `href = data:text/json;charset=utf-8,...`; si no, quita el botón.

`VariablesJs.do` (líneas 18, 78-80):

```js
var idiomaUsuario             = "es";
var constanteUrlKmls          = "https://www.vitoria-gasteiz.org/docs/j16/kml/";
var urlRelativaGeojsons       = "/docs/j16/geojson/";
var constanteUrlGeojsonServlet = ["https://www.vitoria-gasteiz.org","/j16-02w/GetGeojson"].join('');
```

**Documentación oficial de la API: no encontrada.** Fallaron `websearch` y búsquedas en DuckDuckGo de `"GetGeojson" "j16-02w"` y de `site:vitoria-gasteiz.org j16-02w API documentación`. Solo aparece el propio visor y enlaces indexados a `capaAction.do`. Todo lo de abajo es ingeniería inversa del bundle + verificación empírica; tratarlo como contrato interno no garantizado.

---

## 2. Codificación y cautela de consola

Las respuestas declaran `application/json;charset=UTF-8` (y a veces `application/x-json;charset=UTF-8`). En la consola de PowerShell los acentos se muestran dañados (`radar m?vil`, `MugiBIKE el?ctricas`), **pero los ficheros descargados están correctamente en UTF-8**.

- En Python: `json.loads(resp.content.decode("utf-8-sig"))` o directamente `resp.json()`.
- En `FormData`/querystring enviar `charset=UTF-8` **y** codificar la etiqueta (`radar móvil` → `radar%20m%C3%B3vil` en GET). Sin esto, la etiqueta con acento puede no coincidir.
- No fiarse de lo que prints la terminal; fiarse de los bytes.

---

## 3. Receta para cada fichero

### 3.1. `geoJSON_4_5052.json` — detectores de semáforo en rojo (tipo 4 = KML)

No hay GeoJSON en el servidor para este elemento. La cadena es:

1. `GET https://www.vitoria-gasteiz.org/j16-02w/detalleAction.do?id=5052&idioma=es` → 200, ~399 bytes, JSON con `tipo:"4"`, `nombreKml:"kml5052es.kml"`, `id:"5052"`.
2. `GET https://www.vitoria-gasteiz.org/docs/j16/kml/kml5052es.kml` → 200, 3.917 bytes, 6 `<Placemark>`.
3. El bundle convierte el KML a GeoJSON (`getKml` @950849 + parser `toGeoJSON` del bundle), y el botón serializa la capa resultante.

Verificado: los 6 pares `(lon, lat)` del KML y del fichero local coinciden **exactamente** (redondeando a 6 decimales) y en el mismo orden:

```
(-2.682190, 42.847323)  (-2.687674, 42.852889)  (-2.666341, 42.841930)
(-2.659341, 42.869651)  (-2.681001, 42.850449)  (-2.678154, 42.849323)
```

`GET https://www.vitoria-gasteiz.org/j16-02w/GetGeojson?idioma=es&id=5052` → **400** con cuerpo `Error al obtener los datos de la capa: 5052`. No es la fuente de este fichero.

### 3.2. `geoJSON_g_138.json` — grupo 138 (radar móvil)

Endpoint: `POST /j16-02w/capaAction.do?accion=CARGAR_ELEMENTOS_CAPA&idioma=es` con `FormData`:

```
g=138
app=J16
charset=UTF-8
```

Respuesta 200: `capa.numele = "48"` y `elementos` con 48 entradas: **47 puntos (tipo 1) + 1 WMS `id=10090` (tipo 6)**. El fichero local tiene 47 features: coinciden los 47 ids; falta `10090` porque el visor no ofrece descarga para WMS (`isWms` @2070035 y @2479991).

### 3.3. `geoJSON_t_radar_móvil.json` — etiqueta «radar móvil»

Mismo endpoint, `FormData`:

```
t=radar móvil      (UTF-8; en GET: t=radar%20m%C3%B3vil)
app=J16
charset=UTF-8
```

Respuesta 200: `capa.numele = "47"`, 47 elementos tipo 1. El fichero local tiene 47 features con **los mismos ids y en el mismo orden** que la respuesta actual.

> Nota: el bundle usa `app=J16` en `getColeccion` (@946686) y `app=j16` en `get` para uid (@943482); ambos funcionan en las pruebas. También probé la variante **GET** (indexada por DuckDuckGo para `c=704`): `GET /j16-02w/capaAction.do?accion=CARGAR_ELEMENTOS_CAPA&idioma=es&g=138&app=J16&charset=UTF-8` → 200, y lo mismo con `t=radar%20m%C3%B3vil` → 200. El código del visor usa POST, pero GET también sirve.

### 3.4. `GetGeojson` — qué es y cuándo se usa

Es el servlet para elementos **tipo 7 (`geojson`) y 8 (`usuario`)** cuando tienen `props.id > 0` (@951294 + @952465). No interviene en los tres ficheros de este informe.

Ejemplo real encontrado: `detalleAction.do?id=39180&idioma=es` → `tipo:"7"`, `urlGeojson:["https://www.vitoria-gasteiz.org/gbfsfifteen/gbfs/2.2/vitoria/en/station_information.json"]`, nombre «MugiBIKE (Alquiler de bicicletas eléctricas)». Entonces:

```
GET https://www.vitoria-gasteiz.org/j16-02w/GetGeojson?idioma=es&id=39180
```

→ 200, `application/json;charset=UTF-8`, 5.564 bytes, `FeatureCollection` de estaciones MugiBIKE (properties: `station_id`, `name`, `capacity`, `icono`, …). El `id` del parámetro es el **id del elemento**, no el de un grupo/etiqueta ni el `nombreKml`.

---

## 4. Derivación del nombre de descarga (`eid`)

Regla del bundle @1292500:

```js
d = `${tipo}_${id || capa.nombre}`;
d = d.replaceAll(/[:; ]/g, "_").replaceAll(",", "");
// href → "geoJSON_" + d + ".json"
```

| Fichero | `tipo` | `id` / nombre | `eid` resultante |
|---|---|---|---|
| `geoJSON_4_5052.json` | `4` | `5052` | `4_5052` |
| `geoJSON_g_138.json` | `g` | `138` | `g_138` |
| `geoJSON_t_radar_móvil.json` | `t` | `radar móvil` | `t_radar_móvil` (espacio → `_`, acento se conserva) |

Cuidado: dentro de `properties` de `geoJSON_4_5052.json` aparece `eid: "4_5052_MQ=="` (por feature, con id en base64 `MQ==` = «1»). Ese **no** es el `eid` usado en el nombre de descarga; el nombre usa el `eid` de la capa.

---

## 5. Comparación con los ficheros locales

| Fichero | Bytes | Features | SHA-256 (16) | Resultado |
|---|---:|---:|---|---|
| `data/raw/geoJSON_4_5052.json` | 4.339 | 6 | `bc1506d067dd1dc6` | Coincide con los 6 placemarks del KML `kml5052es.kml` (mismo orden y coords). |
| `data/raw/geoJSON_g_138.json` | 45.098 | 47 | `08ec57412a03339d` | Mismo conjunto de ids que los 47 puntos de `g=138`; sin el WMS `10090`. El **orden** difiere del orden actual de la respuesta. |
| `data/raw/geoJSON_t_radar_móvil.json` | 45.098 | 47 | `b3557ddb6fc0b82e` | Mismo conjunto de ids, mismo orden y mismos nombres que la respuesta `t=radar móvil`. |

Los dos ficheros de 47 features tienen distinto hash **solo por el orden** (mismo conjunto de ids y `name`). Conclusión: no comparar por hash ni asumir orden estable; ordenar por `properties.id` si se quiere un diff determinista.

---

## 6. Reproducción

### Python (requests)

```python
import requests
from urllib.parse import quote

BASE = "https://www.vitoria-gasteiz.org"

def get_json(url, **kw):
    for _ in range(4):                      # servidor intermitente
        try:
            r = requests.get(url, timeout=30, **kw)
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            continue
    raise RuntimeError(f"sin respuesta: {url}")

# 4_5052: detalle -> KML
det = get_json(f"{BASE}/j16-02w/detalleAction.do?id=5052&idioma=es")
kml_name = det["nombreKml"]                       # kml5052es.kml
kml = requests.get(f"{BASE}/docs/j16/kml/{kml_name}", timeout=30).text
# convertir KML a GeoJSON (p. ej. con togeojson) y serializar

# g_138 / t_radar_móvil: POST FormData
for fields in ({"g": "138"}, {"t": "radar móvil"}):
    data = {**fields, "app": "J16", "charset": "UTF-8"}
    for _ in range(4):
        try:
            r = requests.post(
                f"{BASE}/j16-02w/capaAction.do?accion=CARGAR_ELEMENTOS_CAPA&idioma=es",
                data=data, timeout=30)
            r.raise_for_status()
            col = r.json()
            break
        except requests.RequestException:
            continue
    print(fields, col["capa"]["numele"], len(col["elementos"]))
    # col["elementos"] -> convertir a FeatureCollection y serializar
```

### curl

```bash
# Detalle del elemento KML
curl -sS 'https://www.vitoria-gasteiz.org/j16-02w/detalleAction.do?id=5052&idioma=es'
# KML resultante
curl -sS 'https://www.vitoria-gasteiz.org/docs/j16/kml/kml5052es.kml' -o kml5052es.kml

# Grupo 138 (POST)
curl -sS -X POST \
  'https://www.vitoria-gasteiz.org/j16-02w/capaAction.do?accion=CARGAR_ELEMENTOS_CAPA&idioma=es' \
  -F 'g=138' -F 'app=J16' -F 'charset=UTF-8' -o col_g138.json

# Etiqueta "radar móvil" (POST, UTF-8)
curl -sS -X POST \
  'https://www.vitoria-gasteiz.org/j16-02w/capaAction.do?accion=CARGAR_ELEMENTOS_CAPA&idioma=es' \
  -F 't=radar móvil' -F 'app=J16' -F 'charset=UTF-8' -o col_t_radar.json

# Variante GET (también funciona)
curl -sS 'https://www.vitoria-gasteiz.org/j16-02w/capaAction.do?accion=CARGAR_ELEMENTOS_CAPA&idioma=es&g=138&app=J16&charset=UTF-8'

# GetGeojson solo para elementos tipo 7/8
curl -sS 'https://www.vitoria-gasteiz.org/j16-02w/GetGeojson?idioma=es&id=39180'
```

Para obtener un GeoJSON **equivalente en contenido** al del botón hay que replicar el pipeline del bundle: `detalleAction` / `capaAction` → `transformJson` → capa Leaflet → `toGeoJSON()` → `JSON.stringify`. Si solo interesan las coordenadas y atributos de negocio, basta con construir un `FeatureCollection` a partir de `elementos` (latitud/longitud/id/nombre/direccion/…) y omitir las propiedades de UI.

---

## 7. Cautelas

1. **No es una API pública documentada.** Es el contrato interno que usa el bundle; puede cambiar sin aviso. No se encontró documentación oficial de `GetGeojson`, `capaAction.do` ni `detalleAction.do`.
2. **El botón genera el GeoJSON en cliente.** Los ficheros descargados incluyen metadatos de presentación y pueden variar si cambia la versión del bundle, aunque los endpoints devuelvan los mismos datos.
3. **Servidor intermitente:** se observaron `ConnectTimeout`, `ReadTimeout` y `URLError(TimeoutError(10060))`. Reintentar 3-4 veces con timeout de 25-30 s.
4. **Parámetros sensibles a texto:** `idioma` (`es`/`eu`/`en`/`fr`), `app=J16`, `charset=UTF-8` y la etiqueta exacta `radar móvil`. Cambiar la etiqueta en el menú del visor rompería la consulta por `t`.
5. **WMS excluido:** `g=138` devuelve 48 elementos, pero el tipo `6` (`id=10090`, «Radares de velocidad») no produce descarga. Filtrar `tipo != "6"` (y `!= "5"` para calles) si se quiere el mismo resultado.
6. **Orden volátil:** ordenar por `properties.id` antes de comparar o versionar.
7. **`detalleAction.do` solo para elementos.** Consultar `id=138` o `id=704` devuelve HTML de la web, no JSON; esos ids son grupo/calendario y se resuelven con `capaAction.do`.
8. **UTF-8:** el output de consola puede parecer corrupto; los bytes y los ficheros son UTF-8 válidos. Usar `utf-8-sig` al leer y no reescapar acentos.
9. **Licencias:** no se encontró una declaración de licencia específica para estos datos en las fuentes revisadas. Citar siempre la fuente (Ayuntamiento de Vitoria-Gasteiz, GeoVitoria) y no asumir reutilización libre sin verificarlo.

---

## 8. Apéndice: evidencia guardada

Copias de las respuestas y helpers usados en esta investigación (fuera del repositorio):

- `C:\Users\javie\AppData\Local\Temp\opencode\geovitoria-index.js`
- `C:\Users\javie\AppData\Local\Temp\opencode\gv-probe\VariablesJs.js`
- `C:\Users\javie\AppData\Local\Temp\opencode\gv-probe\detalle.txt`, `detalle_5052.txt`, `detalle_39180.txt`, `detalle_10090.txt`, `detalle_10468.txt`
- `C:\Users\javie\AppData\Local\Temp\opencode\gv-probe\col_g138.txt`, `col_t_radar.txt`, `kml5052.txt`
- `C:\Users\javie\AppData\Local\Temp\opencode\gv_scan*.py`, `gv_probe_*.py`, `gv_compare*.py`, `gv_kml_compare.py`
