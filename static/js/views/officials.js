import { api, navigate, phoneLink, emailLink, showToast } from "../app.js";
import { lastFirst, showScheduleModal } from "../shared.js";




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
      <div class="list-item" style="position:relative">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1;min-width:0" data-goto-jurisdiction="${o.jurisdiction_id || ""}" data-goto-name="${(o.jurisdiction_name || "").replace(/"/g, '&quot;')}">
            <div class="list-item-title">${lastFirst(o.name)}</div>
            <div class="list-item-sub">${o.title || ""} &mdash; ${o.jurisdiction_name || ""}</div>
          </div>
          <button class="btn btn-sm" data-edit-off="${o.official_id}"
            data-off-name="${(o.name || "").replace(/"/g, '&quot;')}"
            data-off-title="${(o.title || "").replace(/"/g, '&quot;')}"
            data-off-phone="${o.phone || ""}"
            data-off-email="${o.email || ""}"
            style="padding:4px 10px;font-size:0.9rem;min-height:32px;background:rgba(255,255,255,0.08);color:var(--text-dim);border:1px solid rgba(255,255,255,0.12);border-radius:6px;margin-left:8px;flex-shrink:0">&#9998;</button>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">
          ${o.phone ? phoneLink(o.phone) : ""}
          ${o.email ? emailLink(o.email) : ""}
        </div>
      </div>
    `).join("");

    // Tap row to go to jurisdiction detail
    listEl.querySelectorAll("[data-goto-jurisdiction]").forEach(row => {
      if (!row.dataset.gotoJurisdiction) return;
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        navigate("jurisdiction-detail", { id: row.dataset.gotoJurisdiction, name: row.dataset.gotoName });
      });
    });

    // Edit buttons
    listEl.querySelectorAll("[data-edit-off]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showEditOfficialModal(btn.dataset.editOff, {
          name: btn.dataset.offName,
          title: btn.dataset.offTitle,
          phone: btn.dataset.offPhone,
          email: btn.dataset.offEmail,
        }, load);
      });
    });
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

function showEditOfficialModal(officialId, existing, refreshFn) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Edit Contact</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="off-name" value="${existing.name || ""}" placeholder="Full name">
      </div>
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" id="off-title" value="${existing.title || ""}" placeholder="Mayor, Clerk, Commissioner...">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-input" id="off-phone" type="tel" value="${existing.phone || ""}" placeholder="(208) 555-1234">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="off-email" type="email" value="${existing.email || ""}" placeholder="name@example.com">
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-block" id="off-delete" style="background:rgba(220,38,38,0.15);color:#DC2626;border:1px solid #DC2626;flex:1">Delete</button>
        <button class="btn btn-primary btn-block" id="off-submit" style="flex:2">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#off-submit").addEventListener("click", async () => {
    const name = overlay.querySelector("#off-name").value.trim();
    const title = overlay.querySelector("#off-title").value.trim();
    const phone = overlay.querySelector("#off-phone").value.trim();
    const email = overlay.querySelector("#off-email").value.trim();

    if (!name) { showToast("Name is required"); return; }

    const body = {};
    if (name !== existing.name) body.name = name;
    if (title !== existing.title) body.title = title;
    if (phone !== (existing.phone || "")) body.phone = phone || null;
    if (email !== (existing.email || "")) body.email = email || null;

    if (Object.keys(body).length === 0) { overlay.remove(); return; }

    try {
      await api(`/officials/${officialId}`, { method: "PUT", body });
      showToast("Contact updated");
      overlay.remove();
      refreshFn();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });

  // Delete handler
  overlay.querySelector("#off-delete").addEventListener("click", async () => {
    if (!confirm(`Delete ${existing.name}? This cannot be undone.`)) return;
    try {
      await api(`/officials/${officialId}`, { method: "DELETE" });
      overlay.remove();
      showToast("Contact deleted");
      refreshFn();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });
}
