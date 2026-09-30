(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.ScheduleParser = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const COURSE_CARD_SELECTOR = ".course_cell_legend";
  const SELECTION_ROW_SELECTOR = ".selection_row";
  const SELECTED_ROW_SELECTOR = [
    ".legendSelect.is-checked",
    ".sel_radio.is-checked",
    "input:checked",
    '[aria-checked="true"]'
  ].join(", ");

  const MONTHS = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12
  };

  const WEEKDAYS = {
    mon: "MO",
    monday: "MO",
    tue: "TU",
    tues: "TU",
    tuesday: "TU",
    wed: "WE",
    wednesday: "WE",
    thu: "TH",
    thur: "TH",
    thurs: "TH",
    thursday: "TH",
    fri: "FR",
    friday: "FR",
    sat: "SA",
    saturday: "SA",
    sun: "SU",
    sunday: "SU"
  };

  const MONTH_PATTERN = Object.keys(MONTHS)
    .sort((left, right) => right.length - left.length)
    .join("|");

  const DATE_RANGE_PATTERN = new RegExp(
    `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\s*(?:-|–|—|to)\\s*(${MONTH_PATTERN})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\b`,
    "i"
  );

  function parseVisibleSchedule(root = document) {
    const cards = findVisibleCourseCards(root);
    return parseCourseCards(cards);
  }

  function parseCourseCards(cards) {
    const result = {
      meetings: [],
      skipped: [],
      warnings: [],
      errors: []
    };

    if (!cards.length) {
      result.errors.push({
        code: "NO_VISIBLE_SCHEDULE",
        message: "No visible CUNY schedule was found."
      });
      return result;
    }

    cards.forEach((card, cardIndex) => {
      const parsed = parseCourseCard(card, cardIndex);
      result.meetings.push(...parsed.meetings);
      result.skipped.push(...parsed.skipped);
      result.warnings.push(...parsed.warnings);
    });

    result.meetings = dedupeMeetings(result.meetings);
    result.skipped = dedupeMessages(result.skipped);
    result.warnings = dedupeMessages(result.warnings);

    if (!result.meetings.length) {
      result.errors.push({
        code: "NO_TIMED_MEETINGS",
        message: "No classes with readable meeting dates and times were found."
      });
    }

    return result;
  }

  function parseCourseCard(card, cardIndex = 0) {
    const meetings = [];
    const skipped = [];
    const warnings = [];
    const courseCode = cleanText(card.querySelector(".course_title"));
    const courseTitle = extractCourseTitle(card);
    const courseLabel = formatCourseLabel(courseCode, courseTitle);
    const termLabel = card.querySelector(".term_label");
    const termName = cleanText(termLabel).replace(/:\s*$/, "");
    const termYear = extractYear(termName);
    const dateText = cleanText(termLabel?.parentElement);
    const dateRange = parseDateRange(dateText, termYear);
    const meetingLines = extractMeetingLines(card.querySelector('[id="hoursInLegend"]'));
    const rows = getSelectedRows(card);

    if (!courseCode && !courseTitle) {
      skipped.push({
        code: "MISSING_COURSE_IDENTITY",
        course: `Course ${cardIndex + 1}`,
        message: "A displayed class was skipped because its course name could not be read."
      });
      return { meetings, skipped, warnings };
    }

    if (!dateRange) {
      skipped.push({
        code: "INVALID_DATE_RANGE",
        course: courseLabel,
        message: `${courseLabel} was skipped because its course dates could not be read.`
      });
      return { meetings, skipped, warnings };
    }

    if (!rows.length) {
      skipped.push({
        code: "AMBIGUOUS_SECTION",
        course: courseLabel,
        message: `${courseLabel} was skipped because the selected section could not be identified.`
      });
      return { meetings, skipped, warnings };
    }

    if (!meetingLines.length) {
      skipped.push({
        code: "NO_FIXED_TIME",
        course: courseLabel,
        message: `${courseLabel} has no fixed meeting time and was not exported.`
      });
      return { meetings, skipped, warnings };
    }

    for (const row of rows) {
      const rowData = extractRowData(row, card);

      for (const line of meetingLines) {
        const meetingTime = parseMeetingLine(line);

        if (!meetingTime) {
          skipped.push({
            code: "INVALID_MEETING_TIME",
            course: courseLabel,
            message: `${courseLabel} was skipped because "${line}" is not a readable meeting time.`
          });
          continue;
        }

        const meeting = {
          courseCode,
          courseTitle,
          termName,
          component: rowData.component,
          section: rowData.section,
          classNumber: rowData.classNumber,
          instructor: rowData.instructor,
          campus: rowData.campus,
          instructionMode: rowData.instructionMode,
          location: rowData.location,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          weekdays: meetingTime.weekdays,
          startTime: meetingTime.startTime,
          endTime: meetingTime.endTime,
          sourceKey: buildSourceKey(card, row, line, cardIndex)
        };

        meetings.push(meeting);

        if (!meeting.location) {
          warnings.push({
            code: "MISSING_LOCATION",
            course: courseLabel,
            message: `${courseLabel} will be exported without a location.`
          });
        }

        if (!meeting.instructor) {
          warnings.push({
            code: "MISSING_INSTRUCTOR",
            course: courseLabel,
            message: `${courseLabel} will be exported without an instructor.`
          });
        }
      }
    }

    return { meetings, skipped, warnings };
  }

  function findVisibleCourseCards(root) {
    if (!root?.querySelectorAll) {
      return [];
    }

    const cards = [];

    if (root.matches?.(COURSE_CARD_SELECTOR)) {
      cards.push(root);
    }

    cards.push(...root.querySelectorAll(COURSE_CARD_SELECTOR));
    return cards.filter(isElementVisible);
  }

  function getSelectedRows(card) {
    const rows = Array.from(card.querySelectorAll(SELECTION_ROW_SELECTOR)).filter(isElementVisible);

    if (!rows.length) {
      return [card];
    }

    const selectedRows = rows.filter((row) => row.querySelector(SELECTED_ROW_SELECTOR));

    if (selectedRows.length) {
      return selectedRows;
    }

    return rows.length === 1 ? rows : [];
  }

  function extractCourseTitle(card) {
    const number = card.querySelector(".mobileNUmber");
    const titleContainer = number?.parentElement;

    if (!titleContainer) {
      return "";
    }

    const clone = titleContainer.cloneNode(true);
    clone.querySelectorAll(".mobileNUmber").forEach((node) => node.remove());
    return cleanText(clone);
  }

  function extractRowData(row, card) {
    const typeText = cleanText(row.querySelector(".type_block"));
    const [component = "", ...sectionParts] = typeText.split(/\s+/).filter(Boolean);
    const instructorElement = row.querySelector('[title="Instructor(s)"]') || card.querySelector('[title="Instructor(s)"]');

    return {
      component: component.toUpperCase(),
      section: sectionParts.join(" "),
      classNumber: cleanText(row.querySelector(".crn_value") || card.querySelector(".crn_value")),
      instructor: extractInstructor(instructorElement),
      campus: cleanText(row.querySelector(".campus_block") || card.querySelector(".campus_block")),
      instructionMode: cleanText(
        row.querySelector(".instructional_method_block") || card.querySelector(".instructional_method_block")
      ),
      location: cleanText(row.querySelector(".location_block") || card.querySelector(".location_block"))
    };
  }

  function extractInstructor(element) {
    if (!element) {
      return "";
    }

    const clone = element.cloneNode(true);
    clone.querySelectorAll(".rmp-rating-container").forEach((node) => node.remove());
    return cleanText(clone);
  }

  function extractMeetingLines(element) {
    if (!element) {
      return [];
    }

    const clone = element.cloneNode(true);
    clone.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));

    return String(clone.textContent ?? "")
      .split(/\n+/)
      .map(cleanString)
      .filter(Boolean);
  }

  function parseDateRange(text, fallbackYear) {
    const match = cleanString(text).match(DATE_RANGE_PATTERN);

    if (!match) {
      return null;
    }

    const startMonth = MONTHS[match[1].toLowerCase()];
    const startDay = Number(match[2]);
    const explicitStartYear = Number(match[3]) || null;
    const endMonth = MONTHS[match[4].toLowerCase()];
    const endDay = Number(match[5]);
    const explicitEndYear = Number(match[6]) || null;
    const startYear = explicitStartYear || fallbackYear;

    if (!startYear) {
      return null;
    }

    const endYear = explicitEndYear || (endMonth < startMonth ? startYear + 1 : startYear);
    const startDate = toIsoDate(startYear, startMonth, startDay);
    const endDate = toIsoDate(endYear, endMonth, endDay);

    if (!startDate || !endDate || startDate > endDate) {
      return null;
    }

    return { startDate, endDate };
  }

  function parseMeetingLine(value) {
    const line = cleanString(value);

    if (!line || /\b(?:TBA|to be announced|asynchronous|no meeting time)\b/i.test(line)) {
      return null;
    }

    const match = line.match(
      /^(.+?)\s*:\s*(\d{1,2})(?::(\d{2}))?\s*([AP]M)\s*(?:to|-|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i
    );

    if (!match) {
      return null;
    }

    const weekdays = parseWeekdays(match[1]);
    const startTime = parseClockTime(match[2], match[3], match[4]);
    const endTime = parseClockTime(match[5], match[6], match[7]);

    if (!weekdays.length || !startTime || !endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      return null;
    }

    return { weekdays, startTime, endTime };
  }

  function parseWeekdays(value) {
    const tokens = cleanString(value).match(
      /\b(?:Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\b/gi
    ) ?? [];
    const seen = new Set();
    const weekdays = [];

    for (const token of tokens) {
      const day = WEEKDAYS[token.toLowerCase()];

      if (day && !seen.has(day)) {
        seen.add(day);
        weekdays.push(day);
      }
    }

    return weekdays;
  }

  function parseClockTime(hourText, minuteText, meridiemText) {
    let hour = Number(hourText);
    const minute = Number(minuteText || 0);
    const meridiem = String(meridiemText ?? "").toUpperCase();

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59 || !["AM", "PM"].includes(meridiem)) {
      return null;
    }

    if (hour === 12) {
      hour = 0;
    }

    if (meridiem === "PM") {
      hour += 12;
    }

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function isElementVisible(element) {
    if (!element || element.nodeType !== 1) {
      return false;
    }

    const view = element.ownerDocument?.defaultView;

    for (let current = element; current?.nodeType === 1; current = current.parentElement) {
      if (current.hidden || current.getAttribute("aria-hidden") === "true") {
        return false;
      }

      const style = view?.getComputedStyle?.(current);

      if (style?.display === "none" || style?.visibility === "hidden") {
        return false;
      }
    }

    return true;
  }

  function extractYear(value) {
    const match = cleanString(value).match(/\b(20\d{2})\b/);
    return match ? Number(match[1]) : null;
  }

  function toIsoDate(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function timeToMinutes(value) {
    const [hour, minute] = String(value).split(":").map(Number);
    return hour * 60 + minute;
  }

  function buildSourceKey(card, row, meetingLine, cardIndex) {
    const selectionKey = row.getAttribute?.("data-selkey") || card.querySelector("[data-selkey]")?.getAttribute("data-selkey");
    const classNumber = row.getAttribute?.("data-crns") || cleanText(row.querySelector?.(".crn_value"));
    return [selectionKey, classNumber, meetingLine, cardIndex].filter((value) => value !== null && value !== undefined).join("::");
  }

  function dedupeMeetings(meetings) {
    const seen = new Set();

    return meetings.filter((meeting) => {
      const key = [
        meeting.courseCode,
        meeting.courseTitle,
        meeting.component,
        meeting.section,
        meeting.classNumber,
        meeting.startDate,
        meeting.endDate,
        meeting.weekdays.join(","),
        meeting.startTime,
        meeting.endTime,
        meeting.location
      ]
        .map((value) => cleanString(value).toLowerCase())
        .join("::");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  function dedupeMessages(messages) {
    const seen = new Set();

    return messages.filter((entry) => {
      const key = `${entry.code}::${entry.course ?? ""}::${entry.message}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  function formatCourseLabel(courseCode, courseTitle) {
    return [courseCode, courseTitle].filter(Boolean).join(" — ") || "Displayed class";
  }

  function cleanText(element) {
    return cleanString(element?.textContent);
  }

  function cleanString(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  return {
    findVisibleCourseCards,
    isElementVisible,
    parseCourseCards,
    parseDateRange,
    parseMeetingLine,
    parseVisibleSchedule
  };
});
