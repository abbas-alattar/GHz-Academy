import { createElement as e, Component } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { loadTrainerStore, getTrainerStore } from "./TrainerStore.js";

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("TrainerShellV2", err); }
  render() {
    if (this.state.err) {
      return e("div", { className: "tr2" },
        e("p", { className: "tr2-err" }, String(this.state.err?.message || this.state.err),
          e("button", { type: "button", className: "tr2-btn", onClick: () => { this.setState({ err: null }); this.props.onRetry?.(); } }, "Try again")));
    }
    return this.props.children;
  }
}

const titles = {
  courses: "My courses", homework: "Homework", quizzes: "Quizzes", grades: "Grades",
  attendance: "Attendance", announcements: "Announcements", roster: "Roster", coursecontent: "Course content",
  hwavg: "Homework averages", qzavg: "Quiz averages", notifications: "Notifications"
};

function parseHash() {
  const raw = (location.hash || "#courses").replace(/^#/, "");
  const qi = raw.indexOf("?");
  const path = (qi >= 0 ? raw.slice(0, qi) : raw) || "courses";
  const params = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : "");
  if (path.indexOf("course/") === 0) return { view: "coursecontent", courseId: path.split("/")[1], params, path };
  if (path.indexOf("roster/") === 0) return { view: "roster", courseId: path.split("/")[1], params, path };
  if (path.indexOf("homework-averages") === 0) {
    const parts = path.split("/");
    return { view: "hwavg", courseId: parts[1] || "", params, path };
  }
  if (path.indexOf("quiz-averages") === 0) {
    const parts = path.split("/");
    return { view: "qzavg", courseId: parts[1] || "", params, path };
  }
  if (path.indexOf("homework/") === 0) return { view: "homework", assignmentId: path.split("/")[1], params, path };
  if (path.indexOf("quiz/") === 0) return { view: "quizzes", quizId: path.split("/")[1], params, path };
  if (path.indexOf("grades/") === 0) return { view: "grades", courseId: path.split("/")[1], params, path };
  if (path.indexOf("attendance/") === 0) return { view: "attendance", sessionId: path.split("/")[1], params, path };
  const map = { courses: "courses", homework: "homework", quizzes: "quizzes", grades: "grades", attendance: "attendance", announcements: "announcements", notifications: "notifications" };
  return { view: map[path] || "courses", params, path };
}

function paintFail(host, err) {
  if (!host) return;
  host.innerHTML = `<div class="tr2-timeout"><h3>This section could not load</h3><p>${String(err?.message || err || "Unknown error")}</p><button type="button" class="tr2-btn pri" data-tr2-retry="1">Retry</button></div>`;
  host.querySelector("[data-tr2-retry]")?.addEventListener("click", () => {
    try { window.__ghzTrainerGo?.(location.hash || "#courses"); } catch (e) { console.warn("[ghz-reload]", "trainer section retry", e); }
  });
}
async function runSection(host, loader) {
  try {
    const fn = await loader();
    if (typeof fn === "function") fn();
  } catch (err) {
    console.error(err);
    paintFail(host, err);
  }
}

export function bootTrainerShellV2({ uid, name } = {}) {
  try { window.__trainerBooted = true; } catch {}
  const go = (hash) => {
    const h = hash.startsWith("#") ? hash : "#" + hash;
    if ((location.hash || "") === h) {
      show(parseHash());
      return;
    }
    history.pushState({ view: h }, "", h);
    show(parseHash());
  };
  window.__ghzTrainerGo = go;
  window.__ghzTrainerLeave = null;

  const show = (info) => {
    const nameV = info.view;
    document.querySelectorAll("[id^=view-]").forEach((s) => s.classList.add("hidden"));
    const el = document.getElementById("view-" + nameV);
    if (el) el.classList.remove("hidden");
    document.querySelectorAll(".side nav a").forEach((a) => {
      const on = a.dataset.view === nameV || (nameV === "coursecontent" && a.dataset.view === "courses") || (nameV === "roster" && a.dataset.view === "courses") || (nameV === "hwavg" && a.dataset.view === "homework") || (nameV === "qzavg" && a.dataset.view === "quizzes");
      a.classList.toggle("on", !!on);
    });
    const t = document.getElementById("pageTitle");
    if (t) t.textContent = titles[nameV] || "Trainer";
    const cid = info.courseId || info.params.get("course") || "";
    if (nameV === "courses") {
      runSection(document.getElementById("tr2CoursesRoot"), () => import("./TrainerCoursesV2.js").then((m) => () => m.renderTrainerCoursesV2(document.getElementById("tr2CoursesRoot"), { uid, go, name })));
    }
    if (nameV === "coursecontent" && cid) {
      const host = document.getElementById("cc1Root");
      runSection(host, () => import("./CourseContentV1.js?v=docx2").then((m) => () => { m.renderCourseContentV1({ host, loading: true }); m.renderCourseContentV1({ host, courseId: cid, role: "trainer", uid, name }); }));
    }
    if (nameV === "roster" && cid) {
      const host = document.getElementById("cr1Root");
      runSection(host, () => import("./CourseRosterV1.js?v=2").then((m) => () => { m.renderCourseRosterV1({ host, loading: true }); m.renderCourseRosterV1({ host, courseId: cid, role: "trainer", uid, backHref: "#courses" }); }));
    }
    if (nameV === "homework") runSection(document.getElementById("tr2HwRoot"), () => import("./TrainerHomeworkV2.js").then((m) => () => m.renderTrainerHomeworkV2(document.getElementById("tr2HwRoot"), { uid, go, assignmentId: info.assignmentId, courseId: cid })));
    if (nameV === "hwavg") runSection(document.getElementById("tr2HwAvgRoot"), () => import("./HomeworkAveragesV1.js").then((m) => () => m.renderHomeworkAveragesV1(document.getElementById("tr2HwAvgRoot"), { uid, go, courseId: info.courseId || "", courses: getTrainerStore()?.courses || [] })));
    if (nameV === "quizzes") runSection(document.getElementById("tr2QuizRoot"), () => import("./TrainerQuizzesV2.js").then((m) => () => m.renderTrainerQuizzesV2(document.getElementById("tr2QuizRoot"), { uid, go, quizId: info.quizId, courseId: cid })));
    if (nameV === "qzavg") runSection(document.getElementById("tr2QzAvgRoot"), () => import("./QuizAveragesV1.js").then((m) => () => m.renderQuizAveragesV1(document.getElementById("tr2QzAvgRoot"), { uid, go, courseId: info.courseId || "", courses: getTrainerStore()?.courses || [] })));
    if (nameV === "grades") runSection(document.getElementById("tr2GradesRoot"), () => import("./TrainerGradesV2.js?v=kpi2").then((m) => () => m.renderTrainerGradesV2(document.getElementById("tr2GradesRoot"), { uid, go, courseId: info.courseId || "", listCourse: cid })));
    if (nameV === "attendance") runSection(document.getElementById("tr2AttRoot"), () => import("./TrainerAttendanceV2.js").then((m) => () => m.renderTrainerAttendanceV2(document.getElementById("tr2AttRoot"), { uid, go, courseId: cid, sessionId: info.sessionId || "" })));
    if (nameV === "announcements") runSection(document.getElementById("tr2AnnRoot"), () => import("./TrainerSectionsV2.js").then((m) => () => m.renderTrainerAnnouncementsSection(document.getElementById("tr2AnnRoot"), { uid, name })));
  };

  document.querySelectorAll(".side nav a[data-view]").forEach((a) => {
    a.onclick = (ev) => {
      ev.preventDefault();
      go(a.getAttribute("href") || ("#" + a.dataset.view));
    };
  });
  const shell = document.querySelector(".portal") || document.body;
  if (!shell.dataset.ghzNav) {
    shell.dataset.ghzNav = "1";
    shell.addEventListener("click", async (ev) => {
      const el = ev.target.closest("[data-nav], [data-back]");
      if (!el || !shell.contains(el)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const hash = el.getAttribute("data-nav") || el.getAttribute("data-back") || "";
      if (!hash) return;
      const leave = window.__ghzTrainerLeave;
      if (typeof leave === "function") {
        const ok = await leave();
        if (ok === false) return;
      }
      go(hash);
    });
  }
  window.addEventListener("hashchange", () => show(parseHash()));
  window.addEventListener("popstate", () => show(parseHash()));
  window.addEventListener("ghz-notify-nav", (ev) => {
    const h = ev.detail?.hash || ev.detail?.href;
    if (h) go(String(h).replace(/^\.\//, "").replace(/^.*#/, "#").replace(/^#/, "") || "courses");
  });

  loadTrainerStore(uid);
  import("./TrainerResultBox.js").then((m) => m.bootTrainerResultBoxes({ uid, name, go })).catch(() => {});
  const pack = getTrainerStore();
  try {
    window.__ghzDash = { courseList: pack?.courses || [], assignments: pack?.assignments || [], quizzes: pack?.quizzes || [], announcements: pack?.announcements || [] };
  } catch (_) {}
  show(parseHash());
  return true;
}

let root;
export function renderTrainerShellError(host, err, retry) {
  if (!host) return;
  if (!root) root = createRoot(host);
  root.render(e(Boundary, { onRetry: retry }, e("p", { className: "tr2-err" }, String(err?.message || err))));
}
