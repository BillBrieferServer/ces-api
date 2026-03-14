import { api, navigate, badge } from "../app.js";


function titleCase(s) {
  const small = new Set(["of","and","the","in","at","by","for","to","no","or","a"]);
  return s.toLowerCase().replace(/\w+/g, (w, i) => {
    if (i > 0 && small.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}

function displayName(name, type) {
  const tc = titleCase(name);
  if (type === "city" && tc.startsWith("City of ")) {
    return tc.slice(8) + ", City of";
  }
  return tc;
}

function sortKey(name, type) {
  if (type === "city" && name.startsWith("City of ")) {
    return name.slice(8);
  }
  return name;
}

let currentFilters = { type: "", district: "", status: "", sort: "name", search: "" };

export async function renderJurisdictions(el) {
  el.innerHTML = `
    <input class="search-bar" type="search" placeholder="Search entities..." id="j-search">
    <div class="filter-row">
      <select class="filter-select" id="j-type" style="flex:2">
        <option value="">All Types</option>
        <option value="airport_authority">Airport Authority</option>
        <option value="alternative_school">Alternative Schools</option>
        <option value="cemetery_district">Cemetery Districts</option>
        <option value="city">Cities</option>
        <option value="county">Counties</option>
        <option value="drainage_district">Drainage Districts</option>
        <option value="fire_district">Fire Districts</option>
        <option value="flood_control_district">Flood Control Districts</option>
        <option value="health_district">Health Districts</option>
        <option value="highway_district">Highway Districts</option>
        <option value="hospital_district">Hospital Districts</option>
        <option value="housing_authority">Housing Authorities</option>
        <option value="irrigation_district">Irrigation Districts</option>
        <option value="library_district">Library Districts</option>
        <option value="natural_resource_district">Natural Resource Districts</option>
        <option value="special_district">Other Special Districts</option>
        <option value="port_authority">Port Authority</option>
        <option value="recreation_district">Recreation Districts</option>
        <option value="school_district">School Districts</option>
        <option value="sewer_district">Sewer Districts</option>
        <option value="sewer_water_district">Sewer/Water Districts</option>
        <option value="soil_water_district">Soil/Water Conservation</option>
        <option value="solid_waste_district">Solid Waste Districts</option>
        <option value="transit_authority">Transit Authority</option>
        <option value="water_district">Water Districts</option>
      </select>
      <select class="filter-select" id="j-district">
        <option value="">All Districts</option>
        ${[1,2,3,4,5,6].map(d => `<option value="${d}">District ${d}</option>`).join("")}
      </select>
      <select class="filter-select" id="j-status">
        <option value="">All Statuses</option>
        <option value="not_contacted">Not Contacted</option>
        <option value="contacted">Contacted</option>
        <option value="pitched">Pitched</option>
        <option value="presentation_scheduled">Scheduled</option>
        <option value="board_approved">Approved</option>
        <option value="active_member">Active</option>
      </select>
      <select class="filter-select" id="j-sort">
        <option value="population">Pop. (high)</option>
        <option value="name">Name (A-Z)</option>
      </select>
    </div>
    <div id="j-list"><div class="spinner"></div></div>
  `;

  const listEl = el.querySelector("#j-list");
  const searchEl = el.querySelector("#j-search");

  async function load() {
    const params = new URLSearchParams();
    if (currentFilters.type) params.set("type", currentFilters.type);
    if (currentFilters.district) params.set("aic_district", currentFilters.district);
    if (currentFilters.status) params.set("status", currentFilters.status);
    if (currentFilters.sort) params.set("sort_by", currentFilters.sort);

    const data = await api(`/jurisdictions?${params}`);
    const search = currentFilters.search.toLowerCase();
    const searched = search ? data.filter(j => j.name.toLowerCase().includes(search)) : data;
    const filtered = currentFilters.sort === "name" ? searched.sort((a, b) => sortKey(a.name, a.type).localeCompare(sortKey(b.name, b.type))) : searched;

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="empty">No matching entities</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(j => `
      <div class="list-item" data-id="${j.jurisdiction_id}" data-name="${j.name}">
        <div class="list-item-title">${displayName(j.name, j.type)}</div>
        <div class="list-item-sub">${j.county_name || ""} County</div>
        <div class="list-item-meta">
          ${badge(j.type, "")}
          ${j.population ? `<span style="font-size:0.8rem">Pop: ${j.population.toLocaleString()}</span>` : ""}
          ${badge(j.status, "")}
        </div>
      </div>
    `).join("");

    listEl.querySelectorAll(".list-item").forEach(item => {
      item.addEventListener("click", () => {
        navigate("jurisdiction-detail", { id: item.dataset.id, name: item.dataset.name });
      });
    });
  }

  // Event handlers
  el.querySelector("#j-type").addEventListener("change", e => { currentFilters.type = e.target.value; load(); });

  el.querySelector("#j-district").addEventListener("change", e => { currentFilters.district = e.target.value; load(); });
  el.querySelector("#j-status").addEventListener("change", e => { currentFilters.status = e.target.value; load(); });
  el.querySelector("#j-sort").addEventListener("change", e => { currentFilters.sort = e.target.value; load(); });

  let debounce;
  searchEl.addEventListener("input", e => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { currentFilters.search = e.target.value; load(); }, 200);
  });

  load();
}
