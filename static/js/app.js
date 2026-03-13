import { renderSearch } from "./views/search.js";
import { renderSchedule } from "./views/schedule.js?v=1773384001";
import { renderCalendar } from "./views/calendar.js?v=1773381000";
import { renderBrief } from "./views/brief.js?v=1773378932";
import { renderJurisdictions } from "./views/jurisdictions.js";
import { renderJurisdictionDetail } from "./views/jurisdiction-detail.js?v=1773378207";
import { renderOfficials } from "./views/officials.js";
import { renderVendors } from "./views/vendors.js";
import { renderMap } from "./views/map.js";

const content = document.getElementById("content");
const headerTitle = document.getElementById("header-title");
const backBtn = document.getElementById("back-btn");
const navBtns = document.querySelectorAll(".nav-btn");

let currentView = "search";
let viewStack = [];

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
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
      headerTitle.textContent = "Morning Brief";
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
    case "vendors":
      headerTitle.textContent = "Vendors";
      backBtn.classList.add("hidden");
      renderVendors(content);
      break;
    case "schedule":
      headerTitle.textContent = "My Schedule";
      backBtn.classList.add("hidden");
      renderSchedule(content);
      break;
    case "calendar":
      headerTitle.textContent = "Events Calendar";
      backBtn.classList.add("hidden");
      renderCalendar(content);
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

export function badge(text, prefix = "") {
  if (!text) return "";
  const cls = prefix ? `badge-${text.replace(/ /g, "_")}` : "";
  return `<span class="badge ${cls}">${text.replace(/_/g, " ")}</span>`;
}

export function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
navigate("search", {}, false);
