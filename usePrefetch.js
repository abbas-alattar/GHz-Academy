const chunks = {
  student: [
    "./DashboardV3.js", "./HomeworkV2.js?v=r2", "./StudentScheduleV2.js?v=r2", "./AttendanceV2.js",
    "./QuizzesV2.js?v=r2", "./StudentGradesV3.js", "./AnnouncementsV2.js", "./CertificatesV2.js",
    "./MyCoursesV2.js?v=r2", "./BrowseCoursesV2.js?v=r2", "./ProfileV2.js?v=r2"
  ],
  trainer: ["./HomeworkSubmitV2.js?v=r2", "./DeliveryDays.js"],
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
