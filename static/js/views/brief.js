import { api, navigate, formatDate, badge } from "../app.js";

export async function renderBrief(el) {
  try {
    const data = await api("/brief");
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    let html = `<h2 style="font-size:1.3rem;margin-bottom:16px">${greeting}, Steve</h2>`;

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

    // Upcoming board meetings
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
