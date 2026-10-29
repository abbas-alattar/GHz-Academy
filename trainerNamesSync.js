import { db } from "./firebase-config.js?v=auth8";
import { collection, getDocs, query, where, writeBatch, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const KEY = "ghz-trainer-names-auto-v2";

function idsOf(c) {
  return [].concat(c.trainerIds || (c.trainerId ? [c.trainerId] : [])).filter(Boolean).map(String);
}
function namesNeedWrite(c, map) {
  const ids = idsOf(c);
  const have = Array.isArray(c.trainerNames) ? c.trainerNames.map((n) => String(n || "").trim()) : [];
  const want = ids.map((id) => map[id] || "");
  if (have.length !== want.length) return true;
  return want.some((n, i) => n !== have[i]);
}

export async function syncTrainerNamesOnce(toast) {
  if (sessionStorage.getItem(KEY) === "ok") return { skipped: true, written: [] };
  sessionStorage.setItem(KEY, "run");
  const map = {};
  let us;
  try {
    us = await getDocs(query(collection(db, "users"), where("role", "==", "trainer")));
  } catch (e) {
    console.error("trainerNames users", e?.code || e?.message || e);
    us = await getDocs(collection(db, "users"));
  }
  us.docs.forEach((d) => {
    const x = d.data() || {};
    const nm = String(x.name || x.displayName || "").trim();
    if (!nm) return;
    map[d.id] = nm;
    if (x.uid) map[x.uid] = nm;
  });
  const cs = await getDocs(collection(db, "courses"));
  const written = [];
  const dirty = [];
  cs.docs.forEach((d) => {
    const c = { id: d.id, ...d.data() };
    const ids = idsOf(c);
    const trainerNames = ids.map((id) => map[id] || "");
    written.push({ id: c.id, trainerIds: ids, trainerNames });
    if (namesNeedWrite(c, map)) dirty.push({ id: c.id, trainerNames, trainerName: trainerNames[0] || "" });
  });
  let n = 0;
  try {
    let batch = writeBatch(db);
    let k = 0;
    const flush = async () => {
      if (!k) return;
      await batch.commit();
      batch = writeBatch(db);
      k = 0;
    };
    for (const row of dirty) {
      batch.update(doc(db, "courses", row.id), { trainerNames: row.trainerNames, trainerName: row.trainerName });
      k++; n++;
      if (k >= 400) await flush();
    }
    await flush();
    sessionStorage.setItem(KEY, "ok");
    if (n && typeof toast === "function") toast("Trainer names updated on " + n + " course" + (n === 1 ? "" : "s"));
    try { console.info("ghz trainerNames", written); } catch (_) {}
  } catch (e) {
    sessionStorage.removeItem(KEY);
    console.error(e?.code || e?.message || e);
  }
  return { updated: n, written };
}
