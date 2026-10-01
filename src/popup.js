const DEFAULT_SETTINGS = Object.freeze({
  masterEnabled: true,
  enabled: true,
  hideUnrated: false,
  calendarExport: true,
  cacheHours: 12,
});
const masterEnabled = document.querySelector("#master-enabled");
const masterState = document.querySelector("#master-state");
const featureSettings = document.querySelector("#feature-settings");
const enabled = document.querySelector("#enabled");
const hideUnrated = document.querySelector("#hide-unrated");
const calendarExport = document.querySelector("#calendar-export");
const cacheHours = document.querySelector("#cache-hours");
const form = document.querySelector("#settings-form");
const clearCache = document.querySelector("#clear-cache");
const cacheCount = document.querySelector("#cache-count");
const status = document.querySelector("#status");
let statusTimer;

function applyMasterState() {
  const isEnabled = masterEnabled.checked;
  featureSettings.disabled = !isEnabled;
  masterState.textContent = isEnabled ? "On" : "Off";
  masterState.classList.toggle("state-badge--off", !isEnabled);
  document.body.classList.toggle("is-disabled", !isEnabled);
}

function showStatus(message) {
  clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = setTimeout(() => { status.textContent = ""; }, 2200);
}

async function updateCacheCount() {
  const response = await browser.runtime.sendMessage({ action: "getCacheStats" });
  const entries = response?.entries || 0;
  cacheCount.textContent = `${entries} cached ${entries === 1 ? "rating" : "ratings"}`;
}

async function loadSettings() {
  const stored = await browser.storage.local.get("settings");
  const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  masterEnabled.checked = settings.masterEnabled;
  enabled.checked = settings.enabled;
  hideUnrated.checked = settings.hideUnrated;
  calendarExport.checked = settings.calendarExport;
  cacheHours.value = String(settings.cacheHours);
  applyMasterState();
}

form.addEventListener("change", async (event) => {
  applyMasterState();
  await browser.storage.local.set({
    settings: {
      masterEnabled: masterEnabled.checked,
      enabled: enabled.checked,
      hideUnrated: hideUnrated.checked,
      calendarExport: calendarExport.checked,
      cacheHours: Number(cacheHours.value),
    },
  });
  showStatus(event.target === masterEnabled
    ? `ScheduleRMP turned ${masterEnabled.checked ? "on" : "off"}`
    : "Settings saved");
});

clearCache.addEventListener("click", async () => {
  clearCache.disabled = true;
  await browser.runtime.sendMessage({ action: "clearCache" });
  await updateCacheCount();
  clearCache.disabled = false;
  showStatus("Cache cleared");
});

void Promise.all([loadSettings(), updateCacheCount()]);
