import { api, navigate, formatDate, badge } from "../app.js";

const SCHED_BADGE = {
  entity_visit: { label: "Visit", bg: "rgba(5,150,105,0.2)", color: "#059669" },
  follow_up:    { label: "Follow-up", bg: "rgba(37,99,235,0.2)", color: "#2563EB" },
  presentation: { label: "Present", bg: "rgba(109,40,217,0.2)", color: "#6D28D9" },
  event:        { label: "Event", bg: "rgba(13,148,136,0.2)", color: "#0D9488" },
  custom:       { label: "Custom", bg: "rgba(71,85,105,0.2)", color: "#475569" },
};

function schedCard(item, overdue) {
  const b = SCHED_BADGE[item.item_type] || SCHED_BADGE.custom;
  return `<div class="card" style="padding:10px 14px;${overdue ? 'border-left:3px solid #DC2626;' : ''}margin-bottom:6px">
    <div style="display:flex;align-items:center;gap:10px">
      <input type="checkbox" class="brief-sched-check" data-sid="${item.id}" style="width:18px;height:18px;cursor:pointer;accent-color:${b.color}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:${b.bg};color:${b.color}">${b.label}</span>
          ${item.assigned_to ? `<span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:10px;background:rgba(234,179,8,0.2);color:#EAB308">${item.assigned_to}</span>` : ""}
          ${item.item_time ? `<span style="font-size:11px;color:var(--text-muted)">${item.item_time.slice(0,5)}</span>` : ""}
          <span style="font-weight:600;font-size:13px;color:var(--text)">${item.title}</span>
        </div>
        ${item.event_location ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${item.event_location}</div>` : ""}
        ${item.entity_name && item.entity_id ? `<div style="font-size:11px;color:var(--primary);margin-top:2px;cursor:pointer" class="brief-entity-link" data-eid="${item.entity_id}">${item.entity_name}</div>` : ""}
        ${overdue ? `<div style="font-size:11px;color:#DC2626;margin-top:2px">${formatDate(item.item_date)}</div>` : ""}
        ${!overdue && item.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${item.notes}</div>` : ""}
      </div>
    </div>
  </div>`;
}

export async function renderBrief(el) {
  try {
    const data = await api("/brief");
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    let html = `<h2 style="font-size:1.3rem;margin-bottom:16px">${greeting}, Steve</h2>`;

    // Schedule: Overdue
    if (data.schedule_overdue.length > 0) {
      html += `<div class="section-header" style="color:#DC2626">Overdue</div>`;
      data.schedule_overdue.forEach(item => { html += schedCard(item, true); });
    }

    // Schedule: Today
    html += `<div class="section-header">Today</div>`;
    if (data.schedule_today.length === 0) {
      html += `<div class="card"><div class="empty" style="font-size:0.85rem">Nothing scheduled for today</div></div>`;
    } else {
      data.schedule_today.forEach(item => { html += schedCard(item, false); });
    }

    // Schedule: Upcoming (next 7 days)
    if (data.schedule_upcoming && data.schedule_upcoming.length > 0) {
      html += `<div class="section-header" style="display:flex;justify-content:space-between;align-items:center">
        <span>Upcoming Schedule</span>
        <span class="brief-nav-link" data-nav="schedule" style="font-size:12px;color:var(--primary);cursor:pointer;font-weight:400">View all &rarr;</span>
      </div>`;
      data.schedule_upcoming.forEach(item => { html += schedCard(item, false); });
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

// Pending follow-ups
    html += `<div class="section-header">Pending Follow-ups</div>`;
    if (data.pending_followups.length === 0) {
      html += `<div class="card"><div class="empty">No pending follow-ups</div></div>`;
    } else {
      data.pending_followups.forEach(f => {
        html += `<div class="list-item" data-jid="${f.jurisdiction_id}">
          <div class="list-item-title">${f.jurisdiction_name || "Unknown"}</div>
          <div class="list-item-sub">${f.follow_up_note || f.summary || ""}</div>
          <div class="list-item-meta">
            ${badge(f.type)}
            <span style="color:var(--yellow);font-size:0.8rem">${formatDate(f.follow_up_date)}</span>
          </div>
        </div>`;
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

    // Schedule completion checkboxes
    el.querySelectorAll(".brief-sched-check").forEach(chk => {
      chk.addEventListener("change", async () => {
        const sid = chk.dataset.sid;
        await api(`/calendar/schedule/${sid}?completed=true`, { method: "PATCH" });
        renderBrief(el);
      });
    });

    // Schedule entity links
    el.querySelectorAll(".brief-entity-link").forEach(link => {
      link.addEventListener("click", (ev) => {
        ev.stopPropagation();
        navigate("jurisdiction-detail", { id: parseInt(link.dataset.eid) });
      });
    });

    // Brief nav links (Schedule, Calendar)
    el.querySelectorAll(".brief-nav-link").forEach(link => {
      link.addEventListener("click", () => { navigate(link.dataset.nav); });
    });

    // Brief nav links (Schedule, Calendar)
    el.querySelectorAll(".brief-nav-link").forEach(link => {
      link.addEventListener("click", () => { navigate(link.dataset.nav); });
    });

    // Click handlers for list items with jurisdiction IDs
    el.querySelectorAll("[data-jid]").forEach(item => {
      item.addEventListener("click", () => {
        const jid = item.dataset.jid;
        const name = item.querySelector(".list-item-title")?.textContent || "";
        navigate("jurisdiction-detail", { id: jid, name });
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="empty">Failed to load brief: ${err.message}</div>`;
  }
}
