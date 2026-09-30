import test from "node:test";
import assert from "node:assert/strict";

await import("../src/calendar/ics-generator.js");
const IcsGenerator = globalThis.IcsGenerator;

const lecture = {
  courseCode: "CSC 30400",
  courseTitle: "Introduction to Theoretical Computer Science",
  termName: "2026 Fall Term",
  component: "LEC",
  section: "D2",
  classNumber: "19240",
  instructor: "Tugce Ozdemir",
  campus: "City College",
  instructionMode: "In Person",
  location: "Shepard Hall Rm S-376",
  startDate: "2026-08-28",
  endDate: "2026-12-21",
  weekdays: ["MO", "WE"],
  startTime: "12:30",
  endTime: "13:45",
};

test("generates a recurring Eastern-time ScheduleRMP calendar", () => {
  const calendar = IcsGenerator.generateCalendar([lecture], {
    now: new Date("2026-08-29T15:45:30Z"),
  });
  assert.match(calendar, /PRODID:-\/\/ScheduleRMP\/\/CUNY Schedule Export\/\/EN/);
  assert.match(calendar, /DTSTART;TZID=America\/New_York:20260831T123000/);
  assert.match(calendar, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=33/);
  assert.match(calendar, /LOCATION:Shepard Hall Rm S-376/);
});

test("uses stable UIDs and labels distinct components", () => {
  const first = IcsGenerator.generateCalendar([lecture], { now: new Date("2026-01-01Z") });
  const second = IcsGenerator.generateCalendar([lecture], { now: new Date("2026-02-01Z") });
  assert.equal(first.match(/^UID:(.+)$/m)[1], second.match(/^UID:(.+)$/m)[1]);

  const lab = { ...lecture, component: "LAB", classNumber: "19241", weekdays: ["FR"] };
  const calendar = IcsGenerator.generateCalendar([lecture, lab]);
  assert.match(calendar, /\(LEC\)/);
  assert.match(calendar, /\(LAB\)/);
});

test("escapes text, folds lines, and calculates inclusive occurrences", () => {
  const calendar = IcsGenerator.generateCalendar([{
    ...lecture,
    courseTitle: "Algorithms, Data; and Résumé-Aware Systems with a Very Long Course Name",
  }]);
  const unfolded = calendar.replace(/\r\n[ \t]/g, "");
  assert.match(unfolded, /Algorithms\\, Data\\; and/);
  for (const line of calendar.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  }
  assert.equal(IcsGenerator.countOccurrences("2026-08-28", "2026-12-21", ["MO", "WE"]), 33);
  assert.equal(IcsGenerator.buildFileName([lecture]), "2026-fall-term-schedule.ics");
});
