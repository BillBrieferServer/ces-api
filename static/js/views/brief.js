import { api, navigate, formatDate, badge, showToast } from "../app.js";
function fmt12(t) {
  if (!t) return "";
  const [h, m] = t.slice(0,5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return hr + ":" + String(m).padStart(2, "0") + " " + ampm;
}


const SCHED_BADGE = {
  entity_visit: { label: "Visit", bg: "rgba(5,150,105,0.2)", color: "#059669" },
  follow_up:    { label: "Follow-up", bg: "rgba(37,99,235,0.2)", color: "#2563EB" },
  presentation: { label: "Present", bg: "rgba(109,40,217,0.2)", color: "#6D28D9" },
  event:        { label: "Event", bg: "rgba(13,148,136,0.2)", color: "#0D9488" },
  custom:       { label: "Custom", bg: "rgba(71,85,105,0.2)", color: "#475569" },
};

function showContactPopup(anchorEl, info) {
  document.querySelectorAll(".sched-contact-popup").forEach(p => p.remove());
  const popup = document.createElement("div");
  popup.className = "sched-contact-popup";
  popup.style.cssText = "position:fixed;z-index:1000;background:var(--bg-card,#1e1e2e);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:14px 16px;min-width:240px;max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,0.4);font-size:13px;";
  let h = `<div style="font-weight:700;font-size:14px;margin-bottom:8px">${info.name}</div>`;
  if (info.title) h += `<div style="color:var(--text-dim);font-size:12px;margin-bottom:8px">${info.title}</div>`;
  if (info.phone) h += `<div style="margin-bottom:4px"><a href="tel:${info.phone}" style="color:var(--accent);text-decoration:none">${info.phone}</a> <span style="color:var(--text-dim);font-size:11px">work</span></div>`;
  if (info.cell_phone) h += `<div style="margin-bottom:4px"><a href="tel:${info.cell_phone}" style="color:var(--accent);text-decoration:none">${info.cell_phone}</a> <span style="color:var(--text-dim);font-size:11px">cell</span></div>`;
  if (info.email) h += `<div style="margin-bottom:4px"><a href="mailto:${info.email}" style="color:var(--accent);text-decoration:none">${info.email}</a></div>`;
  if (info.address) h += `<div style="font-size:12px;margin-top:6px"><a href="https://maps.google.com/?q=${encodeURIComponent(info.address)}" target="_blank" style="color:var(--accent);text-decoration:none">${info.address}</a></div>`;
  popup.innerHTML = h;
  document.body.appendChild(popup);
  const rect = anchorEl.getBoundingClientRect();
  popup.style.left = Math.min(rect.left, window.innerWidth - 340) + "px";
  popup.style.top = (rect.bottom + 6) + "px";
  const closer = (e) => { if (!popup.contains(e.target) && e.target !== anchorEl) { popup.remove(); document.removeEventListener("click", closer); } };
  setTimeout(() => document.addEventListener("click", closer), 10);
}

function schedCard(item, overdue, editing) {
  const b = SCHED_BADGE[item.item_type] || SCHED_BADGE.custom;

  if (editing) {
    return `<div class="card" style="padding:10px 14px;border:1px solid var(--primary);margin-bottom:6px">
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;gap:8px">
          <div style="flex:1">
            <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Title</label>
            <input id="brief-edit-title" class="form-input" style="padding:4px 8px;font-size:12px" value="${item.title}" />
          </div>
          <div style="flex:0 0 130px">
            <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Date</label>
            <input id="brief-edit-date" type="date" class="form-input" style="padding:4px 8px;font-size:12px" value="${item.item_date}" />
          </div>
          <div style="flex:0 0 90px">
            <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Time</label>
            <input id="brief-edit-time" type="time" class="form-input" style="padding:4px 8px;font-size:12px" value="${item.item_time ? item.item_time.slice(0,5) : ''}" />
          </div>
        </div>
        <div>
          <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Location / Address</label>
          <input id="brief-edit-location" class="form-input" style="padding:4px 8px;font-size:12px" value="${item.location || ''}" placeholder="Address..." />
        </div>
        <div>
          <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Notes</label>
          <input id="brief-edit-notes" class="form-input" style="padding:4px 8px;font-size:12px" value="${item.notes || ''}" placeholder="Notes..." />
        </div>
        <div>
          <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Assigned to</label>
          <select id="brief-edit-assigned" class="form-select" style="padding:4px 8px;font-size:12px">
            <option value="">Unassigned</option>
            <option value="Steve" ${item.assigned_to === 'Steve' ? 'selected' : ''}>Steve</option>
            <option value="Drew" ${item.assigned_to === 'Drew' ? 'selected' : ''}>Drew</option>
            <option value="Both" ${item.assigned_to === 'Both' ? 'selected' : ''}>Both</option>
          </select>
        </div>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="btn btn-primary btn-sm brief-edit-save" data-sid="${item.id}" style="padding:4px 12px;font-size:11px;min-height:0">Save</button>
          <button class="btn btn-sm brief-edit-cancel" style="padding:4px 12px;font-size:11px;min-height:0;background:var(--bg-card);color:var(--text-muted);border:1px solid var(--border)">Cancel</button>
        </div>
      </div>
    </div>`;
  }

  return `<div class="card" style="padding:10px 14px;${overdue ? 'border-left:3px solid #DC2626;' : ''}${item.completed ? 'opacity:0.5;' : ''}margin-bottom:6px">
    <div style="display:flex;align-items:center;gap:10px">
      <input type="checkbox" class="brief-sched-check" data-sid="${item.id}" ${item.completed ? "checked" : ""} style="width:18px;height:18px;cursor:pointer;accent-color:${b.color}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:${b.bg};color:${b.color}">${b.label}</span>
          ${item.assigned_to ? `<span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:10px;background:rgba(234,179,8,0.2);color:#EAB308">${item.assigned_to}</span>` : ""}
          ${item.item_time ? `<span style="font-size:11px;color:var(--text-muted)">${fmt12(item.item_time)}</span>` : ""}
          <span style="font-weight:600;font-size:13px;color:var(--text);${item.completed ? 'text-decoration:line-through;' : ''}">${item.title}</span>
        </div>
        ${item.location ? `<div style="font-size:11px;margin-top:2px"><a href="https://maps.google.com/?q=${encodeURIComponent(item.location)}" target="_blank" style="color:var(--accent);text-decoration:none">${item.location}</a></div>` : ""}
        ${item.entity_name && item.entity_id ? `<div style="font-size:11px;color:var(--primary);margin-top:2px;cursor:pointer" class="brief-entity-link" data-eid="${item.entity_id}">${item.entity_name} <span class="brief-contact-btn" data-contact-type="entity" data-contact-id="${item.entity_id}" style="font-size:10px;color:var(--text-dim);cursor:pointer;text-decoration:underline">info</span></div>` : ""}
        ${item.official_name ? `<div style="font-size:11px;color:#D97706;margin-top:1px;cursor:pointer" class="brief-contact-btn" data-contact-type="official" data-contact-id="${item.official_id}">Contact: ${item.official_name}</div>` : ""}
        ${item.vendor_name ? `<div style="font-size:11px;color:#059669;margin-top:1px;cursor:pointer" class="brief-contact-btn" data-contact-type="vendor" data-contact-id="${item.vendor_id}">Vendor: ${item.vendor_name}</div>` : ""}
        ${overdue ? `<div style="font-size:11px;color:#DC2626;margin-top:2px">${formatDate(item.item_date)}</div>` : ""}
        ${!overdue && item.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${item.notes}</div>` : ""}
      </div>
      <button class="brief-edit-btn" data-sid="${item.id}" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:11px;padding:4px;font-weight:600" title="Edit">Edit</button>
      <button class="brief-del" data-sid="${item.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px" title="Remove">&times;</button>
    </div>
  </div>`;
}

export async function renderBrief(el) {
  let editingItem = null;
  let allSchedItems = [];

  async function load() {
    try {
      const data = await api("/brief");
      // Combine all schedule items for lookup
      allSchedItems = [
        ...(data.schedule_overdue || []),
        ...(data.schedule_today || []),
        ...(data.schedule_upcoming || []),
      ];
      return data;
    } catch (err) {
      return null;
    }
  }

  async function renderAll() {
    const data = await load();
    if (!data) { el.innerHTML = `<div class="empty">Failed to load brief</div>`; return; }

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    let html = `<h2 style="font-size:1.3rem;margin-bottom:16px">${greeting}, Steve</h2>`;

    // Schedule: Overdue
    if (data.schedule_overdue.length > 0) {
      html += `<div class="section-header" style="color:#DC2626">Overdue</div>`;
      data.schedule_overdue.forEach(item => { html += schedCard(item, true, editingItem === item.id); });
    }

    // Schedule: Today
    html += `<div class="section-header">Today</div>`;
    if (data.schedule_today.length === 0) {
      html += `<div class="card"><div class="empty" style="font-size:0.85rem">Nothing scheduled for today</div></div>`;
    } else {
      data.schedule_today.forEach(item => { html += schedCard(item, false, editingItem === item.id); });
    }

    // Schedule: Upcoming
    if (data.schedule_upcoming && data.schedule_upcoming.length > 0) {
      html += `<div class="section-header">Upcoming Schedule</div>`;
      let lastUpDate = null;
      data.schedule_upcoming.forEach(item => {
        if (item.item_date !== lastUpDate) {
          const d = new Date(item.item_date + "T00:00:00");
          const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          html += `<div style="font-size:11px;font-weight:600;margin:10px 0 4px;color:var(--text-dim)">${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}</div>`;
          lastUpDate = item.item_date;
        }
        html += schedCard(item, false, editingItem === item.id);
      });
    }

    // Upcoming events from calendar
    if (data.upcoming_events && data.upcoming_events.length > 0) {
      html += `<div class="section-header" style="display:flex;justify-content:space-between;align-items:center">
        <span>Upcoming Events</span>
        <span class="brief-nav-link" data-nav="calendar" style="font-size:12px;color:var(--primary);cursor:pointer;font-weight:400">View calendar &rarr;</span>
      </div>`;
      data.upcoming_events.forEach(e => {
        html += `<div class="card" style="padding:10px 14px;border-left:3px solid ${e.color};margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-weight:600;font-size:13px;color:var(--text)">${e.title}</div>
              ${e.location ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${e.location}</div>` : ""}
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${formatDate(e.event_date)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:${e.color}22;color:${e.color}">${e.org}</span>
              ${e.scheduled ? `<span style="font-size:10px;color:var(--green,#059669)">&#10003;</span>` : ""}
            </div>
          </div>
        </div>`;
      });
    }

    // Pending follow-ups (entities + vendors, full week)
    html += `<div class="section-header">Follow-ups This Week</div>`;
    if (data.pending_followups.length === 0) {
      html += `<div class="card"><div class="empty">No follow-ups this week</div></div>`;
    } else {
      const today = new Date(data.today);
      data.pending_followups.forEach(f => {
        const fDate = new Date(f.follow_up_date);
        const isOverdue = fDate < today;
        const dateColor = isOverdue ? "var(--red, #EF4444)" : "var(--yellow)";
        const overdueTag = isOverdue ? ` <span style="color:var(--red, #EF4444);font-size:0.7rem;font-weight:600">OVERDUE</span>` : "";
        if (f.source === "vendor") {
          html += `<div class="list-item" style="cursor:pointer" onclick="window.location.hash='#vendors/${f.vendor_id}'">
            <div class="list-item-title">${f.vendor_name || "Unknown Vendor"} <span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:rgba(5,150,105,0.2);color:#059669">Vendor</span></div>
            <div class="list-item-sub">${f.notes || ""}</div>
            <div class="list-item-meta">
              ${badge(f.next_action_type || "Follow-up")}
              <span style="color:${dateColor};font-size:0.8rem">${formatDate(f.follow_up_date)}</span>${overdueTag}
            </div>
          </div>`;
        } else {
          html += `<div class="list-item" data-jid="${f.jurisdiction_id}">
            <div class="list-item-title">${f.jurisdiction_name || "Unknown"} <span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:rgba(37,99,235,0.2);color:#2563EB">Entity</span></div>
            <div class="list-item-sub">${f.follow_up_note || f.summary || ""}</div>
            <div class="list-item-meta">
              ${badge(f.type)}
              <span style="color:${dateColor};font-size:0.8rem">${formatDate(f.follow_up_date)}</span>${overdueTag}
            </div>
          </div>`;
        }
      });
    }

    // Upcoming actions
    html += `<div class="section-header">Upcoming Actions</div>`;
    if (data.upcoming_actions.length === 0) {
      html += `<div class="card"><div class="empty">No actions in next 30 days</div></div>`;
    } else {
      data.upcoming_actions.forEach(b => {
        html += `<div class="list-item" data-jid="${b.jurisdiction_id}">
          <div class="list-item-title">${b.jurisdiction_name}</div>
          <div class="list-item-meta">
            ${badge(b.next_action_type || "Action")}
            ${badge(b.status, "status")}
            <span style="font-size:0.8rem">${formatDate(b.next_action_date)}</span>
          </div>
        </div>`;
      });
    }

    // Pipeline summary
    html += `<div class="section-header">Pipeline</div><div class="stats-row">`;
    const statusOrder = ["not_contacted", "contacted", "pitched", "presentation_scheduled", "board_approved", "active_member"];
    const statusLabels = { not_contacted: "Not Contacted", contacted: "Contacted", pitched: "Pitched",
      presentation_scheduled: "Scheduled", board_approved: "Approved", active_member: "Active" };
    const statusMap = {};
    data.pipeline_summary.forEach(p => statusMap[p.status] = p.count);
    statusOrder.forEach(s => {
      const count = statusMap[s] || 0;
      if (count > 0 || s === "not_contacted") {
        html += `<div class="stat-card"><div class="stat-value">${count}</div><div class="stat-label">${statusLabels[s] || s}</div></div>`;
      }
    });
    html += `</div>`;

    // Recent interactions
    html += `<div class="section-header">Recent Activity</div>`;
    if (data.recent_interactions.length === 0) {
      html += `<div class="card"><div class="empty">No activity in the last 7 days</div></div>`;
    } else {
      data.recent_interactions.forEach(i => {
        html += `<div class="list-item" data-jid="${i.jurisdiction_id}">
          <div class="list-item-title">${i.jurisdiction_name || "Unknown"}</div>
          <div class="list-item-sub">${i.summary || ""}</div>
          <div class="list-item-meta">
            ${badge(i.type)}
            <span style="font-size:0.8rem">${formatDate(i.interaction_date)}</span>
          </div>
        </div>`;
      });
    }

    el.innerHTML = html;
    bindEvents();
  }

  function bindEvents() {
    // Completion checkboxes
    el.querySelectorAll(".brief-sched-check").forEach(chk => {
      chk.addEventListener("change", async () => {
        const sid = chk.dataset.sid;
        const completed = chk.checked;
        await api(`/calendar/schedule/${sid}?completed=${completed}`, { method: "PATCH" });
        await renderAll();
      });
    });

    // Edit buttons
    el.querySelectorAll(".brief-edit-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        editingItem = parseInt(btn.dataset.sid);
        renderAll();
      });
    });

    // Edit save
    el.querySelectorAll(".brief-edit-save").forEach(btn => {
      btn.addEventListener("click", async () => {
        const sid = btn.dataset.sid;
        const title = el.querySelector("#brief-edit-title").value.trim();
        const item_date = el.querySelector("#brief-edit-date").value;
        const notes = el.querySelector("#brief-edit-notes").value.trim();
        const locationVal = el.querySelector("#brief-edit-location") ? el.querySelector("#brief-edit-location").value.trim() : "";
        const assigned = el.querySelector("#brief-edit-assigned") ? el.querySelector("#brief-edit-assigned").value : "";
        if (!title || !item_date) return;
        const params = new URLSearchParams();
        params.set("title", title);
        params.set("item_date", item_date);
        params.set("notes", notes);
        params.set("location", locationVal);
        params.set("assigned_to", assigned);
        const itemTime = el.querySelector("#brief-edit-time") ? el.querySelector("#brief-edit-time").value : "";
        if (itemTime) params.set("item_time", itemTime);
        await api(`/calendar/schedule/${sid}?${params}`, { method: "PATCH" });
        editingItem = null;
        await renderAll();
      });
    });

    // Edit cancel
    el.querySelectorAll(".brief-edit-cancel").forEach(btn => {
      btn.addEventListener("click", () => { editingItem = null; renderAll(); });
    });

    // Delete buttons
    el.querySelectorAll(".brief-del").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const sid = btn.dataset.sid;
        await api(`/calendar/schedule/${sid}`, { method: "DELETE" });
        await renderAll();
      });
    });

    // Entity links (click name to navigate, click "info" for popup)
    el.querySelectorAll(".brief-entity-link").forEach(link => {
      link.addEventListener("click", (e) => {
        if (e.target.classList.contains("brief-contact-btn")) return;
        const eid = link.dataset.eid;
        navigate("jurisdiction-detail", { id: parseInt(eid) });
      });
    });

    // Contact info popups
    el.querySelectorAll(".brief-contact-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const type = btn.dataset.contactType;
        const id = btn.dataset.contactId;
        try {
          if (type === "entity") {
            const j = await api(`/jurisdictions/${id}`);
            const p = j.profile || {};
            showContactPopup(btn, { name: j.name, title: j.type ? j.type.replace(/_/g, " ") : "", phone: p.office_phone, address: p.physical_address || p.mailing_address });
          } else if (type === "official") {
            const o = await api(`/officials/${id}`);
            showContactPopup(btn, { name: o.name, title: o.title, phone: o.phone, email: o.email, address: o.physical_address });
          } else if (type === "vendor") {
            const v = await api(`/vendors/${id}`);
            showContactPopup(btn, { name: v.vendor_name, title: v.contact_name ? (v.contact_title ? v.contact_name + " \u2014 " + v.contact_title : v.contact_name) : "", phone: v.phone, cell_phone: v.cell_phone, email: v.email, address: v.address });
          }
        } catch (err) {
          showToast("Could not load contact info");
        }
      });
    });

    // Brief nav links
    el.querySelectorAll(".brief-nav-link").forEach(link => {
      link.addEventListener("click", () => { navigate(link.dataset.nav); });
    });

    // Jurisdiction list items
    el.querySelectorAll("[data-jid]").forEach(item => {
      item.addEventListener("click", () => {
        const jid = item.dataset.jid;
        const name = item.querySelector(".list-item-title")?.textContent || "";
        navigate("jurisdiction-detail", { id: jid, name });
      });
    });
  }

  await renderAll();
}
