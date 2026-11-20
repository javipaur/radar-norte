import test from "node:test";
import assert from "node:assert/strict";
import {
  haversineDistanceMeters,
  distanceToGeometryMeters,
  isCertified,
  buildAlertMessage,
  collectAlerts,
  chooseAlert,
  alertKey,
  playChime,
  speakAlertText,
} from "../src/alert-utils.js";

const point = (lon, lat) => ({ type: "Point", coordinates: [lon, lat] });
const line = (coords) => ({ type: "LineString", coordinates: coords });
const feature = (geometry, props = {}) => ({
  type: "Feature",
  id: "x",
  geometry,
  properties: props,
});

test("haversineDistanceMeters convierte grados en metros", () => {
  assert.ok(Math.abs(haversineDistanceMeters(42.8, -2.0, 42.81, -2.0) - 1112) < 5);
});

test("distanceToGeometryMeters mide a un Point", () => {
  assert.ok(Math.abs(distanceToGeometryMeters(42.8, -2.0, feature(point(-2.001, 42.8)))) < 120);
});

test("distanceToGeometryMeters usa el segmento, no el punto medio del tramo", () => {
  const tramo = feature(line([[-2.0, 42.8], [-1.0, 42.8]]));
  const d = distanceToGeometryMeters(42.8005, -1.05, tramo);
  assert.ok(d !== null && d < 100, `distancia al segmento: ${d}`);
});

test("distanceToGeometryMeters da ~0 en el extremo real del NA-2410", () => {
  const na2410 = feature(line([[-1.82876, 42.91911], [-2.22958, 42.86721]]));
  const d = distanceToGeometryMeters(42.91911, -1.82876, na2410);
  assert.ok(d !== null && d < 1, `distancia al extremo: ${d}`);
});

test("distanceToGeometryMeters devuelve null si la geometría no es utilizable", () => {
  assert.equal(
    distanceToGeometryMeters(42.8, -2.0, feature({ type: "Polygon", coordinates: [] })),
    null
  );
});

const dgt = (id, props = {}) => ({
  type: "Feature",
  id,
  geometry: point(-2.0, 42.8),
  properties: {
    source: "dgt",
    active: true,
    valid_from: null,
    valid_to: null,
    road_ref: "A-1",
    km: 12.3,
    ...props,
  },
});
const NOW = Date.parse("2026-11-20T12:00:00Z");

test("isCertified distingue activos de históricos, OSM, inactivos y caducados", () => {
  assert.equal(isCertified(dgt("a")), true);
  assert.equal(isCertified(dgt("b", { source: "historico_movil", historical: true })), false);
  assert.equal(isCertified(dgt("c", { source: "osm" })), false);
  assert.equal(isCertified(dgt("d", { active: false })), false);
  assert.equal(isCertified(dgt("e", { valid_to: "2026-11-19T00:00:00Z" }), NOW), false);
  assert.equal(isCertified(dgt("f", { valid_from: "2026-11-21T00:00:00Z" }), NOW), false);
  assert.equal(isCertified(dgt("g", { valid_to: "2026-11-21T00:00:00Z" }), NOW), true);
});

test("buildAlertMessage nombra vía, pk y distancia en el acercamiento", () => {
  const msg = buildAlertMessage(dgt("a"), "approach", 1200, NOW);
  assert.match(msg, /Radar cercano/);
  assert.match(msg, /A-1/);
  assert.match(msg, /12\.3/);
  assert.match(msg, /1200 metros/);
  assert.doesNotMatch(msg, /no certificado/i);
});

test("buildAlertMessage marca como no certificado un histórico y uno caducado", () => {
  assert.match(
    buildAlertMessage(dgt("b", { source: "historico_movil", historical: true }), "approach", 500, NOW),
    /no certificada/i
  );
  assert.match(
    buildAlertMessage(dgt("e", { valid_to: "2026-11-19T00:00:00Z" }), "approach", 500, NOW),
    /no certificada/i
  );
});

test("buildAlertMessage avisa de entrada a tramo y distingue INVIVE", () => {
  const tramo = {
    ...dgt("t", { source: "dgt_invive", kind: "stretch", name: "NA-2410" }),
    geometry: line([[-1.82876, 42.91911], [-2.22958, 42.86721]]),
  };
  assert.match(buildAlertMessage(tramo, "inside", 0, NOW), /dentro del tramo/i);
  assert.match(buildAlertMessage(tramo, "approach", 1000, NOW), /tramo de vigilancia/i);
});

test("chooseAlert elige el más cercano, gana inside en empate y es determinista", () => {
  const a = dgt("a"), b = dgt("b"), c = dgt("c");
  assert.equal(chooseAlert([]), null);
  assert.equal(chooseAlert([
    { feature: a, kind: "approach", distanceMeters: 900 },
    { feature: b, kind: "approach", distanceMeters: 200 },
  ]).feature.id, "b");
  assert.equal(chooseAlert([
    { feature: a, kind: "approach", distanceMeters: 30 },
    { feature: b, kind: "inside", distanceMeters: 30 },
  ]).kind, "inside");
  assert.equal(chooseAlert([
    { feature: c, kind: "approach", distanceMeters: 40 },
    { feature: a, kind: "approach", distanceMeters: 40 },
  ]).feature.id, "a");
});

test("collectAlerts avisa al entrar, no repite dentro y avisa al reentrar", () => {
  const tramo = {
    ...dgt("t", { source: "dgt_invive" }),
    geometry: line([[-2.0, 42.8], [-1.0, 42.8]]),
  };
  const dentro = { lat: 42.8, lon: -1.5 };
  const fuera = { lat: 42.81, lon: -1.5 };

  const first = collectAlerts([tramo], dentro.lat, dentro.lon, NOW);
  assert.equal(first.triggers.filter((t) => t.kind === "inside").length, 1);
  assert.equal(first.states.get("t").inside, true);

  const still = collectAlerts([tramo], dentro.lat, dentro.lon, NOW + 1000, first.states);
  assert.equal(still.triggers.filter((t) => t.kind === "inside").length, 0);

  const salida = collectAlerts([tramo], fuera.lat, fuera.lon, NOW + 2000, still.states);
  assert.equal(salida.states.get("t").inside, false);

  const reentry = collectAlerts([tramo], dentro.lat, dentro.lon, NOW + 3000, salida.states);
  assert.equal(reentry.triggers.filter((t) => t.kind === "inside").length, 1);
});

test("collectAlerts respeta el cooldown por elemento", () => {
  const radar = dgt("r");
  const first = collectAlerts([radar], 42.8, -2.0, NOW);
  assert.ok(first.triggers.some((t) => t.feature.id === "r" && t.kind === "approach"));
  const second = collectAlerts([radar], 42.8, -2.0, NOW + 1000, first.states);
  assert.equal(second.triggers.length, 0);
});

test("collectAlerts no muta los estados del mapa anterior", () => {
  const radar = dgt("r");
  const first = collectAlerts([radar], 42.8, -2.0, NOW);
  const before = first.states.get("r").lastApproachAt;
  collectAlerts([radar], 42.8, -2.0, NOW + 40000, first.states);
  assert.equal(first.states.get("r").lastApproachAt, before);
});

// --- Hallazgos de la revisión final (identidad estable y audio en móvil) ---

const anon = (lon, lat, props = {}) => ({
  type: "Feature",
  geometry: point(lon, lat),
  properties: { source: "vitoria_ayto", kind: "mobile_location", ...props },
});

function fakeAudioCtx(state = "running") {
  const ctx = {
    state,
    currentTime: 5,
    destination: {},
    events: [],
    gains: [],
    oscillators: [],
    resume() {
      ctx.events.push("resume");
      ctx.state = "running";
      return Promise.resolve();
    },
    createGain() {
      const gain = {
        peak: 0,
        gain: {
          setValueAtTime: (value) => ctx.events.push(["setValueAtTime", value]),
          linearRampToValueAtTime: (value) => {
            ctx.events.push(["ramp", value]);
            gain.peak = Math.max(gain.peak, value);
          },
        },
        connect: () => ctx.events.push("gain-connect"),
      };
      ctx.gains.push(gain);
      return gain;
    },
    createOscillator() {
      const osc = {
        type: "",
        frequency: { value: 0 },
        connect: () => {},
        start: () => ctx.events.push("start"),
        stop: () => ctx.events.push("stop"),
      };
      ctx.oscillators.push(osc);
      return osc;
    },
  };
  return ctx;
}

test("alertKey es estable entre recargas y no depende del índice", () => {
  const a = anon(-2.0, 42.8, { name: "A", km: 1 });
  const b = anon(-1.9, 42.8, { name: "B", km: 2 });
  assert.equal(alertKey(a), alertKey(anon(-2.0, 42.8, { km: 1, name: "A" })));
  assert.notEqual(alertKey(a), alertKey(b));
  assert.equal(alertKey(dgt("id-explicito")), "id-explicito");
});

test("collectAlerts conserva el cooldown tras recargar los datos en otro orden", () => {
  const a = anon(-2.0, 42.8, { name: "A" });
  const first = collectAlerts([a, anon(-1.9, 42.8, { name: "B" })], 42.8, -2.0, NOW);
  assert.ok(first.triggers.some((t) => alertKey(t.feature) === alertKey(a)));

  // La recarga reconstruye el array y cambia el orden si una fuente falla.
  const reloaded = [anon(-1.9, 42.8, { name: "B" }), anon(-2.0, 42.8, { name: "A" })];
  const second = collectAlerts(reloaded, 42.8, -2.0, NOW + 1000, first.states);
  assert.equal(second.triggers.length, 0);
});

test("chooseAlert desempata por identidad estable cuando falta el id", () => {
  const a = anon(-2.0, 42.8, { name: "A" });
  const b = anon(-2.0, 42.81, { name: "B" });
  const ta = { feature: a, kind: "approach", distanceMeters: 30 };
  const tb = { feature: b, kind: "approach", distanceMeters: 30 };
  const esperado = [alertKey(a), alertKey(b)].sort()[0];
  assert.equal(alertKey(chooseAlert([ta, tb]).feature), esperado);
  assert.equal(alertKey(chooseAlert([tb, ta]).feature), esperado);
});

test("playChime programa dos tonos y reanuda un AudioContext suspendido", async () => {
  const suspendido = fakeAudioCtx("suspended");
  playChime(suspendido, "approach");
  assert.ok(suspendido.events.includes("resume"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(suspendido.oscillators.map((o) => o.frequency.value), [660, 880]);
  assert.equal(suspendido.gains.at(-1).peak, 0.10);

  const activo = fakeAudioCtx();
  playChime(activo, "inside");
  assert.equal(activo.events.includes("resume"), false);
  assert.deepEqual(activo.oscillators.map((o) => o.frequency.value), [440, 520]);
  assert.equal(activo.gains.at(-1).peak, 0.05);
  assert.equal(playChime(null, "approach"), false);
});

test("speakAlertText cancela, reanuda y habla en es-ES con el volumen del nivel", () => {
  const calls = [];
  class Utterance {
    constructor(text) {
      this.text = text;
      calls.push(["nuevo", text]);
    }
  }
  const synth = {
    cancel: () => calls.push("cancel"),
    resume: () => calls.push("resume"),
    speak: (utter) => calls.push(["speak", utter]),
  };

  assert.equal(speakAlertText(synth, Utterance, "Radar cercano", "approach"), true);
  assert.ok(calls.includes("cancel"));
  assert.ok(calls.includes("resume"));
  const utter = calls.find((call) => call[0] === "speak")[1];
  assert.equal(utter.lang, "es-ES");
  assert.equal(utter.volume, 0.65);
  assert.equal(utter.rate, 0.95);

  speakAlertText(synth, Utterance, "Dentro del tramo", "inside");
  assert.equal(calls.filter((call) => call[0] === "speak").at(-1)[1].volume, 0.4);
  assert.equal(speakAlertText(null, Utterance, "x", "approach"), false);
});
