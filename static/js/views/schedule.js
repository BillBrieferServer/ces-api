import { api, formatDate, navigate } from "../app.js";

const ROLLING = 90;
const MO = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const SCHED_BADGE = {
  entity_visit: { label: "Visit", bg: "rgba(5,150,105,0.2)", color: "#059669" },
  follow_up:    { label: "Follow-up", bg: "rgba(37,99,235,0.2)", color: "#2563EB" },
  presentation: { label: "Present", bg: "rgba(109,40,217,0.2)", color: "#6D28D9" },
  event:        { label: "Event", bg: "rgba(13,148,136,0.2)", color: "#0D9488" },
  custom:       { label: "Custom", bg: "rgba(71,85,105,0.2)", color: "#475569" },
};

function fmt(d) { return d.toISOString().slice(0, 10); }
function parseD(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addD(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function rel(d) {
  const today = new Date(); today.setHours(0,0,0,0);
  const x = Math.round((d - today) / 864e5);
  return x === 0 ? "Today" : x === 1 ? "Tomorrow" : x < 0 ? `${-x}d ago` : `In ${x}d`;
}

export async function renderSchedule(el) {
  let schedStart = new Date(); schedStart.setHours(0,0,0,0);
  let schedItems = [];
  let schedFilter = null;
  let showCompleted = false;
  let stats = {};
  let editingItem = null;
  let viewMode = "rolling"; // "rolling", "pending", "overdue"

  async function loadSchedule() {
    try {
      let url;
      if (viewMode === "pending") {
        const today = fmt(new Date());
        url = `/calendar/schedule?start=${today}&end=2099-12-31&include_overdue=false&include_completed=false`;
      } else if (viewMode === "overdue") {
        const today = fmt(new Date());
        url = `/calendar/schedule?start=2000-01-01&end=${today}&include_overdue=true&include_completed=false`;
      } else {
        const endDate = addD(schedStart, ROLLING);
        url = `/calendar/schedule?start=${fmt(schedStart)}&end=${fmt(endDate)}&include_overdue=true&include_completed=${showCompleted}`;
      }
      if (schedFilter) url += `&item_type=${schedFilter}`;
      schedItems = await api(url);
      if (viewMode === "overdue") {
        const today = fmt(new Date());
        schedItems = schedItems.filter(i => i.item_date < today && !i.completed);
      }
    } catch (err) {
      schedItems = [];
    }
  }

  async function loadStats() {
    try {
      stats = await api("/calendar/stats");
    } catch (err) {
      stats = {};
    }
  }

  function render() {
    const today = new Date(); today.setHours(0,0,0,0);

    let html = "";

    // Stats row
    html += `<div class="stats-row" style="margin-bottom:12px">
      <div class="stat-card" id="stat-pending" style="cursor:pointer;${viewMode === 'pending' ? 'outline:2px solid var(--primary);' : ''}"><div class="stat-value">${stats.scheduled || 0}</div><div class="stat-label">Pending</div></div>
      <div class="stat-card" id="stat-overdue" style="cursor:pointer;${viewMode === 'overdue' ? 'outline:2px solid var(--primary);' : ''}"><div class="stat-value">${stats.overdue || 0}</div><div class="stat-label">Overdue</div></div>
    </div>`;

    // Nav controls
    html += `<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;justify-content:flex-end">
      <button class="cal-nav-btn" id="sched-prev">&larr;</button>
      <button class="cal-nav-btn" id="sched-today" style="font-size:12px">Today</button>
      <button class="cal-nav-btn" id="sched-next">&rarr;</button>
    </div>`;

    // Quick add bar
    html += `<div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
      <input type="date" id="sched-add-date" class="form-input" style="flex:0 0 auto;width:140px;padding:6px 8px;font-size:12px" value="${fmt(today)}">
      <input type="time" id="sched-add-time" class="form-input" style="flex:0 0 auto;width:100px;padding:6px 8px;font-size:12px" placeholder="Time">
      <input type="text" id="sched-add-title" class="form-input" style="flex:1;min-width:120px;padding:6px 8px;font-size:12px" placeholder="Title...">
      <select id="sched-add-type" class="form-select" style="flex:0 0 auto;width:110px;padding:6px 8px;font-size:12px">
        <option value="custom">Custom</option>
        <option value="entity_visit">Visit</option>
        <option value="follow_up">Follow-up</option>
        <option value="presentation">Present</option>
        <option value="event">Event</option>
      </select>
      <select id="sched-add-assigned" class="form-select" style="flex:0 0 auto;width:90px;padding:6px 8px;font-size:12px">
        <option value="">Assign</option>
        <option value="Steve">Steve</option>
        <option value="Drew">Drew</option>
        <option value="Both">Both</option>
      </select>
      <button class="btn btn-primary btn-sm" id="sched-add-btn" style="padding:6px 12px;font-size:12px;min-height:30px">+ Add</button>
    </div>`;

    // Filter pills
    html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
      <button class="cal-filter-btn sched-type-filter ${!schedFilter ? 'active' : ''}" data-stype="">All</button>
      <button class="cal-filter-btn sched-type-filter ${schedFilter === 'entity_visit' ? 'active' : ''}" data-stype="entity_visit" style="--fc:#059669">Visits</button>
      <button class="cal-filter-btn sched-type-filter ${schedFilter === 'follow_up' ? 'active' : ''}" data-stype="follow_up" style="--fc:#2563EB">Follow-ups</button>
      <button class="cal-filter-btn sched-type-filter ${schedFilter === 'presentation' ? 'active' : ''}" data-stype="presentation" style="--fc:#6D28D9">Presentations</button>
      <button class="cal-filter-btn sched-type-filter ${schedFilter === 'event' ? 'active' : ''}" data-stype="event" style="--fc:#0D9488">Events</button>
    </div>`;

    // Schedule items list
    if (schedItems.length === 0) {
      html += `<div class="card"><div class="empty" style="font-size:0.85rem">No items scheduled</div></div>`;
    } else {
      let lastDate = null;
      for (const item of schedItems) {
        const itemDate = item.item_date;
        if (itemDate !== lastDate) {
          const d = parseD(itemDate);
          const isOverdue = d < today && !item.completed;
          html += `<div style="font-size:12px;font-weight:600;margin:12px 0 6px;color:${isOverdue ? '#DC2626' : 'var(--text-dim)'}">
            ${DS[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()} ${rel(d) === "Today" ? " \u2014 Today" : ` \u2014 ${rel(d)}`}
          </div>`;
          lastDate = itemDate;
        }
        const badge = SCHED_BADGE[item.item_type] || SCHED_BADGE.custom;
        const overdue = item.overdue;
        if (editingItem === item.id) {
          html += `<div class="card" style="padding:10px 14px;border:1px solid var(--primary)">
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="display:flex;gap:8px">
                <div style="flex:1">
                  <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Title</label>
                  <input id="sched-edit-title" class="form-input" style="padding:4px 8px;font-size:12px" value="${item.title}" />
                </div>
                <div style="flex:0 0 130px">
                  <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Date</label>
                  <input id="sched-edit-date" type="date" class="form-input" style="padding:4px 8px;font-size:12px" value="${item.item_date}" />
                </div>
                <div style="flex:0 0 90px">
                  <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Time</label>
                  <input id="sched-edit-time" type="time" class="form-input" style="padding:4px 8px;font-size:12px" value="${item.item_time ? item.item_time.slice(0,5) : ''}" />
                </div>
              </div>
              <div>
                <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Notes</label>
                <input id="sched-edit-notes" class="form-input" style="padding:4px 8px;font-size:12px" value="${item.notes || ''}" placeholder="Notes..." />
              </div>
              <div>
                <label style="font-size:10px;font-weight:600;color:var(--text-secondary)">Assigned to</label>
                <select id="sched-edit-assigned" class="form-select" style="padding:4px 8px;font-size:12px">
                  <option value="">Unassigned</option>
                  <option value="Steve" ${item.assigned_to === 'Steve' ? 'selected' : ''}>Steve</option>
                  <option value="Drew" ${item.assigned_to === 'Drew' ? 'selected' : ''}>Drew</option>
                  <option value="Both" ${item.assigned_to === 'Both' ? 'selected' : ''}>Both</option>
                </select>
              </div>
              <div style="display:flex;gap:6px;justify-content:flex-end">
                <button class="btn btn-primary btn-sm sched-edit-save" data-sid="${item.id}" style="padding:4px 12px;font-size:11px;min-height:0">Save</button>
                <button class="btn btn-sm sched-edit-cancel" style="padding:4px 12px;font-size:11px;min-height:0;background:var(--bg-card);color:var(--text-muted);border:1px solid var(--border)">Cancel</button>
              </div>
            </div>
          </div>`;
        } else {
          html += `<div class="card" style="padding:10px 14px;${overdue ? 'border-left:3px solid #DC2626;' : ''}${item.completed ? 'opacity:0.5;' : ''}">
            <div style="display:flex;align-items:center;gap:10px">
              <input type="checkbox" class="sched-check" data-sid="${item.id}" ${item.completed ? "checked" : ""} style="width:18px;height:18px;cursor:pointer;accent-color:${badge.color}">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:${badge.bg};color:${badge.color}">${badge.label}</span>
                  ${item.org_abbrev ? `<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:${item.org_color || '#475569'}22;color:${item.org_color || '#475569'}">${item.org_abbrev}</span>` : ""}
                ${item.assigned_to ? `<span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:10px;background:rgba(234,179,8,0.2);color:#EAB308">${item.assigned_to}</span>` : ""}
                  ${item.item_time ? `<span style="font-size:11px;color:var(--text-muted)">${item.item_time.slice(0,5)}</span>` : ""}
                <span style="font-weight:600;font-size:13px;color:var(--text);${item.completed ? 'text-decoration:line-through;' : ''}">${item.title}</span>
                </div>
                ${item.location ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${item.location}</div>` : ""}
                ${item.entity_name && item.entity_id ? `<div style="font-size:11px;color:var(--primary);margin-top:2px;cursor:pointer" class="sched-entity-link" data-eid="${item.entity_id}">${item.entity_name}</div>` : ""}
                ${item.official_name ? `<div style="font-size:11px;color:#D97706;margin-top:1px">Contact: ${item.official_name}</div>` : ""}
                ${item.vendor_name ? `<div style="font-size:11px;color:#059669;margin-top:1px">Vendor: ${item.vendor_name}</div>` : ""}
                ${item.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${item.notes}</div>` : ""}
              </div>
              <button class="sched-edit-btn" data-sid="${item.id}" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:11px;padding:4px;font-weight:600" title="Edit">Edit</button>
              <button class="sched-del" data-sid="${item.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px" title="Remove">&times;</button>
            </div>
          </div>`;
        }
      }
    }

    // Show completed toggle
    html += `<div style="display:flex;align-items:center;gap:8px;margin-top:12px;justify-content:center">
      <label style="font-size:12px;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;gap:6px">
        <input type="checkbox" id="sched-show-completed" ${showCompleted ? "checked" : ""}>
        Show completed
      </label>
    </div>`;

    el.innerHTML = html;
    bind();
  }

  function bind() {
    // Stat card clicks
    const pendingCard = el.querySelector("#stat-pending");
    const overdueCard = el.querySelector("#stat-overdue");
    if (pendingCard) pendingCard.addEventListener("click", async () => {
      viewMode = viewMode === "pending" ? "rolling" : "pending";
      await loadSchedule(); render();
    });
    if (overdueCard) overdueCard.addEventListener("click", async () => {
      viewMode = viewMode === "overdue" ? "rolling" : "overdue";
      await loadSchedule(); render();
    });

    // Nav
    const prev = el.querySelector("#sched-prev");
    const next = el.querySelector("#sched-next");
    const todayBtn = el.querySelector("#sched-today");
    if (prev) prev.addEventListener("click", async () => {
      schedStart = addD(schedStart, -ROLLING);
      await loadSchedule(); render();
    });
    if (next) next.addEventListener("click", async () => {
      schedStart = addD(schedStart, ROLLING);
      await loadSchedule(); render();
    });
    if (todayBtn) todayBtn.addEventListener("click", async () => {
      schedStart = new Date(); schedStart.setHours(0,0,0,0);
      await loadSchedule(); render();
    });

    // Filter pills
    el.querySelectorAll(".sched-type-filter").forEach(btn => {
      btn.addEventListener("click", async () => {
        schedFilter = btn.dataset.stype || null;
        await loadSchedule(); render();
      });
    });

    // Completion checkboxes
    el.querySelectorAll(".sched-check").forEach(chk => {
      chk.addEventListener("change", async () => {
        const sid = chk.dataset.sid;
        const completed = chk.checked;
        await api(`/calendar/schedule/${sid}?completed=${completed}`, { method: "PATCH" });
        await Promise.all([loadSchedule(), loadStats()]);
        render();
      });
    });

    // Delete buttons
    el.querySelectorAll(".sched-del").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const sid = btn.dataset.sid;
        await api(`/calendar/schedule/${sid}`, { method: "DELETE" });
        await Promise.all([loadSchedule(), loadStats()]);
        render();
      });
    });

    // Edit buttons
    el.querySelectorAll(".sched-edit-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        editingItem = parseInt(btn.dataset.sid);
        render();
      });
    });

    // Edit save
    el.querySelectorAll(".sched-edit-save").forEach(btn => {
      btn.addEventListener("click", async () => {
        const sid = btn.dataset.sid;
        const title = el.querySelector("#sched-edit-title").value.trim();
        const item_date = el.querySelector("#sched-edit-date").value;
        const notes = el.querySelector("#sched-edit-notes").value.trim();
        const assigned = el.querySelector("#sched-edit-assigned") ? el.querySelector("#sched-edit-assigned").value : "";
        if (!title || !item_date) return;
        const params = new URLSearchParams();
        params.set("title", title);
        params.set("item_date", item_date);
        params.set("notes", notes);
        params.set("assigned_to", assigned);
        const itemTime = el.querySelector("#sched-edit-time") ? el.querySelector("#sched-edit-time").value : "";
        if (itemTime) params.set("item_time", itemTime);
        await api(`/calendar/schedule/${sid}?${params}`, { method: "PATCH" });
        editingItem = null;
        await Promise.all([loadSchedule(), loadStats()]);
        render();
      });
    });

    // Edit cancel
    el.querySelectorAll(".sched-edit-cancel").forEach(btn => {
      btn.addEventListener("click", () => {
        editingItem = null;
        render();
      });
    });

    // Entity links
    el.querySelectorAll(".sched-entity-link").forEach(link => {
      link.addEventListener("click", () => {
        const eid = link.dataset.eid;
        navigate("jurisdiction-detail", { id: parseInt(eid) });
      });
    });

    // Quick add
    const addBtn = el.querySelector("#sched-add-btn");
    if (addBtn) addBtn.addEventListener("click", async () => {
      const titleEl = el.querySelector("#sched-add-title");
      const dateEl = el.querySelector("#sched-add-date");
      const typeEl = el.querySelector("#sched-add-type");
      const title = titleEl.value.trim();
      const itemDate = dateEl.value;
      const itemType = typeEl.value;
      const assignedEl = el.querySelector("#sched-add-assigned");
      const assigned = assignedEl ? assignedEl.value : "";
      const timeEl = el.querySelector("#sched-add-time");
      const itemTime = timeEl ? timeEl.value : "";
      if (!title || !itemDate) return;
      let addUrl = `/calendar/schedule/custom?title=${encodeURIComponent(title)}&item_date=${itemDate}&item_type=${itemType}`;
      if (assigned) addUrl += `&assigned_to=${encodeURIComponent(assigned)}`;
      if (itemTime) addUrl += `&item_time=${encodeURIComponent(itemTime)}`;
      await api(addUrl, { method: "POST" });
      titleEl.value = "";
      await Promise.all([loadSchedule(), loadStats()]);
      render();
    });

    // Show completed toggle
    const showCompEl = el.querySelector("#sched-show-completed");
    if (showCompEl) showCompEl.addEventListener("change", async () => {
      showCompleted = showCompEl.checked;
      await loadSchedule(); render();
    });
  }

  // Initial load
  await Promise.all([loadSchedule(), loadStats()]);
  render();
}
