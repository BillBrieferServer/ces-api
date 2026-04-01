import { api, navigate, phoneLink, emailLink, badge, formatDate, showToast } from "../app.js";

const PIPELINE_COLORS = {
  prospect: { bg: "rgba(100,116,139,0.2)", color: "#64748B" },
  contacted: { bg: "rgba(37,99,235,0.2)", color: "#2563EB" },
  pitched: { bg: "rgba(109,40,217,0.2)", color: "#6D28D9" },
  onboarding: { bg: "rgba(217,119,6,0.2)", color: "#D97706" },
  active: { bg: "rgba(5,150,105,0.2)", color: "#059669" },
};

const ACTION_TYPES = ["Visit", "Call", "Present", "Follow-up", "Send info"];

let currentTab = "pipeline";
let currentFilter = "";

export async function renderVendors(el) {
  function render(data) {
    let html = "";

    // Tab bar
    html += `<div style="display:flex;gap:0;margin-bottom:12px;border-bottom:2px solid rgba(255,255,255,0.1)">
      <button class="vtab" data-tab="pipeline" style="flex:1;padding:10px;font-size:14px;font-weight:600;border:none;cursor:pointer;
        background:${currentTab === 'pipeline' ? 'var(--accent)' : 'transparent'};
        color:${currentTab === 'pipeline' ? '#fff' : 'var(--text-dim)'};
        border-radius:8px 8px 0 0">Pipeline</button>
      <button class="vtab" data-tab="intelligence" style="flex:1;padding:10px;font-size:14px;font-weight:600;border:none;cursor:pointer;
        background:${currentTab === 'intelligence' ? 'var(--accent)' : 'transparent'};
        color:${currentTab === 'intelligence' ? '#fff' : 'var(--text-dim)'};
        border-radius:8px 8px 0 0">All Vendors</button>
    </div>`;

    // Add vendor button
    html += `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="btn btn-primary btn-sm" id="add-vendor-btn" style="padding:6px 14px;font-size:12px">+ Add Vendor</button>
    </div>`;

    if (currentTab === "pipeline") {
      // Pipeline filters
      html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        ${["", "prospect", "contacted", "pitched", "onboarding", "active"].map(s => {
          const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : "All";
          const isActive = currentFilter === s;
          const c = PIPELINE_COLORS[s] || { bg: "rgba(255,255,255,0.08)", color: "var(--text-dim)" };
          return `<button class="pf-btn" data-status="${s}" style="padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid ${isActive ? c.color : 'transparent'};background:${isActive ? c.bg : 'rgba(255,255,255,0.06)'};color:${isActive ? c.color : 'var(--text-dim)'}">${label}</button>`;
        }).join("")}
      </div>`;

      const pipeline = data.filter(v => {
        if (!v.pipeline_status) return false;
        if (currentFilter && v.pipeline_status !== currentFilter) return false;
        return true;
      });

      if (pipeline.length === 0) {
        html += `<div class="card"><div class="empty">No vendors in pipeline${currentFilter ? ` with status "${currentFilter}"` : ''}. Add vendors from the All Vendors tab.</div></div>`;
      } else {
        pipeline.forEach(v => {
          const pc = PIPELINE_COLORS[v.pipeline_status] || PIPELINE_COLORS.prospect;
          html += `<div class="list-item" style="position:relative">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div style="flex:1;min-width:0;cursor:pointer" data-vid="${v.vendor_id}">
                <div class="list-item-title">${v.vendor_name}</div>
                <div class="list-item-meta" style="margin-top:4px">
                  <span style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:12px;background:${pc.bg};color:${pc.color}">${v.pipeline_status}</span>
                  ${v.assigned_rm ? `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:rgba(234,179,8,0.2);color:#EAB308">${v.assigned_rm}</span>` : ''}
                  ${v.total_spend ? `<span style="font-size:12px;color:var(--text-dim)">$${Math.round(v.total_spend).toLocaleString()}</span>` : ''}
                </div>
                ${v.next_action_date ? `<div style="font-size:11px;color:var(--accent);margin-top:4px">${v.next_action_type || 'Action'}: ${formatDate(v.next_action_date)}</div>` : ''}
                ${v.jurisdictions ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px">${v.jurisdictions}</div>` : ''}
              </div>
            </div>
          </div>`;
        });
      }
    } else {
      // Intelligence view — all vendors search
      html += `<input class="search-bar" type="search" placeholder="Search vendors..." id="v-search" style="margin-bottom:8px">`;
      html += `<div id="v-intel-list">`;
      data.forEach(v => {
        html += `<div class="list-item" style="display:flex;justify-content:space-between;align-items:center">
          <div style="flex:1;min-width:0;cursor:pointer" data-vid="${v.vendor_id}">
            <div class="list-item-title">${v.vendor_name}</div>
            <div class="list-item-meta">
              ${v.total_spend ? `<span style="font-size:12px">$${Math.round(v.total_spend).toLocaleString()}</span>` : ''}
              ${v.jurisdictions ? `<span style="font-size:11px;color:var(--text-dim)">${v.jurisdictions}</span>` : ''}
            </div>
          </div>
          ${!v.pipeline_status ? `<button class="btn btn-sm add-pipeline-btn" data-vid="${v.vendor_id}" style="padding:4px 10px;font-size:11px;min-height:28px;background:rgba(5,150,105,0.15);color:#059669;border:1px solid #059669;border-radius:6px;flex-shrink:0;margin-left:8px">+ Pipeline</button>` : `<span style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:12px;background:${(PIPELINE_COLORS[v.pipeline_status]||PIPELINE_COLORS.prospect).bg};color:${(PIPELINE_COLORS[v.pipeline_status]||PIPELINE_COLORS.prospect).color}">${v.pipeline_status}</span>`}
          <button class="btn btn-sm sched-vendor-btn" data-sv-id="${v.vendor_id}" data-sv-name="${(v.vendor_name || '').replace(/"/g, '&quot;')}" style="padding:4px 10px;font-size:0.9rem;min-height:32px;background:rgba(5,150,105,0.12);color:#059669;border:1px solid rgba(5,150,105,0.3);border-radius:6px;flex-shrink:0;margin-left:4px">&#128197;</button>
        </div>`;
      });
      html += `</div>`;
    }

    el.innerHTML = html;

    // Tab handlers
    const addBtn = el.querySelector("#add-vendor-btn");
    if (addBtn) addBtn.addEventListener("click", () => showAddVendorModal(el));

    el.querySelectorAll(".vtab").forEach(btn => {
      btn.addEventListener("click", async () => {
        currentTab = btn.dataset.tab;
        const d = await loadData();
        render(d);
      });
    });

    // Pipeline filter handlers
    el.querySelectorAll(".pf-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        currentFilter = btn.dataset.status;
        const d = await loadData();
        render(d);
      });
    });

    // Add to pipeline buttons
    el.querySelectorAll(".add-pipeline-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await api(`/vendors/${btn.dataset.vid}/pipeline`, { method: "PATCH", body: { pipeline_status: "prospect" } });
        showToast("Added to pipeline");
        const d = await loadData();
        render(d);
      });
    });

    // Vendor detail click
    el.querySelectorAll("[data-vid]").forEach(item => {
      if (item.classList.contains("add-pipeline-btn")) return;
      if (item.classList.contains("sched-vendor-btn")) return;
      item.addEventListener("click", () => {
        showVendorDetail(el, parseInt(item.dataset.vid));
      });
    });

    // Schedule icon buttons on vendor rows
    el.querySelectorAll(".sched-vendor-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showScheduleVendorModal(parseInt(btn.dataset.svId), btn.dataset.svName);
      });
    });

    // Search in intelligence view
    const searchEl = el.querySelector("#v-search");
    if (searchEl) {
      let debounce;
      searchEl.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(async () => {
          const d = await loadData(searchEl.value.trim());
          // Re-render just the list portion
          render(d);
          // Restore search value
          const newSearch = el.querySelector("#v-search");
          if (newSearch) { newSearch.value = searchEl.value; newSearch.focus(); }
        }, 300);
      });
    }
  }

  async function loadData(searchName) {
    const params = new URLSearchParams();
    if (currentTab === "pipeline") {
      params.set("pipeline", "active");
    }
    if (searchName) params.set("name", searchName);
    return await api(`/vendors?${params}`);
  }


  function showAddVendorModal(parentEl) {
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
          <input class="form-input" id="nav-name" placeholder="Company name">
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)">
          <div style="font-weight:600;margin-bottom:8px">Contact Info</div>
          <div class="form-group">
            <label class="form-label">Contact Name</label>
            <input class="form-input" id="nav-contact" placeholder="Contact name">
          </div>
          <div class="form-group">
            <label class="form-label">Title</label>
            <input class="form-input" id="nav-title" placeholder="Title / Role">
          </div>
          <div style="display:flex;gap:8px">
            <div class="form-group" style="flex:1">
              <label class="form-label">Work Phone</label>
              <input class="form-input" id="nav-phone" type="tel" placeholder="Work phone">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Cell Phone</label>
              <input class="form-input" id="nav-cell" type="tel" placeholder="Cell phone">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-input" id="nav-email" type="email" placeholder="Email">
          </div>
          <div class="form-group">
            <label class="form-label">Address</label>
            <input class="form-input" id="nav-address" placeholder="Address">
          </div>
          <div class="form-group">
            <label class="form-label">Website</label>
            <input class="form-input" id="nav-website" type="url" placeholder="https://...">
          </div>
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)">
          <div style="font-weight:600;margin-bottom:8px">Pipeline</div>
          <div style="display:flex;gap:8px">
            <div class="form-group" style="flex:1">
              <label class="form-label">Status</label>
              <select class="form-select" id="nav-pipeline">
                <option value="">None (Intelligence only)</option>
                <option value="prospect">Prospect</option>
                <option value="contacted">Contacted</option>
                <option value="pitched">Pitched</option>
                <option value="onboarding">Onboarding</option>
                <option value="active">Active</option>
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Assigned RM</label>
              <select class="form-select" id="nav-rm">
                <option value="">—</option>
                <option value="Steve">Steve</option>
                <option value="Drew">Drew</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea class="form-input" id="nav-notes" rows="2" placeholder="Notes..."></textarea>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
          <button class="btn btn-primary" id="nav-save">Save Vendor</button>
        </div>
      </div>
    `;
    parentEl.appendChild(overlay);

    overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#nav-save").addEventListener("click", async () => {
      const name = overlay.querySelector("#nav-name").value.trim();
      if (!name) { showToast("Vendor name is required"); return; }

      const body = {
        vendor_name: name,
        contact_name: overlay.querySelector("#nav-contact").value.trim() || null,
        contact_title: overlay.querySelector("#nav-title").value.trim() || null,
        phone: overlay.querySelector("#nav-phone").value.trim() || null,
        cell_phone: overlay.querySelector("#nav-cell").value.trim() || null,
        email: overlay.querySelector("#nav-email").value.trim() || null,
        address: overlay.querySelector("#nav-address").value.trim() || null,
        website: overlay.querySelector("#nav-website").value.trim() || null,
        pipeline_status: overlay.querySelector("#nav-pipeline").value || null,
        assigned_rm: overlay.querySelector("#nav-rm").value || null,
        notes: overlay.querySelector("#nav-notes").value.trim() || null,
      };

      try {
        await api("/vendors", { method: "POST", body });
        overlay.remove();
        showToast("Vendor added");
        renderVendors(el);
      } catch (err) {
        showToast("Error: " + err.message);
      }
    });
  }

  async function showVendorDetail(parentEl, vendorId) {
    const v = await api(`/vendors/${vendorId}`);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>${v.vendor_name}</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="card-row"><label>Total Spend</label><span>$${Math.round(v.total_spend || 0).toLocaleString()}</span></div>
        ${v.jurisdictions ? `<div class="card-row"><label>Entities</label><span style="text-align:right;max-width:60%">${v.jurisdictions}</span></div>` : ''}

        <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)">
          <div style="font-weight:600;margin-bottom:8px">Contact Info</div>
          <div class="form-group">
            <label class="form-label">Contact Name</label>
            <input class="form-input" id="vc-name" value="${v.contact_name || ''}" placeholder="Contact name">
          </div>
          <div class="form-group">
            <label class="form-label">Title</label>
            <input class="form-input" id="vc-title" value="${v.contact_title || ''}" placeholder="Title / Role">
          </div>
          <div style="display:flex;gap:8px">
            <div class="form-group" style="flex:1">
              <label class="form-label">Work Phone</label>
              <input class="form-input" id="vc-phone" type="tel" value="${v.phone || ''}" placeholder="Work phone">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Cell Phone</label>
              <input class="form-input" id="vc-cell" type="tel" value="${v.cell_phone || ''}" placeholder="Cell phone">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-input" id="vc-email" type="email" value="${v.email || ''}" placeholder="Email">
          </div>
          <div class="form-group">
            <label class="form-label">Address</label>
            <input class="form-input" id="vc-address" value="${(v.address || '').replace(/"/g, '&quot;')}" placeholder="Address">
          </div>
          <div class="form-group">
            <label class="form-label">Website</label>
            <input class="form-input" id="vc-website" type="url" value="${v.website || ''}" placeholder="https://...">
          </div>
        </div>

        <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)">
          <div style="font-weight:600;margin-bottom:8px">Schedule</div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="vs-type">
              <option value="entity_visit">Visit</option>
              <option value="follow_up">Follow-up</option>
              <option value="presentation">Presentation</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Date</label>
            <input class="form-input" id="vs-date" type="date">
          </div>
          <div class="form-group">
            <label class="form-label">Time (optional)</label>
            <input class="form-input" id="vs-time" type="time">
          </div>
          <div class="form-group">
            <label class="form-label">Title</label>
            <input class="form-input" id="vs-title" value="Vendor meeting \u2014 ${v.vendor_name}" placeholder="Title (e.g. Meet with Jeff re: Keller)">
          </div>
          <div class="form-group">
            <label class="form-label">Location (optional)</label>
            <input class="form-input" id="vs-location" placeholder="Address...">
          </div>
          <div class="form-group">
            <label class="form-label">Assigned to</label>
            <select class="form-select" id="vs-assigned">
              <option value="">\u2014</option>
              <option value="Steve">Steve</option>
              <option value="Drew">Drew</option>
              <option value="Both">Both</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Notes (optional)</label>
            <textarea class="form-textarea" id="vs-notes" rows="2"></textarea>
          </div>
          <button class="btn btn-primary btn-block" id="vs-add">Add to Schedule</button>
        </div>

        <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)">
          <div style="font-weight:600;margin-bottom:8px">Pipeline</div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="vp-status">
              <option value="">Not in pipeline</option>
              ${["prospect","contacted","pitched","onboarding","active"].map(s =>
                `<option value="${s}" ${v.pipeline_status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Assigned RM</label>
            <select class="form-select" id="vp-rm">
              <option value="">—</option>
              <option value="Steve" ${v.assigned_rm === 'Steve' ? 'selected' : ''}>Steve</option>
              <option value="Drew" ${v.assigned_rm === 'Drew' ? 'selected' : ''}>Drew</option>
              <option value="Both" ${v.assigned_rm === 'Both' ? 'selected' : ''}>Both</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Next Action</label>
            <div style="display:flex;gap:8px">
              <input class="form-input" id="vp-action-date" type="date" value="${v.next_action_date || ''}" style="flex:1">
              <select class="form-select" id="vp-action-type" style="flex:1">
                <option value="">Type...</option>
                ${ACTION_TYPES.map(t => `<option value="${t}" ${v.next_action_type === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea class="form-textarea" id="vp-notes" rows="3">${v.notes || ''}</textarea>
          </div>
          <div style="display:flex;gap:8px"><button class="btn btn-block" id="vp-delete" style="background:rgba(220,38,38,0.15);color:#DC2626;border:1px solid #DC2626;flex:1">Delete</button><button class="btn btn-primary btn-block" id="vp-save" style="flex:2">Save</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#vs-add").addEventListener("click", async () => {
      const sDate = overlay.querySelector("#vs-date").value;
      const sTime = overlay.querySelector("#vs-time").value;
      const sTitle = overlay.querySelector("#vs-title").value.trim();
      const sType = overlay.querySelector("#vs-type").value;
      const sAssigned = overlay.querySelector("#vs-assigned").value;
      const sLocation = overlay.querySelector("#vs-location").value.trim();
      const sNotes = overlay.querySelector("#vs-notes").value.trim();
      if (!sDate || !sTitle) { showToast("Date and title required"); return; }
      let url = `/calendar/schedule/custom?title=${encodeURIComponent(sTitle)}&item_date=${sDate}&item_type=${sType}&vendor_id=${vendorId}`;
      if (sTime) url += `&item_time=${encodeURIComponent(sTime)}`;
      if (sAssigned) url += `&assigned_to=${encodeURIComponent(sAssigned)}`;
      if (sLocation) url += `&location=${encodeURIComponent(sLocation)}`;
      if (sNotes) url += `&notes=${encodeURIComponent(sNotes)}`;
      try {
        await api(url, { method: "POST" });
        showToast("Scheduled!");
      } catch (err) {
        showToast("Error: " + err.message);
      }
    });

    overlay.querySelector("#vp-save").addEventListener("click", async () => {
      // Save contact info via PUT
      const contactBody = {
        contact_name: overlay.querySelector("#vc-name").value.trim() || null,
        contact_title: overlay.querySelector("#vc-title").value.trim() || null,
        phone: overlay.querySelector("#vc-phone").value.trim() || null,
        cell_phone: overlay.querySelector("#vc-cell").value.trim() || null,
        email: overlay.querySelector("#vc-email").value.trim() || null,
        address: overlay.querySelector("#vc-address").value.trim() || null,
        website: overlay.querySelector("#vc-website").value.trim() || null,
      };
      await api(`/vendors/${vendorId}`, { method: "PUT", body: contactBody });

      // Save pipeline info
      const body = {
        pipeline_status: overlay.querySelector("#vp-status").value || null,
        assigned_rm: overlay.querySelector("#vp-rm").value || null,
        next_action_date: overlay.querySelector("#vp-action-date").value || null,
        next_action_type: overlay.querySelector("#vp-action-type").value || null,
        notes: overlay.querySelector("#vp-notes").value.trim() || null,
      };
      await api(`/vendors/${vendorId}/pipeline`, { method: "PATCH", body });
      overlay.remove();
      showToast("Vendor updated");
      const d = await loadData();
      render(d);
    });

    overlay.querySelector("#vp-delete").addEventListener("click", async () => {
      if (!confirm('Delete ' + v.vendor_name + '? This cannot be undone.')) return;
      try {
        await api('/vendors/' + vendorId, { method: 'DELETE' });
        overlay.remove();
        showToast('Vendor deleted');
        const d = await loadData();
        render(d);
      } catch (err) {
        showToast('Error: ' + err.message);
      }
    });
  }

  const data = await loadData();
  render(data);
}


function showScheduleVendorModal(vendorId, vendorName) {
  const today = new Date().toISOString().slice(0, 10);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Schedule with ${vendorName}</h2>
        <button class="modal-close">&times;</button>
      </div>
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
        <input class="form-input" id="sa-title" value="Vendor meeting \u2014 ${vendorName}">
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
    let url = `/calendar/schedule/custom?title=${encodeURIComponent(title)}&item_date=${itemDate}&item_type=${overlay.querySelector("#sa-type").value}&vendor_id=${vendorId}`;
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
