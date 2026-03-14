import { api, phoneLink, emailLink, badge, showToast } from "../app.js";

export async function renderVendors(el) {
  el.innerHTML = `
    <input class="search-bar" type="search" placeholder="Search vendors..." id="v-search">
    <div class="filter-row">
      <select class="filter-select" id="v-status">
        <option value="">All Statuses</option>
        <option value="not_listed">Not Listed</option>
        <option value="recruited">Recruited</option>
        <option value="onboarded">Onboarded</option>
        <option value="active">Active</option>
      </select>
      <select class="filter-select" id="v-sort">
        <option value="spend">Sort: $ Amount</option>
        <option value="name">Sort: Name</option>
        <option value="category">Sort: Category</option>
        <option value="entity">Sort: Entity</option>
      </select>
      <button class="btn btn-primary btn-sm" id="add-vendor-btn">+ Add Vendor</button>
    </div>
    <div class="filter-row">
      <span id="v-count" style="font-size:0.8rem;color:var(--text-dim)"></span>
    </div>
    <div id="v-list"><div class="spinner"></div></div>
  `;

  const listEl = el.querySelector("#v-list");

  async function load() {
    const params = new URLSearchParams();
    const name = el.querySelector("#v-search").value.trim();
    const status = el.querySelector("#v-status").value;
    if (name) params.set("name", name);
    if (status) params.set("bluebook_status", status);

    const data = await api(`/vendors?${params}`);
    if (data.length === 0) {
      listEl.innerHTML = `<div class="empty">No vendors found</div>`;
      return;
    }

    const sortBy = el.querySelector("#v-sort").value;
    if (sortBy === "spend") {
      data.sort((a, b) => (b.total_spend || 0) - (a.total_spend || 0));
    } else if (sortBy === "name") {
      data.sort((a, b) => (a.vendor_name || "").localeCompare(b.vendor_name || ""));
    } else if (sortBy === "category") {
      data.sort((a, b) => (a.ces_contract_category || "zzz").localeCompare(b.ces_contract_category || "zzz") || (b.total_spend || 0) - (a.total_spend || 0));
    } else if (sortBy === "entity") {
      data.sort((a, b) => (a.jurisdictions || "zzz").localeCompare(b.jurisdictions || "zzz") || (b.total_spend || 0) - (a.total_spend || 0));
    }
    el.querySelector("#v-count").textContent = data.length + " vendors" + (data.length >= 200 ? " (showing first 200)" : "");
    listEl.innerHTML = data.map(v => {
      const spend = v.total_spend ? "$" + Number(v.total_spend).toLocaleString("en-US", {minimumFractionDigits: 0, maximumFractionDigits: 0}) : "";
      return `
      <div class="card" style="padding:14px 16px;cursor:pointer" onclick="window.__openVendor(${v.vendor_id})">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div style="font-weight:600;font-size:0.95rem;margin-bottom:2px">${v.vendor_name}</div>
          ${spend ? `<div style="font-weight:600;font-size:0.85rem;color:var(--accent)">${spend}</div>` : ""}
        </div>
        ${v.contact_name ? `<div style="color:var(--text-dim);font-size:0.8rem">${v.contact_name}</div>` : ""}
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">
          ${v.phone ? phoneLink(v.phone) : ""}
          ${v.email ? emailLink(v.email) : ""}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center">
          ${badge(v.bluebook_status)}
          ${v.ces_contract_category ? `<span class="badge" style="background:#e0e7ff;color:#3730a3">${v.ces_contract_category}</span>` : ""}
        </div>
        ${v.jurisdictions || v.source ? `<div style="font-size:0.75rem;color:var(--text-dim);margin-top:4px">
          ${v.jurisdictions ? "\u{1F3DB} " + v.jurisdictions : ""}${v.jurisdictions && v.source ? " &middot; " : ""}${v.source ? "Source: " + v.source : ""}
        </div>` : ""}
      </div>`;
    }).join("");
  }

  let debounce;
  el.querySelector("#v-search").addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(load, 300);
  });
  el.querySelector("#v-status").addEventListener("change", load);
  el.querySelector("#v-sort").addEventListener("change", load);

  el.querySelector("#add-vendor-btn").addEventListener("click", () => showAddVendorModal(el, load));

  window.__openVendor = (id) => showVendorDetailModal(id, load);

  load();
}

async function showVendorDetailModal(vendorId, reload) {
  const v = await api(`/vendors/${vendorId}`);

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Vendor Details</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">Vendor Name *</label>
        <input class="form-input" id="vd-name" value="${v.vendor_name || ""}">
      </div>
      <div class="form-group">
        <label class="form-label">Contact Name</label>
        <input class="form-input" id="vd-contact" value="${v.contact_name || ""}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" id="vd-phone" type="tel" value="${v.phone || ""}">
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" id="vd-email" type="email" value="${v.email || ""}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Website</label>
        <input class="form-input" id="vd-website" value="${v.website || ""}">
      </div>
      <div class="form-group">
        <label class="form-label">Address</label>
        <input class="form-input" id="vd-address" value="${v.address || ""}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">BlueBook Status</label>
          <select class="form-select" id="vd-bb">
            <option value="not_listed" ${v.bluebook_status === "not_listed" ? "selected" : ""}>Not Listed</option>
            <option value="recruited" ${v.bluebook_status === "recruited" ? "selected" : ""}>Recruited</option>
            <option value="onboarded" ${v.bluebook_status === "onboarded" ? "selected" : ""}>Onboarded</option>
            <option value="active" ${v.bluebook_status === "active" ? "selected" : ""}>Active</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">CES Contract Category</label>
          <select class="form-select" id="vd-cat">
            <option value="" ${!v.ces_contract_category ? "selected" : ""}>-- None --</option>
            <option value="Construction & Building Services" ${v.ces_contract_category === "Construction & Building Services" ? "selected" : ""}>Construction & Building</option>
            <option value="Technology & IT" ${v.ces_contract_category === "Technology & IT" ? "selected" : ""}>Technology & IT</option>
            <option value="Fleet & Vehicles" ${v.ces_contract_category === "Fleet & Vehicles" ? "selected" : ""}>Fleet & Vehicles</option>
            <option value="Office Supplies & Furniture" ${v.ces_contract_category === "Office Supplies & Furniture" ? "selected" : ""}>Office Supplies & Furniture</option>
            <option value="Janitorial & Maintenance" ${v.ces_contract_category === "Janitorial & Maintenance" ? "selected" : ""}>Janitorial & Maintenance</option>
            <option value="Medical & Health" ${v.ces_contract_category === "Medical & Health" ? "selected" : ""}>Medical & Health</option>
            <option value="Public Safety & Security" ${v.ces_contract_category === "Public Safety & Security" ? "selected" : ""}>Public Safety & Security</option>
            <option value="Food Services" ${v.ces_contract_category === "Food Services" ? "selected" : ""}>Food Services</option>
            <option value="Utility & Heavy Equipment" ${v.ces_contract_category === "Utility & Heavy Equipment" ? "selected" : ""}>Utility & Heavy Equipment</option>
            <option value="Moving & Storage" ${v.ces_contract_category === "Moving & Storage" ? "selected" : ""}>Moving & Storage</option>
            <option value="Educational Supplies" ${v.ces_contract_category === "Educational Supplies" ? "selected" : ""}>Educational Supplies</option>
            <option value="Performing Arts" ${v.ces_contract_category === "Performing Arts" ? "selected" : ""}>Performing Arts</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Source</label>
        <input class="form-input" id="vd-source" value="${v.source || ""}" readonly style="opacity:0.7">
      </div>
      ${v.jurisdictions ? `<div style="font-size:0.85rem;color:var(--text-dim);margin:8px 0;padding:8px 12px;background:var(--card-bg);border-radius:8px">
        <strong>Entities:</strong> ${v.jurisdictions}${v.total_spend ? ` &mdash; $${Number(v.total_spend).toLocaleString("en-US", {minimumFractionDigits: 0, maximumFractionDigits: 0})} total spend` : ""}
      </div>` : ""}
      <div style="display:flex;gap:10px;margin-top:4px">
        <button class="btn btn-primary" style="flex:1" id="vd-save">Save Changes</button>
        <button class="btn" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5" id="vd-delete">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#vd-delete").addEventListener("click", async () => {
    if (!confirm("Delete this vendor? This cannot be undone.")) return;
    await api(, { method: "DELETE" });
    overlay.remove();
    showToast("Vendor deleted");
    reload();
  });

  overlay.querySelector("#vd-save").addEventListener("click", async () => {
    const body = {
      vendor_name: overlay.querySelector("#vd-name").value.trim(),
      contact_name: overlay.querySelector("#vd-contact").value.trim() || null,
      phone: overlay.querySelector("#vd-phone").value.trim() || null,
      email: overlay.querySelector("#vd-email").value.trim() || null,
      website: overlay.querySelector("#vd-website").value.trim() || null,
      address: overlay.querySelector("#vd-address").value.trim() || null,
      bluebook_status: overlay.querySelector("#vd-bb").value,
      ces_contract_category: overlay.querySelector("#vd-cat").value || null,
      source: overlay.querySelector("#vd-source").value.trim() || null,
    };
    if (!body.vendor_name) { overlay.querySelector("#vd-name").focus(); return; }
    await api(`/vendors/${vendorId}`, { method: "PUT", body });
    overlay.remove();
    showToast("Vendor updated");
    reload();
  });
}

function showAddVendorModal(parentEl, reload) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Add Vendor</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">Vendor Name *</label>
        <input class="form-input" id="v-name" placeholder="Company name">
      </div>
      <div class="form-group">
        <label class="form-label">Contact Name</label>
        <input class="form-input" id="v-contact" placeholder="Sales rep name">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-input" id="v-phone" type="tel" placeholder="208-555-1234">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="v-email" type="email" placeholder="rep@company.com">
      </div>
      <div class="form-group">
        <label class="form-label">Website</label>
        <input class="form-input" id="v-website" placeholder="https://...">
      </div>
      <div class="form-group">
        <label class="form-label">BlueBook Status</label>
        <select class="form-select" id="v-bb">
          <option value="not_listed">Not Listed</option>
          <option value="recruited">Recruited</option>
          <option value="onboarded">Onboarded</option>
          <option value="active">Active</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">CES Contract Category</label>
        <input class="form-input" id="v-cat" placeholder="e.g. Office Supplies">
      </div>
      <div class="form-group">
        <label class="form-label">Source</label>
        <input class="form-input" id="v-source" placeholder="e.g. Conference, Referral">
      </div>
      <button class="btn btn-primary btn-block" id="v-submit">Save Vendor</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#v-submit").addEventListener("click", async () => {
    const name = overlay.querySelector("#v-name").value.trim();
    if (!name) { overlay.querySelector("#v-name").focus(); return; }

    const body = {
      vendor_name: name,
      contact_name: overlay.querySelector("#v-contact").value.trim() || null,
      phone: overlay.querySelector("#v-phone").value.trim() || null,
      email: overlay.querySelector("#v-email").value.trim() || null,
      website: overlay.querySelector("#v-website").value.trim() || null,
      bluebook_status: overlay.querySelector("#v-bb").value,
      ces_contract_category: overlay.querySelector("#v-cat").value.trim() || null,
      source: overlay.querySelector("#v-source").value.trim() || null,
    };

    await api("/vendors", { method: "POST", body });
    overlay.remove();
    showToast("Vendor added");
    reload();
  });
}
