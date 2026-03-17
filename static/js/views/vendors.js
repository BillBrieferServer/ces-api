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
        </div>`;
      });
      html += `</div>`;
    }

    el.innerHTML = html;

    // Tab handlers
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
        ${v.phone ? `<div class="card-row"><label>Phone</label><span>${v.phone}</span></div>` : ''}
        ${v.email ? `<div class="card-row"><label>Email</label><span>${v.email}</span></div>` : ''}
        ${v.website ? `<div class="card-row"><label>Website</label><a href="${v.website}" target="_blank" class="contact-link">${v.website}</a></div>` : ''}

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

    overlay.querySelector("#vp-save").addEventListener("click", async () => {
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
