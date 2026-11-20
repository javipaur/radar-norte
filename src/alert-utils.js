/**
 * Lógica pura de los avisos por proximidad. Sin React ni Leaflet: se prueba
 * con `node --test`. Las coordenadas GeoJSON son siempre [lon, lat].
 */
import { getCategory, isHistoricalMobile } from "./categories.js";
import { featureIdentity } from "./data-utils.js";

/** Distancias y tiempos de los avisos (ver spec 2026-11-20). */
export const APPROACH_DISTANCE_M = 1500;
export const INSIDE_DISTANCE_M = 60;
export const INSIDE_EXIT_HYSTERESIS_M = 40;
export const APPROACH_COOLDOWN_MS = 30000;

const EARTH_RADIUS_M = 6371000;
const alertKeyCache = new WeakMap();

/**
 * Identidad del elemento para el estado de los avisos. Los GeoJSON de Vitoria
 * y Euskadi no traen `id`: usar el índice del array haría que, si una fuente
 * falla al refrescarse, el cooldown de un radar se adjudicara a otro.
 * `featureIdentity` ignora solo anotaciones (source/notes), no fecha ni PK.
 */
export function alertKey(feature) {
  if (!feature || typeof feature !== "object") return "";
  if (alertKeyCache.has(feature)) return alertKeyCache.get(feature);
  const key =
    feature.id !== undefined && feature.id !== null
      ? String(feature.id)
      : String(featureIdentity(feature));
  alertKeyCache.set(feature, key);
  return key;
}

export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function isFiniteCoord(coord) {
  return (
    Array.isArray(coord) &&
    coord.length >= 2 &&
    Number.isFinite(coord[0]) &&
    Number.isFinite(coord[1])
  );
}

/** Distancia del punto [lat, lon] al segmento [lon1,lat1]-[lon2,lat2]. */
function distanceToSegmentMeters(lat, lon, start, end) {
  // Plano local equirectangular: la longitud se escala por cos(lat) para que
  // la proyección sobre el segmento no se sesgue en estas latitudes.
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const x = lon * cosLat;
  const y = lat;
  const x1 = start[0] * cosLat;
  const y1 = start[1];
  const dx = (end[0] - start[0]) * cosLat;
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return haversineDistanceMeters(lat, lon, start[1], start[0]);
  }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  const projectedLon = (x1 + t * dx) / cosLat;
  const projectedLat = y1 + t * dy;
  return haversineDistanceMeters(lat, lon, projectedLat, projectedLon);
}

/**
 * Distancia en metros desde [lat, lon] a la geometría completa del elemento.
 * Para LineString mide a cada tramo, no a su punto medio: el NA-2410 tiene
 * 36 km y el punto medio está a kilómetros de cualquiera de sus extremos.
 * Devuelve null si la geometría no es utilizable.
 */
export function distanceToGeometryMeters(lat, lon, feature) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const geometry = feature?.geometry;
  if (!geometry) return null;

  if (geometry.type === "Point") {
    return isFiniteCoord(geometry.coordinates)
      ? haversineDistanceMeters(lat, lon, geometry.coordinates[1], geometry.coordinates[0])
      : null;
  }

  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    const coords = geometry.coordinates;
    let closest = Infinity;
    for (let i = 1; i < coords.length; i += 1) {
      if (!isFiniteCoord(coords[i - 1]) || !isFiniteCoord(coords[i])) continue;
      const d = distanceToSegmentMeters(lat, lon, coords[i - 1], coords[i]);
      if (d < closest) closest = d;
    }
    return Number.isFinite(closest) ? closest : null;
  }

  return null;
}

/**
 * Un aviso es fiable solo si el elemento sigue vigente y no es una zona
 * posible, histórica, inactiva o caducada. Esas zonas SÍ se anuncian, pero con
 * el sufijo «no certificada».
 */
export function isCertified(feature, now = Date.now()) {
  const props = feature?.properties || {};
  if (isHistoricalMobile(feature)) return false;
  if (getCategory(feature) === "posibles") return false;
  if (props.active === false) return false;

  const validFrom = Date.parse(props.valid_from);
  const validTo = Date.parse(props.valid_to);
  if (Number.isFinite(validFrom) && validFrom > now) return false;
  if (Number.isFinite(validTo) && validTo < now) return false;
  return true;
}

function roadLabel(feature) {
  const props = feature?.properties || {};
  return props.road_ref || props.name || "";
}

/** Frase corta en español para el nivel de aviso indicado. */
export function buildAlertMessage(feature, kind, distanceMeters, now = Date.now()) {
  const props = feature?.properties || {};
  const via = roadLabel(feature);
  const metres = Math.round(distanceMeters);
  const isTramo =
    feature?.geometry?.type === "LineString" && getCategory(feature) === "moviles";

  let text;
  if (kind === "inside") {
    text = "Estás dentro del tramo de vigilancia";
    if (via) text += `, ${via}`;
  } else if (isTramo) {
    text = via ? `${via}, tramo de vigilancia` : "Tramo de vigilancia";
    text += ` a ${metres} metros`;
  } else {
    text = "Radar cercano";
    if (via) text += `, ${via}`;
    if (props.km !== null && props.km !== undefined && props.km !== "") {
      text += `${via ? " " : ", "}pk ${props.km}`;
    }
    text += `, a ${metres} metros`;
  }

  if (!isCertified(feature, now)) text += " · zona no certificada";
  return text;
}

/**
 * Actualiza el estado de cada elemento (sin mutar el mapa anterior) y devuelve
 * los disparos de este tick. `inside` solo aplica a tramos: una cabina puntual
 * no es «un tramo» aunque el coche pase por encima de sus coordenadas.
 */
export function collectAlerts(
  features,
  lat,
  lon,
  now,
  previousStates = new Map()
) {
  const states = new Map(previousStates);
  const triggers = [];

  features.forEach((feature) => {
    const distance = distanceToGeometryMeters(lat, lon, feature);
    if (!Number.isFinite(distance)) return;

    const key = alertKey(feature);
    // Copia: el mapa anterior puede seguir siendo usado por quien lo pasó.
    const previous = {
      inside: false,
      lastApproachAt: 0,
      lastInsideAt: 0,
      ...previousStates.get(key),
    };
    const geometryType = feature.geometry?.type;
    const isTramo = geometryType === "LineString" || geometryType === "MultiLineString";
    let inside = previous.inside;

    if (isTramo && distance <= INSIDE_DISTANCE_M && !inside) {
      triggers.push({ feature, kind: "inside", distanceMeters: distance });
      inside = true;
      previous.lastInsideAt = now;
    } else if (distance > INSIDE_DISTANCE_M + INSIDE_EXIT_HYSTERESIS_M) {
      inside = false;
    }

    if (
      distance <= APPROACH_DISTANCE_M &&
      now - previous.lastApproachAt >= APPROACH_COOLDOWN_MS
    ) {
      triggers.push({ feature, kind: "approach", distanceMeters: distance });
      previous.lastApproachAt = now;
    }

    states.set(key, { ...previous, inside });
  });

  return { states, triggers };
}

/** Un solo aviso por tick: el más cercano; en empate gana `inside` y luego el id. */
export function chooseAlert(triggers) {
  if (!Array.isArray(triggers) || triggers.length === 0) return null;
  const rank = (kind) => (kind === "inside" ? 0 : 1);
  return [...triggers].sort((a, b) => {
    if (a.distanceMeters !== b.distanceMeters) {
      return a.distanceMeters - b.distanceMeters;
    }
    if (rank(a.kind) !== rank(b.kind)) return rank(a.kind) - rank(b.kind);
    const idA = alertKey(a.feature);
    const idB = alertKey(b.feature);
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  })[0];
}

/**
 * Chime con Web Audio. El contexto recibe como parámetro (no se accede a
 * `window`) para poder probarlo sin navegador. Si el móvil lo suspendió al
 * cambiar de app, se reanuda antes de programar los osciladores.
 */
export function playChime(ctx, kind) {
  if (
    !ctx ||
    typeof ctx.createGain !== "function" ||
    typeof ctx.createOscillator !== "function"
  ) {
    return false;
  }

  const schedule = () => {
    const now = ctx.currentTime || 0;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(kind === "inside" ? 0.05 : 0.10, now + 0.09);
    gain.gain.linearRampToValueAtTime(0, now + 0.12);
    gain.connect(ctx.destination);
    const tones = kind === "inside" ? [440, 520] : [660, 880];
    tones.forEach((frequency) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.12);
    });
  };

  try {
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      Promise.resolve(ctx.resume()).then(schedule).catch(() => {});
    } else {
      schedule();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Voz en español. `cancel()` congela la cola en algunos Chrome, así que se
 * llama a `resume()` antes de `speak()`. El contexto y el constructor se pasan
 * como parámetros para que la función sea probable sin navegador.
 */
export function speakAlertText(synth, Utterance, text, kind) {
  if (!synth || !Utterance || !text) return false;
  try {
    if (typeof synth.cancel === "function") synth.cancel();
    if (typeof synth.resume === "function") synth.resume();
    const utter = new Utterance(text);
    utter.lang = "es-ES";
    utter.volume = kind === "inside" ? 0.4 : 0.65;
    utter.rate = 0.95;
    synth.speak(utter);
    return true;
  } catch {
    return false;
  }
}
