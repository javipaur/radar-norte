import {
  BroadcastIcon,
  CarIcon,
  QuestionIcon,
  TrafficSignalIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { divIcon } from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";

// "Coche con radar": el coche de Phosphor + unas ondas de radar en la esquina.
function MobileRadarIcon({ size = 24, ...rest }) {
  return (
    <span className="rn-combo-icon">
      <CarIcon size={size} {...rest} />
      <BroadcastIcon
        className="rn-combo-waves"
        size={Math.max(8, Math.round(size * 0.5))}
        {...rest}
      />
    </span>
  );
}

// Fijos: ondas concéntricas con centro, el equivalente a un icono de radar.
export const CATEGORIES = [
  {
    id: "fijos",
    label: "Fijos",
    description: "Cabinas, radares permanentes y tramos de velocidad",
    colorHint: "rojo",
    Icon: BroadcastIcon,
  },
  {
    id: "moviles",
    label: "Móviles",
    description: "Radares móviles anunciados",
    colorHint: "naranja",
    Icon: MobileRadarIcon,
  },
  {
    id: "semaforos",
    label: "Semáforos",
    description: "Foto-rojo y semáforos S (velocidad)",
    colorHint: "azul / morado",
    Icon: TrafficSignalIcon,
  },
  {
    id: "posibles",
    label: "Posibles",
    description: "Puntos detectados en OSM, sin verificar",
    colorHint: "gris",
    Icon: QuestionIcon,
  },
];

export const INCIDENT_CATEGORY = {
  id: "incidencias",
  label: "Incidencias",
  description: "Obras, retenciones y avisos de tráfico en directo",
  colorHint: "rojo oscuro",
  Icon: WarningIcon,
};

export const ALL_CATEGORIES = [...CATEGORIES, INCIDENT_CATEGORY];

/**
 * Clasifica un elemento según su tipo, sin importar la fuente.
 * Los tramos (INVIVE, section, stretch) van con los fijos.
 */
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
    source === "vitoria_ayto" ||
    source === "vitoria_ayto_movil" ||
    source === "donostia_movil"
  ) {
    return "moviles";
  }
  if (source === "osm" || source === "osm_notes") return "posibles";
  return "fijos";
}

/** Icono SVG reutilizado en el mapa para cada categoría. */
export function makeCategoryIcon(category) {
  const Icon = category.Icon;
  return divIcon({
    className: "rn-marker-wrapper",
    html: `<span class="rn-marker rn-marker--${category.id}">${renderToStaticMarkup(
      <Icon size={20} weight="fill" color="currentColor" />
    )}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -14],
  });
}
