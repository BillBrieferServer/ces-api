import { api, formatDate, navigate, showToast } from "../app.js";

let _marked = null;
async function getMarked() {
  if (_marked) return _marked;
  await import("../lib/marked.min.js");
  _marked = window.marked;
  if (_marked && _marked.setOptions) {
    _marked.setOptions({ breaks: true, gfm: true });
  }
  return _marked;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMd(text) {
  if (!text) return "<em style='color:var(--text-dim)'>(empty)</em>";
  if (_marked) return _marked.parse(text);
  return escapeHtml(text).replace(/\n/g, "<br>");
}

const TYPE_LABEL = { entity: "Entity", official: "Official", vendor: "Vendor", event: "Event" };
const TYPE_COLOR = { entity: "#3b82f6", official: "#10b981", vendor: "#f59e0b", event: "#a855f7" };

const RM_LIST = [
  { email: "sbrown@ces.org", name: "Steve" },
  { email: "devans@ces.org", name: "Drew" },
];
function rmName(email) {
  const r = RM_LIST.find(x => x.email === email);
  return r ? r.name : email;
}

let _currentUser = null;
async function getCurrentUser() {
  if (_currentUser) return _currentUser;
  try {
    _currentUser = await api("/me");
  } catch (err) {
    _currentUser = { email: "" };
  }
  return _currentUser;
}


export async function renderNotes(el, params = {}) {
  await getMarked();
  const me = await getCurrentUser();

  let notes = [];
  let editing = null;
  let q = "";
  let followUpsOnly = false;
  let filterTarget = null;
  if (params.target_type && params.target_id) {
    filterTarget = {
      target_type: params.target_type,
      target_id: params.target_id,
      target_name: params.target_name || "",
    };
  }
  let prefillLink = params.prefillLink || null;

  async function loadList() {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (followUpsOnly) qs.set("follow_ups_only", "true");
    if (filterTarget) {
      qs.set("target_type", filterTarget.target_type);
      qs.set("target_id", String(filterTarget.target_id));
    }
    const url = qs.toString() ? "/notes?" + qs.toString() : "/notes";
    notes = await api(url);
  }

  async function openEditor(noteId) {
    if (noteId) {
      editing = await api("/notes/" + noteId);
    } else {
      editing = {
        note_id: null,
        title: "",
        body: "",
        follow_up_date: null,
        follow_up_done: false,
        links: prefillLink ? [prefillLink] : [],
        owner_email: me.email,
        shared_with: [],
      };
    }
    editing._preview = false;
    render();
  }


  async function saveNote() {
    const titleEl = document.getElementById("note-title");
    const bodyEl = document.getElementById("note-body");
    const fudEl = document.getElementById("note-fud");
    const shareEl = document.getElementById("note-share");
    let shared_with = editing.shared_with || [];
    if (shareEl) {
      const v = shareEl.value;
      if (v === "private") shared_with = [];
      else if (v === "both") shared_with = RM_LIST.map(r => r.email);
      else shared_with = [v];
    }
    const payload = {
      title: titleEl.value.trim() || null,
      body: bodyEl ? bodyEl.value : editing.body,
      follow_up_date: fudEl.value || null,
      links: editing.links.map(l => ({ target_type: l.target_type, target_id: l.target_id })),
      shared_with: shared_with,
    };
    try {
      if (editing.note_id) {
        await api("/notes/" + editing.note_id, { method: "PUT", body: payload });
        showToast("Saved");
      } else {
        await api("/notes", { method: "POST", body: payload });
        showToast("Created");
      }
      editing = null;
      await loadList();
      render();
    } catch (err) {
      showToast("Save failed");
    }
  }

  async function appendNote() {
    if (!editing.note_id) return;
    const ta = document.getElementById("note-append-text");
    const txt = (ta.value || "").trim();
    if (!txt) return;
    try {
      editing = await api("/notes/" + editing.note_id + "/append", { method: "POST", body: { text: txt } });
      editing._preview = false;
      editing._appendOpen = false;
      showToast("Appended");
      render();
    } catch (err) {
      showToast("Append failed");
    }
  }

  async function deleteNote() {
    if (!editing.note_id) { editing = null; render(); return; }
    if (!confirm("Delete this note?")) return;
    try {
      await api("/notes/" + editing.note_id, { method: "DELETE" });
      showToast("Deleted");
      editing = null;
      await loadList();
      render();
    } catch (err) {
      showToast("Delete failed");
    }
  }

  async function searchTargets(query) {
    if (!query || query.length < 2) return [];
    try {
      const res = await api("/search?q=" + encodeURIComponent(query));
      const out = [];
      (res.jurisdictions || []).slice(0, 8).forEach(j => out.push({ target_type: "entity", target_id: j.jurisdiction_id, target_name: j.name, sub: j.type }));
      (res.officials || []).slice(0, 8).forEach(o => out.push({ target_type: "official", target_id: o.official_id, target_name: o.name, sub: o.title || "" }));
      (res.vendors || []).slice(0, 8).forEach(v => out.push({ target_type: "vendor", target_id: v.vendor_id, target_name: v.vendor_name, sub: "vendor" }));
      return out;
    } catch (err) {
      return [];
    }
  }

  function chipHtml(link) {
    const color = TYPE_COLOR[link.target_type] || "#6b7280";
    const name = link.target_name || link.target_id;
    return '<span class="note-chip" style="background:' + color + '22;color:' + color + ';border:1px solid ' + color + '55;padding:2px 8px;border-radius:12px;font-size:11px;display:inline-block;margin:2px">' + TYPE_LABEL[link.target_type] + ": " + escapeHtml(String(name)) + '</span>';
  }


  function renderListView() {
    let html = '';
    html += '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap">';
    html += '<input type="text" id="notes-q" class="form-input" placeholder="Search notes..." value="' + escapeHtml(q) + '" style="flex:1;min-width:180px;padding:8px">';
    html += '<button class="btn btn-primary" id="notes-new">+ New Note</button>';
    html += '</div>';

    html += '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap">';
    html += '<label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="notes-fu"' + (followUpsOnly ? ' checked' : '') + '> Follow-ups only</label>';
    if (filterTarget) {
      html += '<span class="note-chip" style="background:#3b82f622;color:#3b82f6;border:1px solid #3b82f655;padding:4px 10px;border-radius:14px;font-size:12px">Filter: ' + escapeHtml(filterTarget.target_name) + ' <a href="#" id="notes-clearfilter" style="margin-left:6px;color:inherit;text-decoration:none">x</a></span>';
    }
    html += '</div>';

    if (notes.length === 0) {
      html += '<div style="padding:40px;text-align:center;color:var(--text-dim)">No notes yet.</div>';
    } else {
      html += '<div class="notes-list">';
      for (const n of notes) {
        let fu = '';
        if (n.follow_up_date) {
          const color = n.follow_up_done ? 'var(--text-dim)' : '#dc2626';
          const icon = n.follow_up_done ? 'Done' : 'Due';
          fu = '<div style="font-size:11px;color:' + color + ';margin-top:4px">' + icon + ': ' + formatDate(n.follow_up_date) + '</div>';
        }
        html += '<div class="note-card" data-id="' + n.note_id + '" style="background:var(--bg-card);border:1px solid rgba(255,255,255,0.28);border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer">';
        html += '<div style="display:flex;justify-content:space-between;align-items:start;gap:8px">';
        html += '<div style="flex:1;min-width:0">';
        html += '<div style="font-weight:600;font-size:14px;margin-bottom:4px">' + escapeHtml(n.title || 'Untitled') + '</div>';
        if (n.owner_email && n.owner_email !== me.email) {
          html += '<div style="font-size:10px;color:var(--accent);margin-bottom:4px">Shared by ' + rmName(n.owner_email) + '</div>';
        } else if (n.shared_with && n.shared_with.length > 0) {
          const others = n.shared_with.filter(em => em !== me.email).map(rmName).join(', ');
          if (others) html += '<div style="font-size:10px;color:var(--text-dim);margin-bottom:4px">Shared with ' + others + '</div>';
        }
        html += '<div style="font-size:12px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(n.snippet) + '</div>';
        html += '<div style="margin-top:6px">' + (n.links || []).map(chipHtml).join('') + '</div>';
        html += fu;
        html += '</div>';
        html += '<div style="font-size:10px;color:var(--text-dim);white-space:nowrap">' + formatDate(n.updated_at) + '</div>';
        html += '</div></div>';
      }
      html += '</div>';
    }
    el.innerHTML = html;

    document.getElementById("notes-new").addEventListener("click", () => openEditor(null));
    const qInput = document.getElementById("notes-q");
    let qTimer;
    qInput.addEventListener("input", (e) => {
      clearTimeout(qTimer);
      qTimer = setTimeout(async () => {
        q = e.target.value;
        await loadList();
        render();
        const newQInput = document.getElementById("notes-q");
        if (newQInput) { newQInput.focus(); newQInput.setSelectionRange(q.length, q.length); }
      }, 250);
    });
    document.getElementById("notes-fu").addEventListener("change", async (e) => {
      followUpsOnly = e.target.checked;
      await loadList();
      render();
    });
    const cf = document.getElementById("notes-clearfilter");
    if (cf) cf.addEventListener("click", async (e) => {
      e.preventDefault();
      filterTarget = null;
      await loadList();
      render();
    });
    document.querySelectorAll(".note-card").forEach(card => {
      card.addEventListener("click", () => openEditor(parseInt(card.dataset.id)));
    });
  }


  function renderEditorView() {
    const e = editing;
    const isNew = !e.note_id;
    const canEdit = isNew || e.owner_email === me.email;
    let html = '';

    html += '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">';
    html += '<button class="btn" id="note-back">&larr; Back</button>';
    html += '<div style="flex:1"></div>';
    html += '<button class="btn" id="note-preview-toggle">' + (e._preview ? 'Edit' : 'Preview') + '</button>';
    if (!isNew) html += '<button class="btn btn-primary" id="note-append-toggle">+ Append</button>';
    if (!isNew && canEdit) html += '<button class="btn" id="note-delete" style="color:#dc2626">Delete</button>';
    if (canEdit) html += '<button class="btn btn-primary" id="note-save">Save</button>';
    html += '</div>';

    if (e._appendOpen) {
      html += '<div style="background:var(--bg-card);border:1px solid var(--accent);border-radius:6px;padding:12px;margin-bottom:12px">';
      html += '<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px;font-weight:600">APPEND ENTRY</div>';
      html += '<textarea id="note-append-text" class="form-input" placeholder="Add an update (will be timestamped)..." style="width:100%;min-height:80px;padding:10px;font-size:13px;background:var(--bg-card);border:1px solid rgba(255,255,255,0.28);border-radius:6px"></textarea>';
      html += '<div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end">';
      html += '<button class="btn" id="note-append-cancel">Cancel</button>';
      html += '<button class="btn btn-primary" id="note-append-submit">Add Entry</button>';
      html += '</div></div>';
    }

    html += '<input type="text" id="note-title" class="form-input" placeholder="Title (optional)" value="' + escapeHtml(e.title || '') + '"' + (canEdit ? '' : ' readonly') + ' style="width:100%;padding:10px;font-size:16px;font-weight:600;margin-bottom:8px;background:var(--bg-card);border:1px solid rgba(255,255,255,0.28);border-radius:6px">';

    html += '<div id="note-body-wrap" style="margin-bottom:12px">';
    if (e._preview) {
      html += '<div class="note-preview" style="min-height:240px;padding:12px;background:var(--bg-card);border:1px solid rgba(255,255,255,0.28);border-radius:6px">' + renderMd(e.body) + '</div>';
    } else {
      html += '<textarea id="note-body" class="form-input" placeholder="Write your note in Markdown..."' + (canEdit ? '' : ' readonly') + ' style="width:100%;min-height:240px;padding:10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;background:var(--bg-card);border:1px solid rgba(255,255,255,0.28);border-radius:6px">' + escapeHtml(e.body || '') + '</textarea>';
    }
    html += '</div>';

    html += '<div style="background:var(--bg-card);border:1px solid rgba(255,255,255,0.28);border-radius:6px;padding:12px;margin-bottom:12px">';
    html += '<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px;font-weight:600">FOLLOW-UP</div>';
    html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
    html += '<input type="date" id="note-fud" class="form-input" value="' + (e.follow_up_date || '') + '" style="padding:6px 8px">';
    if (e.follow_up_date && !isNew) {
      html += '<label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="note-fud-done"' + (e.follow_up_done ? ' checked' : '') + '> Done</label>';
    }
    html += '<span style="font-size:11px;color:var(--text-dim)">Setting a date adds it to My Schedule.</span>';
    html += '</div></div>';

    // Visibility dropdown
    {
      let curVal = 'private';
      const sw = e.shared_with || [];
      if (sw.length >= 2) curVal = 'both';
      else if (sw.length === 1) curVal = sw[0];
      html += '<div style="background:var(--bg-card);border:1px solid rgba(255,255,255,0.28);border-radius:6px;padding:12px;margin-bottom:12px">';
      html += '<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px;font-weight:600">VISIBILITY</div>';
      html += '<select id="note-share" class="form-select" style="padding:6px 8px"' + (canEdit ? '' : ' disabled') + '>';
      html += '<option value="private"' + (curVal === 'private' ? ' selected' : '') + '>Just me</option>';
      RM_LIST.forEach(r => {
        html += '<option value="' + r.email + '"' + (curVal === r.email ? ' selected' : '') + '>' + r.name + '</option>';
      });
      html += '<option value="both"' + (curVal === 'both' ? ' selected' : '') + '>Both</option>';
      html += '</select>';
      if (!canEdit) html += '<span style="font-size:11px;color:var(--text-dim);margin-left:8px">Shared by ' + rmName(e.owner_email) + ' (read-only)</span>';
      html += '</div>';
    }

    html += '<div style="background:var(--bg-card);border:1px solid rgba(255,255,255,0.28);border-radius:6px;padding:12px">';
    html += '<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px;font-weight:600">LINKED TO</div>';
    html += '<div id="note-links">';
    e.links.forEach((l, i) => {
      const color = TYPE_COLOR[l.target_type];
      const name = l.target_name || l.target_id;
      html += '<span class="note-chip" style="background:' + color + '22;color:' + color + ';border:1px solid ' + color + '55;padding:4px 10px;border-radius:14px;font-size:12px;display:inline-block;margin:3px">' + TYPE_LABEL[l.target_type] + ': ' + escapeHtml(String(name)) + ' <a href="#" data-rm="' + i + '" style="color:inherit;text-decoration:none;font-weight:bold;margin-left:4px">x</a></span>';
    });
    html += '</div>';
    html += '<div style="margin-top:8px;position:relative">';
    html += '<input type="text" id="note-link-search" class="form-input" placeholder="Search to link an entity, official, or vendor..." style="width:100%;padding:6px 8px;font-size:13px">';
    html += '<div id="note-link-results" style="position:absolute;top:100%;left:0;right:0;background:var(--bg-card);border:1px solid rgba(255,255,255,0.28);border-radius:6px;max-height:240px;overflow-y:auto;z-index:10;display:none;margin-top:2px"></div>';
    html += '</div></div>';
    html += '<div style="height:300px"></div>';

    el.innerHTML = html;

    document.getElementById("note-back").addEventListener("click", async () => {
      editing = null;
      await loadList();
      render();
    });
    document.getElementById("note-preview-toggle").addEventListener("click", () => {
      const bEl = document.getElementById("note-body");
      if (bEl) e.body = bEl.value;
      const tEl = document.getElementById("note-title");
      if (tEl) e.title = tEl.value;
      e._preview = !e._preview;
      render();
    });
    const saveBtn = document.getElementById("note-save");
    if (saveBtn) saveBtn.addEventListener("click", saveNote);
    const appendToggleBtn = document.getElementById("note-append-toggle");
    if (appendToggleBtn) appendToggleBtn.addEventListener("click", () => {
      e._appendOpen = !e._appendOpen;
      render();
      if (e._appendOpen) {
        const ta = document.getElementById("note-append-text");
        if (ta) ta.focus();
      }
    });
    const appendSubmitBtn = document.getElementById("note-append-submit");
    if (appendSubmitBtn) appendSubmitBtn.addEventListener("click", appendNote);
    const appendCancelBtn = document.getElementById("note-append-cancel");
    if (appendCancelBtn) appendCancelBtn.addEventListener("click", () => {
      e._appendOpen = false;
      render();
    });
    const delBtn = document.getElementById("note-delete");
    if (delBtn) delBtn.addEventListener("click", deleteNote);
    const fudDone = document.getElementById("note-fud-done");
    if (fudDone) fudDone.addEventListener("change", (ev) => {
      e.follow_up_done = ev.target.checked;
    });

    document.querySelectorAll("#note-links a[data-rm]").forEach(a => {
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const idx = parseInt(a.dataset.rm);
        e.links.splice(idx, 1);
        const bEl = document.getElementById("note-body");
        if (bEl) e.body = bEl.value;
        const tEl = document.getElementById("note-title");
        if (tEl) e.title = tEl.value;
        render();
      });
    });

    const searchInput = document.getElementById("note-link-search");
    const resultsDiv = document.getElementById("note-link-results");
    let searchTimer;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const val = searchInput.value;
      searchTimer = setTimeout(async () => {
        const results = await searchTargets(val);
        if (results.length === 0) {
          resultsDiv.style.display = "none";
          return;
        }
        let rh = '';
        results.forEach((r, i) => {
          rh += '<div class="link-result" data-i="' + i + '" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.28);font-size:13px">';
          rh += '<span style="display:inline-block;background:' + TYPE_COLOR[r.target_type] + '22;color:' + TYPE_COLOR[r.target_type] + ';padding:1px 6px;border-radius:8px;font-size:10px;margin-right:6px">' + TYPE_LABEL[r.target_type] + '</span>';
          rh += '<strong>' + escapeHtml(r.target_name) + '</strong>';
          if (r.sub) rh += '<span style="color:var(--text-dim);font-size:11px;margin-left:6px">' + escapeHtml(r.sub) + '</span>';
          rh += '</div>';
        });
        resultsDiv.innerHTML = rh;
        resultsDiv.style.display = "block";
        resultsDiv.querySelectorAll(".link-result").forEach(div => {
          div.addEventListener("click", () => {
            const r = results[parseInt(div.dataset.i)];
            if (!e.links.find(l => l.target_type === r.target_type && l.target_id === r.target_id)) {
              e.links.push(r);
            }
            const bEl = document.getElementById("note-body");
            if (bEl) e.body = bEl.value;
            const tEl = document.getElementById("note-title");
            if (tEl) e.title = tEl.value;
            searchInput.value = "";
            resultsDiv.style.display = "none";
            render();
          });
        });
      }, 200);
    });
  }

  function render() {
    if (editing) {
      renderEditorView();
    } else {
      renderListView();
    }
  }

  await loadList();
  if (params.openNew) {
    await openEditor(null);
  } else {
    render();
  }
}
