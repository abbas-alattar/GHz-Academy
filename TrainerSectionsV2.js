import { createElement as e, useEffect, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { getTrainerStore, loadTrainerStore, refreshTrainerStore, subscribeTrainerStore } from "./TrainerStore.js";
import { renderTrainerAnnouncementsV2 } from "./TrainerAnnouncementsV2.js";

function usePack(uid) {
  const [pack, setPack] = useState(getTrainerStore());
  useEffect(() => subscribeTrainerStore(setPack), []);
  useEffect(() => { if (uid) loadTrainerStore(uid); }, [uid]);
  return { pack, retry: () => refreshTrainerStore(uid) };
}

function Head({ title, sub, cls }) {
  return e("div", { className: cls + "-head" }, e("div", null, e("h2", null, title), e("p", null, sub)));
}

let gRoot, aRoot;
export function renderTrainerGradesV2(host, { uid, courseId } = {}) {
  if (!host) return;
  if (!gRoot) gRoot = createRoot(host);
  function Page() {
    const { pack, retry } = usePack(uid);
    if (!pack || !pack.extrasReady) {
      return e("div", { className: "tg2" }, e(Head, { cls: "tg2", title: "Grades", sub: "Homework grades across your courses" }),
        e("div", { className: "tg2-card" }, e("p", { style: { padding: 16 } }, "Loading…")));
    }
    if (pack.hwErr) {
      return e("div", { className: "tg2" }, e(Head, { cls: "tg2", title: "Grades", sub: "Homework grades across your courses" }),
        e("div", { className: "tg2-card" }, e("p", { className: "tg2-err" }, pack.hwErr, " ", e("button", { className: "tg2-btn", onClick: retry }, "Try again"))));
    }
    const list = (pack.assignments || []).filter((a) => !courseId || a.courseId === courseId);
    return e("div", { className: "tg2" },
      e(Head, { cls: "tg2", title: "Grades", sub: courseId ? "Filtered to this course" : "Homework grades across your courses" }),
      e("div", { className: "tg2-card" }, list.length
        ? e("table", null,
          e("thead", null, e("tr", null, e("th", null, "Assignment"), e("th", null, "Course"), e("th", null, "Graded"))),
          e("tbody", null, list.map((a) => e("tr", { key: a.id },
            e("td", null, a.title), e("td", null, (pack.courses.find((c) => c.id === a.courseId) || {}).title || ""),
            e("td", null, String((pack.submissions || []).filter((s) => s.assignmentId === a.id && s.status === "graded").length))))))
        : e("div", { className: "tg2-empty" }, "No grades yet.")));
  }
  gRoot.render(e(Page));
}
export function renderTrainerAttendanceV2(host, { uid, courseId } = {}) {
  if (!host) return;
  if (!aRoot) aRoot = createRoot(host);
  function Page() {
    const { pack, retry } = usePack(uid);
    if (!pack || !pack.extrasReady) {
      return e("div", { className: "ta2" }, e(Head, { cls: "ta2", title: "Attendance", sub: "Sessions for your courses" }),
        e("div", { className: "ta2-card" }, e("p", { style: { padding: 16 } }, "Loading…")));
    }
    if (pack.sessErr) {
      return e("div", { className: "ta2" }, e(Head, { cls: "ta2", title: "Attendance", sub: "Sessions for your courses" }),
        e("div", { className: "ta2-card" }, e("p", { className: "ta2-err" }, pack.sessErr, " ", e("button", { className: "ta2-btn", onClick: retry }, "Try again"))));
    }
    const list = (pack.sessions || []).filter((s) => !courseId || s.courseId === courseId);
    return e("div", { className: "ta2" },
      e(Head, { cls: "ta2", title: "Attendance", sub: courseId ? "Filtered to this course" : "Sessions for your courses" }),
      e("div", { className: "ta2-card" }, list.length
        ? e("table", null,
          e("thead", null, e("tr", null, e("th", null, "Date"), e("th", null, "Course"), e("th", null, "Title"), e("th", null, "Status"))),
          e("tbody", null, list.map((s) => e("tr", { key: s.id },
            e("td", null, s.date || "—"), e("td", null, (pack.courses.find((c) => c.id === s.courseId) || {}).title || ""),
            e("td", null, s.title || "Session"), e("td", null, s.status || "—")))))
        : e("div", { className: "ta2-empty" }, "No sessions yet.")));
  }
  aRoot.render(e(Page));
}
export function renderTrainerAnnouncementsSection(host, props) {
  try { return renderTrainerAnnouncementsV2(host, props); } catch (er) {
    console.error("announcements", er);
    if (host) host.innerHTML = `<p class="th2-err">${er.message || er}</p>`;
  }
}
