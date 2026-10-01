import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, "..");

test("master popup switch disables features and persists its state", async () => {
  const html = fs.readFileSync(path.join(projectRoot, "src", "popup.html"), "utf8")
    .replace('<script src="popup.js"></script>', "");
  const script = fs.readFileSync(path.join(projectRoot, "src", "popup.js"), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "moz-extension://test/popup.html" });
  const { window } = dom;
  let savedSettings;
  window.browser = {
    storage: {
      local: {
        get: async () => ({
          settings: {
            masterEnabled: false,
            enabled: true,
            hideUnrated: false,
            calendarExport: true,
            cacheHours: 12,
          },
        }),
        set: async ({ settings }) => { savedSettings = settings; },
      },
    },
    runtime: { sendMessage: async () => ({ status: "ok", entries: 2 }) },
  };
  window.eval(script);
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  const master = window.document.querySelector("#master-enabled");
  const features = window.document.querySelector("#feature-settings");
  assert.equal(master.checked, false);
  assert.equal(features.disabled, true);
  assert.equal(window.document.querySelector("#master-state").textContent, "Off");

  master.checked = true;
  master.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  assert.equal(features.disabled, false);
  assert.equal(savedSettings.masterEnabled, true);
  assert.match(window.document.querySelector("#status").textContent, /turned on/);
  dom.window.close();
});
