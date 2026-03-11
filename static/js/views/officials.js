import { api, navigate, phoneLink, emailLink } from "../app.js";

export async function renderOfficials(el) {
  el.innerHTML = `
    <input class="search-bar" type="search" placeholder="Search officials by name..." id="off-search">
    <input class="search-bar" type="search" placeholder="Filter by entity name..." id="off-jurisdiction" style="margin-top:-4px">
    <div class="filter-row">
      <select class="filter-select" id="off-title">
        <option value="">All Titles</option>
        <option value="Mayor">Mayor</option>
        <option value="Clerk">Clerk</option>
        <option value="Councilor">Councilor</option>
        <option value="Commissioner">Commissioner</option>
        <option value="Treasurer">Treasurer</option>
        <option value="Chief">Chief</option>
        <option value="Attorney">Attorney</option>
        <option value="Superintendent">Superintendent</option>
      </select>
    </div>
    <div id="off-list"><div class="empty">Search by name, entity, or select a title</div></div>
  `;

  const listEl = el.querySelector("#off-list");

  async function load() {
    const name = el.querySelector("#off-search").value.trim();
    const jurisdiction = el.querySelector("#off-jurisdiction").value.trim();
    const title = el.querySelector("#off-title").value;
    if (!name && !title && !jurisdiction) {
      listEl.innerHTML = `<div class="empty">Search by name, entity, or select a title</div>`;
      return;
    }

    listEl.innerHTML = `<div class="spinner"></div>`;
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (jurisdiction) params.set("jurisdiction", jurisdiction);
    if (title) params.set("title", title);

    const data = await api(`/officials?${params}`);
    if (data.length === 0) {
      listEl.innerHTML = `<div class="empty">No officials found</div>`;
      return;
    }

    listEl.innerHTML = data.map(o => `
      <div class="list-item">
        <div class="list-item-title">${o.name}</div>
        <div class="list-item-sub">${o.title || ""} &mdash; ${o.jurisdiction_name || ""}</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">
          ${o.phone ? phoneLink(o.phone) : ""}
          ${o.email ? emailLink(o.email) : ""}
        </div>
      </div>
    `).join("");
  }

  let debounce;
  el.querySelector("#off-search").addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(load, 300);
  });
  el.querySelector("#off-jurisdiction").addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(load, 300);
  });
  el.querySelector("#off-title").addEventListener("change", load);
}
