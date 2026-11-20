import {
  BroadcastIcon,
  CarIcon,
  TrafficSignalIcon,
  WarningCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react";

// Cada categoría usa un icono Phosphor "fill" sobre un badge redondeado del
// color del marcador, tal como en el mockup v5 aprobado (estilo "Phosphor fill").
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
    Icon: CarIcon,
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
    Icon: WarningCircleIcon,
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
