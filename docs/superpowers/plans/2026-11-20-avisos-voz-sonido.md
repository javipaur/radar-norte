# Avisos por voz y sonido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar por voz y sonido al acercarse a un radar o al entrar en un tramo INVIVE, con un solo aviso por momento y distancias medidas sobre la geometría completa.

**Architecture:** Toda la lógica pura (distancia a geometría, certificación, mensajes, estado por elemento y selección del aviso) vive en un módulo nuevo `src/alert-utils.js`, testeable con `node --test` sin React. `src/App.jsx` solo mantiene el `watchPosition`, el `AudioContext` y `speechSynthesis`, y llama a esos helpers. No se toca el pipeline Python ni los GeoJSON.

**Tech Stack:** React 19, Vite 8, Leaflet (sin cambios), Web Speech API, Web Audio API, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-20-avisos-voz-sonido-design.md`

## Global Constraints

- `engines.node` = `>=22.12.0` (Vite 8); `npm test` = `node --test tests/*.test.mjs && python -m unittest discover -s scripts -p "test_*.py"`.
- Sin backend, sin dependencias nuevas, sin ficheros de audio externos.
- Los avisos leen solo los GeoJSON ya publicados en `public/data/processed/`; no se añaden fuentes nuevas de radares.
- Los filtros visuales (`activeCategory`, `rawSource`, `onlyNavarra`) **nunca** afectan a los avisos; solo se excluyen las incidencias (`rawSourceKey` con prefijo `incidencias-`).
- Mensajes en español, `lang = "es-ES"`. Zonas posibles, históricas, inactivas o con `valid_to` vencido se anuncian como **no certificadas**.
- Un único aviso por tick: el disparo con menor distancia; `inside` gana en empate y después el `id` más bajo.
- Umbrales: `APPROACH_DISTANCE_M = 1500`, `INSIDE_DISTANCE_M = 60`, `INSIDE_EXIT_HYSTERESIS_M = 40`, `APPROACH_COOLDOWN_MS = 30000`.
- No commitear ni pushear salvo petición explícita del usuario; los pasos de commit aparecen marcados como condicionales.

## Review Focus

- **Extremo del NA‑2410 en Uharte Arakil**: medir distancia a la polilínea, no al punto medio (que está a kilómetros) → test de distancia sobre el primer extremo real en Task 1.
- **Cruce con decenas de puntos a <1500 m**: debe sonar un solo aviso, no una ráfaga → test de `chooseAlert` en Task 2 + verificación en navegador en Task 3.
- **Elementos `active: false` / `valid_to` vencido / históricos / OSM**: deben decir «no certificado» → tests de `isCertified` y `buildAlertMessage` en Task 2.
- **Salir y volver a entrar en el mismo tramo**: debe avisar de nuevo al reentrar, pero no mientras sigue dentro → test de `collectAlerts` en Task 2.
- **Filtrar el mapa por categoría o fuente**: no debe silenciar un aviso → verificación en navegador en Task 3.

---

### Task 1: Helpers de distancia sobre geometría real

**Files:**
- Create: `src/alert-utils.js`
- Create: `tests/alert-utils.test.mjs`
- Modify: `src/App.jsx` (quitar la definición local de `haversineDistance` e importarla)

**Interfaces:**
- Consumes: GeoJSON features con `geometry.type` `Point` o `LineString` (coordenadas `[lon, lat]`).
- Produces: `haversineDistanceMeters(lat1, lon1, lat2, lon2) -> number`; `distanceToGeometryMeters(lat, lon, feature) -> number | null`; constantes `APPROACH_DISTANCE_M`, `INSIDE_DISTANCE_M`, `INSIDE_EXIT_HYSTERESIS_M`, `APPROACH_COOLDOWN_MS`.

- [ ] **Step 1: Write the failing tests**

En `tests/alert-utils.test.mjs`, con `import test from "node:test"`, `import assert from "node:assert/strict"` y los imports anteriores:

```js
const point = (lon, lat) => ({ type: "Point", coordinates: [lon, lat] });
const line = (coords) => ({ type: "LineString", coordinates: coords });
const feature = (geometry, props = {}) => ({ type: "Feature", id: "x", geometry, properties: props });

test("haversineDistanceMeters convierte grados en metros", () => {
  assert.ok(Math.abs(haversineDistanceMeters(42.8, -2.0, 42.81, -2.0) - 1112) < 5);
});

test("distanceToGeometryMeters mide a un Point", () => {
  assert.ok(Math.abs(distanceToGeometryMeters(42.8, -2.0, feature(point(-2.001, 42.8)))) < 120);
});

test("distanceToGeometryMeters usa el segmento, no el punto medio del tramo", () => {
  const tramo = feature(line([[-2.0, 42.8], [-1.0, 42.8]]));
  const d = distanceToGeometryMeters(42.8005, -1.05, tramo);
  assert.ok(d !== null && d < 100, `distancia al segmento: ${d}`);
});

test("distanceToGeometryMeters da ~0 en el extremo real del NA-2410", () => {
  const na2410 = feature(line([[-1.82876, 42.91911], [-2.22958, 42.86721]]));
  const d = distanceToGeometryMeters(42.91911, -1.82876, na2410);
  assert.ok(d !== null && d < 1, `distancia al extremo: ${d}`);
});

test("distanceToGeometryMeters devuelve null si la geometría no es utilizable", () => {
  assert.equal(distanceToGeometryMeters(42.8, -2.0, feature({ type: "Polygon", coordinates: [] })), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/alert-utils.test.mjs`
Expected: FAIL con `SyntaxError: Cannot find module '../src/alert-utils.js'`.

- [ ] **Step 3: Implement the helpers**

En `src/alert-utils.js`:
- Declarar las cuatro constantes con los valores exactos de Global Constraints.
- `haversineDistanceMeters`: fórmula de haversine con `R = 6371000`, misma que tenía `App.jsx` en las líneas 30–40.
- `distanceToGeometryMeters(lat, lon, feature)`: para `Point`, haversine directo; para `LineString`, recorrer cada par consecutivo de posiciones, proyectar el punto sobre el segmento en un plano local equirectangular `(x = lon * cos(latRef), y = lat)` y devolver el mínimo de `haversineDistanceMeters` al punto proyectado; ignorar segmentos de longitud cero; `null` para cualquier otra geometría o coordenadas no finitas.
- Exportar todo con `export`.

En `src/App.jsx`: borrar la función local `haversineDistance` y añadir `haversineDistanceMeters` al import de `./alert-utils.js`. Los dos usos existentes (líneas 280 y 436-460) pasan a llamar al nombre importado; `getPointCoords` se conserva porque sigue usándose para dibujar.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/alert-utils.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit (solo si el usuario lo pide)**

```bash
git add src/alert-utils.js src/App.jsx tests/alert-utils.test.mjs
git commit -m "feat: medir distancia de avisos a la geometría completa"
```

---

### Task 2: Certificación, mensajes, estado y selección de aviso

**Files:**
- Modify: `src/alert-utils.js`
- Modify: `tests/alert-utils.test.mjs`

**Interfaces:**
- Consumes: `distanceToGeometryMeters`, `APPROACH_DISTANCE_M`, `INSIDE_DISTANCE_M`, `INSIDE_EXIT_HYSTERESIS_M`, `APPROACH_COOLDOWN_MS` de Task 1; `isHistoricalMobile` y `getCategory` de `src/categories.js`; `rawSourceKey` de `src/raw-view.js`.
- Produces:
  - `isCertified(feature, now = Date.now()) -> boolean`
  - `buildAlertMessage(feature, kind, distanceMeters, now = Date.now()) -> string`
  - `collectAlerts(features, lat, lon, now, previousStates = new Map()) -> { states: Map<string, {inside: boolean, lastApproachAt: number, lastInsideAt: number}>, triggers: Array<{feature, kind: "approach"|"inside", distanceMeters: number}> }`
  - `chooseAlert(triggers) -> {feature, kind, distanceMeters} | null`

- [ ] **Step 1: Write the failing tests**

Añadir a `tests/alert-utils.test.mjs`:

```js
const dgt = (id, props = {}) => ({
  type: "Feature", id, geometry: point(-2.0, 42.8),
  properties: { source: "dgt", active: true, valid_from: null, valid_to: null, road_ref: "A-1", km: 12.3, ...props },
});
const NOW = Date.parse("2026-11-20T12:00:00Z");

test("isCertified distingue activos de históricos, OSM, inactivos y caducados", () => {
  assert.equal(isCertified(dgt("a")), true);
  assert.equal(isCertified(dgt("b", { source: "historico_movil", historical: true })), false);
  assert.equal(isCertified(dgt("c", { source: "osm" })), false);
  assert.equal(isCertified(dgt("d", { active: false })), false);
  assert.equal(isCertified(dgt("e", { valid_to: "2026-11-19T00:00:00Z" }), NOW), false);
  assert.equal(isCertified(dgt("f", { valid_from: "2026-11-21T00:00:00Z" }), NOW), false);
  assert.equal(isCertified(dgt("g", { valid_to: "2026-11-21T00:00:00Z" }), NOW), true);
});

test("buildAlertMessage nombra vía, pk y distancia en el acercamiento", () => {
  const msg = buildAlertMessage(dgt("a"), "approach", 1200, NOW);
  assert.match(msg, /Radar cercano/);
  assert.match(msg, /A-1/);
  assert.match(msg, /12\.3/);
  assert.match(msg, /1200 metros/);
  assert.doesNotMatch(msg, /no certificado/i);
});

test("buildAlertMessage marca como no certificado un histórico y uno caducado", () => {
  assert.match(buildAlertMessage(dgt("b", { source: "historico_movil", historical: true }), "approach", 500, NOW), /no certificado/i);
  assert.match(buildAlertMessage(dgt("e", { valid_to: "2026-11-19T00:00:00Z" }), "approach", 500, NOW), /no certificado/i);
});

test("buildAlertMessage avisa de entrada a tramo y distingue INVIVE", () => {
  const tramo = { ...dgt("t", { source: "dgt_invive", kind: "stretch", name: "NA-2410" }), geometry: line([[-1.82876, 42.91911], [-2.22958, 42.86721]]) };
  assert.match(buildAlertMessage(tramo, "inside", 0, NOW), /dentro del tramo/i);
  assert.match(buildAlertMessage(tramo, "approach", 1000, NOW), /tramo de vigilancia/i);
});

test("chooseAlert elige el más cercano, gana inside en empate y es determinista", () => {
  const a = dgt("a"), b = dgt("b"), c = dgt("c");
  assert.equal(chooseAlert([]), null);
  assert.equal(chooseAlert([
    { feature: a, kind: "approach", distanceMeters: 900 },
    { feature: b, kind: "approach", distanceMeters: 200 },
  ]).feature.id, "b");
  assert.equal(chooseAlert([
    { feature: a, kind: "approach", distanceMeters: 30 },
    { feature: b, kind: "inside", distanceMeters: 30 },
  ]).kind, "inside");
  assert.equal(chooseAlert([
    { feature: c, kind: "approach", distanceMeters: 40 },
    { feature: a, kind: "approach", distanceMeters: 40 },
  ]).feature.id, "a");
});

test("collectAlerts avisa al entrar, no repite dentro y avisa al reentrar", () => {
  const tramo = { ...dgt("t", { source: "dgt_invive" }), geometry: line([[-2.0, 42.8], [-1.0, 42.8]]) };
  const dentro = { lat: 42.8, lon: -1.5 };
  const fuera = { lat: 42.81, lon: -1.5 };

  const first = collectAlerts([tramo], dentro.lat, dentro.lon, NOW);
  assert.equal(first.triggers.filter((t) => t.kind === "inside").length, 1);
  assert.equal(first.states.get("t").inside, true);

  const still = collectAlerts([tramo], dentro.lat, dentro.lon, NOW + 1000, first.states);
  assert.equal(still.triggers.filter((t) => t.kind === "inside").length, 0);

  const salida = collectAlerts([tramo], fuera.lat, fuera.lon, NOW + 2000, still.states);
  assert.equal(salida.states.get("t").inside, false);

  const reentry = collectAlerts([tramo], dentro.lat, dentro.lon, NOW + 3000, salida.states);
  assert.equal(reentry.triggers.filter((t) => t.kind === "inside").length, 1);
});

test("collectAlerts respeta el cooldown por elemento", () => {
  const radar = dgt("r");
  const first = collectAlerts([radar], 42.8, -2.0, NOW);
  assert.ok(first.triggers.some((t) => t.feature.id === "r" && t.kind === "approach"));
  const second = collectAlerts([radar], 42.8, -2.0, NOW + 1000, first.states);
  assert.equal(second.triggers.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/alert-utils.test.mjs`
Expected: FAIL con `isCertified is not defined`.

- [ ] **Step 3: Implement certification, messages, selection and state**

En `src/alert-utils.js`:
- `isCertified`: `false` si `isHistoricalMobile(feature)`, `getCategory(feature) === "posibles"`, `props.active === false`, `Date.parse(props.valid_from) > now` o `Date.parse(props.valid_to) < now`; fechas `null`/vacías se ignoran; en otro caso `true`.
- `buildAlertMessage`: para `approach`, si `getCategory(feature) === "moviles"` con geometría `LineString`, usar `<vía>, tramo de vigilancia a <n> metros`; si no, `Radar cercano, <vía> pk <km>, a <n> metros`. Para `inside`, `Estás dentro del tramo de vigilancia, <vía>`. Usar `road_ref`/`name` como vía y `km` como pk; si faltan, omitir el fragmento sin dejar comas dobles. Añadir `· zona no certificada` al final cuando `!isCertified(feature, now)`. Redondear `distanceMeters` con `Math.round`.
- `chooseAlert`: devolver `null` si no hay triggers; ordenar por `distanceMeters` ascendente, con descriptor `kind === "inside" ? 0 : 1` y `String(feature.id)` como tercer criterio; devolver el primero.
- `collectAlerts`: para cada feature con distancia finita, clave `String(feature.id ?? feature.__renderKey ?? indice)`, estado previo o `{inside:false,lastApproachAt:0,lastInsideAt:0}`; si `d <= INSIDE_DISTANCE_M` y `!inside`, push trigger `inside` y marcar `inside=true`; si `d > INSIDE_DISTANCE_M + INSIDE_EXIT_HYSTERESIS_M`, marcar `inside=false`; si `d <= APPROACH_DISTANCE_M` y `now - lastApproachAt >= APPROACH_COOLDOWN_MS`, push trigger `approach` y actualizar `lastApproachAt`. Devolver un **nuevo** `Map` con los estados (no mutar el anterior) y los triggers.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/alert-utils.test.mjs`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit (solo si el usuario lo pide)**

```bash
git add src/alert-utils.js tests/alert-utils.test.mjs
git commit -m "feat: seleccionar un solo aviso no certificado por momento"
```

---

### Task 3: Integrar seguimiento, voz y sonido en la interfaz

**Files:**
- Modify: `src/App.jsx`
- Modify: `README.md` (añadir una nota corta sobre los avisos y su limitación en segundo plano)

**Interfaces:**
- Consumes: `distanceToGeometryMeters`, `collectAlerts`, `chooseAlert`, `buildAlertMessage`, `INSIDE_DISTANCE_M` de Task 1 y 2; `rawSourceKey` de `src/raw-view.js`.
- Produces: botón «🔔 Alertas: ON/OFF», botón «Probar aviso», `voiceStatus` con el último aviso; `startAlerts()` / `stopAlerts()` como funciones internas del componente.

- [ ] **Step 1: Add refs and the watcher**

En `src/App.jsx`:
- Importar los helpers nuevos.
- Sustituir `lastAlertRef` por `alertStateRef = useRef(new Map())`, añadir `featuresRef = useRef([])`, `watchIdRef = useRef(null)`, `audioCtxRef = useRef(null)`; mantener `voiceOn` como estado que representa «alertas activas».
- `useEffect(() => { featuresRef.current = features; }, [features])`.
- En `handleLocate` mantener solo el centrado del mapa y el `setStatus`; quitar el cálculo de radar cercano y eliminar el `useCallback` `speak` existente.
- `startAlerts`: crear/reanudar `AudioContext` en el gesto del clic; registrar `navigator.geolocation.watchPosition(onPosition, onError, {enableHighAccuracy:true, maximumAge:2000, timeout:10000})`; guardar el id en `watchIdRef`.
- `onPosition`: filtrar `featuresRef.current` excluyendo `rawSourceKey(f).startsWith("incidencias-")` (sin aplicar `activeCategory`, `rawSource` ni `onlyNavarra`); llamar a `collectAlerts(candidatos, lat, lon, Date.now(), alertStateRef.current)`; guardar `result.states` en el ref; `chooseAlert(result.triggers)`; si hay elegido, reproducir chime + voz y `setVoiceStatus(texto)`.
- `stopAlerts`: `clearWatch`, `speechSynthesis.cancel()`, cerrar `AudioContext` y limpiar `voiceStatus`.
- `useEffect` de limpieza al desmontar que llame a `stopAlerts`.

- [ ] **Step 2: Add the chime and the voice**

En `src/App.jsx`:
- `playChime(kind)`: usar `audioCtxRef.current`; si no existe, no hacer nada. Crear un `GainNode` con ganancia `0.10` para `approach` y `0.05` para `inside`; dos osciladores senoidales (660/880 Hz para `approach`, 440/520 Hz para `inside`), cada uno con `gain` en rampa de 0.09 s; pararlos a los 0.12 s. Nunca lanzar excepción si Web Audio no está disponible.
- `speakAlert(text, kind)`: si `!voiceOn` o no hay `speechSynthesis`, volver; `cancel()`, crear `SpeechSynthesisUtterance(text)`, `lang="es-ES"`, `volume=0.65` para `approach` y `0.4` para `inside`, `rate=0.95`, `speak()`.
- `toggleAlerts`: si no hay geolocalización, avisar con `alert(...)` y no activar; si no hay `speechSynthesis`, activar igualmente y usar solo el chime; si se activa, `setVoiceOn(true)` y `startAlerts()`; si se desactiva, `stopAlerts()` y `setVoiceOn(false)`.
- El botón «Probar aviso» llama a `playChime("approach")` y `speakAlert("Radar cercano, A-1 pk 12,3, a 500 metros · prueba", "approach")` sin necesitar geolocalización.

- [ ] **Step 3: Update the UI**

En `src/App.jsx`: botón `🔔 Alertas: ON/OFF` con `aria-pressed={voiceOn}` en lugar del actual `🔊 Voz: ON/OFF`; botón nuevo «Probar aviso» al lado; `voiceStatus` mostrando el último aviso (ya existe un `<span>` en la línea ~489). En `README.md`, añadir bajo «Qué muestra» o «Limitaciones»: avisos por voz y sonido, dos niveles, funcionan con pantalla encendida y no en segundo plano.

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: PASS, 38 JS tests (26 anteriores + 12 nuevos) y 39 Python.

Run: `npm run build`
Expected: BUILD OK, sin errores de Vite.

Verificación manual en navegador con geolocalización simulada:
1. Activar «Alertas» y acercar la posición simulada a un punto DGT: se oye un chime suave y una voz con vía/pk/distancia.
2. Simular posición en el primer extremo del NA‑2410 `[-1.82876, 42.91911]`: se oye el aviso tenue de tramo; la voz indica «no certificado» solo si el elemento lo es (el tramo DGT no lo es).
3. Colocar la posición en el cruce de Uharte Arakil con decenas de puntos a <1500 m: suena **un solo** aviso.
4. Activar y luego desactivar la categoría «Móviles» y la fuente «DGT» en la leyenda: el aviso sigue sonando.
5. Salir del tramo y volver a entrar: vuelve a sonar el aviso de entrada; quedarse dentro no lo repite.
6. Pulsar «Probar aviso»: suena sin geolocalización.
7. Consola del navegador: 0 errores.

- [ ] **Step 5: Commit (solo si el usuario lo pide)**

```bash
git add src/App.jsx README.md
git commit -m "feat: avisar por voz y sonido al acercarse y entrar en tramos"
```
