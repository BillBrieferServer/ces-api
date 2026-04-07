import { api, phoneLink, emailLink, badge, formatDate, showToast } from "../app.js";
import { lastFirst, getLastName, PRIORITY_COLORS, ACTION_TYPES, assigneeOptions, showScheduleModal, renderLinkedNotesSection } from "../shared.js";

export async function renderJurisdictionDetail(el, id) {
  try {
    const j = await api(`/jurisdictions/${id}`);
    const p = j.profile || {};
    const o = j.outreach || {};

    let html = `
      <div style="margin-bottom:4px">
        ${badge(j.type)}
        <span style="color:var(--text-dim);font-size:0.85rem;margin-left:4px">${j.county_name || ""} County</span>
        ${j.grades ? `<span style="color:var(--accent);font-size:0.85rem;margin-left:8px">Grades ${j.grades}</span>` : ""}
      </div>
      <h2 style="font-size:1.3rem;margin-bottom:16px">${j.name}</h2>
    `;

    // Profile card
    html += `<div class="card"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center">Profile<button class="btn btn-sm" id="edit-profile-btn" style="padding:4px 10px;font-size:0.9rem;min-height:28px;background:rgba(255,255,255,0.08);color:var(--text-dim);border:1px solid rgba(255,255,255,0.12);border-radius:6px">Edit</button></div>`;
    if (p.population) html += `<div class="card-row"><label>Population</label><span>${p.population.toLocaleString()}</span></div>`;
    if (p.employee_count) html += `<div class="card-row"><label>Employees</label><span>${p.employee_count}</span></div>`;
    if (p.aic_district) html += `<div class="card-row"><label>AIC District</label><span>${p.aic_district}</span></div>`;
    if (p.council_meeting_schedule) html += `<div class="card-row"><label>Council Meetings</label><span style="text-align:right;max-width:60%">${p.council_meeting_schedule}</span></div>`;
    if (p.office_phone) html += `<div class="card-row"><label>Phone</label>${phoneLink(p.office_phone)}</div>`;
    if (p.office_fax) html += `<div class="card-row"><label>Fax</label><span>${p.office_fax}</span></div>`;
    if (p.office_hours) html += `<div class="card-row"><label>Hours</label><span style="text-align:right;max-width:60%">${p.office_hours}</span></div>`;
    if (p.physical_address) html += `<div class="card-row"><label>Courthouse</label><span style="text-align:right;max-width:60%">${p.physical_address}</span></div>`;
    if (p.mailing_address) html += `<div class="card-row"><label>Mailing Address</label><span style="text-align:right;max-width:60%">${p.mailing_address}</span></div>`;
    if (j.website_url) html += `<div class="card-row"><label>Website</label><a class="contact-link" href="${j.website_url}" target="_blank" style="text-align:right;max-width:60%;word-break:break-all">${j.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></div>`;
    html += `</div>`;

    // Outreach card
    html += `<div class="card" id="outreach-card"><div class="card-title">Outreach Status</div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="o-status">
          ${["not_contacted","emailed","contacted","pitched","presentation_scheduled","presentation_given","board_approved","active_member","declined","inactive"]
            .map(s => `<option value="${s}" ${o.status === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Assigned RM</label>
        <select class="form-input" id="o-rm" style="padding:8px;font-size:13px">${assigneeOptions(o.assigned_rm, true)}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <div id="priority-pills" style="display:flex;gap:8px;margin-top:4px">
          ${["hot","warm","cold"].map(p => {
            const c = PRIORITY_COLORS[p];
            const active = o.priority === p;
            return `<button class="priority-pill" data-priority="${p}" style="
              padding:6px 16px;border-radius:20px;font-size:0.85rem;font-weight:600;
              cursor:pointer;transition:all 0.15s;border:2px solid ${active ? c.border : "transparent"};
              background:${active ? c.bg : "rgba(255,255,255,0.06)"};
              color:${active ? c.text : "var(--text-dim)"};
            ">${p.charAt(0).toUpperCase() + p.slice(1)}</button>`;
          }).join("")}
        </div>
        <input type="hidden" id="o-priority" value="${o.priority || ""}">
      </div>
      <div class="form-group">
        <label class="form-label">Next Action</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="form-input" id="o-action-date" type="date" value="${o.next_action_date || ""}" style="flex:1">
          <select class="form-select" id="o-action-type" style="flex:1">
            <option value="">Type...</option>
            ${Object.entries(ACTION_TYPES).map(([k,v]) => `<option value="${k}" ${o.next_action_type === k ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </div>
        ${o.next_action_date ? `<div style="font-size:0.8rem;color:var(--accent);margin-top:4px">
          Scheduled: ${ACTION_TYPES[o.next_action_type] || o.next_action_type || "Action"} ${formatDate(o.next_action_date)}
        </div>` : ""}
      </div>
      <button class="btn btn-primary btn-block" id="save-outreach">Save Outreach</button>
    </div>`;

    // Linked Notes placeholder (populated after render)
    html += `<div id="linked-notes-container"></div>`;

    // Officials
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 10px">
      <span class="section-header" style="margin:0">Officials (${j.officials.length})</span>
      <button class="btn btn-primary btn-sm" id="add-official-btn">+ Add Contact</button>
    </div>`;
    if (j.officials.length > 1) {
      html += `<div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn btn-sm sort-btn" id="sort-name" style="padding:4px 12px;font-size:0.8rem;min-height:28px;background:rgba(255,255,255,0.08);color:var(--text-dim);border:1px solid rgba(255,255,255,0.12);border-radius:6px">Sort by Name</button>
        <button class="btn btn-sm sort-btn" id="sort-title" style="padding:4px 12px;font-size:0.8rem;min-height:28px;background:var(--accent);color:#fff;border:1px solid var(--accent);border-radius:6px">Sort by Position</button>
      </div>`;
    }
    html += `<div id="officials-list"></div>`;

    // Store officials data for sorting
    const officialsData = j.officials;
    let currentSort = "title";

    function renderOfficials(sortBy) {
      currentSort = sortBy;
      const sorted = [...officialsData].sort((a, b) => {
        if (sortBy === "name") return getLastName(a.name).localeCompare(getLastName(b.name));
        return (a.title || "").localeCompare(b.title || "") || getLastName(a.name).localeCompare(getLastName(b.name));
      });
      let listHtml = "";
      if (sorted.length === 0) {
        listHtml = `<div class="card"><div class="empty">No officials on file</div></div>`;
      } else {
        sorted.forEach(off => {
          listHtml += `<div class="card" style="padding:12px 16px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="font-weight:600;font-size:0.95rem">${lastFirst(off.name)}</div>
              <button class="btn btn-sm" data-edit-official="${off.official_id}" data-off-name="${(off.name||'').replace(/"/g,'&quot;')}" data-off-title="${(off.title||'').replace(/"/g,'&quot;')}" data-off-phone="${off.phone||''}" data-off-email="${off.email||''}" style="padding:4px 10px;font-size:0.9rem;min-height:32px;background:rgba(255,255,255,0.08);color:var(--text-dim);border:1px solid rgba(255,255,255,0.12);border-radius:6px">Edit</button>
              <button class="btn btn-sm" data-sched-official="${off.official_id}" data-sched-off-name="${(off.name||'').replace(/"/g,'&quot;')}" style="padding:4px 10px;font-size:0.9rem;min-height:32px;background:rgba(5,150,105,0.12);color:#059669;border:1px solid rgba(5,150,105,0.3);border-radius:6px">&#128197;</button>
            </div>
            <div style="color:var(--text-dim);font-size:0.8rem;margin-bottom:6px">${off.title || ""}</div>
            <div style="display:flex;gap:16px;flex-wrap:wrap">
              ${off.phone ? phoneLink(off.phone) : ""}
              ${off.email ? emailLink(off.email) : ""}
            </div>
          </div>`;
        });
      }
      return listHtml;
    }

    // Key Staff section
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 10px">
      <span class="section-header" style="margin:0">Key Staff (${j.staff.length})</span>
      <button class="btn btn-primary btn-sm" id="add-staff-btn">+ Add Staff</button>
    </div>`;
    if (j.staff.length === 0) {
      html += `<div class="card"><div class="empty">No key staff on file</div></div>`;
    } else {
      [...j.staff].sort((a, b) => (a.title || "").localeCompare(b.title || "") || getLastName(a.name).localeCompare(getLastName(b.name))).forEach(s => {
        html += `<div class="card" style="padding:12px 16px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-weight:600;font-size:0.95rem">${lastFirst(s.name)}</div>
            <button class="btn btn-sm" data-edit-staff="${s.official_id}" data-staff-name="${(s.name||'').replace(/"/g,'&quot;')}" data-staff-title="${(s.title||'').replace(/"/g,'&quot;')}" data-staff-phone="${s.phone||''}" data-staff-email="${s.email||''}" style="padding:4px 10px;font-size:0.9rem;min-height:32px;background:rgba(255,255,255,0.08);color:var(--text-dim);border:1px solid rgba(255,255,255,0.12);border-radius:6px">Edit</button>
          </div>
          <div style="color:var(--text-dim);font-size:0.8rem;margin-bottom:6px">${s.title || ""}</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${s.phone ? phoneLink(s.phone) : ""}
            ${s.email ? emailLink(s.email) : ""}
          </div>
        </div>`;
      });
    }

    // History (auto-logged from outreach changes)
    if (j.history && j.history.length > 0) {
      html += `<div style="margin:20px 0 10px">
        <span class="section-header" style="margin:0">History</span>
      </div>`;
      j.history.forEach(h => {
        html += `<div class="card" style="padding:10px 14px;margin-bottom:4px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:0.85rem;color:var(--text)">${h.summary || ""}</div>
            <span style="font-size:0.75rem;color:var(--text-dim);white-space:nowrap;margin-left:12px">${formatDate(h.interaction_date)}</span>
          </div>
        </div>`;
      });
    }

    // Vendors
    html += `<div class="section-header">Vendors (${j.vendors.length})</div>`;
    if (j.vendors.length === 0) {
      html += `<div class="card"><div class="empty">No vendors linked</div></div>`;
    } else {
      j.vendors.forEach(v => {
        html += `<div class="card" style="padding:12px 16px">
          <div style="font-weight:600">${v.vendor_name}</div>
          <div class="list-item-meta">
            ${badge(v.relationship_type)}
            ${v.annual_spend ? `<span style="font-size:0.8rem">$${v.annual_spend.toLocaleString()}</span>` : ""}
          </div>
        </div>`;
      });
    }

    el.innerHTML = html;

    // Populate linked notes (lazy)
    renderLinkedNotesSection(document.getElementById('linked-notes-container'), 'entity', id, j.name);


    // Render officials list
    const officialsList = el.querySelector("#officials-list");
    if (officialsList) {
      officialsList.innerHTML = renderOfficials("title");
    }

    // Priority pill handlers
    el.querySelectorAll(".priority-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        const val = pill.dataset.priority;
        const input = el.querySelector("#o-priority");
        const current = input.value;
        // Toggle: if already selected, deselect
        const newVal = current === val ? "" : val;
        input.value = newVal;
        // Update all pill styles
        el.querySelectorAll(".priority-pill").forEach(p => {
          const pv = p.dataset.priority;
          const c = PRIORITY_COLORS[pv];
          const active = pv === newVal;
          p.style.background = active ? c.bg : "rgba(255,255,255,0.06)";
          p.style.color = active ? c.text : "var(--text-dim)";
          p.style.borderColor = active ? c.border : "transparent";
        });
      });
    });

    // Sort button handlers
    const sortNameBtn = el.querySelector("#sort-name");
    const sortTitleBtn = el.querySelector("#sort-title");
    function updateSortButtons(active) {
      if (sortNameBtn && sortTitleBtn) {
        [sortNameBtn, sortTitleBtn].forEach(b => {
          b.style.background = "rgba(255,255,255,0.08)";
          b.style.color = "var(--text-dim)";
          b.style.borderColor = "rgba(255,255,255,0.12)";
        });
        const activeBtn = active === "name" ? sortNameBtn : sortTitleBtn;
        activeBtn.style.background = "var(--accent)";
        activeBtn.style.color = "#fff";
        activeBtn.style.borderColor = "var(--accent)";
      }
    }
    if (sortNameBtn) {
      sortNameBtn.addEventListener("click", () => {
        officialsList.innerHTML = renderOfficials("name");
        updateSortButtons("name");
        wireEditButtons();
      });
    }
    if (sortTitleBtn) {
      sortTitleBtn.addEventListener("click", () => {
        officialsList.innerHTML = renderOfficials("title");
        updateSortButtons("title");
        wireEditButtons();
      });
    }

    function wireEditButtons() {
      // Schedule buttons on official cards
      el.querySelectorAll("[data-sched-official]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          showScheduleModal({
            title: "Schedule with " + btn.dataset.schedOffName,
            entityId: id,
            officialId: parseInt(btn.dataset.schedOfficial),
            defaultTitle: j.name + " \u2014 " + btn.dataset.schedOffName,
            onSaved: () => renderJurisdictionDetail(el, id),
          });
        });
      });
      el.querySelectorAll("[data-edit-official]").forEach(btn => {
        btn.addEventListener("click", () => {
          showOfficialModal(el, id, {
            official_id: parseInt(btn.dataset.editOfficial),
            name: btn.dataset.offName,
            title: btn.dataset.offTitle,
            phone: btn.dataset.offPhone,
            email: btn.dataset.offEmail,
          });
        });
      });
    }

    // Save outreach handler
    el.querySelector("#save-outreach").addEventListener("click", async () => {
      const body = {};
      const status = el.querySelector("#o-status").value;
      const rm = el.querySelector("#o-rm").value.trim();
      const priority = el.querySelector("#o-priority").value;
      const actionDate = el.querySelector("#o-action-date").value;
      const actionType = el.querySelector("#o-action-type").value;

      body.status = status;
      body.assigned_rm = rm || null;
      body.priority = priority || null;
      body.next_action_date = actionDate || null;
      body.next_action_type = actionType || null;

      await api(`/outreach/${id}`, { method: "PUT", body });
      showToast("Outreach saved");
      renderJurisdictionDetail(el, id);
    });




    // Wire edit official buttons (initial render)
    wireEditButtons();

    // Add official button
    el.querySelector("#add-official-btn").addEventListener("click", () => {
      showOfficialModal(el, id, null);
    });

    // Edit profile button
    el.querySelector("#edit-profile-btn").addEventListener("click", () => {
      showProfileModal(el, id, j, p);
    });

    // Add staff button
    el.querySelector("#add-staff-btn").addEventListener("click", () => {
      showOfficialModal(el, id, null, "staff");
    });

    // Edit staff buttons
    el.querySelectorAll("[data-edit-staff]").forEach(btn => {
      btn.addEventListener("click", () => {
        showOfficialModal(el, id, {
          official_id: parseInt(btn.dataset.editStaff),
          name: btn.dataset.staffName,
          title: btn.dataset.staffTitle,
          phone: btn.dataset.staffPhone,
          email: btn.dataset.staffEmail,
        }, "staff");
      });
    });

  } catch (err) {
    el.innerHTML = `<div class="empty">Failed to load: ${err.message}</div>`;
  }
}

function showOfficialModal(parentEl, jurisdictionId, existing, roleType) {
  const isEdit = !!existing;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${isEdit ? "Edit " + (roleType === "staff" ? "Staff" : "Contact") : "Add " + (roleType === "staff" ? "Staff" : "Contact")}</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="off-name" value="${isEdit ? (existing.name || "") : ""}" placeholder="Full name">
      </div>
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" id="off-title" value="${isEdit ? (existing.title || "") : ""}" placeholder="Mayor, Clerk, Commissioner...">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-input" id="off-phone" type="tel" value="${isEdit ? (existing.phone || "") : ""}" placeholder="(208) 555-1234">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="off-email" type="email" value="${isEdit ? (existing.email || "") : ""}" placeholder="name@example.com">
      </div>
      <div style="display:flex;gap:8px">
      ${isEdit ? '<button class="btn btn-block" id="off-delete" style="background:rgba(220,38,38,0.15);color:#DC2626;border:1px solid #DC2626;flex:1">Delete</button>' : ''}
      <button class="btn btn-primary btn-block" id="off-submit" style="flex:${isEdit ? 2 : 1}">${isEdit ? "Save Changes" : "Add Contact"}</button>
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
    if (!isEdit && !title) { showToast("Title is required"); return; }

    try {
      if (isEdit) {
        const body = {};
        if (name !== existing.name) body.name = name;
        if (title !== existing.title) body.title = title;
        if (phone !== (existing.phone || "")) body.phone = phone || null;
        if (email !== (existing.email || "")) body.email = email || null;
        if (Object.keys(body).length === 0) { overlay.remove(); return; }
        await api(`/officials/${existing.official_id}`, { method: "PUT", body });
        showToast("Contact updated");
      } else {
        const body = { jurisdiction_id: parseInt(jurisdictionId), name, title, role_type: roleType || "elected" };
        if (phone) body.phone = phone;
        if (email) body.email = email;
        await api("/officials", { method: "POST", body });
        showToast("Contact added");
      }
      overlay.remove();
      renderJurisdictionDetail(parentEl, jurisdictionId);
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });

  // Delete handler
  const deleteBtn = overlay.querySelector("#off-delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Delete ${existing.name}? This cannot be undone.`)) return;
      try {
        await api(`/officials/${existing.official_id}`, { method: "DELETE" });
        overlay.remove();
        showToast("Contact deleted");
        renderJurisdictionDetail(parentEl, jurisdictionId);
      } catch (err) {
        showToast("Error: " + err.message);
      }
    });
  }
}


function showProfileModal(parentEl, jurisdictionId, j, p) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Edit Profile</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">Entity Name</label>
        <input class="form-input" id="p-entity-name" value="${(j.name || "").replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label class="form-label">Population</label>
        <input class="form-input" id="p-population" type="number" value="${p.population || ""}">
      </div>
      <div class="form-group">
        <label class="form-label">Employees</label>
        <input class="form-input" id="p-employees" type="number" value="${p.employee_count || ""}">
      </div>
      <div class="form-group">
        <label class="form-label">AIC District</label>
        <input class="form-input" id="p-district" type="number" min="1" max="6" value="${p.aic_district || ""}">
      </div>
      <div class="form-group">
        <label class="form-label">Council Meeting Schedule</label>
        <input class="form-input" id="p-meetings" value="${p.council_meeting_schedule || ""}">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-input" id="p-phone" type="tel" value="${p.office_phone || ""}">
      </div>
      <div class="form-group">
        <label class="form-label">Fax</label>
        <input class="form-input" id="p-fax" type="tel" value="${p.office_fax || ""}">
      </div>
      <div class="form-group">
        <label class="form-label">Hours</label>
        <input class="form-input" id="p-hours" value="${p.office_hours || ""}">
      </div>
      <div class="form-group">
        <label class="form-label">Courthouse / Physical Address</label>
        <input class="form-input" id="p-physical" value="${(p.physical_address || "").replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label class="form-label">Mailing Address</label>
        <input class="form-input" id="p-mailing" value="${(p.mailing_address || "").replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label class="form-label">Website URL</label>
        <input class="form-input" id="p-website" type="url" value="${j.website_url || ""}" placeholder="https://...">
      </div>
      <button class="btn btn-primary btn-block" id="p-submit">Save Profile</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#p-submit").addEventListener("click", async () => {
    const body = {
      entity_name: overlay.querySelector("#p-entity-name").value.trim() || null,
      population: parseInt(overlay.querySelector("#p-population").value) || null,
      employee_count: parseInt(overlay.querySelector("#p-employees").value) || null,
      aic_district: parseInt(overlay.querySelector("#p-district").value) || null,
      council_meeting_schedule: overlay.querySelector("#p-meetings").value.trim() || null,
      office_phone: overlay.querySelector("#p-phone").value.trim() || null,
      office_fax: overlay.querySelector("#p-fax").value.trim() || null,
      office_hours: overlay.querySelector("#p-hours").value.trim() || null,
      physical_address: overlay.querySelector("#p-physical").value.trim() || null,
      mailing_address: overlay.querySelector("#p-mailing").value.trim() || null,
      website_url: overlay.querySelector("#p-website").value.trim() || null,
    };

    try {
      await api(`/jurisdictions/${jurisdictionId}/profile`, { method: "PUT", body });
      overlay.remove();
      showToast("Profile saved");
      renderJurisdictionDetail(parentEl, jurisdictionId);
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });
}


