import { api, navigate } from "../app.js";

const STATUS_LABELS = {
  not_contacted: "Not Contacted", contacted: "Contacted", pitched: "Pitched",
  presentation_scheduled: "Presentation", board_approved: "Approved", active_member: "Active"
};
const TYPE_LABELS = {
  entity_visit: "Visit", follow_up: "Follow-up", presentation: "Presentation",
  event: "Event", custom: "Custom"
};
const PRI_COLORS = { hot: "#DC2626", warm: "#EAB308", cold: "#3B82F6", none: "#475569" };

function bar(value, max, color) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
    <div style="flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:4px"></div>
    </div>
    <span style="font-size:12px;color:var(--text);min-width:30px;text-align:right">${value}</span>
  </div>`;
}

export async function renderReports(el) {
  try {
    const d = await api("/reports");

    let html = "";

    // ── Schedule Overview ──
    const ss = d.schedule_stats;
    html += `<div class="section-header">Schedule Overview</div>`;
    html += `<div class="stats-row" style="margin-bottom:12px">
      <div class="stat-card"><div class="stat-value">${ss.total}</div><div class="stat-label">Total</div></div>
      <div class="stat-card"><div class="stat-value">${ss.completed}</div><div class="stat-label">Completed</div></div>
      <div class="stat-card"><div class="stat-value">${ss.pending}</div><div class="stat-label">Pending</div></div>
      <div class="stat-card" style="${ss.overdue > 0 ? 'border:1px solid rgba(220,38,38,0.3)' : ''}"><div class="stat-value" style="${ss.overdue > 0 ? 'color:#DC2626' : ''}">${ss.overdue}</div><div class="stat-label">Overdue</div></div>
    </div>`;

    // By Assignee
    if (d.by_assignee.length > 0) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">By Assignee</div>`;
      const maxA = Math.max(...d.by_assignee.map(a => a.total));
      d.by_assignee.forEach(a => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:12px;min-width:80px;color:var(--text-secondary)">${a.assignee}</span>
          <div style="flex:1">${bar(a.pending, maxA, "#3B82F6")}</div>
          <span style="font-size:10px;color:var(--text-muted);min-width:60px">${a.completed} done</span>
        </div>`;
      });
      html += `</div>`;
    }

    // By Type
    if (d.by_type.length > 0) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">By Type</div>`;
      const maxT = Math.max(...d.by_type.map(t => t.total));
      d.by_type.forEach(t => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:12px;min-width:80px;color:var(--text-secondary)">${TYPE_LABELS[t.item_type] || t.item_type}</span>
          <div style="flex:1">${bar(t.pending, maxT, "#059669")}</div>
          <span style="font-size:10px;color:var(--text-muted);min-width:60px">${t.completed} done</span>
        </div>`;
      });
      html += `</div>`;
    }

    // ── Pipeline ──
    html += `<div class="section-header">Pipeline</div>`;
    html += `<div class="card" style="padding:14px;margin-bottom:12px">`;
    const maxP = Math.max(...d.pipeline.map(p => p.count));
    d.pipeline.forEach(p => {
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:12px;min-width:110px;color:var(--text-secondary)">${STATUS_LABELS[p.status] || p.status}</span>
        <div style="flex:1">${bar(p.count, maxP, "#6D28D9")}</div>
      </div>`;
    });
    html += `</div>`;

    // Priority breakdown
    if (d.priorities.length > 0) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">Priority Breakdown</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">`;
      d.priorities.forEach(p => {
        const color = PRI_COLORS[p.priority] || "#475569";
        html += `<div style="display:flex;align-items:center;gap:6px">
          <span style="width:10px;height:10px;border-radius:50%;background:${color}"></span>
          <span style="font-size:13px;color:var(--text)">${p.priority === 'none' ? 'No priority' : p.priority.charAt(0).toUpperCase() + p.priority.slice(1)}</span>
          <span style="font-size:13px;font-weight:700;color:var(--text)">${p.count}</span>
        </div>`;
      });
      html += `</div></div>`;
    }

    // ── Events ──
    html += `<div class="section-header">Events Calendar</div>`;

    // By source
    if (d.events_by_source.length > 0) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">Events by Source</div>`;
      d.events_by_source.forEach(s => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:${s.color}22;color:${s.color};min-width:50px;text-align:center">${s.source}</span>
          <span style="font-size:13px;color:var(--text)">${s.event_count} events</span>
          <span style="font-size:11px;color:var(--text-muted)">(${s.upcoming} upcoming)</span>
        </div>`;
      });
      html += `</div>`;
    }

    // By month
    if (d.events_by_month.length > 0) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">Events by Month</div>`;
      const maxM = Math.max(...d.events_by_month.map(m => m.count));
      d.events_by_month.forEach(m => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;min-width:70px;color:var(--text-secondary)">${m.label}</span>
          <div style="flex:1">${bar(m.count, maxM, "#0D9488")}</div>
        </div>`;
      });
      html += `</div>`;
    }

    // ── Entities by County ──
    html += `<div class="section-header">Entities by County <span style="font-size:12px;font-weight:400;color:var(--text-muted)">(${d.total_entities} total)</span></div>`;
    if (d.by_county.length > 0) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">`;
      const maxC = Math.max(...d.by_county.map(c => c.total));
      d.by_county.forEach(c => {
        const hotDots = c.hot > 0 ? `<span style="color:#DC2626;font-size:10px;font-weight:700">${c.hot} hot</span>` : "";
        const warmDots = c.warm > 0 ? `<span style="color:#EAB308;font-size:10px;font-weight:700">${c.warm} warm</span>` : "";
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;min-width:100px;color:var(--text-secondary)">${c.county}</span>
          <div style="flex:1">${bar(c.total, maxC, "#475569")}</div>
          <div style="display:flex;gap:6px;min-width:80px">${hotDots}${warmDots}</div>
        </div>`;
      });
      html += `</div>`;
    }

    // ── Activity (last 30 days) ──
    if (d.interactions_by_type.length > 0) {
      html += `<div class="section-header">Activity (Last 30 Days)</div>`;
      html += `<div class="card" style="padding:14px;margin-bottom:12px">`;
      const maxI = Math.max(...d.interactions_by_type.map(i => i.count));
      d.interactions_by_type.forEach(i => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;min-width:80px;color:var(--text-secondary)">${i.type}</span>
          <div style="flex:1">${bar(i.count, maxI, "#B45309")}</div>
        </div>`;
      });
      html += `</div>`;
    }

    el.innerHTML = html;

  } catch (err) {
    el.innerHTML = `<div class="empty">Failed to load reports: ${err.message}</div>`;
  }
}
