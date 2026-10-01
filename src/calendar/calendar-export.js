(function () {
  const RECONCILE_DELAY_MS = 250;
  const DEFAULT_SETTINGS = { masterEnabled: true, calendarExport: true };
  let reconcileTimer = null;
  let enabled = true;

  if (!window.ScheduleParser || !window.IcsGenerator || !window.CalendarUi) {
    console.error("ScheduleRMP calendar export could not start because a required module is missing.");
    return;
  }

  void initialize();

  const observer = new MutationObserver(() => {
    scheduleReconcile();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  async function initialize() {
    const stored = await browser.storage.local.get("settings");
    const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
    enabled = settings.masterEnabled && settings.calendarExport;
    if (enabled) scheduleReconcile();
  }

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.settings) return;
    const settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
    enabled = settings.masterEnabled && settings.calendarExport;
    if (enabled) scheduleReconcile();
    else {
      window.clearTimeout(reconcileTimer);
      window.CalendarUi.removeExportControl(document);
    }
  });

  function scheduleReconcile() {
    if (!enabled) return;
    window.clearTimeout(reconcileTimer);
    reconcileTimer = window.setTimeout(reconcileExportControl, RECONCILE_DELAY_MS);
  }

  function reconcileExportControl() {
    if (!enabled) {
      window.CalendarUi.removeExportControl(document);
      return;
    }
    const cards = window.ScheduleParser.findVisibleCourseCards(document);

    if (!cards.length) {
      window.CalendarUi.removeExportControl(document);
      return;
    }

    const anchor = cards[0].closest(".legend_table") || cards[0];
    window.CalendarUi.ensureExportControl(anchor, openCurrentScheduleReview);
  }

  function openCurrentScheduleReview() {
    if (!enabled) return;
    const result = window.ScheduleParser.parseVisibleSchedule(document);

    window.CalendarUi.openReview(result, {
      summaryBuilder: (meeting, meetings) => window.IcsGenerator.buildEventSummary(meeting, meetings),
      onDownload: downloadCalendar
    });
  }

  function downloadCalendar(meetings) {
    const calendarText = window.IcsGenerator.generateCalendar(meetings);
    const fileName = window.IcsGenerator.buildFileName(meetings);
    const blob = new Blob([calendarText], { type: "text/calendar;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = fileName;
    link.hidden = true;
    document.body.appendChild(link);

    try {
      link.click();
    } finally {
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }

    return { fileName };
  }

  window.CalendarExportController = {
    downloadCalendar,
    openCurrentScheduleReview,
    reconcileExportControl
  };
})();
