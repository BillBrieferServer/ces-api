import { api, phoneLink, emailLink, badge, formatDate, showToast } from "../app.js";

export async function renderJurisdictionDetail(el, id) {
  try {
    const j = await api(`/jurisdictions/${id}`);
    const p = j.profile || {};
    const o = j.outreach || {};

    let html = `
      <div style="margin-bottom:4px">
        ${badge(j.type, "")}
        <span style="color:var(--text-dim);font-size:0.85rem;margin-left:4px">${j.county_name || ""} County</span>
      </div>
      <h2 style="font-size:1.3rem;margin-bottom:16px">${j.name}</h2>
    `;

    // Profile card
    html += `<div class="card"><div class="card-title">Profile</div>`;
    if (p.population) html += `<div class="card-row"><label>Population</label><span>${p.population.toLocaleString()}</span></div>`;
    if (p.employee_count) html += `<div class="card-row"><label>Employees</label><span>${p.employee_count}</span></div>`;
    if (p.aic_district) html += `<div class="card-row"><label>AIC District</label><span>${p.aic_district}</span></div>`;
    if (p.council_meeting_schedule) html += `<div class="card-row"><label>Council Meetings</label><span style="text-align:right;max-width:60%">${p.council_meeting_schedule}</span></div>`;
    if (p.office_phone) html += `<div class="card-row"><label>Phone</label>${phoneLink(p.office_phone)}</div>`;
    if (p.office_fax) html += `<div class="card-row"><label>Fax</label><span>${p.office_fax}</span></div>`;
    if (p.office_hours) html += `<div class="card-row"><label>Hours</label><span style="text-align:right;max-width:60%">${p.office_hours}</span></div>`;
    if (p.mailing_address) html += `<div class="card-row"><label>Address</label><span style="text-align:right;max-width:60%">${p.mailing_address}</span></div>`;
    if (j.website_url) html += `<div class="card-row"><label>Website</label><a class="contact-link" href="${j.website_url}" target="_blank">Visit</a></div>`;
    html += `</div>`;

    // Outreach card
    html += `<div class="card" id="outreach-card"><div class="card-title">Outreach Status</div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="o-status">
          ${["not_contacted","contacted","pitched","presentation_scheduled","board_approved","active_member"]
            .map(s => `<option value="${s}" ${o.status === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Assigned RM</label>
        <input class="form-input" id="o-rm" value="${o.assigned_rm || ""}" placeholder="Steve / Drew">
      </div>
      <div class="form-group">
        <label class="form-label">Priority Tier</label>
        <select class="form-select" id="o-tier">
          <option value="">Not set</option>
          ${[1,2,3,4,5].map(t => `<option value="${t}" ${o.priority_tier === t ? "selected" : ""}>Tier ${t}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Board Meeting Target</label>
        <input class="form-input" id="o-board" type="date" value="${o.board_meeting_target || ""}">
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="o-notes" rows="3">${o.notes || ""}</textarea>
      </div>
      <button class="btn btn-primary btn-block" id="save-outreach">Save Outreach</button>
    </div>`;

    // Officials
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 10px">
      <span class="section-header" style="margin:0">Officials (${j.officials.length})</span>
      <button class="btn btn-primary btn-sm" id="add-official-btn">+ Add Contact</button>
    </div>`;
    if (j.officials.length === 0) {
      html += `<div class="card"><div class="empty">No officials on file</div></div>`;
    } else {
      j.officials.forEach(off => {
        html += `<div class="card" style="padding:12px 16px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-weight:600;font-size:0.95rem">${off.name}</div>
            <button class="btn btn-sm" data-edit-official="${off.official_id}" data-off-name="${(off.name||'').replace(/"/g,'&quot;')}" data-off-title="${(off.title||'').replace(/"/g,'&quot;')}" data-off-phone="${off.phone||''}" data-off-email="${off.email||''}" style="padding:4px 10px;font-size:0.8rem;min-height:32px">&#9998;</button>
          </div>
          <div style="color:var(--text-dim);font-size:0.8rem;margin-bottom:6px">${off.title || ""}</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${off.phone ? phoneLink(off.phone) : ""}
            ${off.email ? emailLink(off.email) : ""}
          </div>
        </div>`;
      });
    }

    // Interactions
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 10px">
      <span class="section-header" style="margin:0">Interactions (${j.interactions.length})</span>
      <button class="btn btn-primary btn-sm" id="log-interaction-btn">+ Log</button>
    </div>`;
    if (j.interactions.length === 0) {
      html += `<div class="card"><div class="empty">No interactions logged</div></div>`;
    } else {
      j.interactions.forEach(i => {
        html += `<div class="card" style="padding:12px 16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-weight:600;font-size:0.85rem">${badge(i.type)}</span>
            <span style="font-size:0.8rem;color:var(--text-dim)">${formatDate(i.interaction_date)}</span>
          </div>
          <div style="font-size:0.9rem">${i.summary || ""}</div>
          ${i.official_name ? `<div style="font-size:0.8rem;color:var(--text-dim);margin-top:4px">w/ ${i.official_name}</div>` : ""}
          ${i.follow_up_date ? `<div style="font-size:0.8rem;margin-top:4px;color:${i.completed ? "var(--green)" : "var(--yellow)"}">
            Follow-up: ${formatDate(i.follow_up_date)} ${i.completed ? "(done)" : ""}
            ${!i.completed ? `<button class="btn btn-sm" style="margin-left:8px;padding:4px 10px;font-size:0.7rem" data-complete="${i.interaction_id}">Mark Done</button>` : ""}
          </div>` : ""}
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

    // Save outreach handler
    el.querySelector("#save-outreach").addEventListener("click", async () => {
      const body = {};
      const status = el.querySelector("#o-status").value;
      const rm = el.querySelector("#o-rm").value.trim();
      const tier = el.querySelector("#o-tier").value;
      const board = el.querySelector("#o-board").value;
      const notes = el.querySelector("#o-notes").value.trim();

      body.status = status;
      if (rm) body.assigned_rm = rm; else body.assigned_rm = null;
      if (tier) body.priority_tier = parseInt(tier); else body.priority_tier = null;
      if (board) body.board_meeting_target = board; else body.board_meeting_target = null;
      if (notes) body.notes = notes; else body.notes = null;

      await api(`/outreach/${id}`, { method: "PUT", body });
      showToast("Outreach saved");
    });

    // Log interaction button
    el.querySelector("#log-interaction-btn").addEventListener("click", () => {
      showInteractionModal(el, id, j.officials);
    });

    // Complete follow-up buttons
    el.querySelectorAll("[data-complete]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await api(`/interactions/${btn.dataset.complete}/complete`, { method: "PUT" });
        showToast("Follow-up completed");
        renderJurisdictionDetail(el, id);
      });
    });

    // Edit official buttons
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

    // Add official button
    el.querySelector("#add-official-btn").addEventListener("click", () => {
      showOfficialModal(el, id, null);
    });

  } catch (err) {
    el.innerHTML = `<div class="empty">Failed to load: ${err.message}</div>`;
  }
}

function showInteractionModal(parentEl, jurisdictionId, officials) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Log Interaction</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <select class="form-select" id="i-type">
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="meeting">Meeting</option>
          <option value="presentation">Presentation</option>
          <option value="board_meeting">Board Meeting</option>
          <option value="conference">Conference</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Official (optional)</label>
        <select class="form-select" id="i-official">
          <option value="">None</option>
          ${officials.map(o => `<option value="${o.official_id}">${o.name} - ${o.title || ""}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input class="form-input" id="i-date" type="datetime-local" value="${new Date().toISOString().slice(0,16)}">
      </div>
      <div class="form-group">
        <label class="form-label">Summary</label>
        <textarea class="form-textarea" id="i-summary" placeholder="What happened?"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Follow-up Date (optional)</label>
        <input class="form-input" id="i-followup" type="date">
      </div>
      <div class="form-group">
        <label class="form-label">Follow-up Note (optional)</label>
        <input class="form-input" id="i-followup-note" placeholder="What to follow up on">
      </div>
      <button class="btn btn-primary btn-block" id="i-submit">Save Interaction</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#i-submit").addEventListener("click", async () => {
    const body = {
      jurisdiction_id: parseInt(jurisdictionId),
      interaction_date: new Date(overlay.querySelector("#i-date").value).toISOString(),
      type: overlay.querySelector("#i-type").value,
      summary: overlay.querySelector("#i-summary").value,
    };
    const official = overlay.querySelector("#i-official").value;
    if (official) body.official_id = parseInt(official);
    const followup = overlay.querySelector("#i-followup").value;
    if (followup) body.follow_up_date = followup;
    const followupNote = overlay.querySelector("#i-followup-note").value;
    if (followupNote) body.follow_up_note = followupNote;

    await api("/interactions", { method: "POST", body });
    overlay.remove();
    showToast("Interaction logged");
    renderJurisdictionDetail(parentEl, jurisdictionId);
  });
}


function showOfficialModal(parentEl, jurisdictionId, existing) {
  const isEdit = !!existing;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${isEdit ? "Edit Contact" : "Add Contact"}</h2>
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
      <button class="btn btn-primary btn-block" id="off-submit">${isEdit ? "Save Changes" : "Add Contact"}</button>
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
        const body = { jurisdiction_id: parseInt(jurisdictionId), name, title };
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
}
