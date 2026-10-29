import { auth, db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, deleteField, increment } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const byCourse = async (col, cid, step) => {
  try {
    return (await getDocs(query(collection(db, col), where("courseId", "==", cid)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    e.step = step;
    throw e;
  }
};

export async function completeCounts(cid) {
  const submissions = await byCourse("submissions", cid, "submissions");
  const attempts = await byCourse("quizAttempts", cid, "quizAttempts");
  const sessions = await byCourse("sessions", cid, "sessions");
  const enrollments = await byCourse("enrollments", cid, "enrollments");
  const certificates = await byCourse("certificates", cid, "certificates");
  const ungradedHw = submissions.filter((s) => s.status && s.status !== "graded").length;
  const ungradedQuiz = attempts.filter((s) => s.status && s.status !== "graded").length;
  const scheduled = sessions.filter((s) => s.status === "Scheduled").length;
  const noCert = enrollments.filter((en) => !certificates.some((c) => c.uid === en.uid && c.status === "issued")).length;
  return { ungradedHw, ungradedQuiz, scheduled, noCert };
}

function ensureCss() {
  if (document.getElementById("ghz-cd-css")) return;
  const link = document.createElement("link");
  link.id = "ghz-cd-css";
  link.rel = "stylesheet";
  link.href = "./ConfirmDialog.css";
  document.head.appendChild(link);
}

function ico(kind, color) {
  const common = `width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;display:block"`;
  if (kind === "hw") return `<svg ${common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg>`;
  if (kind === "quiz") return `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/><circle cx="12" cy="17" r=".6" fill="${color}" stroke="none"/></svg>`;
  if (kind === "cal") return `<svg ${common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>`;
  return `<svg ${common}><circle cx="12" cy="8" r="5"/><path d="M8.2 13.2 7 22l5-3 5 3-1.2-8.8"/></svg>`;
}
function rowHtml(kind, ok, okText, warnLead, warnRest) {
  const color = ok ? "#16A34A" : "#B45309";
  const cls = ok ? "ok" : "warn";
  const label = ok ? okText : `<strong>${warnLead}</strong> ${warnRest}`;
  return `<div class="cc-row ${cls}"><span class="cc-ico ${cls}" aria-hidden="true">${ico(kind, color)}</span><span>${label}</span></div>`;
}

function paintDialog(modal, html) {
  ensureCss();
  if (!document.getElementById("ghz-cc-css")) {
    const s = document.createElement("style");
    s.id = "ghz-cc-css";
    s.textContent = `
      .ghz-cd-card.cc-card { max-width:480px; }
      .cc-title { margin:0 0 12px; font-family:"Space Grotesk",sans-serif; font-size:20px; font-weight:700; color:#0F2747; }
      .cc-name { margin:0 0 12px; font-size:15px; font-weight:700; color:#0F2747; }
      .cc-desc { margin:0 0 12px; font-size:14px; line-height:1.5; color:#64748B; }
      .cc-rows { display:grid; gap:8px; margin:4px 0 14px; }
      .cc-row { display:flex; align-items:center; gap:10px; height:48px; min-height:48px; padding:0 12px; border-radius:12px; font-size:13.5px; color:#0F2747; box-sizing:border-box; }
      .cc-row.ok { background:#F0FDF4; }
      .cc-row.warn { background:#FFFBEB; }
      .cc-ico { width:32px; height:32px; min-width:32px; min-height:32px; border-radius:999px; display:flex; align-items:center; justify-content:center; flex:none; }
      .cc-ico svg { width:18px; height:18px; display:block; }
      .cc-ico.ok { background:#DCFCE7; }
      .cc-ico.warn { background:#FEF3C7; }
      .cc-ready { margin:0 0 4px; font-size:13px; font-weight:600; color:#16A34A; }
      .cc-open { margin:0 0 4px; font-size:13px; font-weight:600; color:#B45309; }
      .cc-acts { display:flex; gap:8px; justify-content:flex-end; margin-top:16px; flex-wrap:wrap; }
      .cc-acts .ghz-cd-btn { min-width:140px; justify-content:center; }
      .cc-err { margin:10px 0 0; color:#DC2626; font-size:13px; }
      @media (max-width:560px) {
        .cc-acts { flex-direction:column-reverse; }
        .cc-acts .ghz-cd-btn { width:100%; }
      }
    `;
    document.head.appendChild(s);
  }
  modal.classList.remove("hidden");
  modal.innerHTML = html;
}

export async function confirmComplete(course, toast, reload) {
  const modal = document.getElementById("modal");
  const close = () => { modal.classList.add("hidden"); modal.innerHTML = ""; window.removeEventListener("keydown", onEsc); };
  const onEsc = (ev) => { if (ev.key === "Escape") close(); };
  window.addEventListener("keydown", onEsc);
  paintDialog(modal, `<div class="ghz-cd-dim" data-cc-dim>
    <div class="ghz-cd-card cc-card" role="dialog" aria-modal="true" aria-labelledby="cc-title">
      <div class="ghz-cd-ico warn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></div>
      <h3 class="cc-title" id="cc-title">Complete this course?</h3>
      <p class="cc-name"></p>
      <p class="cc-desc">Loading…</p>
    </div>
  </div>`);
  modal.querySelector(".cc-name").textContent = course.title || "Course";
  modal.querySelector("[data-cc-dim]").onclick = (ev) => { if (ev.target.hasAttribute("data-cc-dim")) close(); };
  try {
    const c = await completeCounts(course.id);
    const allOk = !c.ungradedHw && !c.ungradedQuiz && !c.scheduled && !c.noCert;
    const rows = [
      rowHtml("hw", !c.ungradedHw, "All homework submissions are graded", String(c.ungradedHw), "homework submissions not graded yet"),
      rowHtml("quiz", !c.ungradedQuiz, "All quiz attempts are graded", String(c.ungradedQuiz), "quiz attempts not graded yet"),
      rowHtml("cal", !c.scheduled, "No sessions still Scheduled", String(c.scheduled), "sessions still Scheduled"),
      rowHtml("award", !c.noCert, "Every enrollment has an issued certificate", String(c.noCert), "enrollments without an issued certificate")
    ].join("");
    paintDialog(modal, `<div class="ghz-cd-dim" data-cc-dim>
      <div class="ghz-cd-card cc-card" role="dialog" aria-modal="true" aria-labelledby="cc-title">
        <div class="ghz-cd-ico warn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></div>
        <h3 class="cc-title" id="cc-title">Complete this course?</h3>
        <p class="cc-name"></p>
        <p class="cc-desc">Completing this course makes it read-only for trainers and students. They can still view everything, but cannot submit, grade, mark attendance or post. You can reopen it later.</p>
        <div class="cc-rows">${rows}</div>
        <p class="${allOk ? "cc-ready" : "cc-open"}">${allOk ? "Everything is ready to complete." : "Some items are still open. You can complete the course anyway."}</p>
        <p class="cc-err" id="ccErr" hidden></p>
        <div class="cc-acts">
          <button class="ghz-cd-btn ghz-cd-cancel" type="button" id="cancelComplete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg> Cancel</button>
          <button class="ghz-cd-btn ghz-cd-ok danger" type="button" id="doComplete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> Complete course</button>
        </div>
      </div>
    </div>`);
    modal.querySelector("[data-cc-dim]").onclick = (ev) => { if (ev.target.hasAttribute("data-cc-dim")) close(); };
    modal.querySelector("#cancelComplete").onclick = close;
    modal.querySelector("#doComplete").onclick = async () => {
      const btn = modal.querySelector("#doComplete");
      const errEl = modal.querySelector("#ccErr");
      if (btn.disabled) return;
      btn.disabled = true;
      btn.innerHTML = `<span class="ghz-cd-spin" aria-hidden="true"></span> Complete course`;
      errEl.hidden = true;
      try {
        const uid = auth.currentUser?.uid || "";
        await updateDoc(doc(db, "courses", course.id), {
          status: "Completed",
          previousStatus: course.status || "Closed",
          completedAt: serverTimestamp(),
          completedBy: uid,
          completionCount: increment(1),
          completedCount: increment(1)
        });
        close();
        toast("Course completed");
        await reload();
      } catch (e) {
        errEl.hidden = false;
        errEl.textContent = e.code || e.message || String(e);
        btn.disabled = false;
        btn.textContent = "Complete course";
      }
    };
  } catch (e) {
    paintDialog(modal, `<div class="ghz-cd-dim" data-cc-dim>
      <div class="ghz-cd-card cc-card" role="dialog">
        <p class="cc-err">${(e.step || "completeCounts")}: ${e.code || e.message}</p>
        <div class="cc-acts"><button class="ghz-cd-btn ghz-cd-cancel" type="button" id="cancelComplete">Cancel</button></div>
      </div>
    </div>`);
    modal.querySelector("[data-cc-dim]").onclick = (ev) => { if (ev.target.hasAttribute("data-cc-dim")) close(); };
    modal.querySelector("#cancelComplete").onclick = close;
  }
}

export async function confirmReopen(course, toast, reload) {
  if (!confirm("Reopen this course?")) return;
  try {
    await updateDoc(doc(db, "courses", course.id), {
      status: course.previousStatus || "Open",
      completedBy: deleteField(),
      previousStatus: deleteField(),
      reopenedAt: serverTimestamp(),
      reopenCount: increment(1)
    });
    toast("Course reopened");
    await reload();
  } catch (e) {
    toast("reopenCourse: " + (e.code || e.message), "err");
  }
}
