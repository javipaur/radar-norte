import test from "node:test";
import assert from "node:assert/strict";
import {
  featureIdentity,
  mergeDuplicateFeatures,
  collectPopupRows,
  featurePaths,
  featuresBounds,
} from "../src/data-utils.js";

const point = (lon, lat) => ({ type: "Point", coordinates: [lon, lat] });
const feat = (source, props, geometry = point(-2.7, 42.8)) => ({
  type: "Feature",
  geometry,
  properties: { source, ...props },
});

test("featuresBounds incluye puntos y tramos para que el mapa encuadre también la A-10", () => {
  // Sin esto el mapa arranca en Vitoria y la incidencia de A-10 queda fuera de pantalla.
  const a10 = feat("navarra", { title: "Carril izquierdo cortado" }, point(-1.8543, 42.9122));
  const vitoria = feat("dgt", { name: "RadarVitoria" }, point(-2.6716, 42.8467));
  const tramo = feat("dgt_invive", { name: "Tramo" }, {
    type: "LineString",
    coordinates: [[-2.5, 42.85], [-2.4, 42.9]],
  });

  assert.deepEqual(featuresBounds([a10, vitoria, tramo]), [
    [42.8467, -2.6716],
    [42.9122, -1.8543],
  ]);
});

test("featuresBounds devuelve null cuando no hay geometría válida", () => {
  assert.equal(featuresBounds([]), null);
});

test("mergeDuplicateFeatures fusiona solo el duplicado real de Vitoria y no pierde datos", () => {
  const vitoriaA = feat("vitoria_ayto", { name: "Radar móvil 1", notes: "Nota A" });
  const vitoriaB = feat("vitoria_ayto_movil", { name: "Radar móvil 1", notes: "Nota B" });
  const navA = feat("navarra", { title: "Corte de carril izquierdo", pk: "8", date: "16 Nov 2026" }, point(-1.66, 42.51));
  const navB = feat("navarra", { title: "Corte de carril derecho", pk: "8", date: "16 Nov 2026" }, point(-1.66, 42.51));
  const tramoA = feat("dgt_invive", { name: "Tramo N-230 km 29-64" }, {
    type: "LineString",
    coordinates: [[0, 42], [1, 43]],
  });
  const tramoB = feat("dgt_invive", { name: "Tramo N-230 km 64-117" }, {
    type: "LineString",
    coordinates: [[1, 43], [2, 44]],
  });

  const result = mergeDuplicateFeatures([vitoriaA, vitoriaB, navA, navB, tramoA, tramoB]);

  assert.equal(result.features.length, 5);
  assert.equal(result.mergedCount, 1);

  const merged = result.features.find((f) => f.properties.sources);
  assert.ok(merged, "el duplicado fusionado debe conservar 'sources'");
  assert.equal(merged.properties.source, "vitoria_ayto", "source sigue siendo escalar para no romper getCategory");
  assert.deepEqual(merged.properties.sources, ["vitoria_ayto", "vitoria_ayto_movil"]);
  assert.deepEqual(merged.properties.notes, ["Nota A", "Nota B"], "se conservan AMBAS notas");

  const titles = result.features
    .filter((f) => f.properties.source === "navarra")
    .map((f) => f.properties.title);
  assert.deepEqual(titles, ["Corte de carril izquierdo", "Corte de carril derecho"]);

  const lines = result.features.filter((f) => f.geometry.type === "LineString");
  assert.equal(lines.length, 2, "los tramos con punto medio compartido NO se fusionan");
});

test("featureIdentity distingue entidades distintas que comparten coordenadas", () => {
  const a = feat("navarra", { title: "Izquierdo" }, point(-1.66, 42.51));
  const b = feat("navarra", { title: "Derecho" }, point(-1.66, 42.51));
  assert.notEqual(featureIdentity(a), featureIdentity(b));

  const c = feat("vitoria_ayto", { name: "X" }, point(-2.7, 42.8));
  const d = feat("vitoria_ayto_movil", { name: "X" }, point(-2.7, 42.8));
  assert.equal(featureIdentity(c), featureIdentity(d));
});

test("NO fusiona accidentes distintos con la misma posición y título pero distinta fecha/efecto", () => {
  // Caso real detectado en Euskadi: dos "Accidente" en GI-2634 PK 36 con
  // horas y efectos diferentes. Fusionarlos dejaría un solo marcador.
  const base = {
    title: "Accidente",
    location: "Elgoibar (GIPUZKOA)",
    severity: "Blanco",
    category: "Accidente",
    road: "GI-2634",
    pkStart: "36.0",
    pkEnd: "36.0",
    direction: "ELGOIBAR",
  };
  const a = feat("euskadi", { ...base, date: "2026-11-19T09:46:25", effect: "Alcance" }, point(-2.37867, 43.20784));
  const b = feat("euskadi", { ...base, date: "2026-11-19T09:53:02", effect: "Salida" }, point(-2.37867, 43.20784));

  const result = mergeDuplicateFeatures([a, b]);
  assert.equal(result.features.length, 2, "los dos accidentes deben seguir siendo dos marcadores");
  assert.equal(result.mergedCount, 0);
});

test("SÍ fusiona duplicados de Vitoria aunque difiera solo la nota y la fuente", () => {
  const a = feat("vitoria_ayto", { name: "Radar 1", address: "Calle 1", kind: "mobile_location", notes: "Nota A" });
  const b = feat("vitoria_ayto_movil", { name: "Radar 1", address: "Calle 1", kind: "mobile_location", notes: "Nota B" });
  const result = mergeDuplicateFeatures([a, b]);
  assert.equal(result.features.length, 1);
  assert.equal(result.mergedCount, 1);
  assert.deepEqual(result.features[0].properties.notes, ["Nota A", "Nota B"]);
});

test("collectPopupRows incluye TODAS las propiedades del elemento", () => {
  const properties = {
    source: "navarra",
    title: "Carril izquierdo cortado",
    date: "19 Nov 2026",
    details: "Corte entre los PK 2 y 0, sentido Irurtzun, por limpieza de mediana",
    category: "Obras",
    type: "Trabajos de mantenimiento",
    pk: "2",
    pkEnd: "0",
    direction: "Irurtzun",
    km_from: 0,
    km_to: 2,
    radius_m: 1533,
    bearing: 81,
    reported: "2026-11-19",
    name: "A-10",
    notes: ["Nota A", "Nota B"],
    active: false,
  };
  const rows = collectPopupRows({ type: "Feature", geometry: point(0, 0), properties });
  const keys = rows.map((r) => r.key);

  for (const key of Object.keys(properties)) {
    assert.ok(keys.includes(key), `falta la propiedad ${key} en el popup`);
  }
  assert.equal(rows.find((r) => r.key === "date").label, "Fecha");
  assert.equal(rows.find((r) => r.key === "details").label, "Detalles");
  assert.equal(rows.find((r) => r.key === "pkEnd").label, "PK fin");
  assert.equal(rows.find((r) => r.key === "notes").value, "Nota A · Nota B");
  assert.equal(rows.find((r) => r.key === "active").value, "No");
});

test("featurePaths devuelve la geometría completa de los tramos", () => {
  const line = {
    type: "LineString",
    coordinates: [[-1.5, 42.5], [-1.6, 42.6], [-1.7, 42.7]],
  };
  assert.deepEqual(featurePaths({ geometry: line }), [
    [42.5, -1.5],
    [42.6, -1.6],
    [42.7, -1.7],
  ]);
  assert.equal(featurePaths({ geometry: point(-1.5, 42.5) }), null);
  assert.equal(featurePaths({ geometry: null }), null);
});
