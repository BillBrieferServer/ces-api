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
      <button class="btn btn-primary btn-sm" id="add-vendor-btn">+ Add Vendor</button>
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

    listEl.innerHTML = data.map(v => `
      <div class="card" style="padding:14px 16px">
        <div style="font-weight:600;font-size:0.95rem;margin-bottom:2px">${v.vendor_name}</div>
        ${v.contact_name ? `<div style="color:var(--text-dim);font-size:0.8rem">${v.contact_name}</div>` : ""}
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">
          ${v.phone ? phoneLink(v.phone) : ""}
          ${v.email ? emailLink(v.email) : ""}
        </div>
        <div style="margin-top:6px">${badge(v.bluebook_status)}</div>
      </div>
    `).join("");
  }

  let debounce;
  el.querySelector("#v-search").addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(load, 300);
  });
  el.querySelector("#v-status").addEventListener("change", load);

  el.querySelector("#add-vendor-btn").addEventListener("click", () => showAddVendorModal(el, load));

  load();
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
