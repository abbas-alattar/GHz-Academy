import { bound, loadStudentDash } from "./student-dash-data.js?v=stu7";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { gradeCalc } from "./gradeCalc.js";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const firstName = (n) => String(n || "student").split(" ")[0];
const greet = (d) => { const h = d.getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const initials = (name) => String(name || "?").split(/\s+/).slice(0,2).map((p)=>p[0]||"").join("").toUpperCase() || "?";
const rel = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  return Math.round(h / 24) + "d ago";
};
const courseTitle = (data, id) => (data.enrollments.find((e) => e.courseId === id)?.courseTitle) || "";

function dueChip(due) {
  if (!due) return { cls: "later", text: "—" };
  const d = new Date(due); d.setHours(0,0,0,0);
  const t = new Date(); t.setHours(0,0,0,0);
  const diff = Math.round((d - t) / 86400000);
  if (diff < 0) return { cls: "over", text: "Overdue" };
  if (diff <= 2) return { cls: "soon", text: diff === 0 ? "Due today" : diff === 1 ? "Tomorrow" : "Soon" };
  return { cls: "later", text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
}

function animate(el, target) {
  if (target === "—" || target == null) { el.textContent = "—"; return; }
  const n = Number(target);
  if (!Number.isFinite(n)) { el.textContent = String(target); return; }
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / 700);
    el.textContent = String(Math.round(n * p));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function wrapErr(fn) {
  return (el) => {
    try { fn(el); }
    catch (e) {
      el.innerHTML = `<p class="uni-fail">This section could not load<br>${esc(e?.code || e?.message || e)}</p>`;
    }
  };
}

function mountHero(el) {
  bound(el, (root, data) => {
    const now = new Date();
    const subIds = new Set(data.submissions.map((s) => s.assignmentId));
    const attIds = new Set(data.quizAttempts.map((a) => a.quizId));
    const due = [...data.assignments.filter((a) => !subIds.has(a.id)), ...data.quizzes.filter((q) => !attIds.has(q.id))];
    const week = due.filter((x) => {
      if (!x.dueDate) return false;
      const d = new Date(x.dueDate); const t = new Date();
      const diff = (d - t) / 86400000;
      return diff >= -1 && diff <= 7;
    }).length;
    const smart = week > 0 ? `${week} task${week===1?"":"s"} due this week` : "You're all caught up";
    const clock = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    root.innerHTML = `<div class="uni-hero uni-fade">
      <p class="uni-live"><i></i> Live <span class="uni-clock" data-uni-clock>${esc(clock)}</span></p>
      <h2>${esc(greet(now))}, ${esc(firstName(data.name))}</h2>
      <p class="uni-date">${esc(fmtDate(now))}</p>
      <p class="uni-smart">${esc(smart)}</p>
      <div class="uni-hero-actions">
        <button class="uni-refresh" type="button" id="uniRefresh" aria-label="Refresh">↻</button>
      </div>
    </div>`;
    root.querySelector("#uniRefresh").onclick = () => loadStudentDash(true);
    const clk = root.querySelector("[data-uni-clock]");
    if (clk) {
      if (window.__uniClk) clearInterval(window.__uniClk);
      window.__uniClk = setInterval(() => {
        clk.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }, 30000);
    }
  });
}

function mountStats(el) {
  bound(el, (root, data) => {
    const err = data.errors.assignments || data.errors.quizzes || data.errors.attendance || data.errors.announcementsAll;
    if (err && !data.assignments.length && !data.quizzes.length) {
      root.innerHTML = `<p class="uni-fail">${esc(err.step)}: ${esc(err.code)}</p>`;
      return;
    }
    const subIds = new Set(data.submissions.map((s) => s.assignmentId));
    const attIds = new Set(data.quizAttempts.map((a) => a.quizId));
    const hwDue = data.assignments.filter((a) => !subIds.has(a.id)).length;
    const qz = data.quizzes.filter((q) => !attIds.has(q.id)).length;
    const recs = data.attendance.filter((a) => a.status);
    const den = recs.filter((r) => r.status !== "excused").length;
    const good = recs.filter((r) => r.status === "present" || r.status === "late").length;
    const attPct = den ? Math.round((good / den) * 100) : "—";
    const read = new Set(data.announcementReadIds || []);
    const unread = data.announcements.filter((a) => a && a.id && !read.has(String(a.id))).length;
    const tiles = [
      { label: "Homework due", val: hwDue, href: "#homework", view: "homework", ico: "HW", color: "blue" },
      { label: "Quizzes to take", val: qz, href: "./student-quizzes.html", ico: "QZ", color: "violet" },
      { label: "Attendance %", val: attPct, href: "#attendance", view: "attendance", ico: "%", color: "green" },
      { label: "Unread announcements", val: unread, href: "./student-announcements.html", ico: "AN", color: "amber" }
    ];
    root.innerHTML = `<div class="uni-stats uni-fade">${tiles.map((t,i)=>`<a class="uni-stat" href="${t.href}" data-i="${i}" ${t.view?`data-view="${t.view}"`:""}><div class="uni-ico ${t.color}">${t.ico}</div><div><span>${esc(t.label)}</span><strong data-n></strong></div></a>`).join("")}</div>`;
    root.querySelectorAll("[data-n]").forEach((n, i) => animate(n, tiles[i].val));
    root.querySelectorAll("a[data-view]").forEach((a) => {
      a.onclick = (e) => { e.preventDefault(); document.querySelector(`.side a[data-view="${a.dataset.view}"]`)?.click(); };
    });
  });
}

function mountWeek(el) {
  bound(el, (root, data) => {
    const subIds = new Set(data.submissions.map((s) => s.assignmentId));
    const attIds = new Set(data.quizAttempts.map((a) => a.quizId));
    const rows = [
      ...data.assignments.filter((a) => !subIds.has(a.id)).map((a) => ({ type: "hw", title: a.title, course: courseTitle(data, a.courseId), due: a.dueDate, href: "#homework", view: "homework" })),
      ...data.quizzes.filter((q) => !attIds.has(q.id)).map((q) => ({ type: "qz", title: q.title, course: courseTitle(data, q.courseId), due: q.dueDate, href: "./student-quizzes.html" }))
    ].sort((a,b) => String(a.due||"zzz").localeCompare(String(b.due||"zzz")));
    if (!rows.length) {
      root.innerHTML = `<div class="uni-card uni-emptycard uni-fade"><h3>This week</h3><div class="uni-emptyviz" aria-hidden="true"><span></span><span></span><span></span></div><p class="uni-empty">Nothing due — enjoy your week.</p></div>`;
      return;
    }
    root.innerHTML = `<div class="uni-card uni-fade"><h3>This week</h3><div class="uni-todo">${rows.map((r)=>{
      const b = dueChip(r.due);
      return `<a href="${r.href}" ${r.view?`data-view="${r.view}"`:""}><span class="uni-type ${r.type}">${r.type==="hw"?"Homework":"Quiz"}</span><div><strong>${esc(r.title||"Untitled")}</strong><p style="color:#64748b;font-size:.82rem;margin:2px 0 0">${esc(r.course)}</p></div><span class="uni-chip ${b.cls}">${esc(b.text)}</span></a>`;
    }).join("")}</div></div>`;
    root.querySelectorAll("a[data-view]").forEach((a) => {
      a.onclick = (e) => { e.preventDefault(); document.querySelector(`.side a[data-view="${a.dataset.view}"]`)?.click(); };
    });
  });
}

function mountNext(el) {
  bound(el, (root, data) => {
    const sessErr = Object.keys(data.errors).find((k) => k.startsWith("sessions"));
    if (sessErr && !data.sessions.length) {
      root.innerHTML = `<div class="uni-card"><h3>Up next</h3><p class="uni-fail">${esc(sessErr)}: ${esc(data.errors[sessErr].code)}</p></div>`;
      return;
    }
    const now = Date.now();
    const list = data.sessions.filter((s) => s.status !== "Cancelled")
      .map((s) => ({ s, t: new Date(`${s.date||""}T${s.startTime||"00:00"}`).getTime() }))
      .filter((x) => x.t >= now - 15 * 60000)
      .sort((a,b)=>a.t-b.t)
      .slice(0, 4);
    if (!list.length) {
      root.innerHTML = `<div class="uni-card uni-emptycard uni-fade"><h3>Up next</h3><div class="uni-soonico" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="2.4"/><path d="M24 14v11l7 4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="24" r="2.2" fill="currentColor"/></svg></div><p class="uni-empty">No upcoming sessions this week.</p></div>`;
      return;
    }
    root.innerHTML = `<div class="uni-card uni-fade"><h3>Up next</h3>${list.map(({s,t})=>{
      const d = new Date(t);
      return `<div class="uni-sess"><div class="uni-dateblk"><b>${d.getDate()}</b><span>${d.toLocaleDateString(undefined,{month:"short"})}</span></div><div><strong>${esc(s.title||"Session")}</strong><p style="color:#64748b;font-size:.85rem;margin:4px 0 0">${esc(s.startTime||"")}${s.endTime?"–"+esc(s.endTime):""} · ${esc(courseTitle(data,s.courseId))}</p></div></div>`;
    }).join("")}</div>`;
  });
}

function mountAnn(el) {
  bound(el, (root, data) => {
    if (data.errors.announcementsAll && !data.announcements.length) {
      root.innerHTML = `<div class="uni-card"><h3>Announcements</h3><p class="uni-fail">announcements: ${esc(data.errors.announcementsAll.code)}</p></div>`;
      return;
    }
    let read = [...(data.announcementReadIds || [])];
    let filter = "all";
    const paint = () => {
      const list = [...data.announcements].filter((a) => {
        const role = String(a.authorRole || "").toLowerCase();
        if (filter === "admin") return role === "admin";
        if (filter === "trainers") return role === "trainer";
        return true;
      }).sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0) || (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0)).slice(0,4);
      const unread = data.announcements.filter((a) => !read.includes(a.id)).length;
      root.innerHTML = `<div class="uni-card uni-fade"><div class="uni-ann-head"><h3>Announcements</h3>${unread?`<span class="badge badge-open">${unread}</span>`:""}</div>
        <div class="sdash-chips" style="margin:10px 0">
          <button type="button" data-f="all" class="${filter==="all"?"on":""}">All</button>
          <button type="button" data-f="trainers" class="${filter==="trainers"?"on":""}">Trainers</button>
          <button type="button" data-f="admin" class="${filter==="admin"?"on":""}">Admin</button>
          <button type="button" id="uniMark">Mark all read</button>
        </div>
        ${list.map((a)=>{
          const unreadDot = read.includes(a.id) ? "" : `<span class="uni-dot"></span>`;
          const ms = a.createdAt?.toMillis ? a.createdAt.toMillis() : Date.now();
          return `<article class="uni-ann-item${read.includes(a.id)?"":" unread"}"><div class="uni-av">${esc(initials(a.authorName))}</div><div><p>${esc(a.authorName||"")}<span class="sdash-role">${String(a.authorRole||"trainer")==="admin"?"Admin":"Trainer"}</span> <span style="color:#64748b;font-size:.8rem">${esc(rel(ms))}</span>${unreadDot}</p><p class="sdash-title">${esc(a.title||"")}</p></div></article>`;
        }).join("") || `<p class="uni-empty">No announcements yet.</p>`}
        <p style="margin-top:8px"><a href="./student-announcements.html">See all announcements</a></p>
      </div>`;
      root.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { filter = b.dataset.f; paint(); });
      const mr = root.querySelector("#uniMark");
      if (mr) mr.onclick = () => { read = data.announcements.map((a)=>a.id); paint(); };
    };
    paint();
  });
}

function paintAvgCard(root, pct, nDone) {
  const shown = pct == null ? "–" : Number(pct).toFixed(1);
  const c = 2 * Math.PI * 36;
  const dash = pct == null ? 0 : (Math.min(100, Math.max(0, Number(pct))) / 100) * c;
  const stroke = pct == null ? "#94a3b8" : Number(pct) >= 80 ? "#16A34A" : Number(pct) >= 50 ? "#D97706" : "#DC2626";
  const note = nDone
    ? `From ${nDone} completed course${nDone === 1 ? "" : "s"} — same as Grades.`
    : "Shows after a course is completed. Active courses stay locked.";
  root.innerHTML = `<a class="uni-card uni-avgcard uni-fade" href="./student-grades.html">
    <h3>Overall average</h3>
    <div class="uni-ringwrap">
      <svg class="uni-ring" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r="36" fill="none" stroke="#e2e8f0" stroke-width="8"/>
        <circle cx="44" cy="44" r="36" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${dash} ${c}" transform="rotate(-90 44 44)"/>
        <text x="44" y="48" text-anchor="middle" font-size="16" font-weight="700" fill="#0F2747">${shown}</text>
      </svg>
      <p style="color:#64748b">${esc(note)}</p>
    </div>
  </a>`;
}

function mountAvg(el) {
  bound(el, (root, data) => {
    (async () => {
      const uid = data.user?.uid;
      const ids = [...new Set((data.enrollments || []).map((e) => e.courseId).filter(Boolean))];
      const avgs = [];
      for (const courseId of ids) {
        try {
          const cs = await getDoc(doc(db, "courses", courseId));
          const status = cs.exists() ? (cs.data().status || "") : "";
          if (status !== "Completed") continue;
          const ss = await getDoc(doc(db, "gradeSchemes", courseId));
          if (!ss.exists()) continue;
          const scheme = ss.data();
          let scores = {};
          const gs = await getDoc(doc(db, "gradeScores", uid + "_" + courseId));
          if (gs.exists()) scores = gs.data().scores || {};
          const assignments = (await getDocs(query(
            collection(db, "assignments"),
            where("courseId", "==", courseId),
            where("status", "==", "Published")
          ))).docs.map((d) => ({ id: d.id, ...d.data() }));
          const quizzes = (await getDocs(query(
            collection(db, "quizzes"),
            where("courseId", "==", courseId),
            where("status", "==", "Published")
          ))).docs.map((d) => ({ id: d.id, ...d.data() }));
          const attendance = (await getDocs(query(
            collection(db, "attendance"),
            where("uid", "==", uid),
            where("courseId", "==", courseId)
          ))).docs.map((d) => ({ id: d.id, ...d.data() }));
          const submissions = (await getDocs(query(
            collection(db, "submissions"),
            where("uid", "==", uid),
            where("courseId", "==", courseId)
          ))).docs.map((d) => ({ id: d.id, ...d.data() }));
          const quizAttempts = (await getDocs(query(
            collection(db, "quizAttempts"),
            where("uid", "==", uid),
            where("courseId", "==", courseId)
          ))).docs.map((d) => ({ id: d.id, ...d.data() }));
          const pack = { assignments, quizzes, attendance, submissions, quizAttempts, scheme };
          const g = gradeCalc({ id: courseId, pack }, scheme, { uid, scores, pack });
          if (!g.failed && g.average != null) avgs.push(g.average);
        } catch (e) {
          console.log(courseId, e?.code || e?.message || e);
        }
      }
      const overall = avgs.length ? Math.round((avgs.reduce((n, v) => n + v, 0) / avgs.length) * 10) / 10 : null;
      paintAvgCard(root, overall, avgs.length);
    })();
  });
}

function mountRing(el) {
  bound(el, (root, data) => {
    if (data.errors.attendance && !data.attendance.length) {
      root.innerHTML = `<div class="uni-card"><h3>Attendance</h3><p class="uni-fail">attendance: ${esc(data.errors.attendance.code)}</p></div>`;
      return;
    }
    const recs = data.attendance.filter((a) => a.status);
    const den = recs.filter((r) => r.status !== "excused").length;
    const good = recs.filter((r) => r.status === "present" || r.status === "late").length;
    const pct = den ? Math.round((good / den) * 100) : 0;
    const c = 2 * Math.PI * 36;
    const dash = den ? (pct / 100) * c : 0;
    root.innerHTML = `<div class="uni-card uni-fade"><h3>Attendance</h3>
      <div class="uni-ringwrap">
        <svg class="uni-ring" viewBox="0 0 88 88" aria-hidden="true">
          <circle cx="44" cy="44" r="36" fill="none" stroke="#e2e8f0" stroke-width="8"/>
          <circle cx="44" cy="44" r="36" fill="none" stroke="#16a34a" stroke-width="8" stroke-linecap="round"
            stroke-dasharray="${dash} ${c}" transform="rotate(-90 44 44)"/>
          <text x="44" y="48" text-anchor="middle" font-size="16" font-weight="700" fill="#0b1f4d">${den ? pct + "%" : "—"}</text>
        </svg>
        <p style="color:#64748b">${den ? "Overall attendance across your sessions." : "Attendance will appear after sessions are marked."}</p>
      </div>
    </div>`;
  });
}

export function bootUniDash() {
  const host = document.getElementById("studentDashRoot");
  if (!host) return;
  try {
    host.innerHTML = `<div class="uni-dash">
      <div id="uniHero"><div class="uni-skel"></div></div>
      <div id="uniStats"><div class="uni-skel"></div></div>
      <div class="uni-cols">
        <div class="uni-col"><div id="uniWeek"><div class="uni-skel"></div></div><div id="uniNext"><div class="uni-skel"></div></div></div>
        <div class="uni-col"><div id="uniAnn"><div class="uni-skel"></div></div><div id="uniAvg"><div class="uni-skel"></div></div><div id="uniRing"><div class="uni-skel"></div></div></div>
      </div>
    </div>`;
    wrapErr(mountHero)(document.getElementById("uniHero"));
    wrapErr(mountStats)(document.getElementById("uniStats"));
    wrapErr(mountWeek)(document.getElementById("uniWeek"));
    wrapErr(mountNext)(document.getElementById("uniNext"));
    wrapErr(mountAnn)(document.getElementById("uniAnn"));
    wrapErr(mountAvg)(document.getElementById("uniAvg"));
    wrapErr(mountRing)(document.getElementById("uniRing"));
    loadStudentDash(true);
  } catch (e) {
    host.innerHTML = `<p class="uni-fail">Dashboard could not load<br>${esc(e?.code || e?.message || e)}</p>`;
  }
}
