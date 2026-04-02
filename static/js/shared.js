import { api, showToast } from "./app.js";

// ── Time formatter ──
export function fmt12(t) {
  if (!t) return "";
  const [h, m] = t.slice(0,5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return hr + ":" + String(m).padStart(2,"0") + " " + ampm;
}

// ── Date utilities ──
export function fmt(d) { return d.toISOString().slice(0, 10); }
export function parseD(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
export function addD(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
export function rel(d) {
  const today = new Date(); today.setHours(0,0,0,0);
  const x = Math.round((d - today) / 864e5);
  return x === 0 ? "Today" : x === 1 ? "Tomorrow" : x < 0 ? `${-x}d ago` : `In ${x}d`;
}
export function isToday(d) { return fmt(d) === fmt(new Date()); }

// ── Schedule badge colors ──
export const SCHED_BADGE = {
  entity_visit: { label: "Visit", bg: "rgba(5,150,105,0.2)", color: "#059669" },
  follow_up:    { label: "Follow-up", bg: "rgba(37,99,235,0.2)", color: "#2563EB" },
  presentation: { label: "Present", bg: "rgba(109,40,217,0.2)", color: "#6D28D9" },
  event:        { label: "Event", bg: "rgba(13,148,136,0.2)", color: "#0D9488" },
  custom:       { label: "Custom", bg: "rgba(71,85,105,0.2)", color: "#475569" },
};

// ── Assignees (single source of truth) ──
export const ASSIGNEES = ["Steve", "Drew", "Both"];

export function assigneeOptions(selected, includeBlank = true) {
  let html = includeBlank ? '<option value="">\u2014</option>' : '';
  ASSIGNEES.forEach(a => {
    html += `<option value="${a}" ${a === selected ? 'selected' : ''}>${a}</option>`;
  });
  return html;
}

// ── Action types ──
export const ACTION_TYPES = {
  visit: "Visit", call: "Call", present: "Present",
  follow_up: "Follow-up", send_info: "Send info"
};

// ── Entity type labels ──
export const ENTITY_LABELS = {
  city: "City", county: "County", fire_district: "Fire District",
  school_district: "School District",
  charter_school: "Charter School", cemetery_district: "Cemetery District",
  highway_district: "Highway District", library_district: "Library District",
  irrigation_district: "Irrigation District", water_district: "Water District",
  sewer_district: "Sewer District", recreation_district: "Recreation District",
  hospital_district: "Hospital District", housing_authority: "Housing Authority",
  alternative_school: "Alternative School", soil_water_district: "Soil & Water",
  drainage_district: "Drainage District", sewer_water_district: "Sewer/Water",
  flood_control_district: "Flood Control", health_district: "Health District",
  natural_resource_district: "Natural Resource", special_district: "Special District",
  solid_waste_district: "Solid Waste", airport_authority: "Airport Authority",
  port_authority: "Port Authority", transit_authority: "Transit Authority",
};

export function fmtType(t) {
  return ENTITY_LABELS[t] || t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Entity type display order ──
export const ENTITY_TYPE_ORDER = [
  "county", "city", "school_district", "alternative_school", "charter_school",
  "airport_authority", "cemetery_district", "drainage_district", "fire_district",
  "flood_control_district", "health_district", "highway_district", "hospital_district",
  "housing_authority", "irrigation_district", "library_district", "natural_resource_district",
  "port_authority", "recreation_district", "sewer_district", "sewer_water_district",
  "soil_water_district", "solid_waste_district", "special_district", "transit_authority",
  "water_district"
];

// ── Name utilities ──
export function lastFirst(name) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(" ");
  return last + ", " + rest;
}

export function getLastName(name) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

// ── Priority colors ──
export const PRIORITY_COLORS = {
  hot:  { bg: "rgba(220,38,38,0.15)", text: "#DC2626", border: "#DC2626" },
  warm: { bg: "rgba(180,83,9,0.15)",  text: "#B45309", border: "#B45309" },
  cold: { bg: "rgba(100,116,139,0.15)", text: "#64748B", border: "#64748B" },
};

// ── Contact popup ──
export function showContactPopup(anchorEl, info) {
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
  if (info.physical_address) h += `<div style="font-size:12px;margin-top:6px"><a href="https://maps.google.com/?q=${encodeURIComponent(info.physical_address)}" target="_blank" style="color:var(--accent);text-decoration:none">${info.physical_address}</a></div>`;
  popup.innerHTML = h;
  document.body.appendChild(popup);
  const rect = anchorEl.getBoundingClientRect();
  popup.style.left = Math.min(rect.left, window.innerWidth - 340) + "px";
  popup.style.top = (rect.bottom + 6) + "px";
  const closer = (e) => { if (!popup.contains(e.target) && e.target !== anchorEl) { popup.remove(); document.removeEventListener("click", closer); } };
  setTimeout(() => document.addEventListener("click", closer), 10);
}

// ── Contact popup data fetcher ──
export async function fetchAndShowContact(btn) {
  const type = btn.dataset.contactType;
  const id = btn.dataset.contactId;
  try {
    if (type === "entity") {
      const j = await api(`/jurisdictions/${id}`);
      const p = j.profile || {};
      showContactPopup(btn, { name: j.name, title: j.type ? j.type.replace(/_/g, " ") : "", phone: p.office_phone, address: p.physical_address || p.mailing_address });
    } else if (type === "official") {
      const o = await api(`/officials/${id}`);
      showContactPopup(btn, { name: o.name, title: o.title, phone: o.phone, email: o.email, physical_address: o.physical_address });
    } else if (type === "vendor") {
      const v = await api(`/vendors/${id}`);
      showContactPopup(btn, { name: v.vendor_name, title: v.contact_name ? (v.contact_title ? v.contact_name + " \u2014 " + v.contact_title : v.contact_name) : "", phone: v.phone, cell_phone: v.cell_phone, email: v.email, address: v.address });
    }
  } catch (err) {
    showToast("Could not load contact info");
  }
}

// ── Schedule modal ──
export function showScheduleModal(opts) {
  const today = new Date().toISOString().slice(0, 10);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${opts.title || "Schedule Item"}</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <select class="form-select" id="sm-type">
          <option value="entity_visit">Visit</option>
          <option value="follow_up">Follow-up</option>
          <option value="presentation">Presentation</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input class="form-input" id="sm-date" type="date" value="${today}">
      </div>
      <div class="form-group">
        <label class="form-label">Time (optional)</label>
        <input class="form-input" id="sm-time" type="time">
      </div>
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" id="sm-title" value="${(opts.defaultTitle || '').replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label class="form-label">Location (optional)</label>
        <input class="form-input" id="sm-location" placeholder="Address...">
      </div>
      <div class="form-group">
        <label class="form-label">Assigned to</label>
        <select class="form-select" id="sm-assigned">
          ${assigneeOptions("", true)}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notes (optional)</label>
        <textarea class="form-textarea" id="sm-notes" rows="2"></textarea>
      </div>
      <button class="btn btn-primary btn-block" id="sm-submit">Add to Schedule</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#sm-submit").addEventListener("click", async () => {
    const itemDate = overlay.querySelector("#sm-date").value;
    const title = overlay.querySelector("#sm-title").value.trim();
    if (!itemDate || !title) { showToast("Date and title required"); return; }
    let url = `/calendar/schedule/custom?title=${encodeURIComponent(title)}&item_date=${itemDate}&item_type=${overlay.querySelector("#sm-type").value}`;
    if (opts.officialId) url += `&official_id=${opts.officialId}`;
    if (opts.entityId) url += `&entity_id=${opts.entityId}`;
    if (opts.vendorId) url += `&vendor_id=${opts.vendorId}`;
    const itemTime = overlay.querySelector("#sm-time").value;
    if (itemTime) url += `&item_time=${encodeURIComponent(itemTime)}`;
    const location = overlay.querySelector("#sm-location").value.trim();
    if (location) url += `&location=${encodeURIComponent(location)}`;
    const assigned = overlay.querySelector("#sm-assigned").value;
    if (assigned) url += `&assigned_to=${encodeURIComponent(assigned)}`;
    const notes = overlay.querySelector("#sm-notes").value.trim();
    if (notes) url += `&notes=${encodeURIComponent(notes)}`;
    try {
      await api(url, { method: "POST" });
      showToast("Scheduled!");
      overlay.remove();
      if (opts.onSaved) opts.onSaved();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });
}

// ── Schedule inline edit form HTML ──
export function schedEditFormHTML(item, prefix) {
  return `<div class="card" style="padding:10px 14px;border:1px solid var(--primary);margin-bottom:6px">
    <div style="display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;gap:8px">
        <div style="flex:1">
          <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Title</label>
          <input id="${prefix}-edit-title" class="form-input" style="padding:4px 8px;font-size:12px" value="${(item.title || '').replace(/"/g, '&quot;')}" />
        </div>
        <div style="flex:0 0 130px">
          <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Date</label>
          <input id="${prefix}-edit-date" type="date" class="form-input" style="padding:4px 8px;font-size:12px" value="${item.item_date}" />
        </div>
        <div style="flex:0 0 90px">
          <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Time</label>
          <input id="${prefix}-edit-time" type="time" class="form-input" style="padding:4px 8px;font-size:12px" value="${item.item_time ? item.item_time.slice(0,5) : ''}" />
        </div>
      </div>
      <div>
        <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Location</label>
        <input id="${prefix}-edit-location" class="form-input" style="padding:4px 8px;font-size:12px" value="${(item.location || '').replace(/"/g, '&quot;')}" placeholder="Address..." />
      </div>
      <div>
        <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Notes</label>
        <input id="${prefix}-edit-notes" class="form-input" style="padding:4px 8px;font-size:12px" value="${(item.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..." />
      </div>
      <div>
        <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Assigned to</label>
        <select id="${prefix}-edit-assigned" class="form-select" style="padding:4px 8px;font-size:12px">
          <option value="">Unassigned</option>
          ${assigneeOptions(item.assigned_to, false)}
        </select>
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button class="btn btn-primary btn-sm ${prefix}-edit-save" data-sid="${item.id}" style="padding:4px 12px;font-size:11px;min-height:0">Save</button>
        <button class="btn btn-sm ${prefix}-edit-cancel" style="padding:4px 12px;font-size:11px;min-height:0;background:var(--bg-card);color:var(--text-muted);border:1px solid var(--border)">Cancel</button>
      </div>
    </div>
  </div>`;
}

// ── Save edited schedule item ──
export async function saveScheduleEdit(el, prefix, sid) {
  const title = el.querySelector(`#${prefix}-edit-title`).value.trim();
  const item_date = el.querySelector(`#${prefix}-edit-date`).value;
  const notes = el.querySelector(`#${prefix}-edit-notes`).value.trim();
  const locationVal = el.querySelector(`#${prefix}-edit-location`)?.value.trim() || "";
  const assigned = el.querySelector(`#${prefix}-edit-assigned`)?.value || "";
  if (!title || !item_date) return false;
  const params = new URLSearchParams();
  params.set("title", title);
  params.set("item_date", item_date);
  params.set("notes", notes);
  params.set("location", locationVal);
  params.set("assigned_to", assigned);
  const itemTime = el.querySelector(`#${prefix}-edit-time`)?.value || "";
  if (itemTime) params.set("item_time", itemTime);
  await api(`/calendar/schedule/${sid}?${params}`, { method: "PATCH" });
  return true;
}
