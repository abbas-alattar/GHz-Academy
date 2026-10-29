const chunks = {
  student: [
    "./DashboardV3.js", "./HomeworkV2.js", "./StudentScheduleV2.js", "./AttendanceV2.js",
    "./QuizzesV2.js", "./StudentGradesV3.js", "./AnnouncementsV2.js", "./CertificatesV2.js",
    "./MyCoursesV2.js", "./BrowseCoursesV2.js", "./ProfileV2.js"
  ],
  trainer: ["./HomeworkSubmitV2.js", "./DeliveryDays.js"],
  admin: []
};

export function idlePrefetch(role) {
  const list = chunks[role] || chunks.student;
  const run = () => list.forEach((f) => import(f).catch(() => {}));
  if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 400);
}

export function hoverPrefetch(nav, extra) {
  if (!nav) return;
  const go = (a) => {
    const href = a && a.getAttribute("href");
    if (!href) return;
    extra?.(href);
    try {
      if (href.startsWith("#")) return;
      const l = document.createElement("link");
      l.rel = "prefetch";
      l.href = href;
      document.head.appendChild(l);
    } catch (_) {}
  };
  nav.addEventListener("pointerenter", (e) => { const a = e.target?.closest?.("a"); if (a) go(a); }, true);
  nav.addEventListener("focusin", (e) => { const a = e.target?.closest?.("a"); if (a) go(a); });
  nav.addEventListener("touchstart", (e) => { const a = e.target?.closest?.("a"); if (a) go(a); }, { passive: true });
}
