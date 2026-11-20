# Avisos por voz y sonido — diseño

Fecha: 2026-11-20
Estado: borrador para aprobación (no hay código implementado todavía)

## Intención y por qué

La app ya muestra radares, tramos INVIVE y zonas posibles en el mapa, pero el
usuario quiere **avisos mientras conduce**, sin mirar la pantalla:

1. Aviso al **acercarse a un radar cercano**, con voz suave pero perceptible.
2. Aviso al **entrar dentro de un tramo** de vigilancia (por ejemplo el NA-2410),
   con un aviso **tenue**.

Ambos avisos llevan **voz en español** y una **señal sonora discreta**. Ninguno
debe sonar como una alarma.

Las fuentes para decidir qué se considera fiable son las que aportó el usuario:
DGT (Punto de Acceso Nacional), inventario de radares de Navarra (AEA), el feed
Radares Anunciados (con procedencia y fecha) y, solo como pista complementaria,
el histórico de Lince GPS. Hay que distinguir **tramos de vigilancia INVIVE** de
**posiciones reales de equipos**.

## Objetivos

- Avisar al acercarse a radares puntuales y a tramos, midiendo distancia a la
  geometría completa del tramo.
- Avisar al entrar en un tramo, una sola vez por entrada, con tono tenue.
- Que la voz diga algo útil (vía, pk o distancia) y que indique explícitamente
  cuando la zona es **no certificada**.
- Incluir también las localizaciones posibles e históricas (decisión del
  usuario), marcadas como no certificadas en el aviso.
- Incluir los elementos con `active: false` o `valid_to` vencido, pero avisar
  de ellos **como no certificados** (decisión del usuario). El mapa sigue
  mostrándolos igual.
- Emitir **como máximo un aviso por momento**, el del elemento más cercano
  (decisión del usuario).
- Que los avisos funcionen con pantalla encendida y no dependan de los filtros
  visuales del mapa.

## No objetivos

- No es un servicio oficial ni sustituye a la señalización.
- No pretende avisar en segundo plano con pantalla apagada: limitación del
  navegador, no solucionable en una PWA web estándar.
- No añade fuentes nuevas de radares al pipeline; solo consume los GeoJSON ya
  publicados en `public/data/processed/`.
- No modifica la clasificación de categorías ni la fusión de duplicados.

## Antes / anti-objetivos (lo que sería un fallo aunque funcione)

- Que suene como alarma, o que la voz interrumpa cada pocos segundos.
- Que un tramo de 36 km dispare el aviso solo al pasar por su punto medio.
- Que un filtro de la leyenda silencie un aviso de seguridad.
- Que se anuncie como radar certificado una zona posible/histórica de OSM o
  recuperada del histórico, o un elemento inactivo/caducado.
- Que un solo tick dispare decenas de chimes seguidos (en Uharte Arakil hay
  decenas de puntos a menos de 1500 m).
- Que los avisos se dupliquen por cada actualización de datos (el pipeline
  refresca los features cada 10 minutos).

## Restricciones

- Stack actual: React 19 + Vite 8, Leaflet, datos GeoJSON estáticos. Sin backend.
- Web Speech API (`speechSynthesis`) y Web Audio API, sin librerías ni ficheros
  de audio externos.
- Geolocalización requiere HTTPS en producción; Dokploy sirve el dominio con
  TLS. En `localhost` funciona sin HTTPS.
- iOS/Android exigen interacción del usuario para activar audio y geolocalización:
  el botón de activación sirve como ese gesto.
- La posición no se envía a ningún servidor.
- Documentación y mensajes en español.

## Decisiones ya tomadas (del usuario)

- Dos niveles: **acercamiento** = sutil pero perceptible; **dentro de tramo** =
  tenue.
- **Voz en los dos casos**, acompañada de una señal sonora corta y suave.
- La voz dice algo concreto (vía / pk / distancia), no solo «pip».
- Avisan también las zonas **posibles e históricas**, indicando que **no están
  certificadas**.
- Si varios elementos disparan a la vez, se anuncia **solo el más cercano**.
- Los elementos con `active: false` o `valid_to` vencido se anuncian **como no
  certificados** (no se omiten del aviso).
- Fuentes de referencia: DGT, Navarra AEA, Radares Anunciados; Lince GPS solo
  como complemento.

## Estado actual del código (recon realizado)

- `src/App.jsx`:
  - `voiceOn` + `speak()` usan `speechSynthesis`, `lang = "es-ES"`, sin volumen
    ni tono configurados, y cancelan cualquier utterance previa.
  - `handleLocate()` llama a `getCurrentPosition()` **una vez, al pulsar el
    botón**; no existe `watchPosition`.
  - Los avisos usan `filterRawFeatures(features, { onlyNavarra, source: rawSource })`
    y filtran por `activeCategory`: heredan los filtros del mapa.
  - `getPointCoords()` devuelve el **punto medio** para `LineString`; por tanto
    los tramos se tratan como puntos y no se detecta «estar dentro».
  - Un único `lastAlertRef` con cooldown global de 30 s.
  - No hay ningún sonido aparte de la voz.
  - `features` se recarga cada 10 minutos; cualquier watcher debe leer la lista
    vigente sin capturar un array obsoleto (usar `useRef`).
- `src/data-utils.js`: `featurePaths(feature)` ya expone la geometría completa
  de los `LineString`; `sortForRender`/`featuresBounds` no intervienen en avisos.
- `src/categories.js`: `isHistoricalMobile(feature)` identifica la semilla
  histórica; `getCategory()` clasifica `dgt_invive` como Móviles.
- Pruebas: `npm test` = 26 JS + 39 Python.

## Diseño propuesto

### 1. Helpers puros en `src/alert-utils.js`

- `distanceToGeometryMeters(lat, lon, feature)`:
  - `Point` → `haversineDistance` al punto.
  - `LineString` → mínimo de la distancia del punto a cada segmento
    (proyección sobre el segmento + distancia de haversine al punto proyectado).
    Debe comportarse bien con segmentos cortos y con el caso «punto dentro del
    tramo» (distencia ≈ 0).
  - Devuelve `null` si la geometría no es utilizable.
- `buildAlertMessage(feature, kind, distanceMeters)`:
  - `kind = "approach"` → `Radar cercano, <vía> pk <pk>, a <n> metros` o, para
    tramos, `<vía>, tramo de vigilancia a <n> metros`.
  - `kind = "inside"` → `Estás dentro del tramo de vigilancia, <vía>`.
  - Si `isHistoricalMobile(feature)` o la categoría es «Posibles» / la fuente
    es OSM no verificada, añadir `zona no certificada`.
  - Textos cortados a una frase; sin datos catalán/euskera, solo español.
- `isCertified(feature)`: helper para decidir el sufijo «no certificada».
  Devuelve `false` si `isHistoricalMobile(feature)`, si la fuente es OSM/posible,
  si `properties.active === false` o si `properties.valid_to` es una fecha
  anterior a `Date.now()`. `valid_from` en el futuro también se trata como no
  certificado (call del diseñador; el feed lo deja casi siempre a `null`).

Estos helpers son funciones puras y se prueban con `node --test` en
`tests/alert-utils.test.mjs`, sumándose al `npm test` existente.

### 2. Estado de avisos en `src/App.jsx`

- Sustituir el disparo puntual por `navigator.geolocation.watchPosition` con
  `enableHighAccuracy: true`, `maximumAge: 2000`, `timeout: 10000`.
- El watcher se activa con el botón existente de voz (que pasa a llamarse
  «Alertas: ON/OFF») y se cancela con `clearWatch` al desactivarlo o al
  desmontar.
- `featuresRef` mantiene la lista más reciente; el callback del watcher lee ese
  ref, nunca el array capturado en el render.
- Los candidatos son **todos** los elementos excepto incidencias
  (`rawSourceKey` con prefijo `incidencias-`). **No** se aplican
  `activeCategory`, `rawSource` ni `onlyNavarra`: los filtros son solo visuales.
- Estado por elemento (Mapa `id -> { lastApproachAt, lastInsideAt, inside }`),
  no un cooldown global:
  - Aviso de acercamiento si `distancia <= UMBRAL_ACERCAMIENTO` y han pasado
    `COOLDOWN_ACERCAMIENTO` desde el último aviso de ese elemento.
  - Transición `inside = false -> true` cuando la distancia al segmento es
    `<= UMBRAL_DENTRO`; dispara el aviso tenue de entrada. Al salir
    (`distancia > UMBRAL_DENTRO + HISTÉRESIS`) se marca `inside = false`, para
    que volver a entrar avise de nuevo.
  - Recordatorio opcional mientras se sigue dentro: `RECORDATORIO_DENTRO` en
    lugar del cooldown corto, con el mismo tono tenue. Se deja como call del
    implementador si el usuario no lo especifica.
- **Selección de un único aviso por tick**: el estado de todos los elementos se
  actualiza siempre, pero se recogen solo los disparos (`approach` / `inside`)
  de ese tick y se elige el de **menor distancia**. Ese es el único que suena.
  Un elemento dentro de un tramo tiene distancia 0 a la polilínea, por lo que
  gana sobre los puntos cercanos: al entrar en el NA‑2410 se oye el aviso del
  tramo, no el de un radar suelto del cruce. Si hay empate, gana `inside` sobre
  `approach` y después el `id` más bajo, para que el resultado sea determinista.
  Así se actualizan los estados de entrada/salida de todos los tramos sin
  lanzar decenas de chimes.

### 3. Audio y voz

- `playChime(level)`: un `AudioContext` creado en el gesto del botón; dos
  osciladores senoidales muy cortos (~80–120 ms), `gain` bajo. Nivel
  `approach` ~0.10, nivel `inside` ~0.05. Sin ficheros externos.
- `speakAlert(text, level)`: `SpeechSynthesisUtterance` con `lang = "es-ES"`,
  `volume` ~0.65 en acercamiento y ~0.4 dentro, `rate` ~0.95. Llamar a
  `cancel()` solo antes de hablar, para no solapar avisos.
- Orden: chime suave → voz. Si `speechSynthesis` no existe, se mantiene solo el
  chime; si no hay Web Audio, se mantiene solo la voz.
- `voiceStatus` deja de estar vacío y muestra el último aviso con su nivel,
  para poder verificarlo en el navegador.

### 4. Interfaz

- El botón «🔊 Voz: ON/OFF» pasa a «🔔 Alertas: ON/OFF» y activa watcher + voz +
  chime. Se mantiene `aria-pressed`.
- Un botón pequeño «Probar aviso» reproduce el chime y la frase de ejemplo,
  para ajustar volumen sin conducir.
- El texto de estado existente sigue mostrando la ubicación y el último aviso.
- Sin panel de ajustes nuevo: los umbrales y volúmenes son constantes
  documentadas al inicio de `alert-utils.js` / `App.jsx`.

### 5. Datos y fiabilidad

- No se altera el pipeline Python ni los GeoJSON: los avisos leen lo ya
  publicado. Si una fuente falla, el pipeline ya conserva el último fichero
  bueno; el aviso seguirá usando esa copia.
- Las zonas no certificadas se identifican con `isHistoricalMobile()` y con la
  procedencia OSM/posibles. La voz lo dice; el popup ya muestra todas las
  propiedades.

### 6. Pruebas y verificación

- `tests/alert-utils.test.mjs`: distancia a punto, distancia a segmento, punto
  sobre la polilínea NA-2410, extremos, mensaje certificado vs no certificado
  (incluyendo `active: false` y `valid_to` vencido), mensaje de entrada a tramo
  y selección determinista del disparo más cercano.
- `npm test` debe quedar en verde (26 JS existentes + nuevos + 39 Python).
- `npm run build` debe compilar.
- Verificación manual en navegador con geolocalización simulada: acercamiento a
  un punto, acercamiento al NA-2410 por el extremo de Uharte Arakil, entrada,
  salida y reentrada, y comprobación de que los filtros de la leyenda no
  silencian el aviso.
- Revisar que no haya errores de consola y que `voiceStatus` refleje ambos
  niveles.

## Lo que queda a criterio del implementador

- Valores numéricos exactos de umbrales, cooldowns, volúmenes y frecuencias del
  chime, dentro de los rangos indicados.
- Si el recordatorio dentro del tramo se emite cada pocos minutos o solo al
  entrar (por defecto: solo al entrar, con histéresis para reavisar al volver).
- Estructura interna del estado por elemento y de los effects de React.
- Redacción final de las frases, siempre cortas y en español.

## Supuestos registrados como decisiones del diseñador (no del usuario)

- Umbral de acercamiento inicial: 1500 m (el que ya usaba el código).
- Umbral «dentro de tramo» inicial: 60 m de la polilínea, con 40 m de
  histéresis para salir.
- Cooldown de acercamiento por elemento: 30 s; aviso de entrada: una vez por
  entrada.
- El botón existente se reutiliza en lugar de añadir otro interruptor.
