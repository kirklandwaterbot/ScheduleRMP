import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixture = fs.readFileSync(path.join(currentDirectory, "fixtures", "csc-30400.html"), "utf8");
const scriptPaths = [
  "../src/calendar/schedule-parser.js",
  "../src/calendar/ics-generator.js",
  "../src/calendar/calendar-ui.js",
  "../src/calendar/calendar-export.js",
];

test("runs the visible-schedule review and local download flow", async () => {
  const dom = new JSDOM(fixture, {
    pretendToBeVisual: true,
    runScripts: "dangerously",
    url: "https://sb.cunyfirst.cuny.edu/example",
  });
  const { window } = dom;
  let downloadedBlob;
  let downloadClicks = 0;
  window.browser = {
    storage: {
      local: { get: async () => ({ settings: { masterEnabled: true, calendarExport: true } }) },
      onChanged: { addListener: () => {} },
    },
  };
  window.TextEncoder = TextEncoder;
  window.Blob = class FakeBlob {
    constructor(parts, options) { this.parts = parts; this.type = options?.type; }
  };
  window.URL.createObjectURL = (blob) => { downloadedBlob = blob; return "blob:schedulermp-test"; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function click() {
    if (this.download) downloadClicks += 1;
  };

  for (const relativePath of scriptPaths) {
    window.eval(fs.readFileSync(path.join(currentDirectory, relativePath), "utf8"));
  }

  window.CalendarExportController.reconcileExportControl();
  window.document.querySelector(".rmcp-calendar-export-button").click();
  const dialog = window.document.getElementById("rmcp-calendar-review-dialog");
  assert.match(dialog.textContent, /CSC 30400 — Introduction to Theoretical Computer Science/);
  dialog.querySelector(".rmcp-calendar-primary-button").click();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  assert.equal(downloadClicks, 1);
  assert.equal(downloadedBlob.type, "text/calendar;charset=utf-8");
  assert.match(downloadedBlob.parts.join(""), /PRODID:-\/\/ScheduleRMP/);
  dom.window.close();
});

test("does not inject calendar export while ScheduleRMP is turned off", async () => {
  const dom = new JSDOM(fixture, {
    pretendToBeVisual: true,
    runScripts: "dangerously",
    url: "https://sb.cunyfirst.cuny.edu/example",
  });
  const { window } = dom;
  window.browser = {
    storage: {
      local: { get: async () => ({ settings: { masterEnabled: false, calendarExport: true } }) },
      onChanged: { addListener: () => {} },
    },
  };
  for (const relativePath of scriptPaths) {
    window.eval(fs.readFileSync(path.join(currentDirectory, relativePath), "utf8"));
  }
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  window.CalendarExportController.reconcileExportControl();
  assert.equal(window.document.querySelector(".rmcp-calendar-export-button"), null);
  dom.window.close();
});
