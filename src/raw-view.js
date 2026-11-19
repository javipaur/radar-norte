/**
 * Lógica pura del "modo crudo": dibujar cada elemento tal como llega de su
 * fichero, sin fusionar duplicados ni clasificarlo en categorías.
 * No importa React ni Leaflet: se prueba con `node --test`.
 */

/** Colores propios por fuente, distintos de los de las categorías normales. */
export const RAW_SOURCES = [
  { id: "dgt", label: "DGT · fijos", color: "#e53935" },
  { id: "dgt_invive", label: "DGT · INVIVE (móviles)", color: "#fb8c00" },
  { id: "navarra", label: "Navarra · radares", color: "#1976d2" },
  { id: "euskadi", label: "Euskadi · radares", color: "#2e7d32" },
  { id: "osm", label: "OSM · radares", color: "#8e24aa" },
  { id: "osm_notes", label: "OSM · notas", color: "#ab47bc" },
  { id: "donostia", label: "Donostia · fijos", color: "#00838f" },
  { id: "donostia_movil", label: "Donostia · móviles", color: "#00acc1" },
  { id: "sct", label: "SCT · fijos", color: "#f9a825" },
  { id: "sct_remolc", label: "SCT · remolque", color: "#ff7043" },
  { id: "vitoria_ayto", label: "Vitoria · ayto.", color: "#5d4037" },
  { id: "vitoria_ayto_movil", label: "Vitoria · móviles", color: "#8d6e63" },
  { id: "vitoria_foto_rojo", label: "Vitoria · foto-rojo", color: "#c62828" },
  { id: "incidencias-navarra", label: "Incidencias · Navarra", color: "#ad1457" },
  { id: "incidencias-euskadi", label: "Incidencias · Euskadi", color: "#d81b60" },
  { id: "desconocida", label: "Sin fuente", color: "#607d8b" },
];

/**
 * Clave de agrupación de la vista cruda. Las incidencias se separan por su
 * fichero de origen (`__dataset`) porque comparten `source` con los radares.
 */
export function rawSourceKey(feature) {
  const props = feature?.properties || {};
  const dataset = props.__dataset;
  if (typeof dataset === "string" && dataset.startsWith("incidencias-")) return dataset;
  return props.source || "desconocida";
}

export function rawSourceStyle(key) {
  return (
    RAW_SOURCES.find((source) => source.id === key) || {
      id: key,
      label: String(key),
      color: "#607d8b",
    }
  );
}

/** Marca cada feature con el fichero del que viene, sin mutar el original. */
export function withDataset(features, dataset) {
  return (features || []).map((feature) => ({
    ...feature,
    properties: { ...(feature.properties || {}), __dataset: dataset },
  }));
}

/** Bbox amplio de Navarra: los OSM no traen provincia y hay que situarlos. */
const NAVARRA_BBOX = { minLon: -2.35, maxLon: -1.2, minLat: 41.75, maxLat: 43.3 };

export function isInNavarraScope(feature) {
  const props = feature?.properties || {};
  if (String(props.province) === "31") return true;
  if (props.source !== "osm" && props.source !== "osm_notes") return false;

  const geom = feature?.geometry || {};
  const coords = geom.type === "Point" ? geom.coordinates : null;
  if (!Array.isArray(coords) || coords.length < 2) return false;
  const [lon, lat] = coords;
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= NAVARRA_BBOX.minLon &&
    lon <= NAVARRA_BBOX.maxLon &&
    lat >= NAVARRA_BBOX.minLat &&
    lat <= NAVARRA_BBOX.maxLat
  );
}

/** Sin fusiones: solo filtros opcionales por zona y por fuente. */
export function filterRawFeatures(features, options = {}) {
  const { onlyNavarra = false, source = null } = options;
  return (features || []).filter((feature) => {
    if (onlyNavarra && !isInNavarraScope(feature)) return false;
    if (source && rawSourceKey(feature) !== source) return false;
    return true;
  });
}

/** Recuento por fuente para pintar la leyenda del modo crudo. */
export function rawSourceCounts(features) {
  const counts = {};
  for (const feature of features || []) {
    const key = rawSourceKey(feature);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
