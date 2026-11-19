import test from "node:test";
import assert from "node:assert/strict";
import {
  rawSourceKey,
  rawSourceStyle,
  withDataset,
  isInNavarraScope,
  filterRawFeatures,
  rawSourceCounts,
} from "../src/raw-view.js";

const point = (lon, lat) => ({ type: "Point", coordinates: [lon, lat] });
const feat = (props, geometry = point(-1.7, 42.8)) => ({
  type: "Feature",
  geometry,
  properties: props,
});

test("rawSourceKey distingue las incidencias de Navarra del radar de la fuente navarra", () => {
  // Sin esto, el radar del Gobierno de Navarra y los cortes de tráfico
  // sharing 'source=navarra' saldrían con el mismo color en la vista cruda.
  const radar = feat({ source: "navarra", name: "Radar fijo A-12" });
  const incidencia = feat({
    source: "navarra",
    title: "Corte de carril",
    __dataset: "incidencias-navarra",
  });

  assert.equal(rawSourceKey(radar), "navarra");
  assert.equal(rawSourceKey(incidencia), "incidencias-navarra");
});

test("rawSourceKey devuelve 'desconocida' cuando el elemento no trae fuente", () => {
  assert.equal(rawSourceKey(feat({})), "desconocida");
});

test("rawSourceStyle da etiqueta y color legible para fuentes conocidas y desconocidas", () => {
  const known = rawSourceStyle("dgt_invive");
  assert.match(known.label, /INVIVE/);
  assert.match(known.color, /^#[0-9a-f]{6}$/i);

  const fallback = rawSourceStyle("fuente_nueva");
  assert.equal(fallback.label, "fuente_nueva");
  assert.match(fallback.color, /^#[0-9a-f]{6}$/i);
});

test("withDataset etiqueta cada feature sin mutar el original", () => {
  const original = feat({ source: "navarra", title: "Corte" });
  const tagged = withDataset([original], "incidencias-navarra");

  assert.equal(tagged[0].properties.__dataset, "incidencias-navarra");
  assert.equal(original.properties.__dataset, undefined);
});

test("isInNavarraScope acepta provincia 31 y OSM de la zona, pero no OSM de Zaragoza", () => {
  assert.equal(isInNavarraScope(feat({ source: "dgt", province: "31" })), true);
  assert.equal(isInNavarraScope(feat({ source: "osm" }, point(-1.678, 42.808))), true);
  assert.equal(isInNavarraScope(feat({ source: "osm" }, point(-0.918, 41.639))), false);
  assert.equal(isInNavarraScope(feat({ source: "euskadi", province: "48" })), false);
});

test("filterRawFeatures sin filtros devuelve los duplicados sin fusionar", () => {
  // El modo crudo tiene que mostrar los 47 pares de Vitoria como vienen.
  const a = feat({ source: "vitoria_ayto", name: "Radar 1" });
  const b = feat({ source: "vitoria_ayto_movil", name: "Radar 1" });

  const result = filterRawFeatures([a, b]);

  assert.equal(result.length, 2);
  assert.equal(result[0].properties.sources, undefined, "no debe crear arrays de fuentes");
});

test("filterRawFeatures con onlyNavarra mezcla provincia 31 y OSM de la zona", () => {
  const navarro = feat({ source: "dgt", province: "31" }, point(-1.6, 42.8));
  const osmNavarra = feat({ source: "osm" }, point(-1.678, 42.808));
  const osmZaragoza = feat({ source: "osm" }, point(-0.918, 41.639));
  const euskadi = feat({ source: "euskadi", province: "48" }, point(-2.6, 42.9));

  const result = filterRawFeatures([navarro, osmNavarra, osmZaragoza, euskadi], {
    onlyNavarra: true,
  });

  assert.equal(result.length, 2);
  assert.ok(result.includes(navarro));
  assert.ok(result.includes(osmNavarra));
});

test("filterRawFeatures con source filtra solo esa fuente", () => {
  const dgt = feat({ source: "dgt" });
  const invive = feat({ source: "dgt_invive" });
  const osm = feat({ source: "osm" });

  assert.deepEqual(filterRawFeatures([dgt, invive, osm], { source: "dgt_invive" }), [invive]);
});

test("rawSourceCounts cuenta cada fuente sin mezclar incidencias con radares", () => {
  const features = [
    feat({ source: "dgt" }),
    feat({ source: "dgt_invive" }),
    feat({ source: "dgt_invive" }),
    feat({ source: "navarra", __dataset: "incidencias-navarra" }),
  ];

  assert.deepEqual(rawSourceCounts(features), {
    dgt: 1,
    dgt_invive: 2,
    "incidencias-navarra": 1,
  });
});
