import { api, navigate, phoneLink, emailLink, showToast, getCsrfToken } from "../app.js";
import { lastFirst, showScheduleModal, renderLinkedNotesSection } from "../shared.js";




export async function renderOfficials(el) {
  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-sm" id="off-import-btn" style="padding:6px 14px;font-size:12px;background:rgba(255,255,255,0.08);color:var(--text);border:1px solid rgba(255,255,255,0.28);border-radius:6px">⬆ Import Officials</button></div>
    <input class="search-bar" type="search" placeholder="Search officials by name..." id="off-search">
    <input class="search-bar" type="search" placeholder="Filter by entity name..." id="off-jurisdiction" style="margin-top:-4px">
    <div class="filter-row">
      <select class="filter-select" id="off-title">
        <option value="">All Titles</option>
        <option value="Mayor">Mayor</option>
        <option value="Clerk">Clerk</option>
        <option value="Councilor">Councilor</option>
        <option value="Commissioner">Commissioner</option>
        <option value="Treasurer">Treasurer</option>
        <option value="Chief">Chief</option>
        <option value="Attorney">Attorney</option>
        <option value="Superintendent">Superintendent</option>
      </select>
    </div>
    <div id="off-list"><div class="empty">Search by name, entity, or select a title</div></div>
  `;

  const listEl = el.querySelector("#off-list");
  const importBtn = el.querySelector("#off-import-btn"); if (importBtn) importBtn.addEventListener("click", () => showImportOfficialsModal(el));

  async function load() {
    const name = el.querySelector("#off-search").value.trim();
    const jurisdiction = el.querySelector("#off-jurisdiction").value.trim();
    const title = el.querySelector("#off-title").value;
    if (!name && !title && !jurisdiction) {
      listEl.innerHTML = `<div class="empty">Search by name, entity, or select a title</div>`;
      return;
    }

    listEl.innerHTML = `<div class="spinner"></div>`;
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (jurisdiction) params.set("jurisdiction", jurisdiction);
    if (title) params.set("title", title);

    const data = await api(`/officials?${params}`);
    if (data.length === 0) {
      listEl.innerHTML = `<div class="empty">No officials found</div>`;
      return;
    }

    listEl.innerHTML = data.map(o => `
      <div class="list-item" style="position:relative">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1;min-width:0" data-goto-jurisdiction="${o.jurisdiction_id || ""}" data-goto-name="${(o.jurisdiction_name || "").replace(/"/g, '&quot;')}">
            <div class="list-item-title">${lastFirst(o.name)}</div>
            <div class="list-item-sub">${o.title || ""} &mdash; ${o.jurisdiction_name || ""}</div>
          </div>
          <button class="btn btn-sm" data-edit-off="${o.official_id}"
            data-off-name="${(o.name || "").replace(/"/g, '&quot;')}"
            data-off-title="${(o.title || "").replace(/"/g, '&quot;')}"
            data-off-phone="${o.phone || ""}"
            data-off-email="${o.email || ""}"
            style="padding:4px 10px;font-size:0.9rem;min-height:32px;background:rgba(255,255,255,0.08);color:var(--text-dim);border:1px solid rgba(255,255,255,0.12);border-radius:6px;margin-left:8px;flex-shrink:0">&#9998;</button>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">
          ${o.phone ? phoneLink(o.phone) : ""}
          ${o.email ? emailLink(o.email) : ""}
        </div>
      </div>
    `).join("");

    // Tap row to go to jurisdiction detail
    listEl.querySelectorAll("[data-goto-jurisdiction]").forEach(row => {
      if (!row.dataset.gotoJurisdiction) return;
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        navigate("jurisdiction-detail", { id: row.dataset.gotoJurisdiction, name: row.dataset.gotoName });
      });
    });

    // Edit buttons
    listEl.querySelectorAll("[data-edit-off]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showEditOfficialModal(btn.dataset.editOff, {
          name: btn.dataset.offName,
          title: btn.dataset.offTitle,
          phone: btn.dataset.offPhone,
          email: btn.dataset.offEmail,
        }, load);
      });
    });
  }

  let debounce;
  el.querySelector("#off-search").addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(load, 300);
  });
  el.querySelector("#off-jurisdiction").addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(load, 300);
  });
  el.querySelector("#off-title").addEventListener("change", load);
}

function showEditOfficialModal(officialId, existing, refreshFn) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Edit Contact</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="off-name" value="${existing.name || ""}" placeholder="Full name">
      </div>
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" id="off-title" value="${existing.title || ""}" placeholder="Mayor, Clerk, Commissioner...">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-input" id="off-phone" type="tel" value="${existing.phone || ""}" placeholder="(208) 555-1234">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="off-email" type="email" value="${existing.email || ""}" placeholder="name@example.com">
      </div>
      <div id="official-linked-notes" style="margin:12px 0"></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-block" id="off-delete" style="background:rgba(220,38,38,0.15);color:#DC2626;border:1px solid #DC2626;flex:1">Delete</button>
        <button class="btn btn-primary btn-block" id="off-submit" style="flex:2">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  renderLinkedNotesSection(overlay.querySelector("#official-linked-notes"), "official", officialId, existing.name);

  overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#off-submit").addEventListener("click", async () => {
    const name = overlay.querySelector("#off-name").value.trim();
    const title = overlay.querySelector("#off-title").value.trim();
    const phone = overlay.querySelector("#off-phone").value.trim();
    const email = overlay.querySelector("#off-email").value.trim();

    if (!name) { showToast("Name is required"); return; }

    const body = {};
    if (name !== existing.name) body.name = name;
    if (title !== existing.title) body.title = title;
    if (phone !== (existing.phone || "")) body.phone = phone || null;
    if (email !== (existing.email || "")) body.email = email || null;

    if (Object.keys(body).length === 0) { overlay.remove(); return; }

    try {
      await api(`/officials/${officialId}`, { method: "PUT", body });
      showToast("Contact updated");
      overlay.remove();
      refreshFn();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });

  // Delete handler
  overlay.querySelector("#off-delete").addEventListener("click", async () => {
    if (!confirm(`Delete ${existing.name}? This cannot be undone.`)) return;
    try {
      await api(`/officials/${officialId}`, { method: "DELETE" });
      overlay.remove();
      showToast("Contact deleted");
      refreshFn();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });
}


export function showImportOfficialsModal(parentEl) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-content" style="max-width:1000px;width:97%;max-height:92vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h2>Import Officials</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div id="oimp-body" style="padding:8px 0;overflow-y:auto;flex:1">
        <p style="color:var(--text-dim);font-size:13px;margin-bottom:12px">Upload a spreadsheet (.csv/.xlsx) or a scanned PDF/image (.pdf/.jpg/.png) of a roster. Vision extraction will pull officials from images/PDFs. You will review every change before committing.</p>
        <input type="file" id="oimp-file" accept=".csv,.xlsx,.txt,.pdf,.jpg,.jpeg,.png" class="form-input" style="padding:8px">
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
          <button class="btn" id="oimp-cancel" style="background:rgba(255,255,255,0.08);color:var(--text);border:1px solid rgba(255,255,255,0.28);border-radius:6px;padding:8px 14px">Cancel</button>
          <button class="btn btn-primary" id="oimp-upload">Upload &amp; Preview</button>
        </div>
      </div>
    </div>`;
  parentEl.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.querySelector("#oimp-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("#oimp-upload").addEventListener("click", async () => {
    const fileInput = overlay.querySelector("#oimp-file");
    const f = fileInput.files[0];
    if (!f) { showToast("Pick a file first"); return; }
    const btn = overlay.querySelector("#oimp-upload");
    btn.disabled = true; btn.textContent = "Uploading...";
    try {
      const fd = new FormData();
      fd.append("file", f);
      const token = await getCsrfToken();
      const res = await fetch("/api/officials/import/preview", {
        method: "POST",
        headers: { "X-CSRF-Token": token },
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const preview = await res.json();
      renderMapping(overlay, preview);
    } catch (e) {
      showToast("Upload failed: " + e.message);
      btn.disabled = false; btn.textContent = "Upload & Preview";
    }
  });
}

function renderMapping(overlay, preview) {
  const { columns, rows, suggested_mapping, field_choices, truncated } = preview;
  const body = overlay.querySelector("#oimp-body");

  const labels = {
    jurisdiction_name: "Jurisdiction / Entity *",
    name: "Official Name *",
    title: "Title / Position *",
    role_type: "Role Type (elected/staff)",
    email: "Email", phone: "Phone", fax: "Fax",
    mailing_address: "Mailing Address", physical_address: "Physical Address",
    source: "Source",
  };

  const optsFor = (field) => {
    const picked = suggested_mapping[field] || "";
    let opts = '<option value="">-- ignore --</option>';
    for (const c of columns) {
      if (!c) continue;
      const safe = c.replace(/"/g, "&quot;");
      opts += '<option value="' + safe + '"' + (c === picked ? " selected" : "") + '>' + c + '</option>';
    }
    return opts;
  };

  let html = '<div style="font-size:13px;color:var(--text-dim);margin-bottom:12px">' + rows.length + ' rows loaded' + (truncated ? " (truncated to 1000)" : "") + '. Map spreadsheet columns. Fields marked * are required.</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-bottom:16px">';
  for (const f of field_choices) {
    html += '<div class="form-group" style="margin:0">' +
      '<label class="form-label" style="font-size:12px">' + labels[f] + '</label>' +
      '<select class="form-select oimp-map" data-field="' + f + '">' + optsFor(f) + '</select>' +
      '</div>';
  }
  html += '</div>';
  html += '<div style="display:flex;gap:8px;justify-content:flex-end">' +
    '<button class="btn" id="oimp-back" style="background:rgba(255,255,255,0.08);color:var(--text);border:1px solid rgba(255,255,255,0.28);border-radius:6px;padding:8px 14px">Cancel</button>' +
    '<button class="btn btn-primary" id="oimp-diff">Review Changes</button>' +
    '</div>';
  body.innerHTML = html;

  body.querySelector("#oimp-back").addEventListener("click", () => overlay.remove());
  body.querySelector("#oimp-diff").addEventListener("click", async () => {
    const mapping = {};
    body.querySelectorAll(".oimp-map").forEach(sel => { if (sel.value) mapping[sel.dataset.field] = sel.value; });
    for (const req of ["jurisdiction_name", "name", "title"]) {
      if (!mapping[req]) { showToast("Map required field: " + labels[req]); return; }
    }
    const btn = body.querySelector("#oimp-diff");
    btn.disabled = true; btn.textContent = "Analyzing...";
    try {
      const result = await api("/officials/import/diff", {
        method: "POST",
        body: { columns, rows, mapping },
      });
      renderDiff(overlay, { columns, rows, mapping }, result);
    } catch (e) {
      showToast("Diff failed: " + e.message);
      btn.disabled = false; btn.textContent = "Review Changes";
    }
  });
}

function statusBadge(status) {
  const styles = {
    NEW: "background:rgba(34,197,94,0.2);color:#22C55E",
    SAME: "background:rgba(255,255,255,0.12);color:var(--text-dim)",
    CHANGED: "background:rgba(234,179,8,0.2);color:#EAB308",
    UNMATCHED: "background:rgba(239,68,68,0.2);color:#EF4444",
    ERROR: "background:rgba(239,68,68,0.35);color:#fca5a5",
  };
  return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;' + (styles[status] || "") + '">' + status + '</span>';
}

function renderDiff(overlay, ctx, result) {
  const { columns, rows, mapping } = ctx;
  const body = overlay.querySelector("#oimp-body");
  const diffRows = result.rows;
  const summary = result.summary || {};

  const decisions = new Map();
  for (const r of diffRows) {
    if (r.status === "NEW") decisions.set(r.row_index, { action: "insert", jurisdiction_id: r.jurisdiction_id });
    else if (r.status === "CHANGED") decisions.set(r.row_index, { action: "replace", jurisdiction_id: r.jurisdiction_id, existing_official_id: r.existing.official_id });
    else if (r.status === "UNMATCHED") decisions.set(r.row_index, { action: "skip" });
    else decisions.set(r.row_index, { action: "skip" });
  }

  const summaryText = ["NEW", "CHANGED", "SAME", "UNMATCHED", "ERROR"]
    .filter(s => summary[s])
    .map(s => summary[s] + " " + s.toLowerCase())
    .join(" · ");

  let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
    '<div style="font-size:13px">' + summaryText + '</div>' +
    '<div style="font-size:11px;color:var(--text-dim)">Uncheck rows to skip them</div>' +
    '</div>';
  html += '<div style="margin-bottom:12px"><label class="form-label" style="font-size:12px">Source tag (optional)</label><input class="form-input" id="oimp-source" placeholder="e.g. Idaho 2026 elected officials roster"></div>';
  html += '<div id="oimp-rows" style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px"></div>';
  html += '<div style="display:flex;gap:8px;justify-content:space-between;position:sticky;bottom:0;background:var(--bg-card);padding-top:10px;border-top:1px solid rgba(255,255,255,0.1)">' +
    '<button class="btn" id="oimp-back2" style="background:rgba(255,255,255,0.08);color:var(--text);border:1px solid rgba(255,255,255,0.28);border-radius:6px;padding:8px 14px">Back</button>' +
    '<button class="btn btn-primary" id="oimp-commit">Commit <span id="oimp-count"></span></button>' +
    '</div>';
  body.innerHTML = html;

  const rowsContainer = body.querySelector("#oimp-rows");
  const countEl = body.querySelector("#oimp-count");

  const refreshCount = () => {
    let ins = 0, rep = 0;
    for (const d of decisions.values()) {
      if (d.action === "insert") ins++;
      else if (d.action === "replace") rep++;
    }
    countEl.textContent = "(" + (ins + rep) + ": " + ins + " new, " + rep + " replacements)";
  };

  const renderRow = (r) => {
    const i = r.row_index;
    const inc = r.incoming || {};
    const decision = decisions.get(i);
    const active = decision && decision.action !== "skip";

    let body_html = "";
    if (r.status === "NEW") {
      body_html = '<div style="font-size:13px"><strong>' + (inc.name || "") + '</strong> — ' + (inc.title || "") + '</div>' +
        '<div style="font-size:11px;color:var(--text-dim)">New record. ' + [inc.email, inc.phone].filter(Boolean).join(" · ") + '</div>';
    } else if (r.status === "SAME") {
      body_html = '<div style="font-size:13px">' + (inc.name || "") + ' — ' + (inc.title || "") + '</div>' +
        '<div style="font-size:11px;color:var(--text-dim)">Already on file, no changes</div>';
    } else if (r.status === "CHANGED") {
      const ex = r.existing || {};
      let diffs = '<div style="display:grid;grid-template-columns:max-content 1fr 1fr;gap:4px 12px;font-size:11px;margin-top:4px;padding:6px 8px;background:rgba(234,179,8,0.08);border-radius:4px">';
      diffs += '<div></div><div style="color:var(--text-dim)">was</div><div style="color:#EAB308">→ new</div>';
      for (const ch of (r.changed_fields || [])) {
        diffs += '<div style="color:var(--text-dim)">' + ch.field + '</div>';
        diffs += '<div style="color:var(--text-dim);text-decoration:line-through">' + (ch.old || "—") + '</div>';
        diffs += '<div style="color:#EAB308">' + (ch.new || "—") + '</div>';
      }
      diffs += '</div>';
      body_html = '<div style="font-size:13px"><strong>' + (inc.title || "") + '</strong>: ' + (ex.name || "?") + ' → ' + (inc.name || "?") + '</div>' + diffs;
    } else if (r.status === "UNMATCHED") {
      const cands = r.jurisdiction_candidates || [];
      let optsJ = '<option value="">-- pick jurisdiction or skip --</option>';
      for (const c of cands) {
        optsJ += '<option value="' + c.jurisdiction_id + '">' + c.name + (c.type ? " (" + c.type + ")" : "") + '</option>';
      }
      body_html = '<div style="font-size:13px"><strong>' + (inc.name || "") + '</strong> — ' + (inc.title || "") + '</div>' +
        '<div style="font-size:11px;color:#EF4444;margin:2px 0">No match for jurisdiction: "' + (inc.jurisdiction_name || "") + '"</div>' +
        '<select class="form-select oimp-jpick" data-ri="' + i + '" style="font-size:12px;padding:4px 6px">' + optsJ + '</select>';
    } else if (r.status === "ERROR") {
      body_html = '<div style="font-size:12px;color:#EF4444">Row ' + (i + 1) + ': ' + (r.error || "error") + '</div>';
    }

    const checked = active ? "checked" : "";
    const disabled = (r.status === "SAME" || r.status === "ERROR") ? "disabled" : "";
    return '<div class="oimp-row" data-ri="' + i + '" style="border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:8px 10px;display:flex;gap:10px;align-items:flex-start">' +
      '<input type="checkbox" class="oimp-cb" data-ri="' + i + '" ' + checked + ' ' + disabled + ' style="margin-top:4px">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">' + statusBadge(r.status) + '<span style="font-size:11px;color:var(--text-dim)">' + (inc.jurisdiction_name || "") + '</span></div>' +
        body_html +
      '</div>' +
    '</div>';
  };

  rowsContainer.innerHTML = diffRows.map(renderRow).join("");
  refreshCount();

  rowsContainer.querySelectorAll(".oimp-cb").forEach(cb => {
    cb.addEventListener("change", () => {
      const ri = parseInt(cb.dataset.ri, 10);
      const r = diffRows.find(x => x.row_index === ri);
      if (!cb.checked) {
        decisions.set(ri, { action: "skip" });
      } else if (r.status === "NEW") {
        decisions.set(ri, { action: "insert", jurisdiction_id: r.jurisdiction_id });
      } else if (r.status === "CHANGED") {
        decisions.set(ri, { action: "replace", jurisdiction_id: r.jurisdiction_id, existing_official_id: r.existing.official_id });
      } else if (r.status === "UNMATCHED") {
        const sel = rowsContainer.querySelector('.oimp-jpick[data-ri="' + ri + '"]');
        const jid = sel && sel.value ? parseInt(sel.value, 10) : null;
        if (jid) decisions.set(ri, { action: "insert", jurisdiction_id: jid });
        else { cb.checked = false; decisions.set(ri, { action: "skip" }); showToast("Pick a jurisdiction first"); }
      }
      refreshCount();
    });
  });

  rowsContainer.querySelectorAll(".oimp-jpick").forEach(sel => {
    sel.addEventListener("change", () => {
      const ri = parseInt(sel.dataset.ri, 10);
      const jid = sel.value ? parseInt(sel.value, 10) : null;
      const cb = rowsContainer.querySelector('.oimp-cb[data-ri="' + ri + '"]');
      if (jid) {
        decisions.set(ri, { action: "insert", jurisdiction_id: jid });
        if (cb) cb.checked = true;
      } else {
        decisions.set(ri, { action: "skip" });
        if (cb) cb.checked = false;
      }
      refreshCount();
    });
  });

  body.querySelector("#oimp-back2").addEventListener("click", () => renderMapping(overlay, {
    columns, rows, suggested_mapping: mapping, field_choices: Object.keys({ jurisdiction_name:1,name:1,title:1,role_type:1,email:1,phone:1,fax:1,mailing_address:1,physical_address:1,source:1 }), truncated: false,
  }));

  body.querySelector("#oimp-commit").addEventListener("click", async () => {
    const decisionList = [];
    for (const [ri, d] of decisions.entries()) {
      decisionList.push({ row_index: ri, ...d });
    }
    const btn = body.querySelector("#oimp-commit");
    btn.disabled = true; btn.textContent = "Committing...";
    try {
      const result = await api("/officials/import/commit", {
        method: "POST",
        body: {
          columns, rows, mapping,
          decisions: decisionList,
          source: body.querySelector("#oimp-source").value.trim() || null,
        },
      });
      const parts = [];
      if (result.inserted) parts.push(result.inserted + " inserted");
      if (result.replaced) parts.push(result.replaced + " replaced");
      if (result.skipped) parts.push(result.skipped + " skipped");
      if (result.errors && result.errors.length) parts.push(result.errors.length + " errors");
      showToast(parts.join(", ") || "Nothing committed");
      overlay.remove();
      navigate("officials");
    } catch (e) {
      showToast("Commit failed: " + e.message);
      btn.disabled = false; btn.textContent = "Commit";
    }
  });
}
