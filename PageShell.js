import { beginNav, endNav, swapLoadingText } from "./NavLoader.js";
import { idlePrefetch, hoverPrefetch } from "./usePrefetch.js";
import { loadStudentDash } from "./student-dash-data.js?v=stu7";

function roleOf() {
  const p = location.pathname || "";
  if (/admin/i.test(p)) return "admin";
  if (/trainer/i.test(p)) return "trainer";
  return "student";
}

function wrap(content) {
  if (!content || content.dataset.pshell === "1") return content;
  const shell = document.createElement("div");
  shell.className = "ghz-content-shell";
  shell.style.position = "relative";
  const page = document.createElement("div");
  page.className = "ghz-page-fx in";
  const parent = content.parentNode;
  parent.insertBefore(shell, content);
  page.appendChild(content);
  shell.appendChild(page);
  content.dataset.pshell = "1";
  return page;
}

function transition(page, fn) {
  beginNav();
  page.classList.add("out");
  page.classList.remove("in");
  setTimeout(() => {
    try { fn?.(); } catch (_) {}
    page.classList.remove("out");
    page.classList.add("in");
    endNav();
  }, 100);
}

export function bootPageShell(root) {
  try {
    if (!root) return false;
    const content = root.getElementsByClassName("content")[0];
    const nav = root.querySelector("aside nav, .side nav, [data-student-nav]");
    if (!content) return false;
    const page = wrap(content);
    swapLoadingText();
    const role = roleOf();
    hoverPrefetch(nav, (href) => {
      if (/schedule/i.test(href)) import("./StudentScheduleV2.js").catch(() => {});
      if (/homework/i.test(href)) import("./HomeworkV2.js").catch(() => {});
      if (/grade/i.test(href)) import("./StudentGradesV3.js").catch(() => {});
    });
    idlePrefetch(role);
    if (role === "student") { try { loadStudentDash(false); } catch (_) {} }
    nav?.addEventListener("click", (e) => {
      const a = e.target?.closest?.("a");
      if (!a) return;
      transition(page);
    });
    window.addEventListener("hashchange", () => transition(page));
    window.addEventListener("pageshow", () => endNav());
    setTimeout(endNav, 400);
    return true;
  } catch (e) {
    console.error("PageShell", e);
    return false;
  }
}
