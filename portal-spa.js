const CSS_BY_HREF = [
  [/admin-reports/, ["./AdminReportsV2.css", "./AdminPdfExport.css"]],
  [/admin-grades/, ["./AdminPdfExport.css"]],
  [/admin-announcements/, ["./AdminAnnouncementsV2.css", "./AdminPdfExport.css"]],
  [/admin-certificates/, ["./AdminCertificatesV2.css", "./AdminPdfExport.css"]],
  [/admin-messages/, ["./AdminPdfExport.css"]],
  [/admin\.html/, ["./AdminDashboardV2.css", "./AdminCoursesV2.css", "./CourseFormV2.css", "./AdminRegistrationsV2.css", "./AdminStudentsV2.css", "./AdminTrainersV2.css", "./TrainerFormV2.css", "./AdminPdfExport.css"]]
];

export function ensureStyles(hrefs) {
  (hrefs || []).forEach((href) => {
    if ([...document.querySelectorAll("link[rel=stylesheet]")].some((l) => (l.getAttribute("href") || "").includes(href.replace("./", "")))) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  });
}

export function bootPortalSpa() {
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    CSS_BY_HREF.forEach(([re, files]) => { if (re.test(href)) ensureStyles(files); });
  }, true);
}

if (typeof document !== "undefined") bootPortalSpa();

