import { api, navigate, phoneLink, emailLink, badge } from "../app.js";

export async function renderSearch(el) {
  el.innerHTML = `
    <div style="padding:20px 0 12px;text-align:center">
      <div style="font-size:1.4rem;font-weight:700;margin-bottom:4px">CES Idaho</div>
      <div style="font-size:0.8rem;color:var(--text-dim)">Entities &middot; People &middot; Vendors &middot; Notes &middot; Events</div>
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
    const totalResults = data.jurisdictions.length + data.officials.length + data.vendors.length
      + data.interactions.length + data.schedule.length + data.events.length + data.outreach_notes.length;

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
          ${o.notes ? `<div style="font-size:0.8rem;color:var(--text-dim);font-style:italic;margin-top:2px">${highlight(o.notes, q)}</div>` : ""}
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">
            ${o.phone ? phoneLink(o.phone) : ""}
            ${o.email ? emailLink(o.email) : ""}
          </div>
        </div>`;
      });
    }

    // Outreach Notes
    if (data.outreach_notes.length > 0) {
      html += `<div class="section-header" style="margin-top:16px">Outreach Notes (${data.outreach_notes.length})</div>`;
      data.outreach_notes.forEach(n => {
        html += `<div class="list-item" data-action="jurisdiction" data-id="${n.jurisdiction_id}" data-name="${n.jurisdiction_name}">
          <div class="list-item-title">${highlight(n.jurisdiction_name, q)}</div>
          <div class="list-item-meta">
            ${badge(n.type, "")}
            ${n.status ? badge(n.status, "") : ""}
            ${n.priority ? badge(n.priority, "") : ""}
          </div>
          <div style="font-size:0.85rem;color:var(--text-dim);margin-top:4px;font-style:italic">${highlight(n.notes, q)}</div>
        </div>`;
      });
    }

    // Interactions
    if (data.interactions.length > 0) {
      html += `<div class="section-header" style="margin-top:16px">Interactions (${data.interactions.length})</div>`;
      data.interactions.forEach(i => {
        const d = i.interaction_date ? new Date(i.interaction_date).toLocaleDateString() : "";
        html += `<div class="list-item" data-action="jurisdiction" data-id="${i.jurisdiction_id}" data-name="${i.jurisdiction_name || ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="list-item-title">${i.jurisdiction_name || "Unknown"}</div>
            <span style="font-size:0.8rem;color:var(--text-dim)">${d}</span>
          </div>
          <div class="list-item-meta">${badge(i.type)} ${i.official_name ? `<span style="font-size:0.8rem">w/ ${i.official_name}</span>` : ""}</div>
          <div style="font-size:0.85rem;margin-top:4px">${highlight(i.summary || "", q)}</div>
          ${i.follow_up_note ? `<div style="font-size:0.8rem;color:var(--text-dim);margin-top:2px">Follow-up: ${highlight(i.follow_up_note, q)}</div>` : ""}
        </div>`;
      });
    }

    // Schedule
    if (data.schedule.length > 0) {
      html += `<div class="section-header" style="margin-top:16px">Schedule (${data.schedule.length})</div>`;
      data.schedule.forEach(s => {
        const d = s.item_date ? new Date(s.item_date + "T00:00:00").toLocaleDateString() : "";
        html += `<div class="list-item" ${s.entity_id ? `data-action="jurisdiction" data-id="${s.entity_id}" data-name="${s.entity_name || ''}"` : ""}>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="list-item-title">${highlight(s.title || s.entity_name || "", q)}</div>
            <span style="font-size:0.8rem;color:var(--text-dim)">${d}</span>
          </div>
          <div class="list-item-meta">${badge(s.item_type)} ${s.completed ? '<span style="color:var(--green);font-size:0.8rem">Done</span>' : ""}</div>
          ${s.notes ? `<div style="font-size:0.85rem;color:var(--text-dim);margin-top:4px">${highlight(s.notes, q)}</div>` : ""}
        </div>`;
      });
    }

    // Events
    if (data.events.length > 0) {
      html += `<div class="section-header" style="margin-top:16px">Events (${data.events.length})</div>`;
      data.events.forEach(e => {
        const d = e.event_date ? new Date(e.event_date + "T00:00:00").toLocaleDateString() : "";
        html += `<div class="card" style="padding:12px 16px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-weight:600">${highlight(e.title, q)}</div>
            <span style="font-size:0.8rem;color:var(--text-dim)">${d}</span>
          </div>
          ${e.location ? `<div style="font-size:0.85rem;color:var(--text-dim);margin-top:2px">${highlight(e.location, q)}</div>` : ""}
          ${e.description ? `<div style="font-size:0.85rem;margin-top:4px">${highlight(e.description.substring(0, 200), q)}${e.description.length > 200 ? "..." : ""}</div>` : ""}
          ${e.url ? `<a class="contact-link" href="${e.url}" target="_blank" style="font-size:0.8rem;margin-top:4px;display:inline-block">Details</a>` : ""}
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
          ${v.ces_contract_category ? `<div style="font-size:0.8rem;margin-top:2px">${badge(v.ces_contract_category)}</div>` : ""}
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
        if (e.target.closest("a")) return;
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
