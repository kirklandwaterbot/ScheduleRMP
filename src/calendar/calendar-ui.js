(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CalendarUi = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const CONTROL_ID = "rmcp-calendar-export-control";
  const DIALOG_ID = "rmcp-calendar-review-dialog";
  const activeDialogs = new WeakMap();
  const DAY_LABELS = {
    MO: "Mon",
    TU: "Tue",
    WE: "Wed",
    TH: "Thu",
    FR: "Fri",
    SA: "Sat",
    SU: "Sun"
  };

  function ensureExportControl(anchor, onActivate) {
    const document = anchor?.ownerDocument;

    if (!document || !anchor.parentNode) {
      return null;
    }

    let control = document.getElementById(CONTROL_ID);

    if (!control) {
      control = document.createElement("div");
      control.id = CONTROL_ID;
      control.className = "rmcp-calendar-control";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "rmcp-calendar-export-button";
      button.textContent = "Export current schedule";
      button.setAttribute("aria-haspopup", "dialog");
      control.appendChild(button);
    }

    const button = control.querySelector("button");
    button.onclick = onActivate;

    if (control.nextSibling !== anchor || control.parentNode !== anchor.parentNode) {
      anchor.parentNode.insertBefore(control, anchor);
    }

    return button;
  }

  function removeExportControl(document) {
    document?.getElementById(CONTROL_ID)?.remove();
  }

  function openReview(result, options = {}) {
    const document = options.document || globalThis.document;

    if (!document?.body) {
      throw new Error("A document body is required to open the calendar review.");
    }

    activeDialogs.get(document)?.close();
    document.getElementById(DIALOG_ID)?.closest(".rmcp-calendar-overlay")?.remove();

    const previouslyFocused = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "rmcp-calendar-overlay";

    const dialog = document.createElement("section");
    dialog.id = DIALOG_ID;
    dialog.className = "rmcp-calendar-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", `${DIALOG_ID}-title`);
    overlay.appendChild(dialog);

    const header = document.createElement("header");
    header.className = "rmcp-calendar-dialog-header";

    const headingGroup = document.createElement("div");
    const eyebrow = document.createElement("div");
    eyebrow.className = "rmcp-calendar-eyebrow";
    eyebrow.textContent = "Calendar export";
    headingGroup.appendChild(eyebrow);

    const title = document.createElement("h2");
    title.id = `${DIALOG_ID}-title`;
    title.textContent = "Review your schedule";
    headingGroup.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "rmcp-calendar-subtitle";
    subtitle.textContent = buildCountLabel(result.meetings.length);
    headingGroup.appendChild(subtitle);
    header.appendChild(headingGroup);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "rmcp-calendar-icon-button";
    closeButton.setAttribute("aria-label", "Close calendar review");
    closeButton.textContent = "×";
    header.appendChild(closeButton);
    dialog.appendChild(header);

    const body = document.createElement("div");
    body.className = "rmcp-calendar-dialog-body";

    if (result.meetings.length) {
      body.appendChild(buildMeetingList(document, result.meetings, options.summaryBuilder));
    }

    const notices = [...result.errors, ...result.skipped, ...result.warnings];

    if (notices.length) {
      body.appendChild(buildNoticeList(document, notices, result.errors.length > 0));
    }

    body.appendChild(buildImportHelp(document));

    const duplicateNote = document.createElement("p");
    duplicateNote.className = "rmcp-calendar-duplicate-note";
    duplicateNote.textContent = "Import this file once. Importing it again may create duplicate events.";
    body.appendChild(duplicateNote);

    const status = document.createElement("div");
    status.className = "rmcp-calendar-status";
    status.setAttribute("aria-live", "polite");
    body.appendChild(status);
    dialog.appendChild(body);

    const footer = document.createElement("footer");
    footer.className = "rmcp-calendar-dialog-footer";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "rmcp-calendar-secondary-button";
    cancelButton.textContent = "Cancel";
    footer.appendChild(cancelButton);

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "rmcp-calendar-primary-button";
    downloadButton.textContent = "Download schedule.ics";
    downloadButton.disabled = result.meetings.length === 0;
    footer.appendChild(downloadButton);
    dialog.appendChild(footer);
    document.body.appendChild(overlay);

    function close() {
      if (!overlay.isConnected) {
        return;
      }

      document.removeEventListener("keydown", handleKeydown, true);
      overlay.remove();
      activeDialogs.delete(document);

      if (previouslyFocused?.isConnected && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    }

    function handleKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        dialog.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
      );

      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    closeButton.addEventListener("click", close);
    cancelButton.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });
    document.addEventListener("keydown", handleKeydown, true);

    downloadButton.addEventListener("click", async () => {
      if (downloadButton.disabled || typeof options.onDownload !== "function") {
        return;
      }

      downloadButton.disabled = true;
      downloadButton.textContent = "Preparing file…";
      status.className = "rmcp-calendar-status";
      status.replaceChildren();

      try {
        const payload = await options.onDownload(result.meetings);
        const fileName = payload?.fileName || "schedule.ics";
        status.className = "rmcp-calendar-status rmcp-calendar-status--success";

        const successTitle = document.createElement("strong");
        successTitle.textContent = `${fileName} downloaded.`;
        status.appendChild(successTitle);

        const instructions = document.createElement("span");
        instructions.textContent = " Follow the import steps above to add it to Google Calendar.";
        status.appendChild(instructions);
        downloadButton.textContent = "Downloaded";
      } catch (error) {
        status.className = "rmcp-calendar-status rmcp-calendar-status--error";
        status.textContent = error?.message || "The calendar file could not be created. Please try again.";
        downloadButton.disabled = false;
        downloadButton.textContent = "Try download again";
      }
    });

    activeDialogs.set(document, { close });
    closeButton.focus();
    return { close, dialog, downloadButton };
  }

  function buildMeetingList(document, meetings, summaryBuilder) {
    const section = document.createElement("section");
    section.className = "rmcp-calendar-meetings";
    section.setAttribute("aria-label", "Meetings to export");

    for (const meeting of meetings) {
      const item = document.createElement("article");
      item.className = "rmcp-calendar-meeting";

      const content = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = typeof summaryBuilder === "function"
        ? summaryBuilder(meeting, meetings)
        : [meeting.courseCode, meeting.courseTitle].filter(Boolean).join(" — ");
      content.appendChild(title);

      const schedule = document.createElement("p");
      schedule.className = "rmcp-calendar-meeting-schedule";
      schedule.textContent = `${formatDays(meeting.weekdays)} · ${formatTimeRange(meeting.startTime, meeting.endTime)}`;
      content.appendChild(schedule);

      const dates = document.createElement("p");
      dates.className = "rmcp-calendar-meeting-meta";
      dates.textContent = `${formatDate(meeting.startDate)} – ${formatDate(meeting.endDate)}`;
      content.appendChild(dates);
      item.appendChild(content);

      const location = document.createElement("div");
      location.className = `rmcp-calendar-meeting-location${meeting.location ? "" : " rmcp-calendar-meeting-location--missing"}`;
      location.textContent = meeting.location || "Location unavailable";
      item.appendChild(location);
      section.appendChild(item);
    }

    return section;
  }

  function buildNoticeList(document, notices, hasBlockingError) {
    const section = document.createElement("section");
    section.className = `rmcp-calendar-notices${hasBlockingError ? " rmcp-calendar-notices--error" : ""}`;

    const title = document.createElement("h3");
    title.textContent = hasBlockingError ? "Export needs attention" : "Before you export";
    section.appendChild(title);

    const list = document.createElement("ul");

    for (const notice of notices) {
      const item = document.createElement("li");
      item.textContent = notice.message;
      list.appendChild(item);
    }

    section.appendChild(list);
    return section;
  }

  function buildImportHelp(document) {
    const section = document.createElement("section");
    section.className = "rmcp-calendar-import-help";
    section.setAttribute("aria-labelledby", `${DIALOG_ID}-import-help-title`);

    const title = document.createElement("h3");
    title.id = `${DIALOG_ID}-import-help-title`;
    title.textContent = "Import into Google Calendar";
    section.appendChild(title);

    const steps = document.createElement("p");
    steps.append("Next to ");
    steps.appendChild(buildStrongText(document, "Other calendars"));
    steps.append(", click ");
    steps.appendChild(buildStrongText(document, "+ → Import"));
    steps.append(", select the downloaded ");
    steps.appendChild(buildStrongText(document, ".ics"));
    steps.append(" file, choose a calendar, then click ");
    steps.appendChild(buildStrongText(document, "Import"));
    steps.append(".");
    section.appendChild(steps);

    const colorNote = document.createElement("p");
    colorNote.className = "rmcp-calendar-import-color-note";
    colorNote.textContent = "Google Calendar uses the destination calendar’s default color. Recolor individual classes manually after importing.";
    section.appendChild(colorNote);

    return section;
  }

  function buildStrongText(document, value) {
    const strong = document.createElement("strong");
    strong.textContent = value;
    return strong;
  }

  function buildCountLabel(count) {
    if (!count) {
      return "No recurring meetings are ready to export";
    }

    return `${count} recurring meeting${count === 1 ? "" : "s"} ready to export`;
  }

  function formatDays(days) {
    return (days ?? []).map((day) => DAY_LABELS[day] || day).join(", ");
  }

  function formatTimeRange(startTime, endTime) {
    return `${formatTime(startTime)}–${formatTime(endTime)}`;
  }

  function formatTime(value) {
    const [hourText, minute = "00"] = String(value ?? "").split(":");
    const hour = Number(hourText);

    if (!Number.isFinite(hour)) {
      return value || "Time unavailable";
    }

    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minute} ${suffix}`;
  }

  function formatDate(value) {
    const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return value || "Date unavailable";
    }

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
  }

  return {
    ensureExportControl,
    formatDate,
    formatDays,
    formatTime,
    openReview,
    removeExportControl
  };
});
