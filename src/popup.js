const DEFAULT_SETTINGS = Object.freeze({ enabled: true, hideUnrated: false, cacheHours: 12 });
const enabled = document.querySelector("#enabled");
const hideUnrated = document.querySelector("#hide-unrated");
const cacheHours = document.querySelector("#cache-hours");
const form = document.querySelector("#settings-form");
const clearCache = document.querySelector("#clear-cache");
const cacheCount = document.querySelector("#cache-count");
const status = document.querySelector("#status");
let statusTimer;

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
  enabled.checked = settings.enabled;
  hideUnrated.checked = settings.hideUnrated;
  cacheHours.value = String(settings.cacheHours);
}

form.addEventListener("change", async () => {
  await browser.storage.local.set({
    settings: {
      enabled: enabled.checked,
      hideUnrated: hideUnrated.checked,
      cacheHours: Number(cacheHours.value),
    },
  });
  showStatus("Settings saved");
});

clearCache.addEventListener("click", async () => {
  clearCache.disabled = true;
  await browser.runtime.sendMessage({ action: "clearCache" });
  await updateCacheCount();
  clearCache.disabled = false;
  showStatus("Cache cleared");
});

void Promise.all([loadSettings(), updateCacheCount()]);
