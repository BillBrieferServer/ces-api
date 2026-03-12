import { api, navigate, phoneLink, emailLink, badge } from "../app.js";

export async function renderSearch(el) {
  el.innerHTML = `
    <div style="padding:20px 0 12px;text-align:center">
      <div style="font-size:1.4rem;font-weight:700;margin-bottom:4px">CES Idaho</div>
      <div style="font-size:0.8rem;color:var(--text-dim)">1,336 entities &middot; 1,759 officials</div>
    </div>
    <input class="search-bar" type="search" placeholder="Search anything..." id="global-search"
           style="font-size:1.1rem;padding:14px 18px" autofocus>
    <div id="search-results"></div>
  `;

  const input = el.querySelector("#global-search");
  const results = el.querySelector("#search-results");
  let debounce;

  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 2) {
      results.innerHTML = q.length === 0
        ? `<div class="empty" style="margin-top:40px">Type a name, title, city, county, or keyword</div>`
        : "";
      return;
    }
    debounce = setTimeout(() => doSearch(q, results), 300);
  });

  // Show initial state
  results.innerHTML = `<div class="empty" style="margin-top:40px">Type a name, title, city, county, or keyword</div>`;
  // Auto-focus
  requestAnimationFrame(() => input.focus());
}

async function doSearch(q, el) {
  el.innerHTML = `<div class="spinner"></div>`;

  try {
    const data = await api(`/search?q=${encodeURIComponent(q)}`);
    let html = "";
    const totalResults = data.jurisdictions.length + data.officials.length + data.vendors.length;

    if (totalResults === 0) {
      el.innerHTML = `<div class="empty">No results for "${q}"</div>`;
      return;
    }

    // Entities
    if (data.jurisdictions.length > 0) {
      html += `<div class="section-header" style="margin-top:16px">Entities (${data.jurisdictions.length})</div>`;
      data.jurisdictions.forEach(j => {
        html += `<div class="list-item" data-action="jurisdiction" data-id="${j.jurisdiction_id}" data-name="${j.name}">
          <div class="list-item-title">${highlight(j.name, q)}</div>
          <div class="list-item-meta">
            ${badge(j.type, "")}
            ${j.county_name ? `<span style="font-size:0.8rem;color:var(--text-dim)">${j.county_name} County</span>` : ""}
            ${j.population ? `<span style="font-size:0.8rem">Pop: ${j.population.toLocaleString()}</span>` : ""}
            ${j.status ? badge(j.status, "") : ""}
          </div>
        </div>`;
      });
    }

    // People
    if (data.officials.length > 0) {
      html += `<div class="section-header" style="margin-top:16px">People (${data.officials.length})</div>`;
      data.officials.forEach(o => {
        html += `<div class="list-item" data-action="jurisdiction" data-id="${o.jurisdiction_id}" data-name="${o.jurisdiction_name || ''}">
          <div class="list-item-title">${highlight(o.name, q)}</div>
          <div class="list-item-sub">${highlight(o.title || "", q)} &mdash; ${o.jurisdiction_name || ""}</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">
            ${o.phone ? phoneLink(o.phone) : ""}
            ${o.email ? emailLink(o.email) : ""}
          </div>
        </div>`;
      });
    }

    // Vendors
    if (data.vendors.length > 0) {
      html += `<div class="section-header" style="margin-top:16px">Vendors (${data.vendors.length})</div>`;
      data.vendors.forEach(v => {
        html += `<div class="card" style="padding:12px 16px">
          <div style="font-weight:600">${highlight(v.vendor_name, q)}</div>
          ${v.contact_name ? `<div style="color:var(--text-dim);font-size:0.85rem">${v.contact_name}</div>` : ""}
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">
            ${v.phone ? phoneLink(v.phone) : ""}
            ${v.email ? emailLink(v.email) : ""}
          </div>
          ${v.bluebook_status ? `<div style="margin-top:6px">${badge(v.bluebook_status)}</div>` : ""}
        </div>`;
      });
    }

    el.innerHTML = html;

    // Click handlers
    el.querySelectorAll("[data-action='jurisdiction']").forEach(item => {
      item.addEventListener("click", (e) => {
        if (e.target.closest("a")) return; // don't navigate on tel/mailto clicks
        navigate("jurisdiction-detail", { id: item.dataset.id, name: item.dataset.name });
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="empty">Search failed: ${err.message}</div>`;
  }
}

function highlight(text, query) {
  if (!text || !query) return text || "";
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return text.replace(regex, `<mark style="background:var(--accent);color:#fff;border-radius:2px;padding:0 2px">$1</mark>`);
}
