/**
 * Utilidades puras para unir las fuentes SIN perder información.
 * No importan React ni Leaflet: se pueden probar con `node --test`.
 */
import { isHistoricalMobile } from "./categories.js";

// Mismos colores que .legend-badge--* / .rn-marker--* en App.css.
export const CATEGORY_COLORS = {
  fijos: "#e53935",
  moviles: "#fb8c00",
  semaforos: "#6a1b9a",
  posibles: "#9e9e9e",
  incidencias: "#b71c1c",
};

const LABELS = {
  source: "Fuente",
  sources: "Fuentes",
  title: "Título",
  name: "Nombre",
  location: "Ubicación",
  address: "Dirección",
  date: "Fecha",
  updated: "Actualizado",
  severity: "Gravedad/Nivel",
  effect: "Afección",
  category: "Categoría",
  type: "Tipo",
  details: "Detalles",
  road: "Carretera",
  road_ref: "Vía",
  pk: "PK",
  pkStart: "PK inicio",
  pkEnd: "PK fin",
  km: "PK",
  km_from: "Desde PK",
  km_to: "Hasta PK",
  km_direction: "Sentido PK",
  direction: "Sentido",
  direction_semantics: "Semántica del sentido",
  direction_confidence: "Confianza del sentido",
  maxspeed: "Límite (km/h)",
  radius_m: "Radio (m)",
  bearing: "Orientación",
  bearing_source: "Origen de la orientación",
  reported: "Reportado",
  notes: "Notas",
  kind: "Tipo de dato",
  active: "Activo",
  certified: "Certificado",
  historical: "Histórico",
  first_seen: "Visto en",
  historical_note: "Nota histórica",
  geometry_source: "Origen de la geometría",
  dgt_extremos: "Extremos publicados por la DGT",
  straight_length_km: "Distancia en recta (km)",
  traced_length_km: "Longitud por carretera (km)",
  trace_tolerance_m: "Tolerancia del trazado (m)",
  valid_from: "Válido desde",
  valid_to: "Válido hasta",
  province: "Provincia",
  attribution: "Atribución",
  url: "Enlace",
};

const stable = (value) => JSON.stringify(value);
const isEmpty = (value) => value === null || value === undefined || value === "";

// Campos que son ANOTACIÓN, no identidad: dos capas distintas pueden
// describir el mismo punto con distinta procedencia o texto de nota.
// Todo lo demás (fecha, efecto, gravedad, PK, vía...) sí distingue entidades.
const NON_IDENTITY_KEYS = new Set(["source", "sources", "notes"]);

/** Las dos capas de Vitoria son la misma colección (doc de investigación §5). */
export function sourceFamily(source) {
  if (source === "vitoria_ayto" || source === "vitoria_ayto_movil") return "vitoria";
  return source || "";
}

/**
 * Identidad estricta: familia de fuente + geometría completa + título/nombre.
 * Así dos incidencias distintas en el MISMO punto no se fusionan, y dos tramos
 * que comparten punto medio pero tienen distinto recorrido tampoco.
 */
export function featureIdentity(feature) {
  const props = feature?.properties || {};
  const geom = feature?.geometry || {};
  const identityProps = Object.keys(props)
    .filter((key) => !NON_IDENTITY_KEYS.has(key) && !key.startsWith("__"))
    .sort()
    .map((key) => `${key}:${stable(props[key])}`)
    .join("|");
  return [
    sourceFamily(props.source || ""),
    geom.type || "",
    stable(geom.coordinates ?? null),
    identityProps,
  ].join("||");
}

/** Unión de propiedades: si hay valores distintos se conservan TODOS en un array. */
function mergeProperties(list) {
  const merged = {};
  for (const props of list) {
    for (const [key, value] of Object.entries(props || {})) {
      if (isEmpty(value)) continue;
      if (!(key in merged)) {
        merged[key] = value;
        continue;
      }
      const values = Array.isArray(merged[key]) ? [...merged[key]] : [merged[key]];
      if (!values.some((v) => stable(v) === stable(value))) values.push(value);
      merged[key] = values;
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    if (Array.isArray(value) && value.length === 1) merged[key] = value[0];
  }
  // `source` debe seguir siendo escalar: getCategory() y los filtros lo comparan.
  if (Array.isArray(merged.source)) {
    merged.sources = merged.source;
    merged.source = merged.source[0];
  }
  return merged;
}

/**
 * Fusiona únicamente features con identidad idéntica. Devuelve also cuántos
 * duplicados se han unido (informativo), sin descartar ningún valor.
 */
export function mergeDuplicateFeatures(features) {
  const groups = new Map();
  for (const feature of features || []) {
    const id = featureIdentity(feature);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(feature);
  }

  let mergedCount = 0;
  const out = [];
  for (const group of groups.values()) {
    if (group.length > 1) mergedCount += group.length - 1;
    const base = group[0];
    out.push({
      ...base,
      properties:
        group.length > 1
          ? mergeProperties(group.map((f) => f.properties))
          : { ...base.properties },
    });
  }
  return { features: out, mergedCount };
}

export function humanizeKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function formatValue(value) {
  if (Array.isArray(value)) return value.map(formatValue).join(" · ");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (isEmpty(value)) return "";
  return String(value);
}

/** Una fila por propiedad: nada del GeoJSON queda fuera del popup. */
export function collectPopupRows(feature) {
  const props = feature?.properties || {};
  const rows = [];
  for (const [key, raw] of Object.entries(props)) {
    if (key.startsWith("__")) continue;
    const value = formatValue(raw);
    if (value === "") continue;
    rows.push({ key, label: LABELS[key] || humanizeKey(key), value, raw });
  }
  return rows;
}

/** Posiciones de Leaflet para dibujar el tramo COMPLETO, no su punto medio. */
export function featurePaths(feature) {
  const geom = feature?.geometry || {};
  if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
    return geom.coordinates.map(([lon, lat]) => [lat, lon]);
  }
  if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
    return geom.coordinates.map((line) => line.map(([lon, lat]) => [lat, lon]));
  }
  return null;
}

/**
 * Orden de pintado en el mapa: las zonas móviles históricas van AL FINAL.
 * Leaflet con SVG pinta en orden de DOM; lo último queda encima y es lo que
 * recibe el clic. En el cruce de Uharte Arakil hay decenas de marcadores
 * apiñados, así que sin esto el punto conservado queda invisible e inplaceable.
 * Devuelve una copia: no altera el orden de los datos ni los filtros.
 */
export function sortForRender(features) {
  const list = [...(features || [])];
  return list.sort((a, b) => Number(isHistoricalMobile(a)) - Number(isHistoricalMobile(b)));
}

/** Bounds de Leaflet [[sur, oeste], [norte, este]] con puntos y tramos. */
export function featuresBounds(features) {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  const add = ([lat, lon]) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    minLat = Math.min(minLat, lat);
    minLon = Math.min(minLon, lon);
    maxLat = Math.max(maxLat, lat);
    maxLon = Math.max(maxLon, lon);
  };
  for (const feature of features || []) {
    const geom = feature?.geometry || {};
    if (geom.type === "Point") {
      add([geom.coordinates?.[1], geom.coordinates?.[0]]);
      continue;
    }
    const paths = featurePaths(feature);
    if (!paths) continue;
    const lines = Array.isArray(paths[0]?.[0]) ? paths : [paths];
    for (const line of lines) for (const position of line) add(position);
  }
  if (minLat === Infinity) return null;
  return [[minLat, minLon], [maxLat, maxLon]];
}
