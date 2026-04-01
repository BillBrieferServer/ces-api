import { api, navigate, phoneLink, emailLink, showToast } from "../app.js";


function lastNameFirst(name) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts.pop();
  return last + ", " + parts.join(" ");
}

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
            <div class="list-item-title">${lastNameFirst(o.name)}</div>
            <div class="list-item-sub">${o.title || ""} &mdash; ${o.jurisdiction_name || ""}</div>
          </div>
          <button class="btn btn-sm" data-sched-off="${o.official_id}"
            data-sched-name="${(o.name || '').replace(/"/g, '&quot;')}"
            data-sched-jid="${o.jurisdiction_id || ''}"
            data-sched-jname="${(o.jurisdiction_name || '').replace(/"/g, '&quot;')}"
            style="padding:4px 10px;font-size:0.9rem;min-height:32px;background:rgba(5,150,105,0.12);color:#059669;border:1px solid rgba(5,150,105,0.3);border-radius:6px;margin-left:4px;flex-shrink:0">&#128197;</button>
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

    // Schedule buttons
    listEl.querySelectorAll("[data-sched-off]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showScheduleOfficialModal({
          official_id: parseInt(btn.dataset.schedOff),
          name: btn.dataset.schedName,
          jurisdiction_id: btn.dataset.schedJid ? parseInt(btn.dataset.schedJid) : null,
          jurisdiction_name: btn.dataset.schedJname || "",
        });
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


function showScheduleOfficialModal(info) {
  const today = new Date().toISOString().slice(0, 10);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Schedule with ${info.name}</h2>
        <button class="modal-close">&times;</button>
      </div>
      ${info.jurisdiction_name ? `<div style="font-size:0.85rem;color:var(--text-dim);margin-bottom:12px">${info.jurisdiction_name}</div>` : ""}
      <div class="form-group">
        <label class="form-label">Type</label>
        <select class="form-select" id="sa-type">
          <option value="entity_visit">Visit</option>
          <option value="follow_up">Follow-up</option>
          <option value="presentation">Presentation</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input class="form-input" id="sa-date" type="date" value="${today}">
      </div>
      <div class="form-group">
        <label class="form-label">Time (optional)</label>
        <input class="form-input" id="sa-time" type="time">
      </div>
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" id="sa-title" value="${info.jurisdiction_name ? info.jurisdiction_name + ' \u2014 ' + info.name : info.name}">
      </div>
      <div class="form-group">
        <label class="form-label">Location (optional)</label>
        <input class="form-input" id="sa-location" placeholder="Address...">
      </div>
      <div class="form-group">
        <label class="form-label">Assigned to</label>
        <select class="form-select" id="sa-assigned">
          <option value="">\u2014</option>
          <option value="Steve">Steve</option>
          <option value="Drew">Drew</option>
          <option value="Both">Both</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notes (optional)</label>
        <textarea class="form-textarea" id="sa-notes" rows="2"></textarea>
      </div>
      <button class="btn btn-primary btn-block" id="sa-submit">Add to Schedule</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#sa-submit").addEventListener("click", async () => {
    const itemDate = overlay.querySelector("#sa-date").value;
    const title = overlay.querySelector("#sa-title").value.trim();
    if (!itemDate || !title) { showToast("Date and title required"); return; }
    let url = `/calendar/schedule/custom?title=${encodeURIComponent(title)}&item_date=${itemDate}&item_type=${overlay.querySelector("#sa-type").value}`;
    if (info.official_id) url += `&official_id=${info.official_id}`;
    if (info.jurisdiction_id) url += `&entity_id=${info.jurisdiction_id}`;
    const itemTime = overlay.querySelector("#sa-time").value;
    if (itemTime) url += `&item_time=${encodeURIComponent(itemTime)}`;
    const location = overlay.querySelector("#sa-location").value.trim();
    if (location) url += `&location=${encodeURIComponent(location)}`;
    const assigned = overlay.querySelector("#sa-assigned").value;
    if (assigned) url += `&assigned_to=${encodeURIComponent(assigned)}`;
    const notes = overlay.querySelector("#sa-notes").value.trim();
    if (notes) url += `&notes=${encodeURIComponent(notes)}`;
    try {
      await api(url, { method: "POST" });
      showToast("Scheduled!");
      overlay.remove();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });
}
