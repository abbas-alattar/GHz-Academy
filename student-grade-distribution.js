import { db } from "./firebase-config.js?v=auth8";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { averageOf, statusOf, parseScore } from "./grade-sheet-math.js";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

export async function studentGradeDistributionHtml(uid, courseId) {
  let schemeSnap;
  try {
    schemeSnap = await getDoc(doc(db, "gradeSchemes", courseId));
  } catch (e) {
    throw Object.assign(e || {}, { step: "gradeSchemes" });
  }
  if (!schemeSnap.exists()) {
    return `<div class="table-wrap" style="margin-top:14px"><p style="padding:14px;color:var(--muted)">Grade distribution is not available for this course yet.</p></div>`;
  }
  const scheme = schemeSnap.data() || {};
  const components = Array.isArray(scheme.components) ? scheme.components : [];
  let passMark = Number(scheme.passMark);
  if (!Number.isFinite(passMark)) passMark = 60;

  let scoreSnap;
  try {
    scoreSnap = await getDoc(doc(db, "gradeScores", uid + "_" + courseId));
  } catch (e) {
    throw Object.assign(e || {}, { step: "gradeScores" });
  }
  if (!scoreSnap.exists()) {
    return `<div class="table-wrap" style="margin-top:14px"><h4 style="padding:14px 14px 0">Grade Distribution</h4><p style="padding:14px;color:var(--muted)">No scores have been posted for this course yet.</p></div>`;
  }
  const scores = scoreSnap.data().scores || {};
  const avg = averageOf(scores, components);
  const st = statusOf(scores, components, passMark, avg);
  const heads = components.map((c) => `<th>${esc(c.title || "")} (${Number(c.weight) || 0}%)</th>`).join("");
  const cells = components.map((c) => {
    const v = parseScore(scores[c.id]);
    return `<td>${v == null ? "—" : v}</td>`;
  }).join("");
  return `<div class="table-wrap" style="margin-top:14px">
    <h4 style="padding:14px 14px 0">Grade Distribution</h4>
    <p style="padding:0 14px 10px;color:var(--muted);font-size:.9rem">Pass mark: <strong>${passMark}/100</strong></p>
    <table class="data"><thead><tr>
      <th>Student</th><th>Average</th>${heads}<th>Status</th>
    </tr></thead><tbody><tr>
      <td>You</td>
      <td style="font-weight:700">${avg.toFixed(1)}/100</td>
      ${cells}
      <td><span class="badge" style="background:${st.bg};color:${st.color}">${esc(st.label)}</span></td>
    </tr></tbody></table>
  </div>`;
}
