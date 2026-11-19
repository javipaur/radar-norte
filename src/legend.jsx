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
    description: "Cabinas y radares permanentes",
    colorHint: "rojo",
    Icon: BroadcastIcon,
  },
  {
    id: "moviles",
    label: "Móviles",
    description: "Radares móviles anunciados y tramos INVIVE",
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

// La lógica de clasificación vive en un módulo puro para poder testearla.
export { getCategory } from "./categories.js";

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
