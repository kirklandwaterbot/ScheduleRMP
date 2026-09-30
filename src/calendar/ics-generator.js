(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.IcsGenerator = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const DAY_TO_INDEX = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6
  };

  const TIMEZONE_LINES = [
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "X-LIC-LOCATION:America/New_York",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];

  function generateCalendar(meetings, options = {}) {
    if (!Array.isArray(meetings) || !meetings.length) {
      throw new Error("At least one meeting is required to create a calendar.");
    }

    const generatedAt = options.now instanceof Date ? options.now : new Date();
    const componentCounts = buildComponentCounts(meetings);
    const calendarName = buildCalendarName(meetings);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ScheduleRMP//CUNY Schedule Export//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeText(calendarName)}`,
      "X-WR-TIMEZONE:America/New_York",
      ...TIMEZONE_LINES
    ];

    for (const meeting of meetings) {
      lines.push(...buildEventLines(meeting, meetings, componentCounts, generatedAt));
    }

    lines.push("END:VCALENDAR");
    return `${lines.map(foldLine).join("\r\n")}\r\n`;
  }

  function buildEventLines(meeting, meetings, componentCounts, generatedAt) {
    const firstOccurrence = findFirstOccurrence(meeting.startDate, meeting.endDate, meeting.weekdays);
    const occurrenceCount = countOccurrences(meeting.startDate, meeting.endDate, meeting.weekdays);

    if (!firstOccurrence || occurrenceCount < 1) {
      throw new Error(`Meeting ${meeting.courseCode || meeting.courseTitle || "event"} has no recurrence dates.`);
    }

    const summary = buildEventSummary(meeting, meetings, componentCounts);
    const description = buildDescription(meeting);
    const uid = buildUid(meeting);
    const startDateTime = formatLocalDateTime(firstOccurrence, meeting.startTime);
    const endDateTime = formatLocalDateTime(firstOccurrence, meeting.endTime);
    const lines = [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${formatUtcDateTime(generatedAt)}`,
      `DTSTART;TZID=America/New_York:${startDateTime}`,
      `DTEND;TZID=America/New_York:${endDateTime}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${meeting.weekdays.join(",")};COUNT=${occurrenceCount}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `LOCATION:${escapeText(meeting.location || "")}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "SEQUENCE:0",
      "END:VEVENT"
    ];

    return lines;
  }

  function buildEventSummary(meeting, meetings = [meeting], componentCounts = buildComponentCounts(meetings)) {
    const base = [meeting.courseCode, meeting.courseTitle].filter(Boolean).join(" — ") || "CUNY Class";
    const courseKey = buildCourseKey(meeting);
    const shouldLabelComponent = meeting.component && (componentCounts.get(courseKey)?.size ?? 0) > 1;
    return shouldLabelComponent ? `${base} (${meeting.component})` : base;
  }

  function buildDescription(meeting) {
    const componentAndSection = [meeting.component, meeting.section].filter(Boolean).join(" ");
    const fields = [
      ["Component", componentAndSection],
      ["Class number", meeting.classNumber],
      ["Instructor", meeting.instructor],
      ["Campus", meeting.campus],
      ["Instruction mode", meeting.instructionMode]
    ];

    return fields
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n");
  }

  function buildCalendarName(meetings) {
    const termName = meetings.find((meeting) => meeting.termName)?.termName;
    return termName ? `${termName} CUNY Schedule` : "CUNY Schedule";
  }

  function buildFileName(meetings) {
    const termName = meetings.find((meeting) => meeting.termName)?.termName || "cuny";
    const slug = termName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${slug || "cuny"}-schedule.ics`;
  }

  function buildComponentCounts(meetings) {
    const counts = new Map();

    for (const meeting of meetings) {
      const key = buildCourseKey(meeting);

      if (!counts.has(key)) {
        counts.set(key, new Set());
      }

      if (meeting.component) {
        counts.get(key).add(meeting.component);
      }
    }

    return counts;
  }

  function buildCourseKey(meeting) {
    return `${meeting.courseCode || ""}::${meeting.courseTitle || ""}`.toLowerCase();
  }

  function buildUid(meeting) {
    const source = [
      meeting.termName,
      meeting.courseCode,
      meeting.courseTitle,
      meeting.component,
      meeting.section,
      meeting.classNumber,
      meeting.startDate,
      meeting.endDate,
      meeting.weekdays?.join(","),
      meeting.startTime,
      meeting.endTime,
      meeting.location
    ]
      .map((value) => String(value ?? "").trim().toLowerCase())
      .join("::");

    return `schedulermp-${hashString(source)}@kirklandwaterbot.github.io`;
  }

  function hashString(value) {
    let hash = 2166136261;

    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function findFirstOccurrence(startDate, endDate, weekdays) {
    const allowedDays = new Set((weekdays ?? []).map((day) => DAY_TO_INDEX[day]));

    for (const date of iterateDates(startDate, endDate)) {
      if (allowedDays.has(date.getUTCDay())) {
        return formatIsoDate(date);
      }
    }

    return null;
  }

  function countOccurrences(startDate, endDate, weekdays) {
    const allowedDays = new Set((weekdays ?? []).map((day) => DAY_TO_INDEX[day]));
    let count = 0;

    for (const date of iterateDates(startDate, endDate)) {
      if (allowedDays.has(date.getUTCDay())) {
        count += 1;
      }
    }

    return count;
  }

  function* iterateDates(startDate, endDate) {
    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);

    if (!start || !end || start > end) {
      return;
    }

    for (let time = start.getTime(); time <= end.getTime(); time += 24 * 60 * 60 * 1000) {
      yield new Date(time);
    }
  }

  function parseIsoDate(value) {
    const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return null;
    }

    return date;
  }

  function formatIsoDate(date) {
    return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
      .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
      .join("-");
  }

  function formatLocalDateTime(date, time) {
    return `${date.replace(/-/g, "")}T${String(time).replace(":", "")}00`;
  }

  function formatUtcDateTime(date) {
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
      "T",
      String(date.getUTCHours()).padStart(2, "0"),
      String(date.getUTCMinutes()).padStart(2, "0"),
      String(date.getUTCSeconds()).padStart(2, "0"),
      "Z"
    ].join("");
  }

  function escapeText(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function foldLine(value) {
    const line = String(value ?? "");
    const encoder = new TextEncoder();
    const chunks = [];
    let chunk = "";
    let byteLength = 0;
    let limit = 75;

    for (const character of line) {
      const characterLength = encoder.encode(character).length;

      if (chunk && byteLength + characterLength > limit) {
        chunks.push(chunk);
        chunk = character;
        byteLength = characterLength;
        limit = 74;
      } else {
        chunk += character;
        byteLength += characterLength;
      }
    }

    chunks.push(chunk);
    return chunks.join("\r\n ");
  }

  return {
    buildEventSummary,
    buildFileName,
    countOccurrences,
    escapeText,
    findFirstOccurrence,
    foldLine,
    generateCalendar
  };
});
