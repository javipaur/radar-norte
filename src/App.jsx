import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import {
  ALL_CATEGORIES,
  CATEGORIES,
  INCIDENT_CATEGORY,
  getCategory,
  makeCategoryIcon,
} from "./legend.jsx";
import {
  CATEGORY_COLORS,
  collectPopupRows,
  featurePaths,
  featuresBounds,
  mergeDuplicateFeatures,
} from "./data-utils.js";

const APP_VERSION = "0.2.0";

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

function LegendRow({ category, active, onToggle, tag }) {
  const Icon = category.Icon;
  return (
    <li>
      <button
        type="button"
        className="legend-btn"
        aria-pressed={active}
        onClick={onToggle}
      >
        <span className={`legend-badge legend-badge--${category.id}`} aria-hidden="true">
          <Icon size={24} weight="fill" color="currentColor" />
        </span>
        <span className="legend-copy">
          {tag && <span className="legend-tag">{tag}</span>}
          <span className="legend-name">{category.label}</span>
          <span className="legend-sub">{category.description}</span>
        </span>
        <span className="legend-hint">{category.colorHint}</span>
      </button>
    </li>
  );
}

function FeaturePopup({ feature, category }) {
  const props = feature.properties || {};
  const rows = collectPopupRows(feature);
  const typeLabel = ALL_CATEGORIES.find((c) => c.id === category)?.label || category;

  return (
    <div className="rn-popup">
      <strong className="rn-popup-title">
        {props.title || props.name || "Elemento del mapa"}
      </strong>
      <dl className="rn-popup-grid">
        <div className="rn-popup-row">
          <dt>Tipo</dt>
          <dd>{typeLabel}</dd>
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
  const [activeCategory, setActiveCategory] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState("");
  const lastAlertRef = useRef(0);
  const didFitRef = useRef(false);

  const markerIcons = useMemo(
    () => Object.fromEntries(ALL_CATEGORIES.map((c) => [c.id, makeCategoryIcon(c)])),
    []
  );

  const { features: mergedFeatures, mergedCount } = useMemo(
    () => mergeDuplicateFeatures(features),
    [features]
  );

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
        const all = [...radarFeatures, ...navFeatures, ...euskFeatures, ...vitoriaFeatures, ...vitoriaMovFeatures, ...vitoriaFrFeatures];
        const merged = mergeDuplicateFeatures(all);
        setFeatures(all);
        // Encuadramos TODA la región la primera vez: si no, el mapa arranca en
        // Vitoria (zoom 12) y elementos de Navarra/Aragón quedan fuera de pantalla.
        // Solo una vez para que el refresco automático no mueva el mapa al usuario.
        if (!didFitRef.current) {
          didFitRef.current = true;
          const bounds = featuresBounds(merged.features);
          if (bounds && mapRef.current) {
            mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
          }
        }
        setStatus(
          `Datos cargados: ${all.length} elementos · ${merged.mergedCount} duplicados fusionados sin perder datos. (${new Date().toLocaleTimeString()})`
        );
      } catch (e) {
        console.error(e);
        setStatus("Error cargando datos.");
      }
    }
    loadData();
    const interval = setInterval(loadData, 10 * 60 * 1000); // cada 10 minutos
    return () => clearInterval(interval);
  }, []);

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
        mergedFeatures
          .filter((f) => (activeCategory ? getCategory(f) === activeCategory : true))
          .filter((f) => getCategory(f) !== "incidencias")
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
  }, [mergedFeatures, activeCategory, speak]);

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

  const filtered = activeCategory
    ? mergedFeatures.filter((f) => getCategory(f) === activeCategory)
    : mergedFeatures;

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
      </div>
      <nav className="legend" aria-label="Leyenda y filtros del mapa">
        <div className="legend-header">
          <span className="legend-title">Leyenda · Radar Norte</span>
          <span className="legend-help">
            {activeCategory
              ? `Mostrando solo ${ALL_CATEGORIES.find((c) => c.id === activeCategory)?.label.toLowerCase()}`
              : "Toca un tipo para filtrar el mapa"}
          </span>
          {activeCategory && (
            <button type="button" className="legend-reset" onClick={() => setActiveCategory(null)}>
              Ver todo
            </button>
          )}
        </div>
        <ul className="legend-list">
          {CATEGORIES.map((category) => (
            <LegendRow
              key={category.id}
              category={category}
              active={activeCategory === category.id}
              onToggle={() => toggleCategory(category.id)}
            />
          ))}
          <LegendRow
            category={INCIDENT_CATEGORY}
            active={activeCategory === INCIDENT_CATEGORY.id}
            onToggle={() => toggleCategory(INCIDENT_CATEGORY.id)}
            tag="No son radares"
          />
        </ul>
      </nav>
      <div className="map-container">
        <MapContainer ref={mapRef} center={[42.8467, -2.6716]} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filtered.map((f, idx) => {
            const category = getCategory(f);
            const popup = (
              <Popup>
                <FeaturePopup feature={f} category={category} />
              </Popup>
            );
            const paths = featurePaths(f);

            if (paths) {
              return (
                <Polyline
                  key={`line-${idx}`}
                  positions={paths}
                  pathOptions={{
                    color: CATEGORY_COLORS[category],
                    weight: 4,
                    opacity: 0.85,
                  }}
                >
                  {popup}
                </Polyline>
              );
            }

            const coords = getPointCoords(f);
            if (!coords) return null;
            return (
              <Marker
                key={`point-${idx}`}
                position={[coords.lat, coords.lon]}
                icon={markerIcons[category]}
                title={`${ALL_CATEGORIES.find((c) => c.id === category)?.label || "Punto"}: ${f.properties?.name || f.properties?.title || "sin nombre"}`}
              >
                {popup}
              </Marker>
            );
          })}
        </MapContainer>
      </div>
      <div className="status-bar">
        <span>{status}</span>
        <span>{voiceStatus}</span>
      </div>
      <div className="disclaimer">
        ⚠️ Datos informativos. No es oficial. Sigue siempre la señalización vial. Radares móviles en tiempo real no se publican; se muestran zonas INVIVE y datos OSM (no verificados).
      </div>
    </div>
  );
}
