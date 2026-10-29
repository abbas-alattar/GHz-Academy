import { protect } from "./auth-guard.js?v=auth8";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs, getDoc, doc, setDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const root = document.getElementById("root");
const fail = (step, e) => {
  console.error(step, e);
  if (root) root.innerHTML = `<p class="banner">This page could not load<br>${step}: ${(e && (e.code || e.message)) || e}</p>`;
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const pct = (n, d) => (!d ? null : Math.round(Number(n) / Number(d) * 100));
const attPct = (recs) => {
  const den = recs.filter((r) => r.status && r.status !== "excused").length;
  const good = recs.filter((r) => r.status === "present" || r.status === "late").length;
  return den ? Math.round(good / den * 100) : null;
};
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const makeCode = async () => {
  const year = new Date().getFullYear();
  for (let n = 0; n < 12; n++) {
    const buf = new Uint8Array(6);
    crypto.getRandomValues(buf);
    let tail = "";
    for (let i = 0; i < 6; i++) tail += ALPHA[buf[i] % ALPHA.length];
    const code = `GHZ-${year}-${tail}`;
    const snap = await getDoc(doc(db, "certificateVerify", code));
    if (!snap.exists()) return code;
  }
  throw new Error("Could not allocate a unique code");
};

try {
  const { user } = await protect("admin");
  let courses = [];
  try {
    courses = (await getDocs(collection(db, "courses"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { fail("courses", e); throw e; }

  let settings = { minAttendance: 70, minAverage: 50 };
  try {
    const s = await getDoc(doc(db, "settings", "certificates"));
    if (s.exists()) settings = { ...settings, ...s.data() };
  } catch (e) { fail("settings/certificates", e); throw e; }

  root.innerHTML = `
    <article class="kpi">
      <h3>Requirements</h3>
      <label>Minimum attendance % <input id="minAtt" type="number" min="0" max="100" value="${Number(settings.minAttendance) || 70}" /></label>
      <label>Minimum course average % <input id="minAvg" type="number" min="0" max="100" value="${Number(settings.minAverage) || 50}" /></label>
      <button class="btn btn-sm" type="button" id="saveReq">Save</button>
    </article>
    <div class="toolbar" style="margin-top:16px">
      <select id="cid">${courses.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join("")}</select>
      <button class="btn btn-sm" type="button" id="issueAll">Issue all eligible</button>
    </div>
    <p id="toast" class="toast" hidden></p>
    <div id="box"></div>`;

  const toast = (m) => { const t = document.getElementById("toast"); t.hidden = false; t.textContent = m; };

  document.getElementById("saveReq").onclick = async () => {
    try {
      const minAttendance = Number(document.getElementById("minAtt").value);
      const minAverage = Number(document.getElementById("minAvg").value);
      await setDoc(doc(db, "settings", "certificates"), { minAttendance, minAverage }, { merge: true });
      settings.minAttendance = minAttendance;
      settings.minAverage = minAverage;
      toast("Requirements saved.");
      await load();
    } catch (e) {
      document.getElementById("box").innerHTML = `<p class="banner">saveSettings: ${e.code || e.message}</p>`;
    }
  };

  const getCol = async (col, cid, step) => {
    try {
      return (await getDocs(query(collection(db, col), where("courseId", "==", cid)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      document.getElementById("box").innerHTML = `<p class="banner">${step}: ${e.code || e.message}</p>`;
      throw e;
    }
  };

  const issueOne = async (row, course, overrideReason) => {
    const existing = row.cert;
    const code = existing && existing.certificateId ? existing.certificateId : await makeCode();
    const batch = writeBatch(db);
    const certRef = doc(db, "certificates", `${row.uid}_${course.id}`);
    const verRef = doc(db, "certificateVerify", code);
    const payload = {
      uid: row.uid,
      studentName: row.studentName,
      courseId: course.id,
      courseTitle: course.title || course.id,
      certificateId: code,
      status: "issued",
      average: row.avg,
      attendance: row.att,
      issuedAt: serverTimestamp(),
      issuedBy: user.uid
    };
    if (overrideReason) payload.overrideReason = overrideReason;
    batch.set(certRef, payload, { merge: true });
    batch.set(verRef, {
      studentName: row.studentName,
      courseTitle: course.title || course.id,
      issuedAt: serverTimestamp(),
      status: "issued"
    });
    await batch.commit();
  };

  const load = async () => {
    const box = document.getElementById("box");
    const cid = document.getElementById("cid").value;
    const course = courses.find((c) => c.id === cid);
    if (!course) { box.innerHTML = "<p>No courses.</p>"; return; }
    box.textContent = "Loading…";
    let ens, assigns, quizzes, subs, atts, sess, recs, certs;
    try {
      ens = await getCol("enrollments", cid, "enrollments");
      assigns = await getCol("assignments", cid, "assignments");
      quizzes = await getCol("quizzes", cid, "quizzes");
      subs = await getCol("submissions", cid, "submissions");
      atts = await getCol("quizAttempts", cid, "quizAttempts");
      sess = await getCol("sessions", cid, "sessions");
      recs = await getCol("attendance", cid, "attendance");
      certs = await getCol("certificates", cid, "certificates");
    } catch { return; }
    void sess;
    const items = [
      ...assigns.map((a) => ({ id: a.id, type: "hw", max: a.maxPoints || 0 })),
      ...quizzes.map((q) => ({ id: q.id, type: "quiz" }))
    ];
    const avgFor = (uid) => {
      let e = 0, m = 0;
      items.forEach((it) => {
        if (it.type === "hw") {
          const s = subs.find((x) => x.uid === uid && x.assignmentId === it.id);
          if (s?.status === "graded") { e += Number(s.grade || 0); m += Number(it.max || 0); }
        } else {
          const s = atts.find((x) => x.uid === uid && x.quizId === it.id);
          if (s?.status === "graded") { e += Number(s.score || 0); m += Number(s.maxScore || 0); }
        }
      });
      return pct(e, m);
    };
    const rows = ens.map((en) => {
      const att = attPct(recs.filter((r) => r.uid === en.uid));
      const avg = avgFor(en.uid);
      const cert = certs.find((c) => c.uid === en.uid);
      const eligible = (att != null && att >= Number(settings.minAttendance || 70)) && (avg != null && avg >= Number(settings.minAverage || 50));
      return { uid: en.uid, studentName: en.studentName || en.uid, att, avg, cert, eligible };
    });

    const statusLabel = (c) => !c ? "Not issued" : c.status === "revoked" ? "Revoked" : "Issued";
    box.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Attendance %</th><th>Average %</th><th>Eligible</th><th>Certificate</th><th></th></tr></thead><tbody>
      ${rows.length ? rows.map((r) => `<tr>
        <td>${esc(r.studentName)}</td>
        <td>${r.att == null ? "—" : r.att + "%"}</td>
        <td>${r.avg == null ? "—" : r.avg + "%"}</td>
        <td>${r.eligible ? `<span class="badge badge-open">Eligible</span>` : `<span class="badge badge-draft">Not yet</span>`}</td>
        <td>${statusLabel(r.cert)}</td>
        <td>
          ${!r.cert || r.cert.status === "revoked" ? `<button class="btn btn-sm" type="button" data-issue="${r.uid}">${r.cert && r.cert.status === "revoked" ? "Reissue" : "Issue"}</button>` : ""}
          ${r.cert && r.cert.status === "issued" ? `<button class="btn btn-sm btn-ghost" type="button" data-view="${r.uid}">View</button>
          <button class="btn btn-sm btn-warn" type="button" data-rev="${r.uid}">Revoke</button>` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="6">No enrolled students.</td></tr>`}
    </tbody></table></div>`;

    box.querySelectorAll("[data-view]").forEach((b) => {
      b.onclick = () => { location.href = `./certificate-view.html?id=${encodeURIComponent(b.dataset.view + "_" + cid)}`; };
    });
    box.querySelectorAll("[data-issue]").forEach((b) => {
      b.onclick = async () => {
        const row = rows.find((x) => x.uid === b.dataset.issue);
        let reason = "";
        if (!row.eligible) {
          if (!confirm("This student is not eligible. Issue anyway?")) return;
          reason = prompt("Override reason (required)") || "";
          if (!reason.trim()) { toast("A reason is required."); return; }
        }
        try {
          await issueOne(row, course, reason.trim() || undefined);
          toast("Issued.");
          await load();
        } catch (e) {
          box.innerHTML = `<p class="banner">issueCertificate: ${e.code || e.message}</p>`;
        }
      };
    });
    box.querySelectorAll("[data-rev]").forEach((b) => {
      b.onclick = async () => {
        const row = rows.find((x) => x.uid === b.dataset.rev);
        const reason = prompt("Revoke reason (required)") || "";
        if (!reason.trim()) { toast("A reason is required."); return; }
        try {
          const batch = writeBatch(db);
          const certRef = doc(db, "certificates", `${row.uid}_${cid}`);
          const verRef = doc(db, "certificateVerify", row.cert.certificateId);
          batch.set(certRef, { status: "revoked", revokedAt: serverTimestamp(), revokedBy: user.uid, revokeReason: reason.trim() }, { merge: true });
          batch.set(verRef, { status: "revoked" }, { merge: true });
          await batch.commit();
          toast("Revoked.");
          await load();
        } catch (e) {
          box.innerHTML = `<p class="banner">revokeCertificate: ${e.code || e.message}</p>`;
        }
      };
    });

    document.getElementById("issueAll").onclick = async () => {
      const eligible = rows.filter((r) => r.eligible && (!r.cert || r.cert.status === "revoked"));
      if (!eligible.length) { toast("No eligible students to issue."); return; }
      if (!confirm(`Issue certificates for ${eligible.length} eligible student(s)?`)) return;
      try {
        for (const row of eligible) await issueOne(row, course);
        toast("Issued eligible certificates.");
        await load();
      } catch (e) {
        box.innerHTML = `<p class="banner">issueAllEligible: ${e.code || e.message}</p>`;
      }
    };
  };

  document.getElementById("cid").onchange = load;
  await load();
} catch (e) {
  fail("boot", e);
}
