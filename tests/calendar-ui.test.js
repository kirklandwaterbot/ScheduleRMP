import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

await import("../src/calendar/calendar-ui.js");
const CalendarUi = globalThis.CalendarUi;
const meeting = {
  courseCode: "CSC 30400",
  courseTitle: "Introduction to Theoretical Computer Science",
  weekdays: ["MO", "WE"],
  startTime: "12:30",
  endTime: "13:45",
  startDate: "2026-08-28",
  endDate: "2026-12-21",
  location: "Shepard Hall Rm S-376",
};
const createDocument = () => new JSDOM(
  '<!doctype html><body><main><div class="legend_table">Schedule</div></main></body>',
  { pretendToBeVisual: true },
).window.document;

test("reuses one export control", () => {
  const document = createDocument();
  const anchor = document.querySelector(".legend_table");
  const first = CalendarUi.ensureExportControl(anchor, () => {});
  const second = CalendarUi.ensureExportControl(anchor, () => {});
  assert.equal(first, second);
  assert.equal(document.querySelectorAll("#rmcp-calendar-export-control").length, 1);
});

test("renders meetings, warnings, import help, and duplicate guidance", () => {
  const document = createDocument();
  const review = CalendarUi.openReview({
    meetings: [meeting],
    skipped: [{ message: "Async Seminar has no fixed time and was skipped." }],
    warnings: [],
    errors: [],
  }, { document, summaryBuilder: () => "CSC 30400 — Introduction to Theoretical Computer Science" });
  assert.equal(review.dialog.getAttribute("role"), "dialog");
  assert.match(review.dialog.textContent, /Mon, Wed · 12:30 PM–1:45 PM/);
  assert.match(review.dialog.textContent, /Import into Google Calendar/);
  assert.match(review.dialog.textContent, /Importing it again may create duplicate events/);
});

test("disables invalid downloads and restores focus on Escape", () => {
  const document = createDocument();
  const trigger = document.createElement("button");
  document.body.prepend(trigger);
  trigger.focus();
  const review = CalendarUi.openReview({
    meetings: [],
    skipped: [],
    warnings: [],
    errors: [{ message: "No readable meetings were found." }],
  }, { document });
  assert.equal(review.downloadButton.disabled, true);
  document.dispatchEvent(new document.defaultView.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(document.getElementById("rmcp-calendar-review-dialog"), null);
  assert.equal(document.activeElement, trigger);
});

test("reports a successful download without duplicating help", async () => {
  const document = createDocument();
  const review = CalendarUi.openReview({
    meetings: [meeting], skipped: [], warnings: [], errors: [],
  }, {
    document,
    onDownload: async () => ({ fileName: "2026-fall-term-schedule.ics" }),
  });
  review.downloadButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(review.dialog.textContent, /2026-fall-term-schedule\.ics downloaded/);
  assert.equal(review.dialog.querySelectorAll(".rmcp-calendar-import-help").length, 1);
});
