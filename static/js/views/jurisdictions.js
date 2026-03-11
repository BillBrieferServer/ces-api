import { api, navigate, badge } from "../app.js";

let currentFilters = { type: "", district: "", status: "", sort: "population", search: "" };

export async function renderJurisdictions(el) {
  el.innerHTML = `
    <input class="search-bar" type="search" placeholder="Search entities..." id="j-search">
    <div class="filter-row">
      <button class="chip active" data-type="">All</button>
      <button class="chip" data-type="city">Cities</button>
      <button class="chip" data-type="county">Counties</button>
      <button class="chip" data-type="school_district">Schools</button>
    </div>
    <div class="filter-row">
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
    const filtered = search ? data.filter(j => j.name.toLowerCase().includes(search)) : data;

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="empty">No matching entities</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(j => `
      <div class="list-item" data-id="${j.jurisdiction_id}" data-name="${j.name}">
        <div class="list-item-title">${j.name}</div>
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
  el.querySelectorAll("[data-type]").forEach(chip => {
    chip.addEventListener("click", () => {
      el.querySelectorAll("[data-type]").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilters.type = chip.dataset.type;
      load();
    });
  });

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
