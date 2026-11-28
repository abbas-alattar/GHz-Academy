import { ask, tell } from "./dialogs.js?v=r2";
import { friendlyError } from "./friendlyError.js?v=r2";
    import { protect } from "./auth-guard.js?v=auth10-r2";
    import { bootNotify } from "./portal-notify.js?v=stu11";
    import { bootPageMotion } from "./PageTransition.js?v=stu11";
    import { bootPageShell } from "./PageShell.js?v=stu11";
    import { swapLoadingText } from "./WaveLoader.js?v=stu11";
    import { bootStudentNav, highlightStudentNav } from "./student-nav.js?v=stu11-r2";
    import { bootPortalShell } from "./PortalShell.js?v=stu11-r2";
    import { auth, db } from "./firebase-config.js?v=auth10";
    import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
    import { collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
    import { portalStatus, statusBadgeHtml, completedOn } from "./portal-status.js?v=stu11-r2";
    import { courseStatusLabel, canRegisterForCourse } from "./courseStatusLabel.js?v=stu11-r2";
    import { bootStudentDash } from "./student-dash-boot.js?v=stu11-r2";
    import { deliveryDaysHtml } from "./DeliveryDays.js?v=stu11";
    import { startsEndsLine, formatCourseDate } from "./courseDates.js?v=stu11";
    import { maybeShowCourseResult } from "./CourseResultBox.js?v=stu11-r2";
    import { sessionStatus } from "./sessionStatus.js?v=stu11";
    import { loadStudentDash as loadStore, loadListPage, whenStudentStore, getStudentStore, asArray, ensureSectionData, ensureSessions, ensureAssignments, ensureQuizzes, ensureAttendance, ensureSubmissions, ensureQuizAttempts, ensureCatalog, ensureEnrollments, ensureRegistrations, ensureCertificates, ensureAnnouncements, ensureGrades, getCourseResult, getEnrolledCourses, getActiveCourses, getCompletedCourses, getActiveEnrollments, enrollmentsReady, prefetchStudentCore } from "./student-dash-data.js?v=stu11-r2";
    import { healOwnNameOnce, liveStudentName } from "./nameSync.js?v=stu11";
    import { computeAverage, computeStatus, mergedSectionValues, autoValuesForStudent, parseScore, gradeCalc } from "./gradeCalc.js?v=stu11";
    import { loadStudentDash, startDashRefresh, onDashData } from "./student-dash-data.js?v=stu11-r2";
    import "./ghz-perf.js";
    import { startLastActiveHeartbeat } from "./lastActive.js?v=stu11";
    const L = (p) => import(p);
    const renderBrowseCoursesV2 = async (a) => (await L("./BrowseCoursesV2.js?v=stu11-r2")).renderBrowseCoursesV2(a);
    const renderMyCoursesV2 = async (a) => (await L("./MyCoursesV2.js?v=stu11-r2")).renderMyCoursesV2(a);
    (async () => {
      const h = ((location.hash || "").replace("#","").split("/")[0] || "").replace(/v2$/, "");
      if (h !== "courses") return;
      const tPaint = (typeof performance !== "undefined") ? performance.now() : Date.now();
      const st = getStudentStore();
      let list = getEnrolledCourses(st);
      if (!list.length) return;
      const root = document.getElementById("myCoursesV2Root");
      await renderMyCoursesV2({
        host: root, courses: list, certs: st?.certificates || [], sessions: st?.sessions || [], assigns: st?.assignments || [], subs: st?.submissions || {}, attendance: st?.attendance || [], quizzes: st?.quizzes || [], attempts: st?.quizAttempts || [], results: {}, onOpen: () => {}, onBrowse: () => {}
      });
      try { console.log("[ghz-perf] painted from cache in " + Math.round(((typeof performance !== "undefined") ? performance.now() : Date.now()) - (window.__ghzT0 || tPaint)) + " ms"); } catch (_) {}
    })();
    const renderMyRegistrationsV2 = async (a) => (await L("./MyRegistrationsV2.js?v=stu26-r2")).renderMyRegistrationsV2(a);
    const downloadReceiptPdf = async (a) => (await L("./ReceiptPdf.js?v=stu20")).downloadReceiptPdf(a);
    const openCheckout = async (a) => (await L("./CheckoutFlow.js?v=stu30-r2")).openCheckout(a);
    const renderHomeworkV2 = async (a) => (await L("./HomeworkV2.js?v=stu11-r2")).renderHomeworkV2(a);
    const renderHomeworkDetailV2 = async (a) => (await L("./HomeworkDetailV2.js?v=stu11")).renderHomeworkDetailV2(a);
    const closeHomeworkDetailV2 = async () => { try { (await L("./HomeworkDetailV2.js?v=stu11")).closeHomeworkDetailV2(); } catch (_) {} };
    const renderHomeworkSubmitV2 = async (a) => (await L("./HomeworkSubmitV2.js?v=stu11-r2")).renderHomeworkSubmitV2(a);
    const renderQuizResultV2 = async (a) => (await L("./QuizResultV2.js?v=stu11")).renderQuizResultV2(a);
    const closeQuizResultV2 = async () => { try { (await L("./QuizResultV2.js?v=stu11")).closeQuizResultV2(); } catch (_) {} };
    const renderStudentQuizTake = async (h, a) => (await L("./StudentQuizTake.js?v=stu11-r2")).renderStudentQuizTake(h, a);
    const unmountStudentQuizTake = async () => { try { (await L("./StudentQuizTake.js?v=stu11-r2")).unmountStudentQuizTake(); } catch (_) {} };
    const renderStudentScheduleV2 = async (a) => (await L("./StudentScheduleV2.js?v=stu11-r2")).renderStudentScheduleV2(a);
    const renderAttendanceV2 = async (a) => (await L("./AttendanceV2.js?v=stu11")).renderAttendanceV2(a);
    const renderProfileV2 = async (a) => (await L("./ProfileV2.js?v=stu11-r2")).renderProfileV2(a);
    const renderQuizzesV2 = async (a) => (await L("./QuizzesV2.js?v=stu11-r2")).renderQuizzesV2(a);
    const renderStudentGradesV3 = async (a) => (await L("./StudentGradesV3.js?v=stu11")).renderStudentGradesV3(a);
    const renderStudentGradesV4 = async (a) => (await L("./StudentGradesV4.js?v=stu11")).renderStudentGradesV4(a);
    const renderAnnouncementsV2 = async (a) => (await L("./AnnouncementsV2.js?v=stu11")).renderAnnouncementsV2(a);
    const renderStudentAnnouncementsV2 = async (h, a) => (await L("./StudentAnnouncementsV2.js?v=stu11-r2")).renderStudentAnnouncementsV2(h, a);
    const renderCertificatesV2 = async (a) => (await L("./CertificatesV2.js?v=stu11")).renderCertificatesV2(a);
    window.__ghzBootOk = false;
    const fmtErr = (err, extra) => {
      const msg = err?.message || err?.code || String(err || extra || "error");
      const file = extra?.filename || err?.fileName || "";
      const line = extra?.lineno || err?.lineNumber || "";
      const loc = file ? (String(file).split("/").pop() + (line ? ":" + line : "")) : "";
      return loc ? (msg + " (" + loc + ")") : msg;
    };
    const showSecErr = (host, err, extra) => {
      const text = fmtErr(err, extra);
      window.__ghzBootErr = text;
      if (!host) return;
      host.innerHTML = "<div class='banner'>" + text + "</div>";
    };
    window.addEventListener("error", (ev) => { window.__ghzBootErr = fmtErr(ev.error || ev.message, ev); }, true);
    window.addEventListener("unhandledrejection", (ev) => { window.__ghzBootErr = fmtErr(ev?.reason); });
    setTimeout(() => {
      if (window.__ghzBootOk) return;
      const host = document.querySelector("[id^=view-]:not(.hidden)") || document.getElementById("studentDashRoot") || document.querySelector(".content") || document.body;
      if (host.querySelector(".ghz-bootwatch")) return;
      const card = document.createElement("div");
      card.className = "ghz-bootwatch banner";
      card.style.cssText = "margin:16px;padding:16px;background:#FEF2F2;color:#991B1B;border-radius:14px;max-width:480px";
      card.innerHTML = "<p><strong>This section could not load</strong></p><p>" + (window.__ghzBootErr || "Try again.") + "</p><p><button type='button' class='btn' id='ghzBootReload'>Retry</button></p>";
      host.prepend(card);
      document.getElementById("ghzBootReload")?.addEventListener("click", () => { try { openHash((location.hash||"").replace("#","")); } catch (e) { console.warn("[ghz-reload]", "boot retry", e); } });
    }, 5000);
    try { if (!bootPageShell(document.body)) bootPageMotion(document.body); swapLoadingText(document.body); bootPortalShell(); } catch (_) { try { bootPageMotion(document.body); } catch (e) {} }
    const paintShellBanners = (data) => {
      const pb = document.getElementById("pendingBanner");
      if (!pb) return;
      try { if (sessionStorage.getItem("ghz-hide-pay-notice") === "1") { pb.hidden = true; return; } } catch {}
      const regs = data?.registrations || [];
      const n = regs.filter((r) => r.status === "pending_payment").length;
      const hash = (location.hash || "#dash").replace("#","").split("/")[0];
      const payOk = hash === "dash" || hash === "dashboard" || hash === "regs" || hash === "registrations";
      const phone = window.matchMedia("(max-width: 767px)").matches;
      pb.hidden = n < 1 || (phone && !payOk);
      const txt = document.getElementById("pendingBannerText");
      const btn = pb.querySelector(".pay-notice-btn");
      if (n > 1) {
        if (txt) txt.textContent = n + " registrations waiting for payment";
        if (btn) btn.textContent = "View registrations";
      } else {
        if (txt) txt.textContent = "You have a registration waiting for payment.";
        if (btn) btn.textContent = "View registration";
      }
    };
    document.getElementById("pendingBannerDismiss")?.addEventListener("click", () => {
      const pb = document.getElementById("pendingBanner");
      if (pb) pb.hidden = true;
      try { sessionStorage.setItem("ghz-hide-pay-notice", "1"); } catch {}
    });
    onDashData(paintShellBanners);
    onDashData((data) => {
      const uid = data?.user?.uid;
      if (!uid) return;
      maybeShowCourseResult({ uid, name: data.name });
    });
    const boot = protect("student");
    boot.then(({ user }) => {
      try { startLastActiveHeartbeat(user?.uid); } catch (e) { console.error("lastActiveAt", e?.code || e?.message || e); }
      bootNotify({ role: "student", uid: user?.uid });
      import("./announcementReads.js?v=stu11").then((m) => { try { m.loadAnnouncementReads(user?.uid); } catch (e) { console.error("announcementReads", e?.code || e?.message || e); } }).catch((e) => console.error("announcementReads", e?.code || e?.message || e));
      const bootSched = async () => {
        try {
          const host = document.getElementById("schedV2Root");
          if (!host) return;
          const ok = await renderStudentScheduleV2({
            host,
            onClassic: () => { schedV2Ready = false; showView("schedulev2"); },
            onReady: () => {
              schedV2Ready = true;
              const nav = document.querySelector('[data-view="schedule"], [data-view="schedulev2"]');
              if (nav) { nav.dataset.view = "schedulev2"; nav.setAttribute("href", "#schedulev2"); }
            }
          });
          if (ok && ((location.hash||"").replace("#","") === "schedule" || (location.hash||"").replace("#","") === "schedulev2")) showView("schedulev2");
        } catch (err) { showSecErr(document.getElementById("schedV2Root"), err); }
      };
      const hNow = (location.hash || "").replace("#", "");
      if (hNow === "schedule" || hNow === "schedulev2") bootSched();
      const cached = getStudentStore();
      if (cached && (hNow === "courses" || hNow === "coursesv2")) {
        try { window.__tryMyCoursesV2?.({ fromCache: true, store: cached }); } catch (_) {}
      }
      const listHash = /^(browse|browsev2|courses|coursesv2|regs|regsv2)$/.test(hNow);
      const startStore = () => {
        loadStudentDash(false).then(() => {
          startDashRefresh();
          if (hNow === "schedule" || hNow === "schedulev2") bootSched();
          requestIdleCallback?.(() => {
            ["HomeworkV2.js?v=stu11","StudentScheduleV2.js?v=stu11","AttendanceV2.js?v=stu11","QuizzesV2.js?v=stu11","StudentGradesV4.js?v=stu11"].forEach((f) => import("./" + f).catch(() => {}));
          }) || setTimeout(() => {}, 0);
        }).catch(() => {});
      };
      if (listHash) {
        const kind = /browse/.test(hNow) ? "browse" : /regs/.test(hNow) ? "regs" : "courses";
        loadListPage(kind).catch(() => {});
      } else {
        startStore();
      }
    }).catch(() => {});
    document.addEventListener("pointerenter", (ev) => {
      const a = ev.target && ev.target.closest && ev.target.closest('a[data-view="schedule"], a[href*="schedule"]');
      if (a) import("./StudentScheduleV2.js?v=stu11-r2").catch(() => {});
    }, true);
    const startHash = (location.hash || "").replace("#", "") || "dash";
    bootStudentNav(startHash.replace(/v2$/, "") || "dash");
    try {
      const raw0 = startHash.split("/")[0].replace(/v2$/, "") || "dash";
      const map0 = { dash:"view-dash", browse:"view-browsev2", courses:"view-coursesv2", regs:"view-regsv2", homework:"view-homeworkv2", quizzes:"view-quizv2", grades:"view-gradesv2", schedule:"view-schedulev2", attendance:"view-attendancev2", announcements:"view-announcements", certificates:"view-certificates", profile:"view-profilev2", notifications:"view-notifications", course:"view-coursecontent" };
      const id0 = map0[raw0] || ("view-" + raw0);
      document.querySelectorAll("[id^=view-]").forEach((s) => s.classList.add("hidden"));
      const el0 = document.getElementById(id0);
      if (el0) el0.classList.remove("hidden");
      const titles0 = {dash:"Dashboard",browse:"Browse courses",courses:"My courses",regs:"My registrations",homework:"Homework",quizzes:"Quizzes",grades:"Grades",schedule:"Schedule",attendance:"Attendance",announcements:"Announcements",certificates:"Certificates",profile:"Profile",notifications:"Notifications",course:"Course content"};
      const pt = document.getElementById("pageTitle"); if (pt) pt.textContent = titles0[raw0] || "Student";
      document.querySelectorAll(".side a").forEach((a) => a.classList.toggle("on", (a.dataset.view||"").replace(/v2$/,"") === raw0));
    } catch (_) {}
    import("./StudentTheme.js?v=stu11").then((m) => { try { m.bootStudentTheme(); } catch (err) { window.__ghzBootErr = fmtErr(err); } }).catch((err) => { window.__ghzBootErr = fmtErr(err); });
    const bootDash = () => import("./DashboardV3.js?v=stu11").then((m) => {
      const host = document.getElementById("studentDashRoot");
      try {
        if (m.bootDashboardV3(host, () => { try { bootStudentDash(); } catch (e) { showSecErr(host, e); } })) window.__ghzBootOk = true;
        else showSecErr(host, new Error("Dashboard did not start"));
      } catch (err) { showSecErr(host, err); }
    }).catch((err) => { showSecErr(document.getElementById("studentDashRoot"), err); });
    if (!startHash || startHash === "dash") bootDash();
    else { window.__ghzBootOk = true; }
    let v2Ready = false;
    let navTok = 0;
    const skel = () => `<div class="nv2-skel" style="height:14px;border-radius:8px;background:linear-gradient(90deg,#E5EAF1,#F8FAFC,#E5EAF1);background-size:200% 100%;margin:12px 0"></div><div class="nv2-skel" style="height:14px;width:70%;border-radius:8px;background:#E5EAF1;margin:12px 0"></div>`;
    const paintSkel = (name) => {
      if (name === "homeworkv2") {
        const h = document.getElementById("hwV2Root");
        if (h && !h.querySelector(".hw2-wrap, .hw2-skel")) h.innerHTML = `<h2>Homework</h2><div class="hw2-skel"></div><div class="hw2-skel"></div>`;
        try { void renderHomeworkV2({ host: h, loading: true }); } catch (_) {}
      }
      if (name === "attendancev2") {
        const h = document.getElementById("attV2Root");
        if (h && !h.querySelector(".av2-wrap, .av2-skel")) h.innerHTML = `<h2>Attendance</h2><div class="av2-skel"></div><div class="av2-skel"></div>`;
        try { void renderAttendanceV2({ host: h, loading: true }); } catch (_) {}
      }
      if (name === "gradesv2") {
        const h = document.getElementById("gradesV2Root");
        if (h && !h.querySelector(".sg4")) h.innerHTML = `<div class="sg4"><div class="sg4-head"><div><h2>Grades</h2></div></div><div class="sg4-sk"></div></div>`;
      }
      if (name === "schedule" || name === "schedulev2") {
        const h = document.getElementById("schedV2Root");
        if (h && h.querySelector(".ss2-ready")) { /* keep painted schedule */ }
        else {
          try { void renderStudentScheduleV2({ host: h, loading: true }); } catch (_) {} if (0) {
            if (h && !h.querySelector(".ss2-wrap")) h.innerHTML = `<div class="ss2-wrap ss2-skelwrap"><div class="ss2-head"><h2>Schedule</h2></div><div class="ss2-week"></div><div class="ss2-skel"></div></div>`;
          }
        }
      }
    };
    const showView = (name, keepHash) => {
      navTok += 1;
      const tok = navTok;
      if (name !== "browse" && name !== "browsev2") paintSkel(name);
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const cur = document.querySelector("[id^=view-]:not(.hidden)");
      const el = document.getElementById("view-"+name);
      document.querySelectorAll("[id^=view-]").forEach((s)=> {
        s.classList.add("hidden");
        s.classList.remove("stu-in", "stu-out");
      });
      if (el) {
        el.classList.remove("hidden", "stu-out");
        if (!reduce) { el.classList.remove("stu-in"); requestAnimationFrame(() => el.classList.add("stu-in")); }
        else el.classList.add("stu-in");
      }
      void cur;
      const key = String(name).replace(/v2$/, "");
      try { highlightStudentNav(name); } catch (_) {
        document.querySelectorAll(".side nav a[data-view]").forEach((a)=> {
          const dv = (a.dataset.view || "").replace(/v2$/, "");
          a.classList.toggle("on", dv === key || a.dataset.view === name || (name === "quiztake" && dv === "quizzes") || (key === "quiz" && dv === "quizzes"));
        });
        const navEl = document.querySelector(".side nav");
        const on = navEl && navEl.querySelector("a.on");
        if (on && navEl) {
          const nr = navEl.getBoundingClientRect();
          const ir = on.getBoundingClientRect();
          if (ir.top < nr.top || ir.bottom > nr.bottom) on.scrollIntoView({ block: "nearest" });
        }
      }
      const titles = {dash:"Dashboard",browse:"Browse courses",browsev2:"Browse courses",courses:"My courses",coursesv2:"My courses",course:"Course",coursecontent:"Course content",regs:"My registrations",regsv2:"My registrations",homework:"Homework",homeworkv2:"Homework",quizzes:"Quizzes",quizv2:"Quizzes",quiztake:"Quiz",grades:"Grades",gradesv2:"Grades",schedule:"Schedule",schedulev2:"Schedule",attendance:"Attendance",attendancev2:"Attendance",announcements:"Announcements",notifications:"Notifications",certificates:"Certificates",profile:"Profile",profilev2:"Profile"};
      document.getElementById("pageTitle").textContent = titles[name]||"Student";
      if (!keepHash) {
        const canon = (typeof highlightStudentNav === "function") ? null : null;
        let hashKey = key;
        try { hashKey = ({ quiz: "quizzes", quizv2: "quizzes", homeworkv2: "homework", attendancev2: "attendance", schedulev2: "schedule", browsev2: "browse", coursesv2: "courses", course: "courses", coursecontent: "courses", regsv2: "regs", gradesv2: "grades", quiztake: "quizzes" }[name] || key); } catch (_) {}
        if (name === "coursecontent") {
          const keepCourse = (location.hash || "").replace(/^#/, "");
          if (/^course\//.test(keepCourse)) hashKey = keepCourse;
        }
        history.replaceState(null, "", "#"+hashKey);
      }
      if (name === "quizzes" || name === "quizv2") window.__bootQuizzes?.(tok);
      if (name === "grades" || name === "gradesv2") window.__bootGrades?.(tok);
      if (name === "announcements") window.__bootAnnouncements?.(tok);
      if (name === "certificates") window.__bootCertificates?.(tok);
      if (name === "homework" || name === "homeworkv2") window.__bootHomework?.(tok);
      if (name === "attendance" || name === "attendancev2") window.__bootAttendance?.(tok);
      if (name === "schedule" || name === "schedulev2") window.__bootSchedule?.(tok);
      if (name === "coursecontent") window.__bootCourseContent?.(tok);
      if (key === "browse") loadListPage("browse").catch(() => {});
      else if (key === "regs") loadListPage("regs").catch(() => {});
      else if (key === "courses") loadListPage("courses").catch(() => {});
      else if (key === "dash" || key === "dashboard") {
        try { bootStudentDash(); } catch (_) {}
        if (!window.__ghzDashRefreshOn) loadStudentDash(false).then(() => startDashRefresh()).catch(() => {});
      }
      return tok;
    };
    let myCoursesV2Ready = false;
    let regsV2Ready = false;
    let hwV2Ready = false;
    let schedV2Ready = false;
    let attV2Ready = false;
    let profileV2Ready = false;
    let quizV2Ready = false;
    let gradesV2Ready = false;
    document.querySelectorAll("[data-view]").forEach((a)=> a.onclick=(e)=>{ e.preventDefault(); let v = a.dataset.view; if (v === "browse") v = "browsev2"; if (v === "courses") v = "coursesv2"; if (v === "regs") v = "regsv2"; if (v === "homework" || v === "homeworkv2") v = "homeworkv2"; if (v === "schedule" || v === "schedulev2") v = "schedulev2"; if (v === "attendance" || v === "attendancev2") v = "attendancev2"; if (v === "quizzes") v = "quizv2"; if (v === "grades") v = "gradesv2"; if (v === "profile" || v === "profilev2") { v = "profilev2"; window.__bootProfile?.(); } showView(v); });
    const hash = (location.hash||"").replace("#","");
    const openHash = (h) => {
      const raw = String(h || "");
      const hwM = raw.match(/^homework\/(.+)$/);
      const qzM = raw.match(/^quiz\/(.+)$/);
      const cM = raw.match(/^course\/([^/]+)(?:\/(materials|sessions|overview))?$/);
      if (hwM) {
        showView("homeworkv2", true);
        const id = hwM[1];
        const go = () => window.__openStudentHw?.(id);
        if (window.__openStudentHw) go(); else window.__pendingHw = id;
        return;
      }
      if (qzM) {
        const parts = qzM[1].split("/");
        const id = parts[0];
        const take = parts[1] === "take";
        if (take) {
          showView("quiztake", true);
          if (window.__openStudentQuizTake) window.__openStudentQuizTake(id); else window.__pendingQzTake = id;
        } else {
          showView("quizv2", true);
          if (window.__openStudentQuiz) window.__openStudentQuiz(id); else window.__pendingQz = id;
        }
        return;
      }
      if (cM) {
        window.__ccCourseId = cM[1]; window.__ccTab = cM[2] || "materials";
        showView("coursecontent", true);
        window.__bootCourseContent?.(navTok);
        return;
      }
      const regM = raw.match(/^register\/(.+)$/);
      if (regM) {
        const cid = decodeURIComponent(regM[1]);
        try { sessionStorage.removeItem("ghz-reg-course"); } catch {}
        showView("browsev2", true);
        window.__pendingRegCourse = cid;
        window.__tryPendingReg?.();
        return;
      }
      closeHomeworkDetailV2();
      closeQuizResultV2();
      if (!raw || raw === "dash") return showView("dash");
      if (raw === "regs" || raw === "regsv2") return showView("regsv2");
      if (raw === "browse" || raw === "browsev2") return showView("browsev2");
      if (raw === "courses" || raw === "coursesv2") return showView("coursesv2");
      if (raw === "homework" || raw === "homeworkv2") return showView("homeworkv2");
      if (raw === "schedule" || raw === "schedulev2") return showView("schedulev2");
      if (raw === "attendance" || raw === "attendancev2") return showView("attendancev2");
      if (raw === "profile" || raw === "profilev2") { window.__bootProfile?.(); return showView("profilev2"); }
      if (raw === "quizzes" || raw === "quizv2") return showView("quizv2");
      if (raw === "grades" || raw === "gradesv2") return showView("gradesv2");
      if (raw === "announcements") return showView("announcements");
      if (raw === "notifications") return showView("notifications");
      if (raw === "certificates") return showView("certificates");
      showView(raw);
    };
    const shell = document.querySelector(".content") || document.body;
    if (!shell.dataset.ghzDeleg) {
      shell.dataset.ghzDeleg = "1";
      shell.addEventListener("click", (e) => {
        const t = e.target && e.target.closest && e.target.closest("[data-hw2-open],[data-qz2-view],[data-qz2-start],[data-mc2-open],[data-cv2-view]");
        if (!t) return;
        const hw = t.getAttribute("data-hw2-open");
        const qv = t.getAttribute("data-qz2-view");
        const qs = t.getAttribute("data-qz2-start");
        const mc = t.getAttribute("data-mc2-open");
        const cv = t.getAttribute("data-cv2-view");
        if (hw) { e.preventDefault(); e.stopPropagation(); location.hash = "homework/" + hw; return; }
        if (qv) { e.preventDefault(); e.stopPropagation(); location.hash = "quiz/" + qv; return; }
        if (qs) { e.preventDefault(); e.stopPropagation(); location.hash = "quiz/" + qs + "/take"; return; }
        if (mc) { e.preventDefault(); e.stopPropagation(); location.hash = "course/" + mc; return; }
        if (cv) { e.preventDefault(); window.__openCert?.(cv); return; }
      }, true);
    }
    openHash(hash);
    window.addEventListener("hashchange", () => {
      window.closeAllSheets?.("navigation");
      openHash((location.hash||"").replace("#",""));
    });

    const badge = (s) => {
      const map = { pending_payment:"badge-soon", payment_submitted:"badge-soon", enrolled:"badge-open", rejected:"badge-closed", cancelled:"badge-draft", Open:"badge-open", "Coming soon":"badge-soon", Closed:"badge-closed", Completed:"badge-done" };
      const courseMap = { Open:1, "Coming soon":1, Closed:1, Completed:1, Draft:1, Archived:1 };
      const label = { pending_payment:"pending payment", payment_submitted:"payment submitted", enrolled:"enrolled", cancelled:"Cancelled" }[s] || (courseMap[s] ? courseStatusLabel(s) : s);
      return `<span class="badge ${map[s]||"badge-draft"}">${label}</span>`;
    };
    const timeline = (s) => {
      const steps = ["Registered","Paid","Confirmed"];
      const n = s==="enrolled"?3 : (s==="payment_submitted"?2 : 1);
      return `<p style="font-size:.85rem;color:var(--muted)">${steps.map((t,i)=> (i<n?"●":"○")+" "+t).join(" → ")}</p>`;
    };
    const money = (c) => {
      const n = Number(c.price);
      if (!Number.isFinite(n) || n <= 0) return "Price on request";
      return n + " " + (c.currency || "USD");
    };
    const orderKey = (s) => s === "Open" ? 0 : s === "Coming soon" ? 1 : 2;

    let catalog = [];
    let catalogConfirmed = false;
    let regsByCourse = {};
    let currentUser = null;
    let myAssigns = [];
    let mySubs = {};
    let enrolledRegs = [];

    const cardActions = (c) => {
      const details = `<a class="v2-details" href="./courses.html?course=${encodeURIComponent(c.id)}">View course</a>`;
      const st = String(c.status || "");
      if (st === "Completed") return `<span class="v2-enrolled" style="background:#E5E7EB;color:#374151">Completed</span>${details}`;
      const reg = regsByCourse[c.id];
      const rst = String(reg?.status || "");
      if (rst === "enrolled" || rst === "confirmed") {
        return `<span class="v2-enrolled">Enrolled</span><a class="btn btn-sm v2-pri" href="#course/${encodeURIComponent(c.id)}" data-mc2-open="${c.id}">Open course</a>${details}`;
      }
      if (rst === "pending_payment" || rst === "payment_submitted") {
        return `<span class="v2-enrolled" style="background:#FEF3C7;color:#92400E">Pending</span><a class="btn btn-sm v2-pri" href="#registrations">View registration</a>${details}`;
      }
      if (!canRegisterForCourse(c) || st === "Closed") {
        return `${details}<button class="btn btn-sm" disabled>Registration closed</button>`;
      }
      if (reg && reg.status === "cancelled") {
        if (!currentUser?.emailVerified) return `${details}<button class="btn btn-sm" disabled>Register</button>`;
        return `${details}<button class="btn btn-sm v2-pri" type="button" data-reopen="${reg.id}">Register</button>`;
      }
      if (!currentUser?.emailVerified) {
        return `${details}<button class="btn btn-sm" disabled>Register</button>`;
      }
      return `${details}<button class="btn btn-sm v2-pri" type="button" data-register="${c.id}">Register</button>`;
    };

    const courseCard = (c) => `<article class="course-card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <h3>${c.title||""}</h3>
        ${badge(c.status)}
      </div>
      <p>${c.short||""}</p>
      <p class="meta-line">${c.duration||"—"} · ${c.level||"—"}</p>
      ${deliveryDaysHtml(c, { emptyMode: "announce" })}
      <p class="meta-line">${money(c)} · ${startsEndsLine(c)||"Dates TBC"}</p>
      <div class="card-actions">${cardActions(c)}</div>
    </article>`;

    const againBtn = (r) => {
      const course = catalog.find((c)=>c.id===r.courseId);
      const open = canRegisterForCourse(course?.status);
      if (!open) return `<button class="btn btn-sm" disabled>Register again</button><p style="font-size:.82rem;color:var(--muted)">Registration is closed</p>`;
      if (!currentUser?.emailVerified) return `<button class="btn btn-sm" disabled>Register again</button><p style="font-size:.82rem;color:var(--muted)">Verify your email</p>`;
      return `<button class="btn btn-sm" type="button" data-reopen="${r.id}">Register again</button>`;
    };
    const reopenReg = async (rid, btn) => {
      if (!await ask("Register again for this course? You will then receive payment instructions.")) return;
      if (btn) { btn.disabled = true; btn.textContent = "Registering…"; }
      try {
        await updateDoc(doc(db,"registrations", rid), { status:"pending_payment", createdAt: serverTimestamp() });
        await import("./notify.js?v=r2").then((m) => m.settle(m.notifyRegistrationReceived({ regId: rid, courseId: rid.split("_").slice(1).join("_"), studentName: currentUser?.displayName || "" }))).catch(() => {});
        location.hash = "regs";
        location.reload();
      } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = "Register again"; }
        tell("Could not register. " + (e.code||"") + " " + (e.message||""));
      }
    };
    const bindBrowse = () => {
      window.__tryPendingReg = () => {
        const cid = window.__pendingRegCourse;
        if (!cid) return;
        const c = catalog.find((x)=>x.id===cid);
        const host = document.getElementById("browse") || document.getElementById("browsev2") || document.querySelector("[data-v2-results]")?.parentElement;
        const box = document.getElementById("regClosedBox");
        if (!c || c.status !== "Open") {
          window.__pendingRegCourse = "";
          const el = document.getElementById("view-browsev2") || document.getElementById("view-browse");
          if (el) {
            const note = document.createElement("div");
            note.className = "banner";
            note.innerHTML = `<p>Registration for this course is closed</p><p><a class="btn btn-sm" href="#browse">Browse other courses</a></p>`;
            el.prepend(note);
          }
          return;
        }
        const btn = document.querySelector('[data-register="'+cid+'"]');
        if (btn) { window.__pendingRegCourse = ""; btn.click(); }
      };
      document.querySelectorAll("[data-reopen]").forEach((b)=> b.onclick=()=> reopenReg(b.dataset.reopen, b));
      document.querySelectorAll("[data-register]").forEach((b)=> b.onclick = async () => {
        const id = b.dataset.register;
        const c = catalog.find((x)=>x.id===id);
        if (!c || !currentUser) return;
        try {
          const us = await getDoc(doc(db, "users", currentUser.uid));
          const profile = us.exists() ? us.data() : {};
          await openCheckout({ user: currentUser, profile, course: c });
        } catch (e) {
          const msg = e.code || e.message || String(e);
          const box = document.createElement("div");
          box.className = "co-page";
          box.innerHTML = `<div class="co-top"><div class="co-brand"><img src="./logo.png" alt="GHz Academy" /><span>GHz Academy</span></div><a class="co-back" href="#browse">Back to course</a></div><div class="co-wrap"><div class="co-err" role="alert"><p>Could not open registration.</p><button type="button" class="co-pri" id="coTry">Try again</button><p class="co-help">${String(msg).replace(/</g,"")}</p></div></div>`;
          document.body.appendChild(box);
          box.querySelector("#coTry").onclick = () => { box.remove(); document.querySelector('[data-register="'+id+'"]')?.click(); };
          box.querySelector(".co-back").onclick = (ev) => { ev.preventDefault(); box.remove(); location.hash = "browse"; };
        }
      });
      window.__tryPendingReg?.();
    };

    const failBox = (el, e) => {
      console.error(e);
      const code = e?.code || e?.message || String(e);
      el.innerHTML = `<p class="banner">Could not load courses (${code})</p>`;
    };
    const catalogFresh = (st) => {
      if (!st || !Array.isArray(st.catalog) || !st.catalog.length) return false;
      const at = Number(st.catalogAt || 0);
      if (!at || Date.now() - at > 10 * 60 * 1000) return false;
      return true;
    };
    const loadCourses = async (status) => {
      let st = getStudentStore();
      if (!catalogFresh(st)) {
        st = await loadListPage("browse");
      }
      const rows = Array.isArray(st?.catalog) ? st.catalog : [];
      return status ? rows.filter((c) => c.status === status) : rows;
    };
    const renderBrowse = () => { bindBrowse(); };
    const refreshBrowse = async () => {
      try {
        catalog = await loadCourses("");
        catalogConfirmed = true;
        await tryBrowseV2();
      } catch (e) { showSecErr(document.getElementById("browseV2Root"), e); }
    };

    const showClassicBrowse = () => { showSecErr(document.getElementById("browseV2Root"), new Error("Could not load Browse courses")); };
    const tryBrowseV2 = async () => {
      const root = document.getElementById("browseV2Root");
      if (!root) return;
      const phone = window.matchMedia("(max-width: 767px)").matches;
      if (phone) {
        const started = performance.now();
        const timer = setTimeout(() => {
          if (!root.querySelector(".v2-card, .v2-empty, .v2-fail")) {
            try { console.log("[ghz-courses-phone] error timeout"); } catch {}
            root.innerHTML = '<div class="v2-fail"><p>Could not load courses</p><button class="btn btn-sm" type="button" id="ghzBrowseRetry">Retry</button></div>';
            root.querySelector("#ghzBrowseRetry")?.addEventListener("click", () => refreshBrowse());
          }
        }, 6000);
        try {
          const okPhone = await renderBrowseCoursesV2({
            host: root,
            catalog: Array.isArray(catalog) ? catalog : [],
            catalogConfirmed,
            cardActions,
            money,
            badge,
            bind: bindBrowse,
            onClassic: () => showSecErr(document.getElementById('browseV2Root'), new Error('Browse courses failed')),
            onReady: () => { v2Ready = true; }
          });
          clearTimeout(timer);
          try { console.log("[ghz-courses-phone] tryBrowse", Math.round(performance.now()-started)+"ms", okPhone); } catch {}
          if (!okPhone) v2Ready = false;
          return;
        } catch (err) {
          clearTimeout(timer);
          try { console.log("[ghz-courses-phone] error", err?.code || err?.message || err); } catch {}
          root.innerHTML = '<div class="v2-fail"><p>Could not load courses</p><button class="btn btn-sm" type="button" id="ghzBrowseRetry">Retry</button></div>';
          root.querySelector("#ghzBrowseRetry")?.addEventListener("click", () => refreshBrowse());
          return;
        }
      }
      const ok = await renderBrowseCoursesV2({
        host: root,
        catalog: Array.isArray(catalog) ? catalog : [],
        catalogConfirmed,
        cardActions,
        money,
        badge,
        bind: bindBrowse,
        onClassic: () => showSecErr(document.getElementById('browseV2Root'), new Error('Browse courses failed')),
        onReady: () => {
          v2Ready = true;
          const nav = document.getElementById("navBrowse");
          if (nav) { nav.dataset.view = "browsev2"; nav.setAttribute("href", "#browsev2"); }
        }
      });
      if (!ok) v2Ready = false;
      if (!document.getElementById("pc1Modal")) {
        const m = document.createElement("div");
        m.id = "pc1Modal"; m.className = "pc1-modal"; m.hidden = true;
        document.body.appendChild(m);
      }
      root.onclick = async (ev) => {
        const a = ev.target && ev.target.closest && ev.target.closest("[data-view], .v2-details");
        if (!a) return;
        const href = a.getAttribute("href") || "";
        const id = a.getAttribute("data-view") || (href.match(/course=([^&]+)/) || [])[1];
        if (!id) return;
        ev.preventDefault();
        const c = (Array.isArray(catalog) ? catalog : []).find((x) => x.id === decodeURIComponent(id));
        if (!c) return;
        const { openModal } = await import("./PublicCoursesV1.js?v=12");
        openModal(c, "student", catalog);
      };
    };

    const hwStatus = (a) => {
      const sub = mySubs[a.id];
      if (sub?.status === "graded") return { label: "Graded", cls: "badge-open" };
      if (sub) {
        const due = a.dueDate ? new Date(a.dueDate) : null;
        const at = sub.submittedAt?.toDate ? sub.submittedAt.toDate() : null;
        if (due && at && at > due) return { label: "Late", cls: "badge-closed" };
        return { label: "Submitted", cls: "badge-soon" };
      }
      return { label: "Not submitted", cls: "badge-draft" };
    };
    const hwGrade = (a) => {
      const sub = mySubs[a.id];
      if (sub?.status !== "graded") return "—";
      const max = Number(a.maxPoints);
      const g = Number(sub.grade);
      if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(g)) return "—";
      return Math.round((g / max) * 100) + "/100";
    };
    const hwBadge = (a) => {
      const st = hwStatus(a);
      return `<span class="badge ${st.cls}">${st.label}</span>`;
    };
    const renderAllHw = () => {
      const rows = [...myAssigns].sort((a,b)=> String(a.dueDate||"").localeCompare(String(b.dueDate||"")));
      document.getElementById("allHw").innerHTML = rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Homework</th><th>Status</th><th>Grade</th><th></th></tr></thead><tbody>` +
        rows.map(a=>`<tr><td><strong>${a.title||"Homework"}</strong><p style="color:var(--muted);font-size:.85rem;margin-top:4px">due ${a.dueDate||"—"}</p></td><td>${hwBadge(a)}</td><td>${hwGrade(a)}</td><td><button class="btn btn-sm" data-openhw="${a.id}">Open</button></td></tr>`).join("") +
        `</tbody></table></div>` : "<p>No homework yet.</p>";
      document.querySelectorAll("[data-openhw]").forEach(b=> b.onclick=()=> openHw(b.dataset.openhw));
    };
    const renderGrades = () => {
      const graded = Object.values(mySubs).filter(s=>s.status==="graded").map(s=>({s, a: myAssigns.find(x=>x.id===s.assignmentId)||{id:s.assignmentId, title:s.assignmentId, courseId:s.courseId, courseTitle:s.courseId, maxPoints:s.maxPoints||0}}));
      const byCourse = {};
      graded.forEach(({a,s})=>{
        byCourse[a.courseId] = byCourse[a.courseId] || {title:a.courseTitle, rows:[], tot:0, max:0};
        byCourse[a.courseId].rows.push({a,s});
        byCourse[a.courseId].tot += Number(s.grade||0);
        byCourse[a.courseId].max += Number(a.maxPoints||0);
      });
      const html = Object.values(byCourse).map(g=>{
        const avg = g.max ? Math.round((g.tot/g.max)*100) : 0;
        return `<h3 style="margin:16px 0 8px">${g.title} · average ${avg}%</h3>
          <div class="table-wrap"><table class="data"><thead><tr><th>Title</th><th>Grade</th><th>Feedback</th><th>Date</th></tr></thead><tbody>
          ${g.rows.map(({a,s})=>{ const max=Number(a.maxPoints||0); const g=Number(s.grade); const p=max>0&&Number.isFinite(g)?Math.round((g/max)*100)+"/100":"—"; return `<tr><td>${a.title}</td><td>${p}</td><td>${s.feedback||""}</td><td>${s.gradedAt?.toDate?s.gradedAt.toDate().toLocaleDateString():"—"}</td></tr>`; }).join("")}
          </tbody></table></div>`;
      }).join("");
      document.getElementById("allGrades").innerHTML = html || "<p>No grades yet.</p>";
    };
    let myCourseDocs = [];
    window.__openMyCourse = (cid) => { location.hash = "course/" + cid; };
    const openMyCourse = async (cid) => {
      location.hash = "course/" + cid;
      return;
      let c = myCourseDocs.find(x=>x.id===cid);
      try {
        const fresh = await getDoc(doc(db, "courses", cid));
        if (fresh.exists()) { c = { id: fresh.id, ...fresh.data() }; const i = myCourseDocs.findIndex(x=>x.id===cid); if (i>=0) myCourseDocs[i]=c; else myCourseDocs.push(c); }
      } catch (e) {
        document.getElementById("sovPane").innerHTML = `<p class="banner">${friendlyError(e)}</p>`;
        showView("course");
        return;
      }
      if (!c) return;
      const title = c.title ?? "";
      const full = c.full || c.short || catalog.find(x=>x.id===cid)?.full || catalog.find(x=>x.id===cid)?.short || "You are enrolled in this course.";
      const outline = Array.isArray(c.outline) ? c.outline : [];
      const trainer = c.trainerName || c.instructor || "";
      document.getElementById("sovPane").innerHTML = `<article class="stu-course-info">
        <div class="kicker" style="letter-spacing:.14em;font-size:.72rem;color:#0891b2">${statusBadgeHtml(c)}</div>
        <h2 style="margin:8px 0 10px">${title}</h2>
        <div class="meta-line" style="display:flex;flex-wrap:wrap;gap:10px;color:var(--muted);margin-bottom:10px">
          <span>${c.duration||"Duration TBC"}</span>
          <span>${c.level||"Level TBC"}</span>
          ${startsEndsLine(c)?`<span>${startsEndsLine(c)}</span>`:""}
          ${trainer?`<span>${trainer}</span>`:""}
        </div>
        ${deliveryDaysHtml(c, { emptyMode: "announce" })}
        <p style="line-height:1.65;margin:14px 0 18px">${full}</p>
        <h3 style="margin:22px 0 8px;font-size:1.05rem">Outline</h3>
        ${outline.length ? `<ol style="padding-left:20px;color:var(--muted);line-height:1.7">${outline.map(m=>`<li><strong>${m.title||""}</strong>${m.description?" — "+m.description:""}</li>`).join("")}</ol>` : `<p style="color:var(--muted)">Outline will be published with the course.</p>`}
        <h3 style="margin:22px 0 8px;font-size:1.05rem">Prerequisites</h3>
        <p style="color:var(--muted)">${c.prerequisites||"Listed on registration."}</p>
      </article>`;
      showView("course");
    };
    const saveHwPayload = async (a, text, link, errTarget) => {
      const payload = { assignmentId:a.id, courseId:a.courseId, uid:currentUser.uid, studentName: window.__ghzLiveName || document.getElementById("userName").textContent||"", text, link, submittedAt: serverTimestamp(), status:"submitted" };
      try {
        await setDoc(doc(db,"submissions", a.id+"_"+currentUser.uid), payload, { merge: true });
        await import("./notify.js?v=r2").then((m) => m.settle(m.notifyHomeworkSubmitted({ submissionId: a.id + "_" + currentUser.uid, courseId: a.courseId, assignmentTitle: a.title, studentName: payload.studentName }))).catch(() => {});
        toastOk = true; closeHomeworkDetailV2(); location.reload();
      } catch(e){
        if (errTarget) { errTarget.hidden = false; errTarget.style.display="block"; errTarget.textContent=(e.code||"")+" "+(e.message||""); }
      }
    };
    window.__openStudentHw = async (aid) => {
      const host = document.getElementById("hd2Root");
      if (host) host.innerHTML = `<div class="hd2-skel" style="min-height:120px"></div>`;
      try {
        let store = await ensureSectionData(["enrollments", "catalog", "assignments", "submissions"]);
        const a = (store.assignments || []).find((x) => x.id === aid) || myAssigns.find((x) => x.id === aid);
        if (!a) throw Object.assign(new Error("not-found"), { code: "not-found" });
        const sub = (store.submissions || []).find((s) => s.assignmentId === aid) || mySubs[aid];
        const course = store.courses?.[a.courseId] || myCourseDocs.find((c) => c.id === a.courseId) || { title: a.courseTitle, status: "" };
        const uid = currentUser?.uid || store.user?.uid || store.user?.id;
        const ok = await renderHomeworkSubmitV2({
          host,
          assignment: a,
          sub,
          course,
          user: { uid, displayName: window.__ghzLiveName || "", name: window.__ghzLiveName || "" },
          onClose: () => { closeHomeworkDetailV2(); if ((location.hash||"").indexOf("homework/") === 1) location.hash = "homework"; },
          onSaved: () => { toastOk = true; closeHomeworkDetailV2(); location.hash = "homework"; loadStore(true); }
        });
        if (ok) return;
        await renderHomeworkDetailV2({
          host, assignment: a, sub, course,
          onSave: async ({ text, link, assignment, onError }) => {
            try {
              await setDoc(doc(db,"submissions", assignment.id+"_"+uid), { assignmentId:assignment.id, courseId:assignment.courseId, uid, studentName: window.__ghzLiveName || "", text, link, submittedAt: serverTimestamp(), status:"submitted" }, { merge: true });
              await import("./notify.js?v=r2").then((m) => m.settle(m.notifyHomeworkSubmitted({ submissionId: assignment.id + "_" + uid, courseId: assignment.courseId, assignmentTitle: assignment.title, studentName: window.__ghzLiveName || "" }))).catch(() => {});
              toastOk = true; closeHomeworkDetailV2(); location.hash = "homework"; loadStore(true);
            } catch (e) { onError?.((e.code||"")+" "+(e.message||"")); }
          }
        });
      } catch (e) {
        if (host) host.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="hdRetry">Try again</button>`;
        document.getElementById("hdRetry")?.addEventListener("click", () => window.__openStudentHw(aid));
      }
    };
    window.__openStudentQuiz = async (qid) => {
      const host = document.getElementById("qr2Root");
      try {
        let store = await ensureSectionData(["enrollments", "catalog", "quizzes", "quizAttempts"]);
        const q = (store.quizzes || []).find((x) => x.id === qid);
        if (!q) throw Object.assign(new Error("not-found"), { code: "not-found" });
        const att = (store.quizAttempts || []).find((x) => x.quizId === qid);
        const course = store.courses?.[q.courseId] || { title: q.courseTitle || "" };
        if (att) {
          if (host) host.innerHTML = `<div class="qr2-skel" style="min-height:120px"></div>`;
          await renderQuizResultV2({ host, quiz: q, attempt: att, course, onClose: () => { closeQuizResultV2(); if ((location.hash||"").indexOf("quiz/") === 1) location.hash = "quizzes"; } });
        } else {
          location.hash = "quiz/" + qid + "/take";
        }
      } catch (e) {
        if (host) host.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="qrRetry">Try again</button>`;
        document.getElementById("qrRetry")?.addEventListener("click", () => window.__openStudentQuiz(qid));
      }
    };
    window.__openStudentQuizTake = async (qid) => {
      const host = document.getElementById("quizTakeRoot");
      if (!host) return;
      host.innerHTML = `<div class="qt2-skel" style="min-height:120px"></div>`;
      try {
        let store = await ensureSectionData(["enrollments", "catalog", "quizzes", "quizAttempts"]);
        const q = (store.quizzes || []).find((x) => x.id === qid);
        if (!q) throw Object.assign(new Error("not-found"), { code: "not-found" });
        const att = (store.quizAttempts || []).find((x) => x.quizId === qid);
        const course = store.courses?.[q.courseId] || { title: q.courseTitle || "" };
        if (att) {
          location.hash = "quiz/" + qid;
          return;
        }
        await renderStudentQuizTake(host, {
          quiz: q, course, uid: currentUser?.uid, studentName: window.__ghzLiveName || "",
          onBack: async () => { unmountStudentQuizTake(); location.hash = "quizzes"; },
          onSubmitted: () => { loadStore(true); }
        });
      } catch (e) {
        host.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="qtRetry">Try again</button>`;
        document.getElementById("qtRetry")?.addEventListener("click", () => window.__openStudentQuizTake(qid));
      }
    };
    if (window.__pendingHw) { const id = window.__pendingHw; window.__pendingHw = null; window.__openStudentHw(id); }
    if (window.__pendingQz) { const id = window.__pendingQz; window.__pendingQz = null; window.__openStudentQuiz(id); }
    if (window.__pendingQzTake) { const id = window.__pendingQzTake; window.__pendingQzTake = null; window.__openStudentQuizTake(id); }
    const openHw = (aid) => {
      location.hash = "homework/" + aid;
    };
    const openHwLegacy = async (aid) => {
      const a = myAssigns.find(x=>x.id===aid); if (!a) return;
      const sub = mySubs[aid];
      const course = myCourseDocs.find(c=>c.id===a.courseId) || { title: a.courseTitle, status: "" };
      if (hwV2Ready) {
        const host = document.getElementById("hd2Root");
        const ok = await renderHomeworkSubmitV2({
          host,
          assignment: a,
          sub,
          course,
          user: { uid: currentUser.uid, displayName: window.__ghzLiveName || document.getElementById("userName")?.textContent || "", name: window.__ghzLiveName || document.getElementById("userName")?.textContent || "" },
          onClose: () => { closeHomeworkDetailV2(); host.innerHTML = ""; },
          onSaved: () => { toastOk = true; closeHomeworkDetailV2(); location.reload(); }
        });
        if (ok) return;
        await renderHomeworkDetailV2({
          host,
          assignment: a,
          sub,
          course,
          onSave: async ({ text, link, assignment, onError }) => {
            const payload = { assignmentId:assignment.id, courseId:assignment.courseId, uid:currentUser.uid, studentName: window.__ghzLiveName || document.getElementById("userName").textContent||"", text, link, submittedAt: serverTimestamp(), status:"submitted" };
            try {
              await setDoc(doc(db,"submissions", assignment.id+"_"+currentUser.uid), payload, { merge: true });
              await import("./notify.js?v=r2").then((m) => m.settle(m.notifyHomeworkSubmitted({ submissionId: assignment.id + "_" + currentUser.uid, courseId: assignment.courseId, assignmentTitle: assignment.title, studentName: payload.studentName }))).catch(() => {});
              toastOk = true; closeHomeworkDetailV2(); location.reload();
            } catch(e){ onError?.((e.code||"")+" "+(e.message||"")); }
          }
        });
        return;
      }
      const courseDone = course?.status === "Completed";
      const graded = sub?.status==="graded" || courseDone;
      const modal = document.getElementById("modal");
      modal.classList.remove("hidden");
      modal.innerHTML = `<div class="sheet"><h2>${a.title}</h2>
        <p>${a.instructions||""}</p>
        ${a.link?`<p><a href="${a.link}" target="_blank" rel="noopener">Reference</a></p>`:""}
        <p>Due ${a.dueDate||"—"} · ${a.maxPoints||0} pts</p>
        ${graded?`<p><strong>Grade:</strong> ${(()=>{ const max=Number(a.maxPoints||0); const g=Number(sub?.grade); return max>0&&Number.isFinite(g)?Math.round((g/max)*100)+"/100":"—"; })()}</p><p>${sub?.feedback||sub?.text||""}</p>`:`
        <label>Your answer</label><textarea id="stext" style="width:100%;min-height:90px;padding:12px;border:1px solid var(--line);border-radius:10px;font:inherit">${sub?.text||""}</textarea>
        <label>Link (optional)</label><input id="slink" value="${sub?.link||""}" />`}
        <p id="herr" class="err"></p>
        ${graded?"":`<button class="btn" id="ssave">${sub?"Update submission":"Submit"}</button>`}
        <button class="btn btn-ghost" id="scancel">Close</button></div>`;
      modal.querySelector("#scancel").onclick=()=> modal.classList.add("hidden");
      const save = modal.querySelector("#ssave");
      if (save) save.onclick=async()=>{
        await saveHwPayload(a, document.getElementById("stext").value, document.getElementById("slink").value.trim(), document.getElementById("herr"));
        document.getElementById("modal").classList.add("hidden");
      };
    };
    let toastOk = false;

    boot.then(async ({ user, profile }) => {
      if (!user) return;
      try { window.__ghzMarkAuth?.(performance.now() - (window.__ghzT0 || 0)); } catch (_) {}
      currentUser = user;
      window.__ghzLiveName = liveStudentName(profile, user);
      try { const n = document.getElementById("userName"); if (n && window.__ghzLiveName) n.textContent = window.__ghzLiveName; } catch (_) {}
      healOwnNameOnce(user.uid, window.__ghzLiveName).catch(() => {});
      try { prefetchStudentCore(); } catch (_) {}
      {
        const land = ((location.hash || "").replace("#","").split("/")[0] || "dash").replace(/v2$/, "");
        if (land === "dash" || land === "dashboard" || land === "") {
          try { bootStudentDash(); } catch (err) { window.__ghzBootErr = err?.message || String(err); console.error(err); }
        }
        window.__ghzBootOk = true;
      }
      const paintSkel = (el) => { if (el && !el.dataset.filled) el.innerHTML = skel(); };
      const liveSection = (tok, keys, paint) => {
        const off = onDashData((st) => {
          if (tok && tok !== navTok) return;
          try { paint(st, false); } catch (_) {}
        });
        paint(getStudentStore() || {}, true);
        ensureSectionData(keys).then((st) => { if (!(tok && tok !== navTok)) paint(st, false); }).catch((e) => paint({ errors: { section: e } }, false));
        return off;
      };
      window.__bootQuizzes = async (tok) => {
        const host = document.getElementById("quizV2Root");
        try { await renderQuizzesV2({ host, loading: true }); } catch (e) { showSecErr(host, e); return; }
        liveSection(tok, ["enrollments", "registrations", "catalog", "quizzes", "quizAttempts"], async (store, first) => {
          const meta = store?._meta || {};
          const ready = meta.enrollments === "ready" && meta.quizzes === "ready";
          const courses = getEnrolledCourses(store);
          if (!ready && !courses.length) {
            await renderQuizzesV2({ host, loading: true });
            return;
          }
          const err = store.errors && (store.errors.quizzes || store.errors.enrollments);
          if (err && !courses.length) {
            host.innerHTML = `<p class="banner">${friendlyError(err)}</p><button class="btn btn-sm" type="button" id="qzRetry">Try again</button>`;
            document.getElementById("qzRetry")?.addEventListener("click", () => window.__bootQuizzes?.(navTok));
            return;
          }
          quizV2Ready = !!(await renderQuizzesV2({ host, courses, quizzes: store.quizzes || [], attempts: store.quizAttempts || [], stale: !ready, onView: (id) => { location.hash = "quiz/" + id; }, onStart: (id) => { location.hash = "quiz/" + id + "/take"; } }));
        });
      };
      window.__bootGrades = async (tok) => {
        const host = document.getElementById("gradesV2Root");
        const student = { name: window.__ghzLiveName || "", email: user.email || "", studentId: "" };
        try { await renderStudentGradesV4({ host, loading: true, onRetry: () => window.__bootGrades?.(navTok) }); } catch (e) { showSecErr(host, e); return; }
        try {
          const store = await ensureSectionData(["enrollments", "catalog", "assignments", "quizzes", "sessions", "attendance", "submissions", "quizAttempts", "grades"]);
          if (tok && tok !== navTok) return;
          student.name = window.__ghzLiveName || store.name;
          student.studentId = store.studentId || store.user?.studentId || "";
          const { mergedSectionValues } = await import("./gradeCalc.js?v=stu11");
          const { db } = await import("./firebase-config.js?v=auth10");
          const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
          const ens = getEnrolledCourses(store).map((c) => ({ courseId: c.id, courseTitle: c.title, status: c.status, courseStatus: c.status }));
          const schemeJobs = ens.map((en) => getDoc(doc(db, "gradeSchemes", en.courseId)).then((s) => ({ id: en.courseId, ok: true, snap: s })).catch((err) => ({ id: en.courseId, ok: false, err })));
          const scoreJobs = ens.map((en) => getDoc(doc(db, "gradeScores", user.uid + "_" + en.courseId)).then((s) => ({ id: en.courseId, ok: true, snap: s })).catch((err) => ({ id: en.courseId, ok: false, err })));
          const [schemeRes, scoreRes] = await Promise.all([
            Promise.allSettled(schemeJobs),
            Promise.allSettled(scoreJobs)
          ]);
          const schemes = {}, schemeErr = {}, scoresMap = {};
          schemeRes.forEach((p) => {
            const r = p.status === "fulfilled" ? p.value : null;
            if (!r) return;
            if (!r.ok) { schemeErr[r.id] = r.err?.code || r.err?.message || "error"; return; }
            if (r.snap && r.snap.exists && r.snap.exists()) schemes[r.id] = r.snap.data();
          });
          scoreRes.forEach((p) => {
            const r = p.status === "fulfilled" ? p.value : null;
            if (!r || r.skip) return;
            if (r.ok && r.snap && r.snap.exists && r.snap.exists()) scoresMap[r.id] = r.snap.data() || {};
          });
          const courses = ens.map((en) => {
            const c = store.courses?.[en.courseId] || {};
            const scheme = schemes[en.courseId] || store.gradeSchemes?.[en.courseId] || null;
            const gradeDoc = scoresMap[en.courseId] && Object.keys(scoresMap[en.courseId]).length ? scoresMap[en.courseId] : (store.gradeScores?.[en.courseId] || null);
            const scores = (gradeDoc && gradeDoc.scores && typeof gradeDoc.scores === "object") ? gradeDoc.scores : (gradeDoc && typeof gradeDoc === "object" ? gradeDoc : {});
            const pack = {
              assignments: (store.assignments || []).filter((a) => a.courseId === en.courseId),
              quizzes: (store.quizzes || []).filter((q) => q.courseId === en.courseId),
              sessions: (store.sessions || []).filter((s) => s.courseId === en.courseId),
              attendance: (store.attendance || []).filter((s) => s.courseId === en.courseId),
              submissions: (store.submissions || []).filter((s) => s.courseId === en.courseId),
              quizAttempts: (store.quizAttempts || []).filter((s) => s.courseId === en.courseId)
            };
            const status = c.status || en.status || en.courseStatus || "Open";
            const scoresLoaded = Object.keys(scores).length > 0;
            const vals = scheme && /^completed$/i.test(String(status).trim()) && gradeDoc ? scores : {};
            const trainerNames = [].concat(c.trainerNames || [], c.trainerName ? [c.trainerName] : []).filter(Boolean);
            console.log("[sg4 boot]", en.courseId, c.title || en.courseTitle || en.courseId, status, "scheme=" + !!scheme, "scores=" + scoresLoaded);
            const published = gradeDoc && (gradeDoc.finalGrade != null || gradeDoc.status) ? gradeDoc : null;
            return { id: en.courseId, uid: user.uid, title: c.title || en.courseTitle || en.courseId, status, scheme, vals, scores: scores && typeof scores === "object" ? scores : {}, pack, scoresLoaded, schemeErr: schemeErr[en.courseId] || "", endDate: c.endDate || en.endDate, startDate: c.startDate || en.startDate, trainerNames, trainerName: c.trainerName || trainerNames.join(", "), gradeDoc: gradeDoc || null, published };
          });
          gradesV2Ready = !!(await renderStudentGradesV4({
            host, courses, student,
            onRetry: () => window.__bootGrades?.(navTok)
          }));
        } catch (e) {
          if (host) host.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="grRetry">Retry</button>`;
          document.getElementById("grRetry")?.addEventListener("click", () => window.__bootGrades?.(navTok));
        }
      };
      {
        const gh = (location.hash || "").replace("#", "");
        if (gh === "grades" || gh === "gradesv2") window.__bootGrades?.(navTok);
      }
      window.__bootAnnouncements = async (tok) => {
        const host = document.getElementById("annV2Root");
        try {
          await renderStudentAnnouncementsV2(host, {
            onClassic: () => {
              whenStudentStore().then(async (store) => {
                const courses = {};
                (store.enrollments || []).forEach((en) => { courses[en.courseId] = en.courseTitle || store.courses?.[en.courseId]?.title || en.courseId; });
                await renderAnnouncementsV2({ host, items: store.announcements || [], courses, uid: store.user?.uid || store.user?.id });
              }).catch((e) => { if (host) host.innerHTML = `<p class="banner">${friendlyError(e)}</p>`; });
            }
          });
        } catch (e) {
          if (host) host.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="annRetry">Try again</button>`;
          document.getElementById("annRetry")?.addEventListener("click", () => window.__bootAnnouncements?.(tok));
        }
      };
      window.__bootCourseContent = async (tok) => {
        const host = document.getElementById("cc1Root");
        const cidRaw = window.__ccCourseId || ((location.hash||"").match(/^#course\/([^/?#]+)/)||[])[1];
        const cid = cidRaw ? decodeURIComponent(cidRaw) : "";
        try {
          const m = await import("./CourseContentV1.js?v=docx2-r2");
          try { m.renderCourseContentV1({ host, loading: true }); } catch (_) {}
          if (!cid) return;
          m.renderCourseContentV1({ host, courseId: cid, role: "student", uid: user.uid, name: window.__ghzLiveName || "" });
        } catch (err) {
          window.__ghzBootErr = err?.message || String(err);
          if (host) host.innerHTML = `<p class="banner">${friendlyError(err)}</p>`;
        }
      };
      window.__bootHomework = async (tok) => {
        const host = document.getElementById("hwV2Root");
        try { await renderHomeworkV2({ host, loading: true }); } catch (_) {}
        liveSection(tok, ["enrollments", "registrations", "catalog", "assignments", "submissions"], async (store, first) => {
          const meta = store?._meta || {};
          const ready = meta.enrollments === "ready" && meta.assignments === "ready";
          const courses = getEnrolledCourses(store);
          if (!ready && !courses.length) {
            await renderHomeworkV2({ host, loading: true });
            return;
          }
          const subs = {};
          (store.submissions || []).forEach((s) => { if (s.assignmentId) subs[s.assignmentId] = s; });
          hwV2Ready = !!(await renderHomeworkV2({ host, courses, assigns: store.assignments || [], subs, stale: !ready, onOpen: (id) => { location.hash = "homework/" + id; } }));
        });
      };
      window.__bootAttendance = async (tok) => {
        const host = document.getElementById("attV2Root");
        const paintAtt = (store) => {
          const courses = getEnrolledCourses(store).map((c) => ({
            id: c.id, title: c.title, status: c.status,
            sessions: (store.sessions || []).filter((s) => s.courseId === c.id),
            recs: (store.attendance || []).filter((a) => a.courseId === c.id)
          }));
          return renderAttendanceV2({ host, uid: store.user?.uid || user.uid, student: { name: window.__ghzLiveName || "" }, courses });
        };
        try {
          const cached = getStudentStore();
          const hasAtt = !!(cached && asArray(cached.attendance).length);
          const hasSess = !!(cached && asArray(cached.sessions).length);
          if (hasAtt && hasSess) attV2Ready = !!(await paintAtt(cached));
          else try { await renderAttendanceV2({ host, loading: true }); } catch (_) {}
          const store = await Promise.all([ensureAttendance(), ensureSessions(), ensureEnrollments()]).then(() => getStudentStore());
          if (tok && tok !== navTok) return;
          const attErr = store?.errors && Object.keys(store.errors).find((k) => k.startsWith("attendance"));
          if (attErr && !(store.attendance || []).length) {
            host.innerHTML = `<p class="banner">${store.errors[attErr].code || attErr}</p><button class="btn btn-sm" type="button" id="attRetry">Try again</button>`;
            document.getElementById("attRetry")?.addEventListener("click", () => window.__bootAttendance?.(navTok));
            return;
          }
          attV2Ready = !!(await paintAtt(store || {}));
          ensureCatalog().catch(() => {});
        } catch (e) {
          if (host) host.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="attRetry2">Try again</button>`;
          document.getElementById("attRetry2")?.addEventListener("click", () => window.__bootAttendance?.(navTok));
        }
      };
      window.__bootSchedule = async (tok) => {
        const host = document.getElementById("schedV2Root");
        if (!(host && host.querySelector(".ss2-ready"))) {
          try { await renderStudentScheduleV2({ host, loading: true }); } catch (_) {}
        }
        try {
          const store = await ensureSectionData(["enrollments", "catalog", "sessions", "attendance"]);
          if (tok && tok !== navTok) return;
          const courses = getEnrolledCourses(store);
          schedV2Ready = !!(await renderStudentScheduleV2({ host, courses, sessions: store.sessions || [], attendance: store.attendance || [], uid: user.uid }));
        } catch (e) {
          if (host) host.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="scRetry">Try again</button>`;
          document.getElementById("scRetry")?.addEventListener("click", () => window.__bootSchedule?.(navTok));
        }
      };
      window.__bootCertificates = async (tok) => {
        const host = document.getElementById("certV2Root");
        paintSkel(host);
        try {
          const store = await ensureSectionData(["enrollments", "catalog", "certificates"]);
          if (tok && tok !== navTok) return;
          const enrolled = getEnrolledCourses(store);
          const coursesMap = {};
          enrolled.forEach((c) => { coursesMap[c.id] = c; });
          await renderCertificatesV2({ host, student: { name: window.__ghzLiveName, uid: user.uid }, certs: store.certificates || [], enrolls: enrolled.map((c) => ({ courseId: c.id, courseTitle: c.title })), courses: coursesMap });
        } catch (e) {
          if (host) host.innerHTML = `<p class="banner">${friendlyError(e)}</p>`;
        }
      };
      let profileBooted = false;
      const bootProfile = async () => {
        const host = document.getElementById("profileV2Root");
        if (host && !profileBooted) host.innerHTML = skel();
        if (profileBooted) return;
        profileBooted = true;
        try {
          const showClassicProfile = () => {};
          const okP = await renderProfileV2({
            host: document.getElementById("profileV2Root"),
            db, uid: user.uid, email: user.email || "",
            fs: { getDoc, doc, updateDoc, setDoc, deleteDoc, serverTimestamp },
            onClassic: () => showSecErr(document.getElementById('profileV2Root'), new Error('Profile failed')),
            onReady: () => {
              profileV2Ready = true;
              const nav = document.querySelector('[data-view="profile"], [data-view="profilev2"]');
              if (nav) { nav.dataset.view = "profilev2"; nav.setAttribute("href", "#profilev2"); }
            }
          });
          if (!okP) profileV2Ready = false;
          const ph = (location.hash||"").replace("#","");
          if (profileV2Ready && (ph === "profile" || ph === "profilev2")) showView("profilev2");
        } catch (e) {
          profileV2Ready = false;
          const root = document.getElementById("profileV2Root");
          if (root) root.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="pv2RetryBtn">Retry</button>`;
          document.getElementById("pv2ClassicBtn")?.addEventListener("click", () => { profileV2Ready = false; showView("profile"); });
        }
      };
      window.__bootProfile = bootProfile;
      if ((location.hash||"").replace("#","") === "profile" || (location.hash||"").replace("#","") === "profilev2") bootProfile();
      try {
        const cached = getStudentStore();
        if (catalogFresh(cached)) {
          catalog = cached.catalog;
          catalogConfirmed = true;
          void tryBrowseV2();
        }
      } catch (e) {
        catalog = catalog || [];
      }
      let regs = [];
      try {
        const stRegs = getStudentStore();
        if (stRegs && Array.isArray(stRegs.registrations) && stRegs.registrations.length) {
          regs = stRegs.registrations;
        } else {
          const fresh = await loadListPage("regs");
          regs = Array.isArray(fresh?.registrations) ? fresh.registrations : [];
        }
      } catch (e) {
        document.getElementById("regList").innerHTML = `<p class="banner">${friendlyError(e)}</p>`;
      }
      regsByCourse = Object.fromEntries(regs.map((r)=>[r.courseId, r]));
      let instructions = "Payment details will appear here once the academy publishes them.";
      try {
        const pay = await getDoc(doc(db,"settings","payment"));
        if (pay.exists()) instructions = pay.data().text || instructions;
      } catch (_) {}
      /* payment banner lives in the shared shell and is filled from the student store */
      const enrolled = regs.filter(r=>r.status==="enrolled");
      enrolledRegs = enrolled;
      let myTab = "active";
      const paintMyCourses = () => {
        const box = document.getElementById("enrolledList");
        const activeN = myCourseDocs.filter(c=>portalStatus(c).group==="active").length;
        const doneN = myCourseDocs.filter(c=>portalStatus(c).group==="completed").length;
        const ta = document.getElementById("tabActiveCourses"); if (ta) { ta.textContent = `Active (${activeN})`; ta.classList.toggle("on", myTab==="active"); }
        const td = document.getElementById("tabDoneCourses"); if (td) { td.textContent = `Completed (${doneN})`; td.classList.toggle("on", myTab==="completed"); }
        const list = myCourseDocs.filter(c=>portalStatus(c).group===myTab);
        if (!list.length) {
          box.innerHTML = myTab==="completed" ? "<p>No completed courses yet.</p>" : "<p>No active courses yet. Browse courses to get started.</p>";
          return;
        }
        box.innerHTML = list.map(c=>{
          const p = portalStatus(c);
          const start = startsEndsLine(c) ? `<p>${startsEndsLine(c)}</p>` : "";
          const days = deliveryDaysHtml(c, { emptyMode: "announce" });
          const acts = p.group==="completed"
            ? `<p>${p.completedLine}</p><p><button class="btn btn-sm" type="button" data-course="${c.id}">View course</button> <a class="btn btn-sm btn-ghost" href="./student-grades.html">View grades</a></p>`
            : `<p><button class="btn btn-sm" type="button" data-course="${c.id}">Open course</button></p>`;
          return `<div class="kpi" style="margin-bottom:10px"><strong>${c.title}</strong> ${statusBadgeHtml(c)}${start}${days}${acts}</div>`;
        }).join("");
        box.querySelectorAll("[data-course]").forEach(a=> a.onclick=(e)=>{ e.preventDefault(); openMyCourse(a.dataset.course); });
      };
      document.getElementById("tabActiveCourses").onclick=()=>{ myTab="active"; paintMyCourses(); };
      document.getElementById("tabDoneCourses").onclick=()=>{ myTab="completed"; paintMyCourses(); };
      try {
        const listSt = await ensureSectionData(["enrollments", "registrations", "catalog"]);
        myCourseDocs = getEnrolledCourses(listSt);
        paintMyCourses();
        const showClassicCourses = () => {
          myCoursesV2Ready = false;
          const nav = document.querySelector('[data-view="courses"]');
          if (nav) { nav.dataset.view = "courses"; nav.setAttribute("href", "#courses"); }
          showView("coursesv2");
          paintMyCourses();
        };
        const loadCourseResults = async () => {
          const out = {};
          const st = getStudentStore() || {};
          const done = (getCompletedCourses(st) || []).concat(myCourseDocs.filter((c) => portalStatus(c).group === "completed"));
          const seen = new Set();
          for (const c of done) {
            const courseId = c.id;
            if (!courseId || seen.has(courseId)) continue;
            seen.add(courseId);
            try {
              const rec = await getCourseResult(courseId);
              if (rec.status === "loading") out[courseId] = { pending: true, avg: null, passed: false };
              else if (rec.status === "unpublished") out[courseId] = { pending: true, avg: null, passed: false, unpublished: true };
              else out[courseId] = { pending: false, avg: rec.avg, passed: rec.passed === true, pass: rec.pass };
            } catch {
              out[courseId] = { pending: true, avg: null, passed: false };
            }
          }
          return out;
        };
        let extraAtt = [];
        let extraAs = myAssigns;
        let extraSubs = Object.values(mySubs || {});
        const tryMyCoursesV2 = async (extra) => {
          const root = document.getElementById("myCoursesV2Root");
          if (!root) return;
          const uid = user?.uid || auth.currentUser?.uid || "";
          extraAtt = extra?.attendance ?? extraAtt;
          extraAs = extra?.assigns ?? extraAs;
          extraSubs = extra?.subs ? Object.values(extra.subs) : extraSubs;
          await renderMyCoursesV2({ host: root, loading: true });
          liveSection(navTok, ["enrollments", "registrations", "catalog", "grades"], async (st, first) => {
            const meta = st?._meta || {};
            const ready = meta.enrollments === "ready" || meta.registrations === "ready";
            const list = getEnrolledCourses(st);
            if (!ready && !list.length) {
              await renderMyCoursesV2({ host: root, loading: true });
              return;
            }
            myCourseDocs = list;
            let liveResults = {};
            try { liveResults = await loadCourseResults(); } catch { liveResults = {}; }
            await renderMyCoursesV2({
              host: root, courses: list, certs: st.certificates || [], uid,
              sessions: extra?.sessions || st.sessions || [], assigns: extra?.assigns || st.assignments || [],
              subs: extra?.subs || st.submissions || {}, attendance: extra?.attendance || st.attendance || [],
              quizzes: extra?.quizzes || st.quizzes || [], attempts: extra?.attempts || st.quizAttempts || [],
              results: liveResults, progressReady: extra?.progressReady === true || meta.sessions === "ready",
              stale: !ready,
              onOpen: (id) => openMyCourse(id), onBrowse: () => showView("browsev2"),
              onResult: (id) => maybeShowCourseResult({ uid, name: window.__ghzLiveName, forceCourseId: id })
            });
            myCoursesV2Ready = true;
            window.__ghzBootOk = true;
          });
          ensureSectionData(["sessions", "assignments", "quizzes", "attendance", "submissions", "quizAttempts", "grades"]).catch(() => {});
          let results = {};
          try { results = await loadCourseResults(); } catch { results = {}; }
          let certs = [];
          if (!uid) {
            root.innerHTML = `<p class="banner">enrollments: waiting for sign-in</p>`;
            return;
          }
          try {
            certs = (await getDocs(query(collection(db, "certificates"), where("uid", "==", uid)))).docs.map((d) => ({ id: d.id, ...d.data() }));
          } catch (e) {
            certs = [];
            const note = document.createElement("p");
            note.className = "banner";
            note.textContent = "certificates: " + (e.code || e.message || e);
            root.prepend?.(note);
          }
          const ok = await renderMyCoursesV2({
            host: root,
            courses: myCourseDocs,
            certs,
            uid,
            sessions: extra?.sessions ?? [],
            assigns: extra?.assigns ?? myAssigns,
            subs: extra?.subs ?? mySubs,
            attendance: extra?.attendance ?? [],
            quizzes: extra?.quizzes || getStudentStore()?.quizzes || [],
            attempts: extra?.attempts || getStudentStore()?.quizAttempts || [],
            results,
            onOpen: (id) => openMyCourse(id),
            onResult: (id) => maybeShowCourseResult({ uid, name: window.__ghzLiveName, forceCourseId: id }),
            onBrowse: () => showView("browsev2"),
            onClassic: () => showSecErr(document.getElementById('myCoursesV2Root'), new Error('My courses failed')),
            onReady: () => {
              myCoursesV2Ready = true;
              const nav = document.querySelector('[data-view="courses"]');
              if (nav) { nav.dataset.view = "coursesv2"; nav.setAttribute("href", "#coursesv2"); }
            }
          });
          if (!ok) myCoursesV2Ready = false;
        };
        window.__tryMyCoursesV2 = tryMyCoursesV2;
        const st0 = getStudentStore();
        if (st0 && (st0.courses && Object.keys(st0.courses).length) && ((location.hash||"").replace("#","") === "courses" || (location.hash||"").replace("#","") === "coursesv2")) {
          await tryMyCoursesV2({ fromCache: true, store: st0 });
        }
        await tryMyCoursesV2({ assigns: myAssigns, subs: mySubs });
        ensureSectionData(["sessions", "assignments", "quizzes", "attendance", "submissions", "quizAttempts"]).then((st) => {
          window.__tryMyCoursesV2?.({ fromCache: true, store: st, sessions: st.sessions, assigns: st.assignments, subs: st.submissions, attendance: st.attendance, quizzes: st.quizzes, attempts: st.quizAttempts });
        }).catch(() => {});
        if (myCoursesV2Ready && ((location.hash||"").replace("#","") === "courses" || (location.hash||"").replace("#","") === "coursesv2")) showView("coursesv2");
      } catch (e) {
        if (!String(document.getElementById("enrolledList").innerHTML||"").includes("banner"))
          document.getElementById("enrolledList").innerHTML = `<p class="banner">${friendlyError(e)}</p>`;
      }
      window.__openCompletedTab = () => { showView(myCoursesV2Ready ? "coursesv2" : "courses"); myTab="completed"; paintMyCourses(); if (myCoursesV2Ready) window.__tryMyCoursesV2?.({ assigns: myAssigns, subs: mySubs }); };
      const paintClassicRegs = () => {
        document.getElementById("regList").innerHTML = regs.length ? regs.map(r=>`<article class="kpi" style="margin-bottom:12px">
        <strong>${r.courseTitle}</strong> ${badge(r.status)}
        <p>${r.amount||0} ${r.currency||""}</p>
        ${timeline(r.status)}
        ${r.status==="pending_payment"?`<pre style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:10px">${instructions}</pre>
          <button class="btn btn-sm" data-paid="${r.id}">I have paid</button>
          <button class="btn btn-sm btn-warn" data-cancel="${r.id}">Cancel registration</button>`:""}
        ${r.status==="payment_submitted"?"<p>Waiting for admin confirmation.</p>":""}
        ${r.status==="enrolled"?`<p><a class="btn btn-sm" href="./course.html?id=${r.courseId}">Open course</a></p>`:""}
        ${r.status==="rejected"?`<p>Note: ${r.rejectNote||""}</p>`:""}
        ${r.status==="cancelled"?againBtn(r):""}
      </article>`).join("") : "<p>No registrations yet.</p>";
        document.querySelectorAll("[data-reopen]").forEach(b=> b.onclick=()=> reopenReg(b.dataset.reopen, b));
        document.querySelectorAll("[data-cancel]").forEach(b=> b.onclick=async()=>{
          if (!await ask("Cancel this registration?")) return;
          await updateDoc(doc(db,"registrations", b.dataset.cancel), { status:"cancelled" });
          location.reload();
        });
        document.querySelectorAll("[data-paid]").forEach(b=> b.onclick=()=> openPayModal(b.dataset.paid));
      };
      const openPayModal = (rid) => {
        const modal = document.getElementById("modal");
        modal.classList.remove("hidden");
        modal.innerHTML = `<div class="sheet"><h2>I have paid</h2>
          <label>Payment method</label><input id="pm" />
          <label>Reference number</label><input id="pr" />
          <label>Payment date</label><input id="pd" type="date" />
          <button class="btn" id="savePay">Submit</button>
          <button class="btn btn-ghost" id="cancelM">Cancel</button></div>`;
        modal.querySelector("#cancelM").onclick=()=> modal.classList.add("hidden");
        modal.querySelector("#savePay").onclick=async()=>{
          await updateDoc(doc(db,"registrations", rid), {
            status:"payment_submitted",
            paymentMethod: document.getElementById("pm").value,
            paymentRef: document.getElementById("pr").value,
            paymentDate: document.getElementById("pd").value
          });
          await import("./notify.js?v=r2").then((m) => m.settle(m.notifyPaymentSubmitted({ regId: rid, courseId: rid.split("_").slice(1).join("_"), studentName: currentUser?.displayName || "" }))).catch(() => {});
          location.reload();
        };
      };
      const showClassicRegs = () => {
        regsV2Ready = false;
        const nav = document.querySelector('[data-view="regs"], [data-view="regsv2"]');
        if (nav) { nav.dataset.view = "regs"; nav.setAttribute("href", "#regs"); }
        showView("regsv2");
        paintClassicRegs();
      };
      paintClassicRegs();
      try {
        const root = document.getElementById("regsV2Root");
        const ok = await renderMyRegistrationsV2({
          host: root,
          regs,
          catalog,
          emailVerified: !!currentUser?.emailVerified,
          payLabel: "I have paid",
          onBrowse: () => showView("browsev2"),
          onClassic: () => showSecErr(document.getElementById('regsV2Root'), new Error('Registrations failed')),
          onPaid: (id) => openPayModal(id),
          onResume: async (id) => {
            const r = regs.find((x) => x.id === id);
            const c = catalog.find((x) => x.id === r?.courseId);
            if (!c || !currentUser) return;
            const us = await getDoc(doc(db, "users", currentUser.uid));
            await openCheckout({ user: currentUser, profile: us.exists() ? us.data() : {}, course: c, existing: r });
          },
          onReceipt: async (id) => {
            const r = regs.find((x) => x.id === id);
            if (!r) return;
            const c = catalog.find((x) => x.id === r.courseId) || {};
            let profile = {};
            try {
              const us = await getDoc(doc(db, "users", currentUser.uid));
              if (us.exists()) profile = us.data();
            } catch (_) {}
            try { await downloadReceiptPdf({ reg: r, course: c, profile, user: currentUser }); }
            catch (e) { tell("Could not download receipt."); }
          },
          onCancel: async (id) => {
            if (!await ask("Cancel this registration?")) return;
            await updateDoc(doc(db,"registrations", id), { status:"cancelled" });
            location.reload();
          },
          onReopen: (id, btn) => reopenReg(id, btn),
          onReady: () => {
            regsV2Ready = true;
            const nav = document.querySelector('[data-view="regs"]');
            if (nav) { nav.dataset.view = "regsv2"; nav.setAttribute("href", "#regsv2"); }
          }
        });
        if (!ok) regsV2Ready = false;
        if (regsV2Ready && ((location.hash||"").replace("#","") === "regs" || (location.hash||"").replace("#","") === "regsv2")) showView("regsv2");
      } catch (e) {
        regsV2Ready = false;
        const root = document.getElementById("regsV2Root");
        if (root) root.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="regsRetryBtn">Retry</button>`;
        document.getElementById("regsClassicBtn")?.addEventListener("click", showClassicRegs);
      }

      myAssigns = []; mySubs = {};
      const failHw = (name, e) => {
        console.error(name, e);
        const code = e.code || String(e);
        const msg = `<p class="banner">${name}: ${code}</p>`;
        document.getElementById("allHw").innerHTML = msg;
        document.getElementById("allGrades").innerHTML = msg;
        const shw = document.getElementById("shwPane");
        if (shw) shw.innerHTML = msg;

      };
      let enrolledCourses = [];
      try {
        const enSnap = await getDocs(query(collection(db, "enrollments"), where("uid", "==", auth.currentUser.uid)));
        const closedHw = new Set((regs || []).filter((r) => r.status === "cancelled" || r.status === "rejected").map((r) => r.courseId));
        enrolledCourses = enSnap.docs.map(d=>({id:d.id,...d.data()})).filter((e) => !closedHw.has(e.courseId));
      } catch (e) { failHw("enrollments", e); enrolledCourses = null; }
      if (enrolledCourses) {
        const titleOf = (cid) => enrolled.find(r=>r.courseId===cid)?.courseTitle || catalog.find(c=>c.id===cid)?.title || cid;
        try {
          for (const e of enrolledCourses) {
            const courseId = e.courseId;
            const as = await getDocs(query(collection(db, "assignments"), where("courseId", "==", courseId), where("status", "==", "Published")));
            myAssigns.push(...as.docs.map(d=>({id:d.id,...d.data(), courseTitle:titleOf(courseId)})));
          }
          myAssigns.sort((a,b)=> String(a.dueDate||"").localeCompare(String(b.dueDate||"")));
        } catch (e) { failHw("assignments", e); enrolledCourses = null; }
      }
      if (enrolledCourses) {
        try {
          mySubs = {};
          for (const e of enrolledCourses) {
            const ss = await getDocs(query(collection(db, "submissions"), where("uid", "==", auth.currentUser.uid), where("courseId", "==", e.courseId)));
            ss.docs.forEach(d=> { const row = {id:d.id,...d.data()}; if (row.assignmentId) mySubs[row.assignmentId] = row; });
          }
          renderAllHw(); renderGrades();
          const showClassicHw = () => {
            hwV2Ready = false;
            const nav = document.querySelector('[data-view="homework"], [data-view="homeworkv2"]');
            if (nav) { nav.dataset.view = "homework"; nav.setAttribute("href", "#homework"); }
            showView("homeworkv2");
            renderAllHw();
          };
          try {
            const root = document.getElementById("hwV2Root");
            const ok = await renderHomeworkV2({
              host: root,
              courses: myCourseDocs,
              assigns: myAssigns,
              subs: mySubs,
              onOpen: (id) => openHw(id),
              onClassic: () => showSecErr(document.getElementById('hwV2Root'), new Error('Homework failed')),
              onReady: () => {
                hwV2Ready = true;
                const nav = document.querySelector('[data-view="homework"]');
                if (nav) { nav.dataset.view = "homeworkv2"; nav.setAttribute("href", "#homeworkv2"); }
              }
            });
            if (!ok) hwV2Ready = false;
            if (hwV2Ready && ((location.hash||"").replace("#","") === "homework" || (location.hash||"").replace("#","") === "homeworkv2")) showView("homeworkv2");
          } catch (e) {
            hwV2Ready = false;
            const root = document.getElementById("hwV2Root");
            if (root) root.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="hwRetryBtn">Retry</button>`;
            document.getElementById("hwClassicBtn")?.addEventListener("click", showClassicHw);
          }
        } catch (e) { failHw("submissions", e); }
      }
      try {
        catalog = await loadCourses("");
        catalogConfirmed = true;
        await tryBrowseV2();
        const nav = document.getElementById("navBrowse");
        if (nav) { nav.dataset.view = "browsev2"; nav.setAttribute("href", "#browsev2"); }
        if ((location.hash||"").replace("#","") === "browse" || (location.hash||"").replace("#","") === "browsev2") showView("browsev2");
      } catch (e) { showSecErr(document.getElementById("browseV2Root"), e); }
      if (enrolledCourses) {
        const titleOf = (cid) => enrolled.find(r=>r.courseId===cid)?.courseTitle || catalog.find(c=>c.id===cid)?.title || cid;
        let sessAll = [];
        try {
          const sessParts = await Promise.allSettled(enrolledCourses.map((en) => getDocs(query(collection(db,"sessions"), where("courseId","==", en.courseId)))));
          sessParts.forEach((p, i) => {
            if (p.status !== "fulfilled") return;
            const cid = enrolledCourses[i].courseId;
            sessAll.push(...p.value.docs.map(d=>({id:d.id,...d.data(), courseTitle:titleOf(cid)})));
          });
        } catch(e) { document.getElementById("schedList").innerHTML = `<p class="banner">${friendlyError(e)}</p>`; }
        const today = new Date().toISOString().slice(0,10);
        const activeIds = new Set(myCourseDocs.filter(c=>portalStatus(c).group==="active").map(c=>c.id));
        const up = sessAll.filter(s=>{ const st=sessionStatus(s); return (st==="Upcoming"||st==="In progress") && activeIds.has(s.courseId); }).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        const past = sessAll.filter(s=>sessionStatus(s)==="Completed").sort((a,b)=>String(b.date).localeCompare(String(a.date)));
        const card = (s) => `<article class="kpi" style="margin-bottom:10px"><strong>${s.title}</strong><p>${s.courseTitle} · ${s.date} · ${s.startTime||""}–${s.endTime||""}</p>${s.meetingLink?`<a class="btn btn-sm" href="${s.meetingLink}" target="_blank" rel="noopener">Join</a>`:""}</article>`;
        document.getElementById("schedList").innerHTML = up.length ? up.map(card).join("") : "<p>No upcoming sessions.</p>";
        document.getElementById("pastList").innerHTML = past.length ? past.map(card).join("") : "<p>No past sessions.</p>";
        const showClassicSched = () => { schedV2Ready = false; showView("schedulev2"); };
        try {
          const ok = await renderStudentScheduleV2({
            host: document.getElementById("schedV2Root"),
            courses: myCourseDocs,
            sessions: [],
            onClassic: () => showSecErr(document.getElementById('schedV2Root'), new Error('Schedule failed')),
            onReady: () => {
              schedV2Ready = true;
              const nav = document.querySelector('[data-view="schedule"], [data-view="schedulev2"]');
              if (nav) { nav.dataset.view = "schedulev2"; nav.setAttribute("href", "#schedulev2"); }
            }
          });
          if (!ok) schedV2Ready = false;
          if (schedV2Ready && ((location.hash||"").replace("#","") === "schedule" || (location.hash||"").replace("#","") === "schedulev2")) showView("schedulev2");
        } catch (e) {
          schedV2Ready = false;
          const root = document.getElementById("schedV2Root");
          if (root) root.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="schedRetryBtn">Retry</button>`;
          document.getElementById("schedClassicBtn")?.addEventListener("click", showClassicSched);
        }

        try {
          let myAtt = [];
          try {
            const cachedAtt = asArray(getStudentStore()?.attendance);
            if (cachedAtt.length) myAtt = cachedAtt;
            else {
            const attParts = await Promise.allSettled(enrolledCourses.map((e) => getDocs(query(collection(db,"attendance"), where("uid","==", auth.currentUser.uid), where("courseId","==", e.courseId)))));
            attParts.forEach((p, i) => {
              if (p.status === "fulfilled") myAtt.push(...p.value.docs.map(d=>({id:d.id,...d.data()})));
              else console.error("attendance", enrolledCourses[i].courseId, p.reason?.code || p.reason);
            });
            }
          } catch(e){ document.getElementById("stuAtt").innerHTML = `<p class="banner">${friendlyError(e)}</p>`; throw e; }
          const badgeSt = (st) => {
            if (st==="present") return `<span class="badge" style="background:#16a34a;color:#fff">Present</span>`;
            if (st==="late") return `<span class="badge" style="background:#d97706;color:#fff">Late</span>`;
            if (st==="absent") return `<span class="badge" style="background:#dc2626;color:#fff">Absent</span>`;
            if (st==="excused") return `<span class="badge" style="background:#2563eb;color:#fff">Excused</span>`;
            return `<span class="badge badge-draft">Not marked yet</span>`;
          };
          const pctFor = (recs) => {
            const den = recs.filter(r=>r.status && r.status!=="excused").length;
            const good = recs.filter(r=>r.status==="present"||r.status==="late").length;
            return den ? Math.round((good/den)*100) : 0;
          };
          const byC = {};
          sessAll.forEach(s=>{ byC[s.courseId]=byC[s.courseId]||{title:s.courseTitle, courseId:s.courseId, rows:[]}; byC[s.courseId].rows.push(s); });
          enrolledCourses.forEach(e=>{ if (!byC[e.courseId]) byC[e.courseId]={title:titleOf(e.courseId), courseId:e.courseId, rows:[]}; });
          const html = Object.values(byC).map(g=>{
            const recs = myAtt.filter(a=>a.courseId===g.courseId);
            const pct = pctFor(recs);
            const rows = [...g.rows].sort((a,b)=> String(a.date||"").localeCompare(String(b.date||"")));
            return `<article class="kpi" style="margin-bottom:16px"><h3>${g.title}</h3>
            <p style="margin:8px 0 6px">${pct}%</p>
            <div style="height:8px;background:#e5e7eb;border-radius:99px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#16a34a"></div></div>
            <div class="table-wrap" style="margin-top:10px"><table class="data"><thead><tr><th>Date</th><th>Time</th><th>Title</th><th>Status</th><th>Note</th></tr></thead><tbody>`+
            (rows.length ? rows.map(s=>{
              const rec = myAtt.find(a=>a.sessionId===s.id);
              return `<tr><td>${s.date||"—"}</td><td>${s.startTime||""}${s.endTime?"–"+s.endTime:""}</td><td>${s.title||""}</td><td>${badgeSt(rec&&rec.status)}</td><td>${rec&&rec.note?rec.note:""}</td></tr>`;
            }).join("") : `<tr><td colspan="5">No sessions yet.</td></tr>`)+
            `</tbody></table></div></article>`;
          }).join("");
          document.getElementById("stuAtt").innerHTML = html || "<p>No sessions yet.</p>";
          try {
            const attCourses = (myCourseDocs || []).map((c) => ({
              id: c.id,
              title: c.title || titleOf(c.id),
              status: c.status,
              sessions: sessAll.filter((s) => s.courseId === c.id),
              recs: myAtt.filter((a) => a.courseId === c.id)
            }));
            const showClassicAtt = () => { attV2Ready = false; showView("attendancev2"); };
            const okAtt = await renderAttendanceV2({
              host: document.getElementById("attV2Root"),
              uid: auth.currentUser.uid,
              student: { name: document.getElementById("userName")?.textContent || "", email: auth.currentUser.email || "" },
              courses: attCourses,
              onClassic: () => showSecErr(document.getElementById('attV2Root'), new Error('Attendance failed')),
              onReady: () => {
                attV2Ready = true;
                const nav = document.querySelector('[data-view="attendance"], [data-view="attendancev2"]');
                if (nav) { nav.dataset.view = "attendancev2"; nav.setAttribute("href", "#attendancev2"); }
              }
            });
            if (!okAtt) attV2Ready = false;
            if (attV2Ready && ((location.hash||"").replace("#","") === "attendance" || (location.hash||"").replace("#","") === "attendancev2")) showView("attendancev2");
          } catch (e) {
            attV2Ready = false;
            const root = document.getElementById("attV2Root");
            if (root) root.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="attRetryBtn">Retry</button>`;
            document.getElementById("attClassicBtn")?.addEventListener("click", () => { attV2Ready = false; showView("attendancev2"); });
          }
          try {
            renderStudentScheduleV2({
              host: document.getElementById("schedV2Root"),
              courses: myCourseDocs,
              sessions: sessAll,
              attendance: myAtt,
              onClassic: () => { schedV2Ready = false; showView("schedulev2"); },
              onReady: () => { schedV2Ready = true; const nav = document.querySelector('[data-view="schedule"], [data-view="schedulev2"]'); if (nav) { nav.dataset.view = "schedulev2"; nav.setAttribute("href", "#schedulev2"); } }
            });
          } catch (_) {}
          window.__tryMyCoursesV2?.({ sessions: sessAll, assigns: myAssigns, subs: mySubs, attendance: myAtt });
          if (hwV2Ready || document.getElementById("hwV2Root")) {
            try {
              renderHomeworkV2({
                host: document.getElementById("hwV2Root"),
                courses: myCourseDocs,
                assigns: myAssigns,
                subs: mySubs,
                onOpen: (id) => openHw(id),
                onClassic: () => { hwV2Ready = false; showView("homeworkv2"); renderAllHw(); },
                onReady: () => { hwV2Ready = true; const nav = document.querySelector('[data-view="homework"]'); if (nav) { nav.dataset.view = "homeworkv2"; nav.setAttribute("href", "#homeworkv2"); } }
              });
            } catch (_) {}
          }
        } catch(e){
          if (!String(document.getElementById("stuAtt").innerHTML).includes("banner")) document.getElementById("stuAtt").innerHTML = `<p class="banner">${friendlyError(e)}</p>`;
          attV2Ready = false;
          const root = document.getElementById("attV2Root");
          if (root && !root.querySelector(".av2-fail")) {
            root.innerHTML = `<p class="banner">${friendlyError(e)}</p><button class="btn btn-sm" type="button" id="attRetryBtn2">Retry</button>`;
            document.getElementById("attClassicBtn2")?.addEventListener("click", () => showView("attendancev2"));
          }
        }
      }
    });
try{const u=[...performance.getEntriesByType('resource')].map(r=>r.name);const mods=[...new Set(u.filter(n=>/\.js/.test(n)))];console.log('[ghz-load] modules', mods.length);}catch(e){}
