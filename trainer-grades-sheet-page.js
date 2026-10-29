import { protect } from "./auth-guard.js?v=auth8";
import { auth, db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { isCourseLocked, CompletedBanner } from "./course-lock.js";
import { parseScore, computeAverage, computeStatus, gradeCalc, fmt1 } from "./gradeCalc.js";

const root = document.getElementById("root");
const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const fail = (step, e) => {
  const code = (e && (e.code || e.message)) || e;
  if (root) root.innerHTML = `<p class="banner">This page could not load<br>${esc(step)}: ${esc(code)}</p>`;
};
const toast = (m, k = "ok") => {
  const t = document.getElementById("tgToast");
  if (!t) return;
  t.hidden = false;
  t.className = "toast " + k;
  t.textContent = m;
};
const srcOf = (c) => (c.source === "attendance" || c.source === "homework" || c.source === "quiz" ? c.source : "manual");

try {
  const { user } = await protect("trainer");
  let courses = [];
  try {
    const cs = await getDocs(query(collection(db, "courses"), where("trainerIds", "array-contains", user.uid)));
    courses = cs.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    fail("courses", e);
    throw e;
  }

  const pre = new URLSearchParams(location.search).get("courseId") || "";
  const startId = (pre && courses.some((c) => c.id === pre)) ? pre : (courses[0]?.id || "");

  root.innerHTML = `
    <div class="toolbar">
      <select id="tgCourse">${courses.map((c) => `<option value="${esc(c.id)}" ${c.id===startId?"selected":""}>${esc(c.title || c.id)}${c.status==="Completed"?" (Completed)":""}</option>`).join("") || `<option value="">No courses</option>`}</select>
    </div>
    <p id="tgToast" class="toast" hidden></p>
    <div id="tgBody">${courses.length ? "Loading…" : "No courses are assigned to you yet."}</div>`;

  const body = document.getElementById("tgBody");
  const sel = document.getElementById("tgCourse");

  const loadCol = async (name, courseId) => {
    try {
      return (await getDocs(query(collection(db, name), where("courseId", "==", courseId)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      body.innerHTML = `<p class="banner">${name}: ${esc((e && (e.code || e.message)) || e)}</p>`;
      throw e;
    }
  };

  const loadSheet = async () => {
    const courseId = sel?.value;
    if (!courseId) { body.innerHTML = "<p>No courses are assigned to you yet.</p>"; return; }
    const course = courses.find((c) => c.id === courseId);
    const locked = isCourseLocked(course);
    body.textContent = "Loading…";
    let schemeSnap;
    try {
      schemeSnap = await getDoc(doc(db, "gradeSchemes", courseId));
    } catch (e) {
      body.innerHTML = `<p class="banner">gradeSchemes: ${esc((e && (e.code || e.message)) || e)}</p>`;
      return;
    }
    if (!schemeSnap.exists()) {
      body.innerHTML = `${CompletedBanner(course)}<h2>${esc(course?.title || "")}</h2><p>The admin has not set the grade distribution for this course yet.</p>`;
      return;
    }
    const scheme = schemeSnap.data() || {};
    const components = Array.isArray(scheme.components) ? scheme.components : [];
    let passMark = Number(scheme.passMark);
    if (!Number.isFinite(passMark)) passMark = 60;

    let enrolled = [];
    try {
      const ens = await getDocs(query(collection(db,"enrollments"), where("courseId","==",courseId)));
      enrolled = ens.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      body.innerHTML = `<p class="banner">enrollments: ${esc((e && (e.code || e.message)) || e)}</p>`;
      return;
    }
    for (const en of enrolled) {
      if (en.studentName || en.studentEmail) continue;
      if (!en.uid) continue;
      try {
        const us = await getDoc(doc(db, "users", en.uid));
        if (us.exists()) {
          const u = us.data();
          en.studentName = u.name || en.studentName;
          en.studentEmail = u.email || en.studentEmail;
        }
      } catch (e) {
        console.warn("users", en.uid, e && (e.code || e.message));
      }
    }

    let scoreMap = {};
    try {
      const ss = await getDocs(query(collection(db, "gradeScores"), where("courseId", "==", courseId)));
      ss.docs.forEach((d) => {
        const data = d.data();
        scoreMap[data.uid] = data.scores || {};
      });
    } catch (e) {
      body.innerHTML = `<p class="banner">gradeScores: ${esc((e && (e.code || e.message)) || e)}</p>`;
      return;
    }

    let autoPack;
    try {
      autoPack = {
        assignments: await loadCol("assignments", courseId),
        quizzes: await loadCol("quizzes", courseId),
        sessions: await loadCol("sessions", courseId),
        attendance: await loadCol("attendance", courseId),
        submissions: await loadCol("submissions", courseId),
        quizAttempts: await loadCol("quizAttempts", courseId)
      };
    } catch { return; }
    void autoPack.sessions;

    const rows = enrolled.map((en) => ({
      uid: en.uid,
      name: en.studentName || en.studentEmail || en.uid,
      manual: { ...(scoreMap[en.uid] || {}) }
    }));
    const valuesOf = (r) => gradeCalc({ id: courseId, pack: { ...autoPack, scheme } }, scheme, { uid: r.uid, scores: r.manual, pack: { ...autoPack, scheme } }).values || {};

    const heads = components.map((c) => `<th>${esc(c.title || "")} (${Number(c.weight) || 0}%)${srcOf(c)!=="manual"?" <span class=\"badge badge-open\">Auto</span>":""}</th>`).join("");
    const tbody = rows.length
      ? rows.map((r, i) => {
          const vals = valuesOf(r);
          const avg = computeAverage(scheme, vals);
          const st = computeStatus(scheme, vals, passMark);
          const cells = components.map((c) => {
            const src = srcOf(c);
            const v = vals[c.id];
            if (src !== "manual") {
              return `<td style="background:#f1f5f9">${v == null ? "—" : fmt1(v)}<span class="badge badge-open" style="margin-left:6px">Auto</span></td>`;
            }
            const shown = v == null || v === "" ? "" : v;
            return `<td><input data-row="${i}" data-cid="${esc(c.id)}" type="number" min="0" max="100" value="${esc(shown)}" ${locked ? "disabled" : ""} style="width:72px;padding:8px" /></td>`;
          }).join("");
          return `<tr>
            <td>${esc(r.name)}</td>
            ${cells}
            <td data-avg="${i}" style="font-weight:700">${fmt1(avg)}/100</td>
            <td data-st="${i}"><span class="badge" style="background:${st.bg};color:${st.color}">${esc(st.label)}</span></td>
            <td>${locked ? "" : `<button class="btn btn-sm" type="button" data-save="${i}">Save</button>`}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="${4 + components.length}">No enrolled students yet.</td></tr>`;

    body.innerHTML = `
      ${CompletedBanner(course)}
      <h2>${esc(course?.title || "")}</h2>
      <p style="color:#94a3b8;font-size:.8rem;margin:4px 0 8px">Found ${enrolled.length} enrollments for courseId ${esc(courseId)}</p>
      <p style="color:var(--muted);margin:8px 0 14px">Pass mark: <strong>${passMark}/100</strong>. Auto sections are computed live and not saved.</p>
      ${locked ? "" : `<p><button class="btn btn-sm" type="button" id="tgSaveAll">Save all</button></p>`}
      <div class="table-wrap" style="margin-top:12px"><table class="data" style="min-width:720px"><thead><tr>
        <th>Student</th>${heads}<th>Average</th><th>Status</th><th></th>
      </tr></thead><tbody>${tbody}</tbody></table></div>`;

    const refreshRow = (i) => {
      const r = rows[i];
      components.forEach((c) => {
        if (srcOf(c) !== "manual") return;
        const inp = body.querySelector(`input[data-row="${i}"][data-cid="${c.id}"]`);
        r.manual[c.id] = parseScore(inp?.value);
      });
      const vals = valuesOf(r);
      const avg = computeAverage(scheme, vals);
      const st = computeStatus(scheme, vals, passMark);
      const avgEl = body.querySelector(`[data-avg="${i}"]`);
      const stEl = body.querySelector(`[data-st="${i}"]`);
      if (avgEl) avgEl.textContent = fmt1(avg) + "/100";
      if (stEl) stEl.innerHTML = `<span class="badge" style="background:${st.bg};color:${st.color}">${esc(st.label)}</span>`;
    };
    body.querySelectorAll("input[data-row]").forEach((inp) => {
      inp.oninput = () => refreshRow(+inp.dataset.row);
    });
    const saveRow = async (i) => {
      refreshRow(i);
      const r = rows[i];
      const scores = {};
      components.forEach((c) => {
        if (srcOf(c) === "manual") scores[c.id] = r.manual[c.id] ?? null;
      });
      try {
        await setDoc(doc(db, "gradeScores", r.uid + "_" + courseId), {
          uid: r.uid,
          courseId,
          scores,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid || user.uid
        });
        toast("Saved " + r.name + ".");
      } catch (e) {
        toast("save: " + ((e && (e.code || e.message)) || e), "err");
      }
    };
    body.querySelectorAll("[data-save]").forEach((b) => { b.onclick = () => saveRow(+b.dataset.save); });
    const all = document.getElementById("tgSaveAll");
    if (all) all.onclick = async () => { for (let i = 0; i < rows.length; i++) await saveRow(i); };
  };

  if (sel) sel.onchange = loadSheet;
  if (courses.length) await loadSheet();
} catch (e) {
  fail("grades page", e);
}
