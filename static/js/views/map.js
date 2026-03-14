import { api, navigate, badge } from "../app.js";

let mapInstance = null;
let geojsonLayer = null;

export async function renderMap(el) {
  el.innerHTML = `
    <div id="map-container" style="height:calc(100dvh - var(--header-height) - var(--nav-height) - var(--safe-bottom));
         margin:-12px -16px;border-radius:0;position:relative">
      <div id="map" style="height:100%;width:100%"></div>
      <button id="locate-btn" style="position:absolute;bottom:16px;right:16px;z-index:1000;
        width:48px;height:48px;border-radius:50%;background:var(--accent);border:none;
        color:#fff;font-size:1.3rem;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center" title="Find my location">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m10-10h-4M6 12H2"/>
        </svg>
      </button>
    </div>
    <div id="county-panel" class="hidden" style="position:fixed;bottom:calc(var(--nav-height) + var(--safe-bottom));
         left:0;right:0;max-height:50dvh;background:var(--bg);border-radius:var(--radius) var(--radius) 0 0;
         padding:0;overflow-y:hidden;z-index:1001;display:flex;flex-direction:column;box-shadow:0 -4px 20px rgba(0,0,0,0.5)">
      <div id="county-panel-header" style="padding:16px 16px 0 16px;flex-shrink:0"></div>
      <div id="county-panel-content" style="overflow-y:auto;padding:0 16px 16px 16px;flex:1"></div>
    </div>
  `;

  // Load Leaflet CSS/JS if not already loaded
  if (!document.getElementById("leaflet-css")) {
    const css = document.createElement("link");
    css.id = "leaflet-css";
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
  }

  await loadLeaflet();

  // Create map centered on Idaho
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }

  mapInstance = L.map("map", {
    zoomControl: false,
    attributionControl: false,
  }).setView([44.6, -114.6], 6.3);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 18,
  }).addTo(mapInstance);

  // Zoom control top-right
  L.control.zoom({ position: "topright" }).addTo(mapInstance);

  // Force layout recalc
  setTimeout(() => mapInstance.invalidateSize(), 100);

  // Load county boundaries
  try {
    const data = await api("/geo/counties");
    geojsonLayer = L.geoJSON(data, {
      style: feature => {
        const p = feature.properties;
        const ratio = p.entity_count > 0 ? p.active_count / p.entity_count : 0;
        return {
          fillColor: ratio > 0 ? `hsl(${120 * ratio}, 70%, 35%)` : "#2a2a4a",
          fillOpacity: 0.6,
          weight: 1,
          color: "#4a5568",
          opacity: 0.8,
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        layer.on("click", (e) => { L.DomEvent.stopPropagation(e); showCountyPanel(p.county_id, p.name); });
        layer.on("mouseover", function() { this.setStyle({ weight: 2, color: "#0ea5e9" }); });
        layer.on("mouseout", function() { geojsonLayer.resetStyle(this); });

        // Label
        const center = layer.getBounds().getCenter();
        L.marker(center, {
          icon: L.divIcon({
            className: "",
            html: `<div style="color:#e2e8f0;font-size:10px;font-weight:600;text-align:center;
                    text-shadow:0 1px 3px rgba(0,0,0,0.8);white-space:nowrap;pointer-events:none">
                    ${p.name}<br><span style="font-size:9px;color:#94a3b8">${p.entity_count}</span></div>`,
            iconSize: [80, 24],
            iconAnchor: [40, 12],
          }),
        }).addTo(mapInstance);
      },
    }).addTo(mapInstance);
  } catch (err) {
    console.error("Failed to load counties:", err);
    el.innerHTML = '<div class="empty">Failed to load map</div>';
  }

  // Locate button
  el.querySelector("#locate-btn").addEventListener("click", locateMe);

  // Close panel on map click
  mapInstance.on("click", () => {
    const panel = document.getElementById("county-panel");
    if (panel && !panel.classList.contains("hidden")) {
      panel.classList.add("hidden");
    }
  });
}

async function showCountyPanel(countyId, countyName) {
  const panel = document.getElementById("county-panel");
  const content = document.getElementById("county-panel-content");
  panel.classList.remove("hidden");

  const header = document.getElementById("county-panel-header");
  header.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h2 style="font-size:1.1rem">${countyName} County</h2>
    <button id="close-panel" style="background:none;border:none;color:var(--text-dim);font-size:1.5rem;
      width:44px;height:44px;cursor:pointer">&times;</button>
  </div>`;
  content.innerHTML = `<div class="spinner"></div>`;

  document.getElementById("close-panel").addEventListener("click", () => panel.classList.add("hidden"));

  try {
    const data = await api(`/geo/county/${countyId}/entities`);
    header.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h2 style="font-size:1.1rem">${data.county_name} County</h2>
      <button id="close-panel2" style="background:none;border:none;color:var(--text-dim);font-size:1.5rem;
        width:44px;height:44px;cursor:pointer">&times;</button>
    </div>`;
    let html = ``;

    // Group by type
    const grouped = {};
    data.entities.forEach(e => {
      if (!grouped[e.type]) grouped[e.type] = [];
      grouped[e.type].push(e);
    });

    const typeLabels = {
      city: "Cities", county: "County Government", school_district: "School Districts",
      alternative_school: "Alternative Schools", fire_district: "Fire Districts",
      highway_district: "Highway Districts", cemetery_district: "Cemetery Districts",
      irrigation_district: "Irrigation Districts", library_district: "Library Districts",
      soil_water_district: "Soil/Water Conservation", recreation_district: "Recreation Districts",
      water_district: "Water Districts", drainage_district: "Drainage Districts",
      sewer_district: "Sewer Districts", sewer_water_district: "Sewer/Water Districts",
      flood_control_district: "Flood Control Districts", housing_authority: "Housing Authorities",
      hospital_district: "Hospital Districts", health_district: "Health Districts",
      natural_resource_district: "Natural Resource Districts", solid_waste_district: "Solid Waste Districts",
      special_district: "Other Special Districts", airport_authority: "Airport Authority",
      transit_authority: "Transit Authority", port_authority: "Port Authority",
    };
    const typeOrder = ["city", "county", "fire_district", "highway_district", "school_district",
      "alternative_school", "cemetery_district", "irrigation_district", "library_district",
      "soil_water_district", "recreation_district", "water_district", "drainage_district",
      "sewer_district", "sewer_water_district", "flood_control_district", "housing_authority",
      "hospital_district", "health_district", "natural_resource_district", "solid_waste_district",
      "special_district", "airport_authority", "transit_authority", "port_authority"];

    html += `<div style="font-size:0.85rem;color:var(--text-dim);margin-bottom:12px">${data.entities.length} entities</div>`;

    // Render known types first, then any remaining
    const allTypes = [...new Set([...typeOrder, ...Object.keys(grouped)])];
    allTypes.forEach(type => {
      const items = grouped[type];
      if (!items) return;
      html += `<div class="section-header" style="margin-top:12px">${typeLabels[type] || type.replace(/_/g, " ")} (${items.length})</div>`;
      items.forEach(e => {
        html += `<div class="list-item" data-id="${e.jurisdiction_id}" data-name="${e.name}">
          <div class="list-item-title">${e.name}</div>
          <div class="list-item-meta">
            ${e.population ? `<span style="font-size:0.8rem">Pop: ${e.population.toLocaleString()}</span>` : ""}
            ${e.status ? badge(e.status, "") : ""}
          </div>
        </div>`;
      });
    });

    content.innerHTML = html;

    document.getElementById("close-panel2").addEventListener("click", () => panel.classList.add("hidden"));

    content.querySelectorAll("[data-id]").forEach(item => {
      item.addEventListener("click", () => {
        panel.classList.add("hidden");
        navigate("jurisdiction-detail", { id: item.dataset.id, name: item.dataset.name });
      });
    });
  } catch (err) {
    content.innerHTML = `<div class="empty">Failed to load: ${err.message}</div>`;
  }
}

async function locateMe() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }

  const btn = document.getElementById("locate-btn");
  btn.style.background = "#666";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      btn.style.background = "var(--accent)";
      const { latitude, longitude } = pos.coords;

      // Add marker
      if (mapInstance) {
        L.circleMarker([latitude, longitude], {
          radius: 8, fillColor: "#0ea5e9", fillOpacity: 1,
          color: "#fff", weight: 2,
        }).addTo(mapInstance);
        mapInstance.setView([latitude, longitude], 9);
      }

      // Find county
      try {
        const data = await api(`/geo/locate?lat=${latitude}&lng=${longitude}`);
        if (data.county_id) {
          showCountyPanel(data.county_id, data.county_name);
        } else {
          alert("You don't appear to be in Idaho");
        }
      } catch (err) {
        alert("Location lookup failed");
      }
    },
    () => {
      btn.style.background = "var(--accent)";
      alert("Unable to get your location");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function loadLeaflet() {
  return new Promise((resolve) => {
    if (window.L) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = resolve;
    document.head.appendChild(s);
  });
}
