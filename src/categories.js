/**
 * Clasificación pura de elementos, sin imports de React/Leaflet.
 * Así se puede probar con `node --test`.
 */

/**
 * Clasifica un elemento según su tipo, sin importar la fuente.
 * Los tramos INVIVE de "Tramo de radar móvil" son radares móviles anunciados,
 * no cabinas fijas.
 */
export function isHistoricalMobile(feature) {
  const props = feature?.properties || {};
  return props.source === "historico_movil" && props.historical === true;
}

export function getCategory(feature) {
  const props = feature?.properties || {};
  const source = props.source || "";
  const kind = props.kind || "";

  if ((source === "navarra" || source === "euskadi") && props.title) return "incidencias";
  if (source === "vitoria_foto_rojo" || kind === "photo_red" || kind === "traffic_light") {
    return "semaforos";
  }
  if (
    kind === "mobile_location" ||
    kind === "mobile_announced" ||
    kind === "mobile_recurring" ||
    // INVIVE = "Tramo de radar móvil" anunciado por la DGT: No es una cabina fija.
    (source === "dgt_invive" && (kind === "stretch" || /tramo de radar m[oó]vil/i.test(props.name || ""))) ||
    source === "vitoria_ayto" ||
    source === "vitoria_ayto_movil" ||
    source === "donostia_movil"
  ) {
    return "moviles";
  }
  if (source === "osm" || source === "osm_notes") return "posibles";
  return "fijos";
}
