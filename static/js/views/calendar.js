import { api, formatDate, navigate } from "../app.js";

const ROLLING = 10;
const MO = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const COLORS = [
  {l:"Navy",h:"#1E3A5F"},{l:"Amber",h:"#B45309"},{l:"Purple",h:"#6D28D9"},{l:"Green",h:"#059669"},
  {l:"Red",h:"#DC2626"},{l:"Blue",h:"#2563EB"},{l:"Rose",h:"#BE185D"},{l:"Slate",h:"#475569"},
];

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
function isToday(d) { return fmt(d) === fmt(new Date()); }
function rel(d) {
  const today = new Date(); today.setHours(0,0,0,0);
  const x = Math.round((d - today) / 864e5);
  return x === 0 ? "Today" : x === 1 ? "Tomorrow" : x < 0 ? `${-x}d ago` : `In ${x}d`;
}
function fmtDate(d) { return `${DS[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; }
function autoAb(n) { return n.replace(/\b(of|the|and|in|for)\b/gi, "").split(/\s+/).map(w => (w[0] || "")).join("").toUpperCase().slice(0, 6); }

export async function renderCalendar(el) {
  let mode = "rolling"; // "rolling" or "month"
  let rollingStart = new Date(); rollingStart.setHours(0,0,0,0);
  let monthDate = new Date(); monthDate.setDate(1); monthDate.setHours(0,0,0,0);
  let events = [];
  let sources = [];
  let stats = {};
  let filter = null; // null = all, or org_abbrev string
  let showAddSource = false;
  let selectedEvent = null;

  // My Schedule state
  let schedStart = new Date(); schedStart.setHours(0,0,0,0);
  let schedItems = [];
  let schedFilter = null; // null = all, or item_type
  let showCompleted = false;

  async function loadData() {
    try {
      const [evts, srcs, st] = await Promise.all([
        api("/calendar/events"),
        api("/calendar/sources"),
        api("/calendar/stats"),
      ]);
      events = evts;
      sources = srcs;
      stats = st;
    } catch (err) {
      el.innerHTML = `<div class="empty">Failed to load calendar: ${err.message}</div>`;
      return false;
    }
    return true;
  }

  async function loadSchedule() {
    try {
      const endDate = addD(schedStart, ROLLING);
      const params = `start=${fmt(schedStart)}&end=${fmt(endDate)}&include_overdue=true&include_completed=${showCompleted}`;
      let url = `/calendar/schedule?${params}`;
      if (schedFilter) url += `&item_type=${schedFilter}`;
      schedItems = await api(url);
    } catch (err) {
      schedItems = [];
    }
  }

  function getFiltered() {
    let f = events;
    if (filter) f = f.filter(e => e.org === filter);
    return f;
  }

  function eventsForDate(dateStr, filtered) {
    return filtered.filter(e => {
      if (e.event_date === dateStr) return true;
      if (e.end_date && e.event_date <= dateStr && e.end_date >= dateStr) return true;
      return false;
    });
  }

  function renderStats() {
    return `<div class="stats-row" style="margin-bottom:12px">
      <div class="stat-card"><div class="stat-value">${stats.next_10_days || 0}</div><div class="stat-label">Next 10 days</div></div>
      <div class="stat-card"><div class="stat-value">${stats.total_upcoming || 0}</div><div class="stat-label">Upcoming</div></div>
      <div class="stat-card"><div class="stat-value">${stats.scheduled || 0}</div><div class="stat-label">Scheduled</div></div>
      <div class="stat-card"><div class="stat-value">${stats.overdue || 0}</div><div class="stat-label">Overdue</div></div>
    </div>`;
  }

  function renderFilters() {
    let html = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;align-items:center">`;
    html += `<button class="cal-filter-btn ${!filter ? 'active' : ''}" data-filter="">All</button>`;
    for (const s of sources) {
      html += `<button class="cal-filter-btn ${filter === s.org_abbrev ? 'active' : ''}" data-filter="${s.org_abbrev}" style="--fc:${s.color}">${s.org_abbrev} <span style="opacity:.6;font-size:11px">${s.event_count}</span></button>`;
    }
    html += `<button class="cal-add-src-btn" id="cal-add-src-toggle">+ Add source</button>`;
    html += `</div>`;
    return html;
  }

  function renderModeToggle() {
    return `<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
      <button class="cal-mode-btn ${mode === 'rolling' ? 'active' : ''}" data-mode="rolling">10-Day</button>
      <button class="cal-mode-btn ${mode === 'month' ? 'active' : ''}" data-mode="month">Month</button>
      <div style="flex:1"></div>
      ${mode === 'rolling'
        ? `<button class="cal-nav-btn" id="cal-prev">&larr;</button>
           <button class="cal-nav-btn" id="cal-today" style="font-size:12px">Today</button>
           <button class="cal-nav-btn" id="cal-next">&rarr;</button>`
        : `<button class="cal-nav-btn" id="cal-prev">&larr;</button>
           <span style="font-size:14px;font-weight:600;color:var(--text);min-width:120px;text-align:center">${MO[monthDate.getMonth()]} ${monthDate.getFullYear()}</span>
           <button class="cal-nav-btn" id="cal-today" style="font-size:12px">Today</button>
           <button class="cal-nav-btn" id="cal-next">&rarr;</button>`
      }
    </div>`;
  }

  function renderEventCard(e) {
    const d = parseD(e.event_date);
    const multiDay = e.end_date ? ` &ndash; ${fmtDate(parseD(e.end_date))}` : "";
    return `<div class="cal-event" data-eid="${e.id}" style="border-left:3px solid ${e.color}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="font-weight:600;font-size:13px;color:var(--text)">${e.title}</div>
        <span class="cal-org-badge" style="background:${e.color}">${e.org}</span>
      </div>
      ${e.location ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${e.location}</div>` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
        <span style="font-size:11px;color:var(--text-muted)">${rel(d)}${multiDay}</span>
        ${e.scheduled
          ? `<span style="font-size:11px;color:var(--green,#059669);font-weight:600">&#10003; Scheduled</span>`
          : `<button class="cal-sched-btn" data-sid="${e.id}">+ Schedule</button>`}
      </div>
    </div>`;
  }

  function renderRolling() {
    const filtered = getFiltered();
    let html = "";
    for (let i = 0; i < ROLLING; i++) {
      const d = addD(rollingStart, i);
      const ds = fmt(d);
      const dayEvents = eventsForDate(ds, filtered);
      const today = isToday(d);
      html += `<div class="cal-day ${today ? 'cal-day-today' : ''}" ${dayEvents.length === 0 ? 'style="opacity:.5"' : ""}>
        <div class="cal-day-header">
          <span style="font-weight:600;font-size:13px;color:${today ? 'var(--primary)' : 'var(--text)'}">${DS[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()}</span>
          <span style="font-size:11px;color:var(--text-muted)">${rel(d)}</span>
        </div>
        ${dayEvents.length === 0
          ? `<div style="padding:8px 12px;font-size:12px;color:var(--text-muted)">No events</div>`
          : dayEvents.map(e => renderEventCard(e)).join("")}
      </div>`;
    }
    return html;
  }

  function renderMonth() {
    const filtered = getFiltered();
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = `<div class="cal-month-grid">`;
    for (const d of DS) {
      html += `<div class="cal-month-hdr">${d}</div>`;
    }
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="cal-month-cell cal-month-empty"></div>`;
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const ds = fmt(d);
      const dayEvents = eventsForDate(ds, filtered);
      const today = isToday(d);
      html += `<div class="cal-month-cell ${today ? 'cal-month-today' : ''} ${dayEvents.length ? 'cal-month-has' : ''}">
        <div class="cal-month-num">${day}</div>
        ${dayEvents.slice(0, 3).map(e => `<div class="cal-month-dot" style="background:${e.color}" title="${e.title}"></div>`).join("")}
        ${dayEvents.length > 3 ? `<div style="font-size:9px;color:var(--text-muted)">+${dayEvents.length - 3}</div>` : ""}
      </div>`;
    }
    html += `</div>`;

    const monthEvents = filtered.filter(e => {
      const ed = parseD(e.event_date);
      return ed.getMonth() === month && ed.getFullYear() === year;
    });
    if (monthEvents.length) {
      html += `<div style="margin-top:12px">`;
      monthEvents.forEach(e => { html += renderEventCard(e); });
      html += `</div>`;
    }
    return html;
  }

  // ── My Schedule Section ──

  function renderScheduleSection() {
    const today = new Date(); today.setHours(0,0,0,0);
    const endDate = addD(schedStart, ROLLING);

    let html = `
    <div style="border-top:1px solid var(--border,rgba(255,255,255,0.1));margin:24px 0 16px;padding-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="font-size:1.1rem;font-weight:700;margin:0;color:var(--text)">My Schedule</h3>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="cal-nav-btn sched-nav" id="sched-prev">&larr;</button>
          <button class="cal-nav-btn sched-nav" id="sched-today" style="font-size:12px">Today</button>
          <button class="cal-nav-btn sched-nav" id="sched-next">&rarr;</button>
        </div>
      </div>`;

    // Quick add bar
    html += `<div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
      <input type="date" id="sched-add-date" class="form-input" style="flex:0 0 auto;width:140px;padding:6px 8px;font-size:12px" value="${fmt(today)}">
      <input type="text" id="sched-add-title" class="form-input" style="flex:1;min-width:120px;padding:6px 8px;font-size:12px" placeholder="Title...">
      <select id="sched-add-type" class="form-select" style="flex:0 0 auto;width:110px;padding:6px 8px;font-size:12px">
        <option value="custom">Custom</option>
        <option value="entity_visit">Visit</option>
        <option value="follow_up">Follow-up</option>
        <option value="presentation">Present</option>
        <option value="event">Event</option>
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
        html += `<div class="card" style="padding:10px 14px;${overdue ? 'border-left:3px solid #DC2626;' : ''}${item.completed ? 'opacity:0.5;' : ''}">
          <div style="display:flex;align-items:center;gap:10px">
            <input type="checkbox" class="sched-check" data-sid="${item.id}" ${item.completed ? "checked" : ""} style="width:18px;height:18px;cursor:pointer;accent-color:${badge.color}">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:${badge.bg};color:${badge.color}">${badge.label}</span>
                <span style="font-weight:600;font-size:13px;color:var(--text);${item.completed ? 'text-decoration:line-through;' : ''}">${item.title}</span>
              </div>
              ${item.entity_name && item.entity_id ? `<div style="font-size:11px;color:var(--primary);margin-top:2px;cursor:pointer" class="sched-entity-link" data-eid="${item.entity_id}">${item.entity_name}</div>` : ""}
              ${item.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${item.notes}</div>` : ""}
            </div>
            <button class="sched-del" data-sid="${item.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px" title="Remove">&times;</button>
          </div>
        </div>`;
      }
    }

    // Show completed toggle
    html += `<div style="display:flex;align-items:center;gap:8px;margin-top:12px;justify-content:center">
      <label style="font-size:12px;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;gap:6px">
        <input type="checkbox" id="sched-show-completed" ${showCompleted ? "checked" : ""}>
        Show completed
      </label>
    </div>`;

    html += `</div>`;
    return html;
  }

  function bindSchedule() {
    // Nav
    const prev = el.querySelector("#sched-prev");
    const next = el.querySelector("#sched-next");
    const todayBtn = el.querySelector("#sched-today");
    if (prev) prev.addEventListener("click", async () => {
      schedStart = addD(schedStart, -ROLLING);
      await loadSchedule(); draw();
    });
    if (next) next.addEventListener("click", async () => {
      schedStart = addD(schedStart, ROLLING);
      await loadSchedule(); draw();
    });
    if (todayBtn) todayBtn.addEventListener("click", async () => {
      schedStart = new Date(); schedStart.setHours(0,0,0,0);
      await loadSchedule(); draw();
    });

    // Filter pills
    el.querySelectorAll(".sched-type-filter").forEach(btn => {
      btn.addEventListener("click", async () => {
        schedFilter = btn.dataset.stype || null;
        await loadSchedule(); draw();
      });
    });

    // Completion checkboxes
    el.querySelectorAll(".sched-check").forEach(chk => {
      chk.addEventListener("change", async () => {
        const sid = chk.dataset.sid;
        const completed = chk.checked;
        await api(`/calendar/schedule/${sid}?completed=${completed}`, { method: "PATCH" });
        await Promise.all([loadSchedule(), loadData()]);
        draw();
      });
    });

    // Delete buttons
    el.querySelectorAll(".sched-del").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const sid = btn.dataset.sid;
        await api(`/calendar/schedule/${sid}`, { method: "DELETE" });
        await Promise.all([loadSchedule(), loadData()]);
        draw();
      });
    });

    // Entity links - navigate to entity detail
    el.querySelectorAll(".sched-entity-link").forEach(link => {
      link.addEventListener("click", () => {
        const eid = link.dataset.eid;
        navigate("jurisdiction-detail", { id: parseInt(eid) });
      });
    });

    // Quick add
    const addBtn = el.querySelector("#sched-add-btn");
    if (addBtn) addBtn.addEventListener("click", async () => {
      const dateEl = el.querySelector("#sched-add-date");
      const titleEl = el.querySelector("#sched-add-title");
      const typeEl = el.querySelector("#sched-add-type");
      const title = titleEl.value.trim();
      const itemDate = dateEl.value;
      const itemType = typeEl.value;
      if (!title || !itemDate) return;
      await api(`/calendar/schedule/custom?title=${encodeURIComponent(title)}&item_date=${itemDate}&item_type=${itemType}`, { method: "POST" });
      titleEl.value = "";
      await Promise.all([loadSchedule(), loadData()]);
      draw();
    });

    // Show completed toggle
    const showCompEl = el.querySelector("#sched-show-completed");
    if (showCompEl) showCompEl.addEventListener("change", async () => {
      showCompleted = showCompEl.checked;
      await loadSchedule(); draw();
    });
  }

  // ── Add Source Panel ──

  function renderAddSourcePanel() {
    return `<div class="cal-add-panel" id="cal-add-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:700;font-size:14px;color:var(--text)">Add calendar source</span>
        <button id="cal-add-close" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px">&times;</button>
      </div>
      <div id="cal-add-body">
        <div style="margin-bottom:10px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Calendar page URL</label>
          <input id="cal-add-url" class="cal-input" placeholder="https://example.org/events/calendar" />
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <div style="flex:2">
            <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Organization name</label>
            <input id="cal-add-org" class="cal-input" placeholder="Bannock County Commission" />
          </div>
          <div style="flex:1">
            <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Abbreviation</label>
            <input id="cal-add-abbrev" class="cal-input" placeholder="Auto" />
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Color</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap" id="cal-add-colors"></div>
        </div>
        <div id="cal-add-error" style="display:none;background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.3);border-radius:6px;padding:8px;margin-bottom:10px;font-size:12px;color:#FCA5A5"></div>
        <button id="cal-add-go" class="cal-primary-btn" disabled>Scan calendar page</button>
      </div>
    </div>`;
  }

  function renderEventModal(e) {
    if (!e) return "";
    const d = parseD(e.event_date);
    return `<div class="cal-modal-overlay" id="cal-modal-overlay">
      <div class="cal-modal">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--text)">${e.title}</div>
            <div style="font-size:12px;color:${e.color};font-weight:600;margin-top:2px">${e.org_name || e.org}</div>
          </div>
          <button id="cal-modal-close" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:20px">&times;</button>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">${fmtDate(d)}${e.end_date ? ` &ndash; ${fmtDate(parseD(e.end_date))}` : ""}</div>
        ${e.location ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">${e.location}</div>` : ""}
        ${e.description ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">${e.description}</div>` : ""}
        ${e.url ? `<a href="${e.url}" target="_blank" rel="noopener" style="font-size:13px;color:var(--primary);text-decoration:none;display:block;margin-bottom:10px">View event page &rarr;</a>` : ""}
        <div style="display:flex;gap:8px">
          ${e.scheduled
            ? `<span style="font-size:13px;color:var(--green,#059669);font-weight:600;padding:8px 0">&#10003; On your schedule</span>`
            : `<button class="cal-primary-btn" id="cal-modal-sched" data-sid="${e.id}">+ Add to my schedule</button>`}
        </div>
      </div>
    </div>`;
  }

  async function draw() {
    let html = renderStats();
    html += renderFilters();
    if (showAddSource) html += renderAddSourcePanel();
    html += renderModeToggle();
    html += `<div id="cal-body">`;
    html += mode === "rolling" ? renderRolling() : renderMonth();
    html += `</div>`;
    html += `<div id="cal-modal"></div>`;
    // My Schedule section
    html += renderScheduleSection();
    el.innerHTML = html;
    bind();
    bindSchedule();
  }

  function bind() {
    // Filter buttons
    el.querySelectorAll(".cal-filter-btn:not(.sched-type-filter)").forEach(btn => {
      btn.addEventListener("click", () => {
        filter = btn.dataset.filter || null;
        draw();
      });
    });

    // Mode toggle
    el.querySelectorAll(".cal-mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        mode = btn.dataset.mode;
        draw();
      });
    });

    // Nav
    const prev = el.querySelector("#cal-prev");
    const next = el.querySelector("#cal-next");
    const todayBtn = el.querySelector("#cal-today");
    if (prev) prev.addEventListener("click", () => {
      if (mode === "rolling") rollingStart = addD(rollingStart, -ROLLING);
      else { monthDate.setMonth(monthDate.getMonth() - 1); }
      draw();
    });
    if (next) next.addEventListener("click", () => {
      if (mode === "rolling") rollingStart = addD(rollingStart, ROLLING);
      else { monthDate.setMonth(monthDate.getMonth() + 1); }
      draw();
    });
    if (todayBtn) todayBtn.addEventListener("click", () => {
      rollingStart = new Date(); rollingStart.setHours(0,0,0,0);
      monthDate = new Date(); monthDate.setDate(1); monthDate.setHours(0,0,0,0);
      draw();
    });

    // Add source toggle
    const addSrcBtn = el.querySelector("#cal-add-src-toggle");
    if (addSrcBtn) addSrcBtn.addEventListener("click", () => { showAddSource = !showAddSource; draw(); });

    // Add source close
    const addClose = el.querySelector("#cal-add-close");
    if (addClose) addClose.addEventListener("click", () => { showAddSource = false; draw(); });

    // Add source panel logic
    if (showAddSource) bindAddSource();

    // Schedule buttons
    el.querySelectorAll(".cal-sched-btn").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const eid = parseInt(btn.dataset.sid);
        try {
          await api(`/calendar/schedule?event_id=${eid}`, { method: "POST" });
          const evt = events.find(e => e.id === eid);
          if (evt) evt.scheduled = true;
          stats.scheduled = (stats.scheduled || 0) + 1;
          await loadSchedule();
          draw();
        } catch (err) {
          if (err.message.includes("409")) {
            const evt = events.find(e => e.id === eid);
            if (evt) evt.scheduled = true;
            draw();
          }
        }
      });
    });

    // Event click -> modal
    el.querySelectorAll(".cal-event").forEach(card => {
      card.addEventListener("click", () => {
        const eid = parseInt(card.dataset.eid);
        selectedEvent = events.find(e => e.id === eid);
        const modal = el.querySelector("#cal-modal");
        if (modal) {
          modal.innerHTML = renderEventModal(selectedEvent);
          bindModal();
        }
      });
    });

    // Month cell click -> switch to rolling for that date
    el.querySelectorAll(".cal-month-has").forEach(cell => {
      cell.addEventListener("click", () => {
        const num = parseInt(cell.querySelector(".cal-month-num").textContent);
        rollingStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), num);
        mode = "rolling";
        draw();
      });
    });
  }

  function bindModal() {
    const overlay = el.querySelector("#cal-modal-overlay");
    const close = el.querySelector("#cal-modal-close");
    if (close) close.addEventListener("click", () => { selectedEvent = null; overlay.remove(); });
    if (overlay) overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) { selectedEvent = null; overlay.remove(); }
    });
    const schedBtn = el.querySelector("#cal-modal-sched");
    if (schedBtn) schedBtn.addEventListener("click", async () => {
      const eid = parseInt(schedBtn.dataset.sid);
      try {
        await api(`/calendar/schedule?event_id=${eid}`, { method: "POST" });
        const evt = events.find(e => e.id === eid);
        if (evt) evt.scheduled = true;
        stats.scheduled = (stats.scheduled || 0) + 1;
        selectedEvent = evt;
        await loadSchedule();
        draw();
      } catch (err) {
        if (err.message.includes("409")) {
          const evt = events.find(e => e.id === eid);
          if (evt) evt.scheduled = true;
          draw();
        }
      }
    });
  }

  function bindAddSource() {
    let addColor = "#6D28D9";
    const colorsEl = el.querySelector("#cal-add-colors");
    const urlEl = el.querySelector("#cal-add-url");
    const orgEl = el.querySelector("#cal-add-org");
    const abbrevEl = el.querySelector("#cal-add-abbrev");
    const goBtn = el.querySelector("#cal-add-go");
    const errEl = el.querySelector("#cal-add-error");
    const bodyEl = el.querySelector("#cal-add-body");

    if (!colorsEl) return;

    // Render color swatches
    colorsEl.innerHTML = COLORS.map(c =>
      `<div class="cal-color-swatch ${addColor === c.h ? 'active' : ''}" data-color="${c.h}" style="background:${c.h}" title="${c.l}"></div>`
    ).join("");
    colorsEl.querySelectorAll(".cal-color-swatch").forEach(sw => {
      sw.addEventListener("click", () => {
        addColor = sw.dataset.color;
        colorsEl.querySelectorAll(".cal-color-swatch").forEach(s => s.classList.remove("active"));
        sw.classList.add("active");
      });
    });

    // Enable/disable go button
    function checkReady() {
      goBtn.disabled = !(urlEl.value.trim() && orgEl.value.trim());
    }
    urlEl.addEventListener("input", checkReady);
    orgEl.addEventListener("input", checkReady);

    // Go button - AI extraction
    goBtn.addEventListener("click", async () => {
      const url = urlEl.value.trim();
      const org = orgEl.value.trim();
      const abbrev = abbrevEl.value.trim() || autoAb(org);
      errEl.style.display = "none";

      bodyEl.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div class="cal-spinner"></div>
        <span style="font-size:13px;color:var(--primary)">Claude is reading the page and extracting events...</span>
      </div>
      <div id="cal-add-log" style="background:var(--bg-card);border-radius:6px;padding:8px;max-height:100px;overflow:auto;font-family:monospace;font-size:11px;color:var(--text-muted)">
        <div>${new Date().toLocaleTimeString()} Fetching calendar page...</div>
      </div>`;

      const logEl = bodyEl.querySelector("#cal-add-log");
      function addLog(msg) {
        logEl.innerHTML += `<div>${new Date().toLocaleTimeString()} ${msg}</div>`;
        logEl.scrollTop = logEl.scrollHeight;
      }

      try {
        const today = fmt(new Date());
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4000,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            messages: [{ role: "user", content: `Go to this URL and extract ALL calendar events: ${url}\n\nThis is the calendar for "${org}". Today is ${today}.\n\nReturn ONLY a JSON array. Each element: {"title":"...","event_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD or null","location":"... or null","url":"absolute URL or null","description":"... or null"}\n\nNo markdown, no backticks, no explanation. Just the JSON array. If no events found, return []` }],
          }),
        });

        if (!r.ok) throw new Error(`API ${r.status}`);
        const d = await r.json();
        addLog("Response received, parsing...");

        let txt = "";
        for (const b of (d.content || [])) if (b.type === "text") txt += b.text;

        let extracted = [];
        const jm = txt.match(/\[[\s\S]*\]/);
        if (jm) {
          let raw = jm[0].replace(/```json|```/g, "").trim();
          extracted = JSON.parse(raw);
        }

        const valid = extracted.filter(e => e && e.title && e.event_date && /^\d{4}-\d{2}-\d{2}$/.test(e.event_date));
        addLog(`Found ${valid.length} events`);

        if (!valid.length) {
          bodyEl.innerHTML = `<div style="color:#FCA5A5;font-size:13px;margin-bottom:10px">No events found. The page may need login or loads dynamically.</div>
            <button class="cal-secondary-btn" id="cal-add-retry">Try again</button>`;
          bodyEl.querySelector("#cal-add-retry").addEventListener("click", () => { showAddSource = true; draw(); });
          return;
        }

        // Review screen
        const selected = new Set(valid.map((_, i) => i));
        function renderReview() {
          let h = `<div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px;color:var(--text)">${valid.length} events found from <strong>${org}</strong></span>
            <button id="cal-add-toggle-all" style="font-size:12px;color:var(--primary);background:none;border:none;cursor:pointer">${selected.size === valid.length ? "Deselect all" : "Select all"}</button>
          </div>`;
          h += `<div style="max-height:300px;overflow:auto;margin-bottom:12px">`;
          valid.forEach((e, i) => {
            h += `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
              <input type="checkbox" class="cal-add-chk" data-idx="${i}" ${selected.has(i) ? "checked" : ""} />
              <div style="flex:1">
                <div style="font-size:13px;font-weight:500;color:var(--text)">${e.title}</div>
                <div style="font-size:11px;color:var(--text-muted)">${e.event_date}${e.location ? ` &bull; ${e.location}` : ""}</div>
              </div>
            </div>`;
          });
          h += `</div>`;
          h += `<div style="display:flex;gap:8px">
            <button class="cal-primary-btn" id="cal-add-confirm">Import ${selected.size} events</button>
            <button class="cal-secondary-btn" id="cal-add-cancel">Cancel</button>
          </div>`;
          bodyEl.innerHTML = h;

          bodyEl.querySelectorAll(".cal-add-chk").forEach(chk => {
            chk.addEventListener("change", () => {
              const idx = parseInt(chk.dataset.idx);
              if (chk.checked) selected.add(idx); else selected.delete(idx);
              renderReview();
            });
          });
          const toggleAll = bodyEl.querySelector("#cal-add-toggle-all");
          if (toggleAll) toggleAll.addEventListener("click", () => {
            if (selected.size === valid.length) selected.clear();
            else valid.forEach((_, i) => selected.add(i));
            renderReview();
          });
          const cancel = bodyEl.querySelector("#cal-add-cancel");
          if (cancel) cancel.addEventListener("click", () => { showAddSource = false; draw(); });
          const confirm = bodyEl.querySelector("#cal-add-confirm");
          if (confirm) confirm.addEventListener("click", async () => {
            confirm.disabled = true;
            confirm.textContent = "Importing...";
            try {
              const src = await api(`/calendar/sources?org_name=${encodeURIComponent(org)}&org_abbrev=${encodeURIComponent(abbrev)}&url=${encodeURIComponent(url)}&color=${encodeURIComponent(addColor)}&parser_type=claude_ai`, { method: "POST" });
              const toAdd = Array.from(selected).map(i => ({
                source_id: src.id,
                title: valid[i].title,
                event_date: valid[i].event_date,
                end_date: valid[i].end_date || null,
                location: valid[i].location || null,
                description: valid[i].description || null,
                url: valid[i].url || null,
                ext_id: valid[i].url || `${valid[i].title}-${valid[i].event_date}`,
              }));
              await api("/calendar/events", { method: "POST", body: toAdd });
              showAddSource = false;
              if (await loadData()) { await loadSchedule(); draw(); }
            } catch (err) {
              confirm.textContent = `Error: ${err.message}`;
            }
          });
        }
        renderReview();
      } catch (err) {
        bodyEl.innerHTML = `<div style="color:#FCA5A5;font-size:13px;margin-bottom:10px">Failed: ${err.message}</div>
          <button class="cal-secondary-btn" id="cal-add-retry">Try again</button>`;
        bodyEl.querySelector("#cal-add-retry").addEventListener("click", () => { showAddSource = true; draw(); });
      }
    });
  }

  // Initial load
  if (await loadData()) {
    await loadSchedule();
    draw();
  }
}
