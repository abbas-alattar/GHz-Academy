import { protect } from "./auth-guard.js?v=auth8";
import { auth, db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { isCourseLocked, CompletedBanner } from "./course-lock.js";
import { parseScore, averageOf, statusOf } from "./grade-sheet-math.js";

const root = document.getElementById("gsRoot");
const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const fail = (step, e) => {
  const code = (e && (e.code || e.message)) || e;
  if (root) root.innerHTML = `<p class="banner">This page could not load<br>${esc(step)}: ${esc(code)}</p>`;
};
const toast = (m, k = "ok") => {
  const t = document.getElementById("gsToast");
  if (!t) return;
  t.hidden = false;
  t.className = "toast " + k;
  t.textContent = m;
};

try {
  const { user } = await protect("trainer");
  const courseId = new URLSearchParams(location.search).get("courseId") || "";
  if (!courseId) {
    root.innerHTML = `<p class="banner">Choose a course from My courses, then open Grade Sheet.</p>`;
  } else {
    let course = null;
    try {
      const snap = await getDoc(doc(db, "courses", courseId));
      if (snap.exists()) course = { id: snap.id, ...snap.data() };
    } catch (e) {
      fail("courses", e);
      throw e;
    }
    if (!course) {
      root.innerHTML = `<p class="banner">Course not found.</p>`;
    } else {
      let schemeSnap;
      try {
        schemeSnap = await getDoc(doc(db, "gradeSchemes", courseId));
      } catch (e) {
        fail("gradeSchemes", e);
        throw e;
      }
      if (!schemeSnap.exists()) {
        root.innerHTML = `${CompletedBanner(course)}<h2>${esc(course.title || "Course")}</h2><p>The admin has not set the grade distribution for this course yet.</p>`;
      } else {
        const scheme = schemeSnap.data() || {};
        const components = Array.isArray(scheme.components) ? scheme.components : [];
        let passMark = Number(scheme.passMark);
        if (!Number.isFinite(passMark)) passMark = 60;
        const locked = isCourseLocked(course);

        let enrolled = [];
        try {
          const ens = await getDocs(query(collection(db, "enrollments"), where("courseId", "==", courseId), where("status", "==", "enrolled")));
          enrolled = ens.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
          fail("enrollments", e);
          throw e;
        }

        let scoreMap = {};
        try {
          const ss = await getDocs(query(collection(db, "gradeScores"), where("courseId", "==", courseId)));
          ss.docs.forEach((d) => {
            const data = d.data();
            scoreMap[data.uid] = data.scores || {};
          });
        } catch (e) {
          fail("gradeScores", e);
          throw e;
        }

        const rows = enrolled.map((en) => {
          const uid = en.uid;
          const scores = { ...(scoreMap[uid] || {}) };
          return { uid, name: en.studentName || en.studentEmail || uid, scores };
        });

        const render = () => {
          const heads = components.map((c) => `<th>${esc(c.title || "")} (${Number(c.weight) || 0}%)</th>`).join("");
          const body = rows.length
            ? rows.map((r, i) => {
                const avg = averageOf(r.scores, components);
                const st = statusOf(r.scores, components, passMark, avg);
                const cells = components.map((c) => {
                  const v = r.scores[c.id];
                  const shown = v == null || v === "" ? "" : v;
                  return `<td><input data-row="${i}" data-cid="${esc(c.id)}" type="number" min="0" max="100" value="${esc(shown)}" ${locked ? "disabled" : ""} style="width:72px;padding:8px" /></td>`;
                }).join("");
                return `<tr>
                  <td>${esc(r.name)}</td>
                  <td data-avg="${i}" style="font-weight:700">${avg.toFixed(1)}/100</td>
                  ${cells}
                  <td data-st="${i}"><span class="badge" style="background:${st.bg};color:${st.color}">${esc(st.label)}</span></td>
                  <td>${locked ? "" : `<button class="btn btn-sm" type="button" data-save="${i}">Save</button>`}</td>
                </tr>`;
              }).join("")
            : `<tr><td colspan="${4 + components.length}">No enrolled students yet.</td></tr>`;
          root.innerHTML = `
            ${CompletedBanner(course)}
            <h2>${esc(course.title || "Course")}</h2>
            <p style="color:var(--muted);margin:8px 0 14px">Pass mark: <strong>${passMark}/100</strong>. Sections and weights are set by admin.</p>
            <p id="gsToast" class="toast" hidden></p>
            ${locked ? "" : `<p><button class="btn btn-sm" type="button" id="gsSaveAll">Save all</button></p>`}
            <div class="table-wrap" style="margin-top:12px"><table class="data" style="min-width:720px"><thead><tr>
              <th>Student</th><th>Average</th>${heads}<th>Status</th><th></th>
            </tr></thead><tbody>${body}</tbody></table></div>`;

          const refreshRow = (i) => {
            const r = rows[i];
            components.forEach((c) => {
              const inp = root.querySelector(`input[data-row="${i}"][data-cid="${c.id}"]`);
              r.scores[c.id] = parseScore(inp?.value);
            });
            const avg = averageOf(r.scores, components);
            const st = statusOf(r.scores, components, passMark, avg);
            const avgEl = root.querySelector(`[data-avg="${i}"]`);
            const stEl = root.querySelector(`[data-st="${i}"]`);
            if (avgEl) avgEl.textContent = avg.toFixed(1) + "/100";
            if (stEl) stEl.innerHTML = `<span class="badge" style="background:${st.bg};color:${st.color}">${esc(st.label)}</span>`;
          };

          root.querySelectorAll("input[data-row]").forEach((inp) => {
            inp.oninput = () => refreshRow(+inp.dataset.row);
          });

          const saveRow = async (i) => {
            refreshRow(i);
            const r = rows[i];
            const scores = {};
            components.forEach((c) => {
              scores[c.id] = r.scores[c.id];
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

          root.querySelectorAll("[data-save]").forEach((b) => {
            b.onclick = () => saveRow(+b.dataset.save);
          });
          const all = document.getElementById("gsSaveAll");
          if (all) all.onclick = async () => {
            for (let i = 0; i < rows.length; i++) await saveRow(i);
          };
        };
        render();
      }
    }
  }
} catch (e) {
  fail("boot", e);
}
