const DEFAULT_SETTINGS = Object.freeze({ enabled: true, hideUnrated: false, cacheHours: 12 });
let settings = { ...DEFAULT_SETTINGS };
let generation = 0;
const inFlight = new WeakSet();

function findSchool(element) {
  let node = element;
  while (node && node !== document.body) {
    const schoolElement = node.querySelector('div[title^="College:"]');
    if (schoolElement) {
      return schoolElement.getAttribute("title").split(":").slice(1).join(":").trim();
    }
    node = node.parentElement;
  }
  return "NA";
}

function getProfessorName(element) {
  const copy = element.cloneNode(true);
  copy.querySelectorAll(".rmp-rating").forEach((badge) => badge.remove());
  return copy.textContent.replace(/\s+/g, " ").trim();
}

function createBadge() {
  const badge = document.createElement("span");
  badge.className = "rmp-rating rmp-rating--loading";
  badge.setAttribute("role", "status");
  badge.setAttribute("aria-live", "polite");
  badge.textContent = "RMP: Loading…";
  return badge;
}

function safeRmpUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl, "https://www.ratemyprofessors.com");
    return ["ratemyprofessors.com", "www.ratemyprofessors.com"].includes(url.hostname)
      ? url : null;
  } catch {
    return null;
  }
}

function renderRating(badge, response) {
  const rating = Number(response.rating);
  const linkUrl = safeRmpUrl(response.link);
  const label = Number.isFinite(rating) ? rating.toFixed(1) : "Not rated";
  let state = "low";
  let symbol = "▼";
  if (rating >= 4) {
    state = "high";
    symbol = "★";
  } else if (rating >= 3) {
    state = "medium";
    symbol = "●";
  }

  badge.className = `rmp-rating rmp-rating--${state}`;
  badge.replaceChildren();
  const content = linkUrl ? document.createElement("a") : document.createElement("span");
  if (linkUrl) {
    content.href = linkUrl.href;
    content.target = "_blank";
    content.rel = "noopener noreferrer";
  }
  content.textContent = `${symbol} RMP ${label}`;
  content.title = `${response.formattedName || "Professor"}: ${label} from ${response.numRatings || 0} rating(s)`;
  badge.append(content);
}

function renderNotFound(badge) {
  if (settings.hideUnrated) {
    badge.remove();
    return;
  }
  badge.className = "rmp-rating rmp-rating--unrated";
  badge.textContent = "– RMP: Not rated";
}

function renderError(badge, retry) {
  badge.className = "rmp-rating rmp-rating--error";
  badge.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "⚠ RMP unavailable — Retry";
  button.title = "Retry the Rate My Professors lookup";
  button.addEventListener("click", retry, { once: true });
  badge.append(button);
}

async function annotateProfessor(element) {
  if (!settings.enabled || inFlight.has(element)) return;
  if (element.dataset.rmpProcessed === "true") return;
  const professorName = getProfessorName(element);
  if (!professorName || professorName.toLowerCase() === "staff") return;
  if (element.querySelector(".rmp-rating")) return;

  const currentGeneration = generation;
  const badge = createBadge();
  element.dataset.rmpProcessed = "true";
  element.append(badge);
  inFlight.add(element);

  try {
    const response = await browser.runtime.sendMessage({
      action: "getProfessorRating",
      data: { professorName, schoolName: findSchool(element) },
    });
    if (currentGeneration !== generation || !settings.enabled || !badge.isConnected) {
      badge.remove();
      return;
    }
    if (response?.status === "ok") renderRating(badge, response);
    else if (response?.status === "not_found") renderNotFound(badge);
    else renderError(badge, () => retryAnnotation(element, badge));
  } catch {
    if (badge.isConnected) renderError(badge, () => retryAnnotation(element, badge));
  } finally {
    inFlight.delete(element);
    if (currentGeneration !== generation && settings.enabled) annotateProfessor(element);
  }
}

function retryAnnotation(element, badge) {
  badge.remove();
  delete element.dataset.rmpProcessed;
  annotateProfessor(element);
}

function removeBadges() {
  document.querySelectorAll(".rmp-rating").forEach((badge) => badge.remove());
  document.querySelectorAll('[data-rmp-processed="true"]')
    .forEach((element) => delete element.dataset.rmpProcessed);
}

function scan() {
  if (!settings.enabled) return;
  document.querySelectorAll('div[title="Instructor(s)"]')
    .forEach((element) => annotateProfessor(element));
}

async function loadSettings() {
  const stored = await browser.storage.local.get("settings");
  settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.settings) return;
  settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
  generation += 1;
  removeBadges();
  scan();
});

async function initialize() {
  await loadSettings();
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
}

void initialize();
