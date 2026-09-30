import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

await import("../src/calendar/schedule-parser.js");
const ScheduleParser = globalThis.ScheduleParser;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixture = fs.readFileSync(path.join(currentDirectory, "fixtures", "csc-30400.html"), "utf8");
const createDocument = (html = fixture) => new JSDOM(html).window.document;

test("parses the visible selected CUNY course", () => {
  const result = ScheduleParser.parseVisibleSchedule(createDocument());
  assert.equal(result.meetings.length, 1);
  assert.equal(result.meetings[0].courseCode, "CSC 30400");
  assert.equal(result.meetings[0].section, "D2");
  assert.deepEqual(result.meetings[0].weekdays, ["MO", "WE"]);
  assert.equal(result.meetings[0].location, "Shepard Hall Rm S-376");
});

test("ignores hidden schedules and skips untimed classes", () => {
  const hidden = createDocument(fixture.replace(
    "legend_table table computer-only",
    'legend_table table computer-only" style="display:none',
  ));
  assert.equal(ScheduleParser.parseVisibleSchedule(hidden).errors[0].code, "NO_VISIBLE_SCHEDULE");

  const asynchronous = createDocument();
  asynchronous.querySelector('[id="hoursInLegend"]').replaceChildren();
  const result = ScheduleParser.parseVisibleSchedule(asynchronous);
  assert.equal(result.skipped[0].code, "NO_FIXED_TIME");
  assert.equal(result.errors[0].code, "NO_TIMED_MEETINGS");
});

test("warns for optional details and deduplicates exact meetings", () => {
  const missing = createDocument();
  missing.querySelector(".location_block").remove();
  missing.querySelector('[title="Instructor(s)"]').remove();
  assert.deepEqual(
    ScheduleParser.parseVisibleSchedule(missing).warnings.map(({ code }) => code),
    ["MISSING_LOCATION", "MISSING_INSTRUCTOR"],
  );

  const duplicateDocument = createDocument();
  const card = duplicateDocument.querySelector(".course_cell_legend");
  card.after(card.cloneNode(true));
  assert.equal(ScheduleParser.parseVisibleSchedule(duplicateDocument).meetings.length, 1);
});

test("parses noon, midnight, and cross-year ranges", () => {
  assert.equal(ScheduleParser.parseMeetingLine("Tue : 12:00 AM to 1:15 AM").startTime, "00:00");
  assert.equal(ScheduleParser.parseMeetingLine("Thu : 12:00 PM to 1:15 PM").startTime, "12:00");
  assert.deepEqual(ScheduleParser.parseDateRange("Dec 20 - Jan 20", 2026), {
    startDate: "2026-12-20",
    endDate: "2027-01-20",
  });
});
