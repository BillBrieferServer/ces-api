import { api } from "../app.js";

const STATUS_LABELS = {
  not_contacted: "Not Contacted", contacted: "Contacted", pitched: "Pitched",
  presentation_scheduled: "Presentation", board_approved: "Approved", active_member: "Active"
};
const TYPE_LABELS = {
  entity_visit: "Visit", follow_up: "Follow-up", presentation: "Presentation",
  event: "Event", custom: "Custom"
};
const ENTITY_LABELS = {
  city: "City", county: "County", fire_district: "Fire District",
  school_district: "School District", cemetery_district: "Cemetery District",
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

function fmtType(t) { return ENTITY_LABELS[t] || t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

export async function renderReports(el) {
  let filters = null;
  let reportData = null;
  let selReport = "schedule";
  let selAssignee = "";
  let selPeriod = "all";
  let selEntityType = "";
  let selCounty = "";
  let loading = false;

  async function loadFilters() {
    filters = await api("/reports/filters");
  }

  async function runReport() {
    loading = true;
    draw();
    let url = `/reports/run?report=${selReport}&period=${selPeriod}`;
    if (selAssignee) url += `&assignee=${encodeURIComponent(selAssignee)}`;
    if (selEntityType) url += `&entity_type=${encodeURIComponent(selEntityType)}`;
    if (selCounty) url += `&county=${encodeURIComponent(selCounty)}`;
    reportData = await api(url);
    loading = false;
    draw();
  }

  function renderFilters() {
    if (!filters) return `<div class="spinner"></div>`;
    let html = `<div class="card" style="padding:14px;margin-bottom:16px">`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">`;

    // Report type
    html += `<div style="flex:1;min-width:140px">
      <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Report</label>
      <select id="rpt-type" class="form-select" style="padding:8px;font-size:13px">
        ${filters.report_types.map(r => `<option value="${r.id}" ${r.id === selReport ? 'selected' : ''}>${r.label}</option>`).join("")}
      </select>
    </div>`;

    // Assignee
    html += `<div style="flex:0 0 110px">
      <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Assignee</label>
      <select id="rpt-assignee" class="form-select" style="padding:8px;font-size:13px">
        <option value="">All</option>
        ${filters.assignees.map(a => `<option value="${a}" ${a === selAssignee ? 'selected' : ''}>${a}</option>`).join("")}
      </select>
    </div>`;

    // Time period
    html += `<div style="flex:0 0 130px">
      <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Period</label>
      <select id="rpt-period" class="form-select" style="padding:8px;font-size:13px">
        ${filters.periods.map(p => `<option value="${p.id}" ${p.id === selPeriod ? 'selected' : ''}>${p.label}</option>`).join("")}
      </select>
    </div>`;

    // Entity type
    html += `<div style="flex:1;min-width:140px">
      <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Entity Type</label>
      <select id="rpt-etype" class="form-select" style="padding:8px;font-size:13px">
        <option value="">All</option>
        ${filters.entity_types.map(t => `<option value="${t}" ${t === selEntityType ? 'selected' : ''}>${fmtType(t)}</option>`).join("")}
      </select>
    </div>`;

    // County
    html += `<div style="flex:1;min-width:120px">
      <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">County</label>
      <select id="rpt-county" class="form-select" style="padding:8px;font-size:13px">
        <option value="">All</option>
        ${filters.counties.map(c => `<option value="${c}" ${c === selCounty ? 'selected' : ''}>${c}</option>`).join("")}
      </select>
    </div>`;

    // Run button
    html += `<div style="flex:0 0 auto">
      <button id="rpt-run" class="btn btn-primary" style="padding:8px 20px;font-size:13px;min-height:38px">Run Report</button>
    </div>`;

    html += `</div></div>`;
    return html;
  }

  function renderResults() {
    if (loading) return `<div style="text-align:center;padding:40px"><div class="spinner"></div></div>`;
    if (!reportData) return `<div class="card"><div class="empty" style="font-size:0.85rem">Select a report and click Run Report</div></div>`;
    const d = reportData;
    switch (d.type) {
      case "schedule": return renderScheduleReport(d);
      case "pipeline": return renderPipelineReport(d);
      case "events": return renderEventsReport(d);
      case "entities": return renderEntitiesReport(d);
      case "activity": return renderActivityReport(d);
      default: return `<div class="empty">Unknown report type</div>`;
    }
  }

  function renderScheduleReport(d) {
    const ss = d.stats;
    let html = `<div class="stats-row" style="margin-bottom:12px">
      <div class="stat-card"><div class="stat-value">${ss.total}</div><div class="stat-label">Total</div></div>
      <div class="stat-card"><div class="stat-value">${ss.completed}</div><div class="stat-label">Completed</div></div>
      <div class="stat-card"><div class="stat-value">${ss.pending}</div><div class="stat-label">Pending</div></div>
      <div class="stat-card" style="${ss.overdue > 0 ? 'border:1px solid rgba(220,38,38,0.3)' : ''}"><div class="stat-value" style="${ss.overdue > 0 ? 'color:#DC2626' : ''}">${ss.overdue}</div><div class="stat-label">Overdue</div></div>
    </div>`;
    if (d.by_assignee.length) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">By Assignee</div>`;
      const mx = Math.max(...d.by_assignee.map(a => a.total));
      d.by_assignee.forEach(a => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:12px;min-width:80px;color:var(--text-secondary)">${a.assignee}</span>
          <div style="flex:1">${bar(a.pending, mx, "#3B82F6")}</div>
          <span style="font-size:10px;color:var(--text-muted);min-width:60px">${a.completed} done</span>
        </div>`;
      });
      html += `</div>`;
    }
    if (d.by_type.length) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">By Type</div>`;
      const mx = Math.max(...d.by_type.map(t => t.total));
      d.by_type.forEach(t => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:12px;min-width:80px;color:var(--text-secondary)">${TYPE_LABELS[t.item_type] || t.item_type}</span>
          <div style="flex:1">${bar(t.pending, mx, "#059669")}</div>
          <span style="font-size:10px;color:var(--text-muted);min-width:60px">${t.completed} done</span>
        </div>`;
      });
      html += `</div>`;
    }
    if (d.items.length) {
      html += `<div class="card" style="padding:14px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">Items (${d.items.length})</div>`;
      d.items.forEach(i => {
        const b = TYPE_LABELS[i.item_type] || i.item_type;
        html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:10px;background:rgba(5,150,105,0.2);color:#059669">${b}</span>
          ${i.assigned_to ? `<span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:10px;background:rgba(234,179,8,0.2);color:#EAB308">${i.assigned_to}</span>` : ""}
          <span style="font-size:12px;color:var(--text);flex:1">${i.title}</span>
          ${i.event_location ? `<span style="font-size:11px;color:var(--text-secondary)">${i.event_location}</span>` : ""}
          <span style="font-size:11px;color:var(--text-muted)">${i.item_date}</span>
          ${i.completed ? `<span style="font-size:10px;color:#059669">&#10003;</span>` : ""}
        </div>`;
      });
      html += `</div>`;
    }
    return html;
  }

  function renderPipelineReport(d) {
    let html = `<div class="card" style="padding:14px;margin-bottom:12px">
      <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">By Status</div>`;
    const mx = Math.max(...d.by_status.map(p => p.count));
    d.by_status.forEach(p => {
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:12px;min-width:110px;color:var(--text-secondary)">${STATUS_LABELS[p.status] || p.status}</span>
        <div style="flex:1">${bar(p.count, mx, "#6D28D9")}</div>
      </div>`;
    });
    html += `</div>`;
    if (d.by_priority.length) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">By Priority</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">`;
      d.by_priority.forEach(p => {
        const color = PRI_COLORS[p.priority] || "#475569";
        html += `<div style="display:flex;align-items:center;gap:6px">
          <span style="width:12px;height:12px;border-radius:50%;background:${color}"></span>
          <span style="font-size:13px;color:var(--text)">${p.priority === 'none' ? 'No priority' : p.priority.charAt(0).toUpperCase() + p.priority.slice(1)}</span>
          <span style="font-size:14px;font-weight:700;color:var(--text)">${p.count}</span>
        </div>`;
      });
      html += `</div></div>`;
    }
    if (d.by_entity_type.length) {
      html += `<div class="card" style="padding:14px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">By Entity Type</div>`;
      const mx2 = Math.max(...d.by_entity_type.map(t => t.count));
      d.by_entity_type.forEach(t => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;min-width:120px;color:var(--text-secondary)">${fmtType(t.entity_type)}</span>
          <div style="flex:1">${bar(t.count, mx2, "#0D9488")}</div>
          ${t.prioritized > 0 ? `<span style="font-size:10px;color:#EAB308">${t.prioritized} prioritized</span>` : ""}
        </div>`;
      });
      html += `</div>`;
    }
    return html;
  }

  function renderEventsReport(d) {
    let html = "";
    if (d.by_source.length) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">By Source</div>`;
      d.by_source.forEach(s => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:${s.color}22;color:${s.color};min-width:50px;text-align:center">${s.source}</span>
          <span style="font-size:13px;color:var(--text)">${s.event_count} events</span>
          <span style="font-size:11px;color:var(--text-muted)">(${s.upcoming} upcoming)</span>
        </div>`;
      });
      html += `</div>`;
    }
    if (d.by_month.length) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">By Month</div>`;
      const mx = Math.max(...d.by_month.map(m => m.count));
      d.by_month.forEach(m => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;min-width:70px;color:var(--text-secondary)">${m.label}</span>
          <div style="flex:1">${bar(m.count, mx, "#0D9488")}</div>
        </div>`;
      });
      html += `</div>`;
    }
    if (d.items.length) {
      html += `<div class="card" style="padding:14px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">Events (${d.items.length})</div>`;
      d.items.forEach(e => {
        html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:${e.color}22;color:${e.color}">${e.org_abbrev}</span>
          <span style="font-size:12px;color:var(--text);flex:1">${e.title}</span>
          ${e.location ? `<span style="font-size:11px;color:var(--text-secondary)">${e.location}</span>` : ""}
          <span style="font-size:11px;color:var(--text-muted)">${e.event_date}</span>
          ${e.scheduled ? `<span style="font-size:10px;color:#059669">&#10003;</span>` : ""}
        </div>`;
      });
      html += `</div>`;
    }
    return html;
  }

  function renderEntitiesReport(d) {
    let html = `<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">${d.total} entities total</div>`;
    if (d.by_county.length) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">By County</div>`;
      const mx = Math.max(...d.by_county.map(c => c.total));
      d.by_county.forEach(c => {
        const tags = [
          c.hot > 0 ? `<span style="color:#DC2626;font-size:10px;font-weight:700">${c.hot} hot</span>` : "",
          c.warm > 0 ? `<span style="color:#EAB308;font-size:10px;font-weight:700">${c.warm} warm</span>` : "",
          c.contacted > 0 ? `<span style="color:#059669;font-size:10px">${c.contacted} contacted</span>` : "",
        ].filter(Boolean).join(" ");
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;min-width:100px;color:var(--text-secondary)">${c.county}</span>
          <div style="flex:1">${bar(c.total, mx, "#475569")}</div>
          <div style="display:flex;gap:6px;min-width:120px">${tags}</div>
        </div>`;
      });
      html += `</div>`;
    }
    if (d.by_entity_type.length) {
      html += `<div class="card" style="padding:14px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">By Entity Type</div>`;
      const mx = Math.max(...d.by_entity_type.map(t => t.total));
      d.by_entity_type.forEach(t => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;min-width:120px;color:var(--text-secondary)">${fmtType(t.entity_type)}</span>
          <div style="flex:1">${bar(t.total, mx, "#475569")}</div>
          ${t.prioritized > 0 ? `<span style="font-size:10px;color:#EAB308;min-width:80px">${t.prioritized} prioritized</span>` : `<span style="min-width:80px"></span>`}
        </div>`;
      });
      html += `</div>`;
    }
    return html;
  }

  function renderActivityReport(d) {
    let html = `<div class="stats-row" style="margin-bottom:12px">
      <div class="stat-card"><div class="stat-value">${d.schedule_total}</div><div class="stat-label">Schedule Items</div></div>
      <div class="stat-card"><div class="stat-value">${d.schedule_completed}</div><div class="stat-label">Completed</div></div>
      <div class="stat-card"><div class="stat-value">${d.items.length}</div><div class="stat-label">Interactions</div></div>
    </div>`;
    if (d.by_type.length) {
      html += `<div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">Interactions by Type</div>`;
      const mx = Math.max(...d.by_type.map(t => t.count));
      d.by_type.forEach(t => {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;min-width:80px;color:var(--text-secondary)">${t.type}</span>
          <div style="flex:1">${bar(t.count, mx, "#B45309")}</div>
        </div>`;
      });
      html += `</div>`;
    }
    if (d.items.length) {
      html += `<div class="card" style="padding:14px">
        <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px">Recent Interactions</div>`;
      d.items.forEach(i => {
        html += `<div style="padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:10px;background:rgba(180,83,9,0.2);color:#B45309">${i.type || "other"}</span>
            <span style="font-size:12px;color:var(--text);flex:1">${i.jurisdiction_name || "Unknown"}</span>
            <span style="font-size:11px;color:var(--text-muted)">${i.interaction_date || ""}</span>
          </div>
          ${i.summary ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${i.summary}</div>` : ""}
        </div>`;
      });
      html += `</div>`;
    } else if (!d.by_type.length) {
      html += `<div class="card"><div class="empty" style="font-size:0.85rem">No activity recorded for this period</div></div>`;
    }
    return html;
  }

  function draw() {
    let html = renderFilters();
    html += `<div id="rpt-results">${renderResults()}</div>`;
    el.innerHTML = html;
    bind();
  }

  function bind() {
    const typeEl = el.querySelector("#rpt-type");
    const assignEl = el.querySelector("#rpt-assignee");
    const periodEl = el.querySelector("#rpt-period");
    const etypeEl = el.querySelector("#rpt-etype");
    const countyEl = el.querySelector("#rpt-county");
    const runBtn = el.querySelector("#rpt-run");

    if (typeEl) typeEl.addEventListener("change", () => { selReport = typeEl.value; });
    if (assignEl) assignEl.addEventListener("change", () => { selAssignee = assignEl.value; });
    if (periodEl) periodEl.addEventListener("change", () => { selPeriod = periodEl.value; });
    if (etypeEl) etypeEl.addEventListener("change", () => { selEntityType = etypeEl.value; });
    if (countyEl) countyEl.addEventListener("change", () => { selCounty = countyEl.value; });
    if (runBtn) runBtn.addEventListener("click", () => { runReport(); });
  }

  try {
    await loadFilters();
    draw();
  } catch (err) {
    el.innerHTML = `<div class="empty">Failed to load reports: ${err.message}</div>`;
  }
}
