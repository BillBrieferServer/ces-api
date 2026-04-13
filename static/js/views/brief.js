import { fmt12, SCHED_BADGE, showContactPopup, fetchAndShowContact, assigneeOptions, schedEditFormHTML, saveScheduleEdit } from "../shared.js";
import { api, navigate, formatDate, badge, showToast } from "../app.js";
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

    let userName = "Steve";
    try { const me = await fetch("/api/me").then(r => r.json()); if (me.name) userName = me.name.split(" ")[0]; } catch(e) {}
    let html = `<h2 style="font-size:1.3rem;margin-bottom:16px">${greeting}, ${userName}</h2>`;

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


    // Action Items (entities + vendors, next 30 days)
    html += `<div class="section-header">Action Items</div>`;
    if (!data.action_items || data.action_items.length === 0) {
      html += `<div class="card"><div class="empty" style="font-size:0.85rem">No upcoming action items</div></div>`;
    } else {
      data.action_items.forEach(a => {
        const isOverdue = a.overdue;
        const dateColor = isOverdue ? "var(--red, #EF4444)" : "var(--text-muted)";
        const overdueTag = isOverdue ? ` <span style="color:var(--red, #EF4444);font-size:0.7rem;font-weight:600">OVERDUE</span>` : "";
        const isVendor = a.source === "vendor";
        const srcBadge = isVendor
          ? `<span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:rgba(5,150,105,0.2);color:#059669">Vendor</span>`
          : `<span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:rgba(37,99,235,0.2);color:#2563EB">Entity</span>`;
        const priorityBadge = a.priority ? `<span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:rgba(234,179,8,0.2);color:#EAB308">${a.priority}</span>` : "";
        const actionLabel = a.next_action_type ? a.next_action_type.replace(/_/g, " ") : "Action";
        const navAttr = isVendor ? `data-vendor-nav="1"` : `data-jid="${a.jurisdiction_id}"`;

        const dismissId = isVendor ? a.vendor_id : a.jurisdiction_id;
        html += `<div class="list-item" style="cursor:pointer;position:relative" ${navAttr}>
          <button class="brief-action-dismiss" data-source="${a.source}" data-id="${dismissId}" title="Clear action item" style="position:absolute;top:6px;right:8px;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px;z-index:2">&times;</button>
          <div class="list-item-title">${a.entity_name || "Unknown"} ${srcBadge} ${priorityBadge}</div>
          <div class="list-item-sub">${actionLabel}${a.notes ? " — " + a.notes : ""}</div>
          <div class="list-item-meta">
            ${a.assigned_rm ? `<span style="font-size:0.75rem;color:var(--text-dim)">${a.assigned_rm}</span>` : ""}
            <span style="color:${dateColor};font-size:0.8rem">${formatDate(a.next_action_date)}</span>${overdueTag}
          </div>
        </div>`;
      });
    }

    el.innerHTML = html;

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
      item.addEventListener("click", (e) => {
        if (e.target.closest(".brief-action-dismiss")) return;
        const jid = item.dataset.jid;
        const name = item.querySelector(".list-item-title")?.textContent || "";
        navigate("jurisdiction-detail", { id: jid, name });
      });
    });

    // Vendor action item clicks -> navigate to vendors tab
    el.querySelectorAll("[data-vendor-nav]").forEach(item => {
      item.addEventListener("click", (e) => {
        if (e.target.closest(".brief-action-dismiss")) return;
        navigate("vendors");
      });
    });

    // Dismiss action items (clear next_action_date)
    el.querySelectorAll(".brief-action-dismiss").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const source = btn.dataset.source;
        const id = btn.dataset.id;
        if (source === "vendor") {
          await api(`/vendors/${id}`, { method: "PUT", body: {next_action_date: null, next_action_type: null} });
        } else {
          await api(`/outreach/${id}`, { method: "PUT", body: {next_action_date: null, next_action_type: null} });
        }
        showToast("Action item cleared");
        await renderAll();
      });
    });
  }

  await renderAll();
}
