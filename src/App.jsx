import { Fragment, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { CircleMarker, MapContainer, TileLayer, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import {
  CATEGORY_COLORS,
  collectPopupRows,
  featurePaths,
  featuresBounds,
  sortForRender,
} from "./data-utils.js";
import {
  RAW_SOURCES,
  filterRawFeatures,
  rawSourceCounts,
  rawSourceKey,
  rawSourceStyle,
  withDataset,
} from "./raw-view.js";
import {
  ALL_CATEGORIES,
  CATEGORIES,
  INCIDENT_CATEGORY,
  getCategory,
} from "./legend.jsx";
import { isHistoricalMobile } from "./categories.js";

const APP_VERSION = "0.3.0";

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getPointCoords(feature) {
  const geom = feature.geometry;
  if (!geom) return null;
  if (geom.type === "Point") {
    return { lat: geom.coordinates[1], lon: geom.coordinates[0] };
  }
  if (geom.type === "LineString" && geom.coordinates.length > 0) {
    const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
    return { lat: mid[1], lon: mid[0] };
  }
  return null;
}

function CategoryRow({ category, active, onToggle, count }) {
  const Icon = category.Icon;
  return (
    <button
      type="button"
      className={`cat-row cat-row--${category.id}`}
      aria-pressed={active}
      onClick={onToggle}
      title={`Filtrar el mapa por ${category.label.toLowerCase()}`}
    >
      <span className={`cat-ico cat-ico--${category.id}`} aria-hidden="true">
        <Icon size={23} weight="fill" color="currentColor" />
      </span>
      <span className="cat-copy">
        <span className="cat-name">{category.label}</span>
        <span className="cat-sub">{category.description}</span>
      </span>
      <span className="cat-count">{count} · {category.colorHint}</span>
    </button>
  );
}

function FeaturePopup({ feature, category }) {
  const props = feature.properties || {};
  const rows = collectPopupRows(feature);
  const sourceStyle = rawSourceStyle(rawSourceKey(feature));
  const categoryLabel = ALL_CATEGORIES.find((c) => c.id === category)?.label || category;

  return (
    <div className="rn-popup">
      <strong className="rn-popup-title">
        {props.title || props.name || "Elemento del mapa"}
      </strong>
      {isHistoricalMobile(feature) && (
        <p className="rn-popup-note">
          Zona posible de radar móvil, no certificada. Guardada de versiones
          anteriores para que una actualización del servicio no la borre.
        </p>
      )}
      {props.source === "dgt_invive" && props.geometry_source === "osm_road_trace" && (
        <p className="rn-popup-note">
          La línea sigue la carretera real (OpenStreetMap); los extremos son los
          publicados por la DGT. La posición exacta del radar dentro del tramo
          no es conocida.
        </p>
      )}
      <dl className="rn-popup-grid">
        <div className="rn-popup-row">
          <dt>Categoría</dt>
          <dd>{categoryLabel}</dd>
        </div>
        <div className="rn-popup-row">
          <dt>Fuente</dt>
          <dd>{sourceStyle.label}</dd>
        </div>
        <div className="rn-popup-row">
          <dt>Fichero</dt>
          <dd>{props.__dataset || "(principal)"}</dd>
        </div>
        {rows.map((row) => (
          <div className="rn-popup-row" key={row.key}>
            <dt>{row.label}</dt>
            <dd>
              {row.key === "url" && typeof row.raw === "string" ? (
                <a href={row.raw} target="_blank" rel="noreferrer">
                  Abrir fuente
                </a>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function App() {
  const mapRef = useRef(null);
  const [features, setFeatures] = useState([]);
  const [status, setStatus] = useState("Cargando datos...");
  const [voiceOn, setVoiceOn] = useState(false);
  const [onlyNavarra, setOnlyNavarra] = useState(false);
  const [rawSource, setRawSource] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [activeCategory, setActiveCategory] = useState(null);
  const [rawOpen, setRawOpen] = useState(false);
  const lastAlertRef = useRef(0);
  const didFitRef = useRef(false);

  const scopeCounts = useMemo(
    () => rawSourceCounts(filterRawFeatures(features, { onlyNavarra })),
    [features, onlyNavarra]
  );

  const displayFeatures = useMemo(() => {
    const scoped = filterRawFeatures(features, { onlyNavarra, source: rawSource });
    const filtered = activeCategory
      ? scoped.filter((f) => getCategory(f) === activeCategory)
      : scoped;
    // Pintar los históricos al final evita que los marcadores apiñados del
    // cruce de Uharte Arakil tapen (y bloqueen) la zona móvil conservada.
    return sortForRender(filtered);
  }, [features, onlyNavarra, rawSource, activeCategory]);

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(ALL_CATEGORIES.map((c) => [c.id, 0]));
    for (const f of filterRawFeatures(features, { onlyNavarra, source: rawSource })) {
      const category = getCategory(f);
      if (category in counts) counts[category] += 1;
    }
    return counts;
  }, [features, onlyNavarra, rawSource]);

  const visibleSourceKeys = useMemo(() => {
    const ids = new Set([...RAW_SOURCES.map((s) => s.id), ...Object.keys(scopeCounts)]);
    return [...ids].filter((id) => (scopeCounts[id] || 0) > 0);
  }, [scopeCounts]);

  const categoryLabel = activeCategory
    ? ALL_CATEGORIES.find((c) => c.id === activeCategory)?.label || activeCategory
    : null;
  const statusText = `${categoryLabel ? `Categoría ${categoryLabel}: ` : ""}${displayFeatures.length} de ${features.length} elementos · ${Object.keys(rawSourceCounts(features)).length} fuentes${onlyNavarra ? " · solo Navarra" : ""}${rawSource ? ` · fuente ${rawSourceStyle(rawSource).label}` : ""}`;

  // La leyenda crece cuando llegan los datos y cambia la altura del mapa.
  // Sin invalidateSize, Leaflet sigue usando el tamaño inicial y recorta el
  // tramo NA-2410 (los paths acaban con d="M0 0" fuera del viewBox antiguo).
  useEffect(() => {
    const container = mapRef.current?.getContainer?.();
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize({ pan: false }));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [radRes, navRes, euskRes, vitoriaRes, vitoriaMovRes, vitoriaFrRes] = await Promise.allSettled([
          fetch("/data/processed/radares-pais-vasco-navarra-aragon.geojson?t=" + Date.now()),
          fetch("/data/processed/incidencias-navarra.geojson?t=" + Date.now()),
          fetch("/data/processed/incidencias-euskadi.geojson?t=" + Date.now()),
          fetch("/data/processed/radares-vitoria-ayto.geojson"),
          fetch("/data/processed/radares-vitoria-moviles-ayto.geojson"),
          fetch("/data/processed/radares-vitoria-fotorrojo.geojson"),
        ]);
        const radarFeatures = radRes.status === "fulfilled" && radRes.value.ok ? (await radRes.value.json()).features || [] : [];
        const navFeatures = navRes.status === "fulfilled" && navRes.value.ok ? (await navRes.value.json()).features || [] : [];
        const euskFeatures = euskRes.status === "fulfilled" && euskRes.value.ok ? (await euskRes.value.json()).features || [] : [];
        const vitoriaFeatures = vitoriaRes.status === "fulfilled" && vitoriaRes.value.ok ? (await vitoriaRes.value.json()).features || [] : [];
        const vitoriaMovFeatures = vitoriaMovRes.status === "fulfilled" && vitoriaMovRes.value.ok ? (await vitoriaMovRes.value.json()).features || [] : [];
        const vitoriaFrFeatures = vitoriaFrRes.status === "fulfilled" && vitoriaFrRes.value.ok ? (await vitoriaFrRes.value.json()).features || [] : [];
        const all = [
          ...withDataset(radarFeatures, "radares"),
          ...withDataset(navFeatures, "incidencias-navarra"),
          ...withDataset(euskFeatures, "incidencias-euskadi"),
          ...withDataset(vitoriaFeatures, "vitoria-ayto"),
          ...withDataset(vitoriaMovFeatures, "vitoria-moviles"),
          ...withDataset(vitoriaFrFeatures, "vitoria-fotorrojo"),
        ].map((feature, i) => ({
          ...feature,
          // Clave estable aunque se filtre: si se usa el índice del array
          // filtrado, React reutiliza el nodo equivocado y el punto histórico
          // deja de dibujarse encima al activar "Móviles".
          __renderKey: `f${i}`,
        }));
        setFeatures(all);
        if (!didFitRef.current) {
          didFitRef.current = true;
          const bounds = featuresBounds(all);
          if (bounds && mapRef.current) {
            mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
          }
        }
        setStatus(`Datos cargados: ${all.length} elementos (${new Date().toLocaleTimeString()})`);
      } catch (e) {
        console.error(e);
        setStatus("Error cargando datos.");
      }
    }
    loadData();
    const interval = setInterval(loadData, 10 * 60 * 1000); // cada 10 minutos
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const bounds = featuresBounds(displayFeatures);
    if (bounds) mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyNavarra, rawSource, activeCategory]);

  const speak = useCallback((text) => {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "es-ES";
    window.speechSynthesis.speak(utter);
  }, [voiceOn]);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Geolocalización no disponible.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        if (mapRef.current) {
          mapRef.current.setView([lat, lon], 13);
        }
        setStatus(`Ubicación: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
        let closest = null;
        let closestDist = Infinity;
        let alertFeatures = filterRawFeatures(features, { onlyNavarra, source: rawSource });
        if (activeCategory) {
          alertFeatures = alertFeatures.filter((f) => getCategory(f) === activeCategory);
        }
        alertFeatures
          .filter((f) => !String(rawSourceKey(f)).startsWith("incidencias-"))
          .forEach((f) => {
            const coords = getPointCoords(f);
            if (!coords) return;
            const dist = haversineDistance(lat, lon, coords.lat, coords.lon);
            if (dist < closestDist) {
              closestDist = dist;
              closest = f;
            }
          });
        if (closest && closestDist <= 1500) {
          const now = Date.now();
          if (now - lastAlertRef.current > 30000) {
            lastAlertRef.current = now;
            const name = closest.properties?.name || closest.properties?.road_ref || "Radar";
            speak(`Atención, ${name} a ${Math.round(closestDist)} metros`);
            setVoiceStatus(`Cercano: ${name} a ${Math.round(closestDist)}m`);
          }
        } else {
          setVoiceStatus("");
        }
      },
      (err) => alert("No se pudo obtener ubicación: " + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [speak, features, onlyNavarra, rawSource, activeCategory]);

  const toggleVoice = () => {
    if (!("speechSynthesis" in window)) {
      alert("Tu navegador no soporta síntesis de voz.");
      return;
    }
    const newState = !voiceOn;
    setVoiceOn(newState);
    if (newState) speak("Alertas de voz activadas");
  };

  const toggleCategory = (id) => {
    setActiveCategory((current) => (current === id ? null : id));
  };

  return (
    <div className="app">
      <header>
        <h1>Radar Norte</h1>
        <span className="version">v{APP_VERSION}</span>
      </header>
      <div className="controls">
        <button type="button" onClick={handleLocate} title="Centrar en mi ubicación">📍 Mi ubicación</button>
        <button type="button" onClick={toggleVoice} aria-pressed={voiceOn}>
          {voiceOn ? "🔊 Voz: ON" : "🔊 Voz: OFF"}
        </button>
        <label className="raw-toggle">
          <input
            type="checkbox"
            checked={onlyNavarra}
            onChange={(event) => {
              setOnlyNavarra(event.target.checked);
              setRawSource(null);
            }}
          />
          Solo Navarra (provincia 31 + OSM de la zona)
        </label>
      </div>
      <nav className="cat-legend" aria-label="Leyenda y filtros del mapa">
        <div className="cat-top">
          <span className="cat-title">Leyenda · Radar Norte</span>
          <span className="cat-pill">Phosphor fill</span>
        </div>
        <div className="cat-list">
          {CATEGORIES.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              active={activeCategory === category.id}
              count={categoryCounts[category.id] || 0}
              onToggle={() => toggleCategory(category.id)}
            />
          ))}
        </div>
        <div className="cat-apart">
          <span className="cat-label">No son radares</span>
          <CategoryRow
            category={INCIDENT_CATEGORY}
            active={activeCategory === INCIDENT_CATEGORY.id}
            count={categoryCounts[INCIDENT_CATEGORY.id] || 0}
            onToggle={() => toggleCategory(INCIDENT_CATEGORY.id)}
          />
        </div>
        {activeCategory && (
          <button type="button" className="cat-reset" onClick={() => setActiveCategory(null)}>
            Ver todas las categorías
          </button>
        )}
      </nav>
      <nav className={`legend ${rawOpen ? "" : "legend-collapsed"}`} aria-label="Datos crudos por fuente">
        <div className="legend-header">
          <span className="legend-title">Datos crudos · por fuente</span>
          <button type="button" className="legend-toggle" onClick={() => setRawOpen((v) => !v)} aria-expanded={rawOpen}>
            {rawOpen ? "Ocultar" : "Mostrar"}
          </button>
          {rawOpen && rawSource && (
            <button type="button" className="legend-reset" onClick={() => setRawSource(null)}>
              Ver todas
            </button>
          )}
        </div>
        {rawOpen && (
          <>
            <span className="legend-help">
              {rawSource
                ? `Mostrando solo ${rawSourceStyle(rawSource).label}`
                : "Toca una fuente para filtrar · todo tal como viene"}
            </span>
            <ul className="legend-list">
              {visibleSourceKeys.map((id) => {
                const style = rawSourceStyle(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="legend-btn"
                      aria-pressed={rawSource === id}
                      onClick={() => setRawSource(rawSource === id ? null : id)}
                    >
                      <span
                        className="legend-badge legend-badge--raw"
                        style={{ background: style.color }}
                        aria-hidden="true"
                      />
                      <span className="legend-copy">
                        <span className="legend-name">{style.label}</span>
                        <span className="legend-sub">{scopeCounts[id] || 0} elementos · {id}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>
      <div className="map-container">
        <MapContainer ref={mapRef} center={[42.8467, -2.6716]} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {displayFeatures.map((f, idx) => {
            const category = getCategory(f);
            const color = CATEGORY_COLORS[category] || rawSourceStyle(rawSourceKey(f)).color;
            const categoryLabel = ALL_CATEGORIES.find((c) => c.id === category)?.label || "Punto";
            const popup = (
              <Popup>
                <FeaturePopup feature={f} category={category} />
              </Popup>
            );
            const paths = featurePaths(f);

            if (paths) {
              const mid = getPointCoords(f);
              return (
                <Fragment key={`group-${f.__renderKey ?? idx}`}>
                  <Polyline
                    key={`line-${f.__renderKey ?? idx}`}
                    positions={paths}
                    pathOptions={{ color, weight: 5, opacity: 0.85, smoothFactor: 0 }}
                  >
                    {popup}
                  </Polyline>
                  {mid && (
                    <CircleMarker
                      key={`line-mid-${f.__renderKey ?? idx}`}
                      center={[mid.lat, mid.lon]}
                      radius={5}
                      pathOptions={{ color: "#fff", weight: 1, fillColor: color, fillOpacity: 0.95 }}
                    >
                      {popup}
                    </CircleMarker>
                  )}
                </Fragment>
              );
            }

            const coords = getPointCoords(f);
            if (!coords) return null;
            const historico = isHistoricalMobile(f);
            return (
              <CircleMarker
                key={`pt-${f.__renderKey ?? idx}`}
                center={[coords.lat, coords.lon]}
                radius={historico ? 9 : 6}
                pathOptions={{
                  color: historico ? "#fb8c00" : "#fff",
                  weight: historico ? 3 : 2,
                  fillColor: color,
                  fillOpacity: historico ? 0.55 : 0.95,
                  dashArray: historico ? "4 4" : undefined,
                }}
                title={
                  historico
                    ? "Radar móvil posible (no certificado) · zona histórica"
                    : `${categoryLabel}: ${f.properties?.name || f.properties?.title || "sin nombre"}`
                }
              >
                {popup}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <div className="status-bar">
        <span>{statusText}</span>
        <span>{voiceStatus}</span>
      </div>
      <div className="disclaimer">
        ⚠️ Datos informativos. No es oficial. Sigue siempre la señalización vial. Radares móviles en tiempo real no se publican; se muestran zonas INVIVE y datos OSM (no verificados).
      </div>
    </div>
  );
}
