import { renderSearch } from "./views/search.js?v=1775583199";
import { renderSchedule } from "./views/schedule.js?v=1775583199";
import { renderReports } from "./views/reports.js?v=1775583199";
import { renderCalendar } from "./views/calendar.js?v=1775583199";
import { renderBrief } from "./views/brief.js?v=1781500000";
import { renderJurisdictions } from "./views/jurisdictions.js?v=1775583199";
import { renderJurisdictionDetail } from "./views/jurisdiction-detail.js?v=1775583199";
import { renderOfficials } from "./views/officials.js?v=1775583199";
import { renderVendors } from "./views/vendors.js?v=1781500000";
import { renderNotes } from "./views/notes.js?v=1775594869";
import { renderMap } from "./views/map.js?v=1776000002";

const content = document.getElementById("content");
const headerTitle = document.getElementById("header-title");
const backBtn = document.getElementById("back-btn");
const navBtns = document.querySelectorAll(".nav-btn");

let currentView = "search";
let viewStack = [];

let _csrfToken = null;

async function getCsrfToken() {
  if (!_csrfToken) {
    const res = await fetch("/api/csrf-token");
    const data = await res.json();
    _csrfToken = data.token;
  }
  return _csrfToken;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function api(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const headers = { "Content-Type": "application/json" };
  if (MUTATING.has(method)) {
    headers["X-CSRF-Token"] = await getCsrfToken();
  }
  const res = await fetch(`/api${path}`, {
    headers,
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 403) {
    // CSRF token may have expired, clear and retry once
    _csrfToken = null;
    if (MUTATING.has(method)) {
      headers["X-CSRF-Token"] = await getCsrfToken();
      const retry = await fetch(`/api${path}`, {
        headers,
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      if (!retry.ok) throw new Error(`API error ${retry.status}`);
      if (retry.status === 204) return null;
      return retry.json();
    }
  }
  if (!res.ok) throw new Error(`API error ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

export function navigate(view, params = {}, pushStack = true) {
  if (pushStack && currentView !== view) {
    viewStack.push({ view: currentView, scroll: window.scrollY });
  }
  currentView = view;
  window.scrollTo(0, 0);
  render(view, params);
}

export function goBack() {
  const prev = viewStack.pop();
  if (prev) {
    currentView = prev.view;
    render(prev.view, {});
    requestAnimationFrame(() => window.scrollTo(0, prev.scroll));
  }
}

function render(view, params) {
  content.innerHTML = "<div class=\"spinner\"></div>";
  const isDetail = view.includes("-detail") || view.includes("-");
  backBtn.classList.toggle("hidden", !isDetail && viewStack.length === 0);

  // Update nav active state
  const baseView = view.split("-")[0];
  navBtns.forEach(b => {
    const bv = b.dataset.view;
    b.classList.toggle("active", bv === baseView || (bv === "jurisdictions" && view.startsWith("jurisdiction")));
  });

  switch (view) {
    case "search":
      headerTitle.textContent = "CES Idaho";
      backBtn.classList.add("hidden");
      renderSearch(content);
      break;
    case "brief":
      headerTitle.textContent = "CES Morning Brief";
      backBtn.classList.add("hidden");
      renderBrief(content);
      break;
    case "jurisdictions":
      headerTitle.textContent = "Entities";
      backBtn.classList.add("hidden");
      renderJurisdictions(content);
      break;
    case "jurisdiction-detail":
      headerTitle.textContent = params.name || "Detail";
      backBtn.classList.remove("hidden");
      renderJurisdictionDetail(content, params.id);
      break;
    case "officials":
      headerTitle.textContent = "Officials";
      backBtn.classList.add("hidden");
      renderOfficials(content);
      break;
    case "notes":
      headerTitle.textContent = "Notes";
      backBtn.classList.add("hidden");
      renderNotes(content, params);
      break;
    case "vendors":
      headerTitle.textContent = "Vendors";
      backBtn.classList.add("hidden");
      renderVendors(content);
      break;
    case "schedule":
      headerTitle.textContent = "My Schedule";
      backBtn.classList.add("hidden");
      renderSchedule(content, params);
      break;
    case "calendar":
      headerTitle.textContent = "Events Calendar";
      backBtn.classList.add("hidden");
      renderCalendar(content);
      break;
    case "reports":
      headerTitle.textContent = "Reports";
      backBtn.classList.add("hidden");
      renderReports(content);
      break;
    case "map":
      headerTitle.textContent = "Map";
      backBtn.classList.add("hidden");
      renderMap(content);
      break;
  }
}

export function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

export function phoneLink(phone) {
  if (!phone) return "";
  return `<a class="contact-link" href="tel:${phone.replace(/[^\d+]/g, "")}">${phone}</a>`;
}

export function emailLink(email) {
  if (!email) return "";
  return `<a class="contact-link" href="mailto:${email}">${email}</a>`;
}

export function badge(text) {
  if (!text) return "";
  return `<span class="badge">${text.replace(/_/g, " ")}</span>`;
}

export function formatDate(d) {
  if (!d) return "";
  if (String(d).includes("T")) d = String(d).split("T")[0];

  const [y,m,dy] = d.split("-").map(Number); return new Date(y, m-1, dy).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Nav button handlers
navBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    viewStack = [];
    navigate(btn.dataset.view, {}, false);
  });
});

backBtn.addEventListener("click", goBack);

// Register service worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Initial render
navigate("brief", {}, false);
