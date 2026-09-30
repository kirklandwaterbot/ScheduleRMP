import { extractProfessorNames, normalizeForLookup } from "./name-parser.js";

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  hideUnrated: false,
  calendarExport: true,
  cacheHours: 12,
});
const PROFESSOR_SELECTOR = [
  'div.rightnclear[title="Instructor(s)"]',
  '[title="Instructor(s)"]',
  '[data-title="Instructor(s)"]',
].join(",");
let settings = { ...DEFAULT_SETTINGS };
let generation = 0;
let scanTimer;
let scanning = false;
let rescanRequested = false;

function findSchool(element) {
  let node = element;
  while (node && node !== document.body) {
    const schoolElement = node.querySelector?.('div[title^="College:"]');
    if (schoolElement) {
      return schoolElement.getAttribute("title").split(":").slice(1).join(":").trim();
    }
    node = node.parentElement;
  }

  const pageSchool = document.querySelector('div[title^="College:"]')?.getAttribute("title")
    ?.split(":").slice(1).join(":").trim();
  return pageSchool
    || document.querySelector('meta[name="school-name"]')?.getAttribute("content")?.trim()
    || document.querySelector("[data-school-name]")?.getAttribute("data-school-name")?.trim()
    || "NA";
}

function getInstructorText(element) {
  const copy = element.cloneNode(true);
  copy.querySelectorAll(".rmp-rating-container, .rmp-rating").forEach((node) => node.remove());
  copy.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  return copy.textContent || "";
}

function collectTargets() {
  const seen = new Set();
  const targets = [];
  for (const element of document.querySelectorAll(PROFESSOR_SELECTOR)) {
    if (seen.has(element)) continue;
    seen.add(element);
    const names = extractProfessorNames(getInstructorText(element));
    if (!names.length) continue;
    const schoolName = findSchool(element);
    const signature = `${schoolName}::${names.map(normalizeForLookup).join("|")}`;
    if (
      element.dataset.rmpSignature === signature
      && element.querySelector(".rmp-rating-container")
    ) continue;
    element.dataset.rmpSignature = signature;
    targets.push({ element, names, schoolName });
  }
  return targets;
}

function ensureContainer(element) {
  let container = element.querySelector(":scope > .rmp-rating-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "rmp-rating-container";
    element.append(container);
  }
  return container;
}

function renderLoading(target) {
  const container = ensureContainer(target.element);
  container.hidden = false;
  container.replaceChildren();
  for (const name of target.names) {
    const row = document.createElement("div");
    row.className = "rmp-rating-row rmp-rating-row--loading";
    row.setAttribute("role", "status");
    row.setAttribute("aria-live", "polite");
    row.textContent = `Loading Rate My Professors data for ${name}…`;
    container.append(row);
  }
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

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number.toFixed(1) : "N/A";
}

function getRatingClass(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return "rmp-rating-pill--unknown";
  if (rating >= 4) return "rmp-rating-pill--high";
  if (rating >= 3) return "rmp-rating-pill--medium";
  return "rmp-rating-pill--low";
}

function appendMeta(summary, text) {
  const meta = document.createElement("span");
  meta.className = "rmp-rating-meta";
  meta.textContent = text;
  summary.append(meta);
}

function buildRatingRow(name, result, retry) {
  if (result?.status === "not_found" && settings.hideUnrated) return null;

  const row = document.createElement("article");
  row.className = "rmp-rating-row";
  const heading = document.createElement("strong");
  heading.className = "rmp-rating-name";
  heading.textContent = name;
  row.append(heading);

  if (result?.status === "ok") {
    const summary = document.createElement("div");
    summary.className = "rmp-rating-summary";
    const rating = document.createElement("span");
    rating.className = `rmp-rating-pill ${getRatingClass(result.rating)}`;
    rating.textContent = `★ ${formatNumber(result.rating)}`;
    summary.append(rating);
    appendMeta(summary, `Difficulty ${formatNumber(result.difficulty)}`);
    const reviews = Number(result.numRatings) || 0;
    appendMeta(summary, `${reviews} review${reviews === 1 ? "" : "s"}`);
    if (Number.isFinite(Number(result.wouldTakeAgain)) && Number(result.wouldTakeAgain) >= 0) {
      appendMeta(summary, `${Math.round(Number(result.wouldTakeAgain))}% take again`);
    }
    row.append(summary);

    if (result.tags?.length) {
      const tags = document.createElement("div");
      tags.className = "rmp-tag-list";
      tags.setAttribute("aria-label", "Top student tags");
      for (const tag of result.tags) {
        const chip = document.createElement("span");
        chip.className = "rmp-tag-chip";
        chip.textContent = `${tag.name} (${tag.count})`;
        tags.append(chip);
      }
      row.append(tags);
    }

    const linkUrl = safeRmpUrl(result.link);
    if (linkUrl) {
      const link = document.createElement("a");
      link.className = "rmp-rating-link";
      link.href = linkUrl.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View RMP profile";
      link.setAttribute("aria-label", `View ${result.formattedName || name} on Rate My Professors`);
      row.append(link);
    }
    return row;
  }

  const state = document.createElement("span");
  state.className = `rmp-rating-state${result?.status === "error" ? " rmp-rating-state--error" : ""}`;
  state.textContent = result?.status === "error"
    ? "Rate My Professors is unavailable."
    : result?.reason === "school"
      ? "CUNY college not found on Rate My Professors."
      : "Professor not found or not rated yet.";
  row.append(state);

  if (result?.status === "error") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rmp-rating-retry";
    button.textContent = "Retry";
    button.addEventListener("click", retry, { once: true });
    row.append(button);
  }
  return row;
}

function renderTarget(target, results) {
  const container = ensureContainer(target.element);
  container.hidden = false;
  container.replaceChildren();
  const retry = () => {
    container.remove();
    delete target.element.dataset.rmpSignature;
    scheduleScan(0);
  };
  for (const name of target.names) {
    const row = buildRatingRow(name, results?.[name] || {
      status: "error",
      message: "No response was returned.",
    }, retry);
    if (row) container.append(row);
  }
  if (!container.childElementCount) container.hidden = true;
}

async function runScan() {
  if (!settings.enabled) return;
  if (scanning) {
    rescanRequested = true;
    return;
  }
  scanning = true;
  const currentGeneration = generation;
  try {
    const targets = collectTargets();
    if (!targets.length) return;
    targets.forEach(renderLoading);
    const grouped = Map.groupBy(targets, (target) => target.schoolName);

    await Promise.all([...grouped.entries()].map(async ([schoolName, schoolTargets]) => {
      const names = [...new Set(schoolTargets.flatMap((target) => target.names))];
      let response;
      try {
        response = await browser.runtime.sendMessage({
          action: "getProfessorRatings",
          data: { professorNames: names, schoolName },
        });
      } catch (error) {
        response = {
          results: Object.fromEntries(names.map((name) => [name, {
            status: "error",
            message: error?.message,
          }])),
        };
      }
      if (generation !== currentGeneration || !settings.enabled) return;
      schoolTargets.forEach((target) => renderTarget(target, response?.results));
    }));
  } finally {
    scanning = false;
    if (rescanRequested) {
      rescanRequested = false;
      scheduleScan();
    }
  }
}

function scheduleScan(delay = 200) {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => void runScan(), delay);
}

function removeRatings() {
  document.querySelectorAll(".rmp-rating-container").forEach((container) => container.remove());
  document.querySelectorAll("[data-rmp-signature]")
    .forEach((element) => delete element.dataset.rmpSignature);
}

async function loadSettings() {
  const stored = await browser.storage.local.get("settings");
  settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.settings) return;
  settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
  generation += 1;
  removeRatings();
  if (settings.enabled) scheduleScan(0);
});

async function initialize() {
  await loadSettings();
  if (settings.enabled) scheduleScan(0);
  new MutationObserver(() => scheduleScan()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

void initialize();
