import { api, navigate, phoneLink, emailLink, badge, formatDate, showToast } from "../app.js";
import { assigneeOptions, showScheduleModal, renderLinkedNotesSection } from "../shared.js";

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
          html += `<div class="list-item" data-vid="${v.vendor_id}" style="cursor:pointer">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div style="flex:1;min-width:0">
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
      html += `<input class="search-bar" type="search" placeholder="Search vendors..." id="v-search" style="margin-bottom:8px;background:var(--bg-card);border:1px solid rgba(255,255,255,0.28);border-radius:6px;padding:10px">`;
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
      item.addEventListener("click", () => {
        showVendorDetail(el, parseInt(item.dataset.vid));
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


  function contactBlockHTML(idx) {
    return `
      <div class="nav-contact-block" data-idx="${idx}" style="padding:10px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:8px;position:relative">
        ${idx > 0 ? '<button class="nav-remove-contact" style="position:absolute;top:6px;right:8px;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:16px">&times;</button>' : ''}
        <div class="form-group">
          <label class="form-label">Contact Name</label>
          <input class="form-input nc-name" placeholder="Contact name">
        </div>
        <div class="form-group">
          <label class="form-label">Title</label>
          <input class="form-input nc-title" placeholder="Title / Role">
        </div>
        <div style="display:flex;gap:8px">
          <div class="form-group" style="flex:1">
            <label class="form-label">Work Phone</label>
            <input class="form-input nc-phone" type="tel" placeholder="Work phone">
          </div>
          <div class="form-group" style="flex:1">
            <label class="form-label">Cell Phone</label>
            <input class="form-input nc-cell" type="tel" placeholder="Cell phone">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input nc-email" type="email" placeholder="Email">
        </div>
      </div>`;
  }

  function showAddVendorModal(parentEl) {
    let contactCount = 1;
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
        <div class="form-group">
          <label class="form-label">Address</label>
          <input class="form-input" id="nav-address" placeholder="Address">
        </div>
        <div class="form-group">
          <label class="form-label">Website</label>
          <input class="form-input" id="nav-website" type="url" placeholder="https://...">
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-weight:600">Contacts</div>
            <button class="btn btn-sm" id="nav-add-contact" style="padding:4px 10px;font-size:11px;background:rgba(37,99,235,0.15);color:#2563EB;border:1px solid #2563EB;border-radius:6px">+ Add Contact</button>
          </div>
          <div id="nav-contacts-list">
            ${contactBlockHTML(0)}
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
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
          <button class="btn btn-primary" id="nav-save">Save Vendor</button>
        </div>
      </div>
    `;
    parentEl.appendChild(overlay);

    overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    // Add contact block
    overlay.querySelector("#nav-add-contact").addEventListener("click", () => {
      const list = overlay.querySelector("#nav-contacts-list");
      list.insertAdjacentHTML("beforeend", contactBlockHTML(contactCount++));
      // Wire remove buttons
      list.querySelectorAll(".nav-remove-contact").forEach(btn => {
        btn.onclick = () => btn.closest(".nav-contact-block").remove();
      });
    });

    overlay.querySelector("#nav-save").addEventListener("click", async () => {
      const name = overlay.querySelector("#nav-name").value.trim();
      if (!name) { showToast("Vendor name is required"); return; }

      // Gather contacts
      const contactBlocks = overlay.querySelectorAll(".nav-contact-block");
      const contacts = [];
      contactBlocks.forEach((block, i) => {
        const cn = block.querySelector(".nc-name").value.trim();
        if (cn) {
          contacts.push({
            contact_name: cn,
            contact_title: block.querySelector(".nc-title").value.trim() || null,
            phone: block.querySelector(".nc-phone").value.trim() || null,
            cell_phone: block.querySelector(".nc-cell").value.trim() || null,
            email: block.querySelector(".nc-email").value.trim() || null,
            is_primary: i === 0,
          });
        }
      });

      const body = {
        vendor_name: name,
        address: overlay.querySelector("#nav-address").value.trim() || null,
        website: overlay.querySelector("#nav-website").value.trim() || null,
        pipeline_status: overlay.querySelector("#nav-pipeline").value || null,
        assigned_rm: overlay.querySelector("#nav-rm").value || null,
      };

      try {
        const vendor = await api("/vendors", { method: "POST", body });
        // Create contacts
        for (const c of contacts) {
          await api(`/vendors/${vendor.vendor_id}/contacts`, { method: "POST", body: c });
        }
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
          <div style="font-weight:600;margin-bottom:8px">Vendor Details</div>
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
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-weight:600">Contacts</div>
            <button class="btn btn-sm" id="vc-add-contact" style="padding:4px 10px;font-size:11px;background:rgba(37,99,235,0.15);color:#2563EB;border:1px solid #2563EB;border-radius:6px">+ Add Contact</button>
          </div>
          <div id="vc-contacts-list"><div class="empty" style="font-size:12px;color:var(--text-dim)">Loading contacts...</div></div>
        </div>

        <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)">
          <div style="font-weight:600;margin-bottom:8px">Schedule</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input class="form-input" id="vs-date" type="date" style="flex:0 0 140px;padding:6px 8px;font-size:12px">
            <input class="form-input" id="vs-time" type="time" style="flex:0 0 100px;padding:6px 8px;font-size:12px">
            <select class="form-select" id="vs-type" style="flex:0 0 110px;padding:6px 8px;font-size:12px">
              <option value="entity_visit">Visit</option>
              <option value="follow_up">Follow-up</option>
              <option value="presentation">Present</option>
              <option value="custom">Custom</option>
            </select>
            <select class="form-select" id="vs-assigned" style="flex:0 0 90px;padding:6px 8px;font-size:12px">
              <option value="">Assign</option>
              <option value="Steve">Steve</option>
              <option value="Drew">Drew</option>
              <option value="Both">Both</option>
            </select>
          </div>
          <input class="form-input" id="vs-title" style="margin-top:6px;padding:6px 8px;font-size:12px" placeholder="Title (e.g. Meet with Jeff re: Keller)" value="Vendor meeting — ${v.vendor_name}">
          <button class="btn btn-primary btn-block" id="vs-add" style="margin-top:8px">Add to Schedule</button>
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
          <div style="display:flex;gap:8px"><button class="btn btn-block" id="vp-delete" style="background:rgba(220,38,38,0.15);color:#DC2626;border:1px solid #DC2626;flex:1">Delete</button><button class="btn btn-primary btn-block" id="vp-save" style="flex:2">Save</button></div>
        </div>

        <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)">
          <div id="vendor-linked-notes"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // ── Load & render contacts ──
    async function loadContacts() {
      const contacts = await api(`/vendors/${vendorId}/contacts`);
      const listEl = overlay.querySelector("#vc-contacts-list");
      if (!contacts.length) {
        listEl.innerHTML = '<div class="empty" style="font-size:12px;color:var(--text-dim)">No contacts yet</div>';
      } else {
        listEl.innerHTML = contacts.map(c => `
          <div class="vc-contact-card" data-cid="${c.contact_id}" style="padding:10px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:8px;position:relative">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div style="flex:1">
                <div style="font-weight:600;font-size:13px">
                  ${c.is_primary ? '<span style="color:#EAB308;margin-right:4px" title="Primary contact">&#9733;</span>' : ''}
                  ${c.contact_name || '(unnamed)'}
                  ${c.contact_title ? '<span style="font-weight:400;color:var(--text-dim);font-size:12px"> — ' + c.contact_title + '</span>' : ''}
                </div>
                <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
                  ${c.phone ? '<span style="margin-right:12px">&#128222; ' + c.phone + '</span>' : ''}
                  ${c.cell_phone ? '<span style="margin-right:12px">&#128241; ' + c.cell_phone + '</span>' : ''}
                  ${c.email ? '<span>&#9993; ' + c.email + '</span>' : ''}
                </div>
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                ${!c.is_primary ? '<button class="vc-set-primary btn btn-sm" data-cid="' + c.contact_id + '" style="padding:2px 8px;font-size:10px;background:rgba(234,179,8,0.15);color:#EAB308;border:1px solid #EAB308;border-radius:4px" title="Set as primary">&#9733;</button>' : ''}
                <button class="vc-edit-contact btn btn-sm" data-cid="${c.contact_id}" style="padding:2px 8px;font-size:10px;border-radius:4px">Edit</button>
                <button class="vc-del-contact btn btn-sm" data-cid="${c.contact_id}" style="padding:2px 8px;font-size:10px;background:rgba(220,38,38,0.15);color:#DC2626;border:1px solid #DC2626;border-radius:4px">&times;</button>
              </div>
            </div>
          </div>
        `).join("");

        // Set primary
        listEl.querySelectorAll(".vc-set-primary").forEach(btn => {
          btn.addEventListener("click", async () => {
            await api(`/vendors/${vendorId}/contacts/${btn.dataset.cid}`, { method: "PUT", body: { is_primary: true } });
            showToast("Primary contact updated");
            loadContacts();
          });
        });

        // Delete
        listEl.querySelectorAll(".vc-del-contact").forEach(btn => {
          btn.addEventListener("click", async () => {
            if (!confirm("Remove this contact?")) return;
            await api(`/vendors/${vendorId}/contacts/${btn.dataset.cid}`, { method: "DELETE" });
            showToast("Contact removed");
            loadContacts();
          });
        });

        // Edit — show inline form
        listEl.querySelectorAll(".vc-edit-contact").forEach(btn => {
          btn.addEventListener("click", async () => {
            const cid = btn.dataset.cid;
            const c = contacts.find(x => x.contact_id == cid);
            const card = btn.closest(".vc-contact-card");
            card.innerHTML = `
              <div class="form-group"><label class="form-label">Name</label><input class="form-input ce-name" value="${c.contact_name || ''}"></div>
              <div class="form-group"><label class="form-label">Title</label><input class="form-input ce-title" value="${c.contact_title || ''}"></div>
              <div style="display:flex;gap:8px">
                <div class="form-group" style="flex:1"><label class="form-label">Work Phone</label><input class="form-input ce-phone" type="tel" value="${c.phone || ''}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Cell Phone</label><input class="form-input ce-cell" type="tel" value="${c.cell_phone || ''}"></div>
              </div>
              <div class="form-group"><label class="form-label">Email</label><input class="form-input ce-email" type="email" value="${c.email || ''}"></div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <button class="btn btn-primary btn-sm ce-save" style="flex:1">Save</button>
                <button class="btn btn-sm ce-cancel" style="flex:1">Cancel</button>
              </div>
            `;
            card.querySelector(".ce-save").addEventListener("click", async () => {
              await api(`/vendors/${vendorId}/contacts/${cid}`, { method: "PUT", body: {
                contact_name: card.querySelector(".ce-name").value.trim() || null,
                contact_title: card.querySelector(".ce-title").value.trim() || null,
                phone: card.querySelector(".ce-phone").value.trim() || null,
                cell_phone: card.querySelector(".ce-cell").value.trim() || null,
                email: card.querySelector(".ce-email").value.trim() || null,
              }});
              showToast("Contact updated");
              loadContacts();
            });
            card.querySelector(".ce-cancel").addEventListener("click", () => loadContacts());
          });
        });
      }
    }
    loadContacts();

    // Add new contact
    overlay.querySelector("#vc-add-contact").addEventListener("click", () => {
      const listEl = overlay.querySelector("#vc-contacts-list");
      // Check if add form already open
      if (listEl.querySelector(".vc-new-form")) return;
      const formDiv = document.createElement("div");
      formDiv.className = "vc-new-form";
      formDiv.style.cssText = "padding:10px;background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.3);border-radius:8px;margin-bottom:8px";
      formDiv.innerHTML = `
        <div class="form-group"><label class="form-label">Name *</label><input class="form-input cn-name" placeholder="Contact name"></div>
        <div class="form-group"><label class="form-label">Title</label><input class="form-input cn-title" placeholder="Title / Role"></div>
        <div style="display:flex;gap:8px">
          <div class="form-group" style="flex:1"><label class="form-label">Work Phone</label><input class="form-input cn-phone" type="tel" placeholder="Work phone"></div>
          <div class="form-group" style="flex:1"><label class="form-label">Cell Phone</label><input class="form-input cn-cell" type="tel" placeholder="Cell phone"></div>
        </div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input cn-email" type="email" placeholder="Email"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary btn-sm cn-save" style="flex:1">Add Contact</button>
          <button class="btn btn-sm cn-cancel" style="flex:1">Cancel</button>
        </div>
      `;
      listEl.prepend(formDiv);
      formDiv.querySelector(".cn-name").focus();
      formDiv.querySelector(".cn-save").addEventListener("click", async () => {
        const nm = formDiv.querySelector(".cn-name").value.trim();
        if (!nm) { showToast("Contact name required"); return; }
        await api(`/vendors/${vendorId}/contacts`, { method: "POST", body: {
          contact_name: nm,
          contact_title: formDiv.querySelector(".cn-title").value.trim() || null,
          phone: formDiv.querySelector(".cn-phone").value.trim() || null,
          cell_phone: formDiv.querySelector(".cn-cell").value.trim() || null,
          email: formDiv.querySelector(".cn-email").value.trim() || null,
          is_primary: false,
        }});
        showToast("Contact added");
        loadContacts();
      });
      formDiv.querySelector(".cn-cancel").addEventListener("click", () => formDiv.remove());
    });

    renderLinkedNotesSection(overlay.querySelector("#vendor-linked-notes"), "vendor", vendorId, v.vendor_name);

    overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#vs-add").addEventListener("click", async () => {
      const sDate = overlay.querySelector("#vs-date").value;
      const sTime = overlay.querySelector("#vs-time").value;
      const sTitle = overlay.querySelector("#vs-title").value.trim();
      const sType = overlay.querySelector("#vs-type").value;
      const sAssigned = overlay.querySelector("#vs-assigned").value;
      if (!sDate || !sTitle) { showToast("Date and title required"); return; }
      let url = `/calendar/schedule/custom?title=${encodeURIComponent(sTitle)}&item_date=${sDate}&item_type=${sType}&vendor_id=${vendorId}`;
      if (sTime) url += `&item_time=${encodeURIComponent(sTime)}`;
      if (sAssigned) url += `&assigned_to=${encodeURIComponent(sAssigned)}`;
      await api(url, { method: "POST" });
      showToast("Added to schedule");
    });

    overlay.querySelector("#vp-save").addEventListener("click", async () => {
      // Save vendor details (address, website) via PUT
      const detailBody = {
        address: overlay.querySelector("#vc-address").value.trim() || null,
        website: overlay.querySelector("#vc-website").value.trim() || null,
      };
      await api(`/vendors/${vendorId}`, { method: "PUT", body: detailBody });

      // Save pipeline info
      const body = {
        pipeline_status: overlay.querySelector("#vp-status").value || null,
        assigned_rm: overlay.querySelector("#vp-rm").value || null,
        next_action_date: overlay.querySelector("#vp-action-date").value || null,
        next_action_type: overlay.querySelector("#vp-action-type").value || null,
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
