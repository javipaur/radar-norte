import test from "node:test";
import assert from "node:assert/strict";
import { getCategory } from "../src/categories.js";

const feature = (properties, geometry = { type: "Point", coordinates: [-2.7, 42.8] }) => ({
  type: "Feature",
  geometry,
  properties,
});

// Datos reales del GeoJSON procesado (provincia 31 = Navarra).
const na2410 = feature(
  {
    name: "Tramo de radar móvil NA-2410 km 0-36.72",
    source: "dgt_invive",
    kind: "stretch",
    road: "NA-2410",
    km_from: 0,
    km_to: 36.72,
    active: true,
    direction: "both",
    province: "31",
  },
  {
    type: "LineString",
    coordinates: [[-1.82876, 42.91911], [-2.22958, 42.86721]],
  }
);

test("el tramo INVIVE NA-2410 de Navarra se clasifica como Móvil, no Fijo", () => {
  assert.equal(
    getCategory(na2410),
    "moviles",
    "el popup decía 'Tipo: Fijos' aunque es un 'Tramo de radar móvil'"
  );
});

test("todos los tramos dgt_invive son Móviles", () => {
  const tramos = [
    { name: "Tramo de radar móvil NA-2410 km 0-36.72", province: "31" },
    { name: "Tramo de radar móvil A-1050 km 0-12.08", province: "04" },
    { name: "Tramo de radar móvil N-230 km 29-64", province: "22" },
  ];
  for (const t of tramos) {
    const f = feature({ ...t, source: "dgt_invive", kind: "stretch" });
    assert.equal(getCategory(f), "moviles", `falló: ${t.name}`);
  }
});

test("el resto de categorías no cambian", () => {
  assert.equal(
    getCategory(feature({ source: "dgt", kind: "stretch", name: "Otro tramo" })),
    "fijos"
  );
  assert.equal(getCategory(feature({ source: "osm", kind: "stretch" })), "posibles");
  assert.equal(
    getCategory(feature({ source: "navarra", title: "Carril izquierdo cortado" })),
    "incidencias"
  );
  assert.equal(
    getCategory(feature({ source: "vitoria_foto_rojo", kind: "photo_red" })),
    "semaforos"
  );
  assert.equal(
    getCategory(feature({ source: "donostia_movil", kind: "mobile_announced" })),
    "moviles"
  );
});
