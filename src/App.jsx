import { useState, useEffect, useCallback, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const APP_VERSION = "0.1.0";

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

export default function App() {
  const mapRef = useRef(null);
  const [features, setFeatures] = useState([]);
  const [status, setStatus] = useState("Cargando datos...");
  const [voiceOn, setVoiceOn] = useState(false);
  const [showFixed, setShowFixed] = useState(true);
  const [showMobiles, setShowMobiles] = useState(true);
  const [showOsm, setShowOsm] = useState(true);
  const [voiceStatus, setVoiceStatus] = useState("");
  const lastAlertRef = useRef(0);

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
        setFeatures(all);
        setStatus(`Datos cargados: ${all.length} elementos. (${new Date().toLocaleTimeString()})`);
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
        // Buscar cercano
        let closest = null;
        let closestDist = Infinity;
        const filtered = getFilteredFeatures(features, showFixed, showMobiles, showOsm);
        filtered.forEach((f) => {
          const props = f.properties || {};
          if ((props.source === "navarra" || props.source === "euskadi") && props.title) return;
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
  }, [features, showFixed, showMobiles, showOsm, speak]);

  const toggleVoice = () => {
    if (!("speechSynthesis" in window)) {
      alert("Tu navegador no soporta síntesis de voz.");
      return;
    }
    const newState = !voiceOn;
    setVoiceOn(newState);
    if (newState) speak("Alertas de voz activadas");
  };

  const filtered = getFilteredFeatures(features, showFixed, showMobiles, showOsm);

  return (
    <div className="app">
      <header>
        <h1>Radar Norte</h1>
        <span className="version">v{APP_VERSION}</span>
      </header>
      <div className="controls">
        <button onClick={handleLocate} title="Centrar en mi ubicación">📍 Mi ubicación</button>
        <button onClick={toggleVoice}>{voiceOn ? "🔊 Voz: ON" : "🔊 Voz: OFF"}</button>
        <label className="filter-label">
          <input type="checkbox" checked={showFixed} onChange={(e) => setShowFixed(e.target.checked)} /> Radares fijos
        </label>
        <label className="filter-label">
          <input type="checkbox" checked={showMobiles} onChange={(e) => setShowMobiles(e.target.checked)} /> Zonas móviles (INVIVE)
        </label>
        <label className="filter-label">
          <input type="checkbox" checked={showOsm} onChange={(e) => setShowOsm(e.target.checked)} /> OSM (posibles)
        </label>
      </div>
      <div className="legend">
        <span className="legend-item"><span className="dot" style={{ background: "#cc0000" }}></span> Fijo</span>
        <span className="legend-item"><span className="dot" style={{ background: "#ff8800" }}></span> Zona móvil (INVIVE)</span>
        <span className="legend-item"><span className="dot" style={{ background: "#888888" }}></span> Posible (OSM)</span>
        <span className="legend-item"><span className="dot" style={{ background: "#d9534f" }}></span> Incidencia</span>
        <span className="legend-item"><span className="dot" style={{ background: "#6b5b95" }}></span> Vitoria radar (Ayto)</span>
        <span className="legend-item"><span className="dot" style={{ background: "#b22222" }}></span> Vitoria foto-rojo</span>
      </div>
      <div className="map-container">
        <MapContainer ref={mapRef} center={[42.8467, -2.6716]} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filtered.map((f, idx) => {
            const coords = getPointCoords(f);
            if (!coords) return null;
            const props = f.properties || {};
            const source = props.source || "";
            const kind = props.kind || "";

            if ((source === "navarra" || source === "euskadi") && props.title) {
              return (
                <CircleMarker key={idx} center={[coords.lat, coords.lon]} radius={7} pathOptions={{ color: "#a94442", fillColor: "#d9534f", fillOpacity: 0.9 }}>
                  <Popup>
                    <strong>Incidencia: {props.title}</strong><br />
                    Ubicación: {props.location || "N/D"}<br />
                    {props.road && <>Carretera: {props.road} {props.pk || props.pkStart || ""}<br /></>}
                    {props.severity && <>Gravedad/Nivel: {props.severity}<br /></>}
                    {props.effect && <>Causa: {props.effect}<br /></>}
                    <em>Fuente: {source === "navarra" ? "Gobierno de Navarra" : "Open Data Euskadi"}</em>
                  </Popup>
                </CircleMarker>
              );
            }
            if (source === "vitoria_ayto" || source === "vitoria_ayto_movil") {
              return (
                <CircleMarker key={idx} center={[coords.lat, coords.lon]} radius={7} pathOptions={{ color: "#4a4a9e", fillColor: "#6b5b95", fillOpacity: 0.9 }}>
                  <Popup>
                    <strong>{props.name || "Ubicación radar (Vitoria)"}</strong><br />
                    {props.address && <>{props.address}<br /></>}
                    {props.notes && <><em>{props.notes}</em></>}
                  </Popup>
                </CircleMarker>
              );
            }
            if (source === "vitoria_foto_rojo") {
              return (
                <CircleMarker key={idx} center={[coords.lat, coords.lon]} radius={7} pathOptions={{ color: "#8b0000", fillColor: "#b22222", fillOpacity: 0.9 }}>
                  <Popup>
                    <strong>Foto-rojo (Vitoria)</strong><br />
                    {props.address && <>{props.address}<br /></>}
                    {props.notes && <><em>{props.notes}</em></>}
                  </Popup>
                </CircleMarker>
              );
            }

            let color = "#3388ff";
            let label = props.name || "Radar";
            if (source === "dgt_invive") { color = "#ff8800"; label = "Zona vigilancia móvil (INVIVE): " + (props.road_ref || label); }
            else if (source === "osm" || source === "osm_notes") { color = "#888888"; label = "Posible radar (OSM): " + label; }
            else if (kind === "fixed") { color = "#cc0000"; }
            else if (kind === "mobile_recurring") { color = "#ff6600"; }

            return (
              <CircleMarker key={idx} center={[coords.lat, coords.lon]} radius={6} pathOptions={{ color: "#333", fillColor: color, fillOpacity: 0.8 }}>
                <Popup>
                  <strong>{label}</strong><br />
                  {props.road_ref && <>Vía: {props.road_ref}<br /></>}
                  {props.maxspeed && <>Límite: {props.maxspeed} km/h<br /></>}
                  {props.direction && <>Sentido: {props.direction}<br /></>}
                  Fuente: {source}<br />
                  {props.url && <a href={props.url} target="_blank" rel="noreferrer">Fuente</a>}
                </Popup>
              </CircleMarker>
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

function getFilteredFeatures(features, showFixed, showMobiles, showOsm) {
  return features.filter((f) => {
    const props = f.properties || {};
    const source = props.source || "";
    const kind = props.kind || "";
    const geomType = f.geometry ? f.geometry.type : null;

    if ((source === "navarra" || source === "euskadi") && props.title) return true;
    if (source === "vitoria_ayto" || source === "vitoria_ayto_movil" || source === "vitoria_foto_rojo") return true;
    const isFixed = kind === "fixed" || (geomType === "Point" && ["dgt", "navarra", "euskadi", "donostia", "salamanca", "madrid", "osm"].includes(source) && kind !== "mobile_recurring");
    const isMobileZone = source === "dgt_invive" || kind === "mobile_recurring";
    const isOsm = source === "osm" || source === "osm_notes";
    if (isOsm && showOsm) return true;
    if (isMobileZone && showMobiles) return true;
    if (isFixed && showFixed) return true;
    if (!isOsm && !isMobileZone && isFixed && showFixed) return true;
    return false;
  });
}
