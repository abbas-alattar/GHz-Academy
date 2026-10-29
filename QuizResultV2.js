const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

function dueMs(q) {
  const d = String(q?.dueDate ?? "").trim();
  if (!d) return 0;
  const n = Date.parse(d.length <= 10 ? d + "T12:00:00" : d);
  return Number.isFinite(n) ? n : 0;
}

function itemKind(q, att) {
  const st = String(att?.status ?? "");
  if (st === "graded") return "graded";
  if (st === "partial") return "partial";
  if (att) return "submitted";
  const due = dueMs(q);
  const now = Date.now();
  if (due && due < now) return "missed";
  if (due && due - now <= 3 * 86400000) return "soon";
  return "take";
}

function kindLabel(k) {
  if (k === "graded") return "Graded";
  if (k === "partial") return "Partially graded";
  if (k === "submitted") return "Submitted";
  if (k === "missed") return "Missed";
  if (k === "soon") return "Due soon";
  return "Not started";
}

function fmtWhen(v) {
  try { if (v && typeof v.toDate === "function") return v.toDate().toLocaleString(); } catch {}
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = Date.parse(s);
  return Number.isFinite(n) ? new Date(n).toLocaleString() : s;
}

export function closeQuizResultV2() {
  try { document.removeEventListener("keydown", window.__qr2esc); } catch {}
  const el = document.getElementById("qr2Root");
  if (el) el.innerHTML = "";
}

export function renderQuizResultV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    const q = opts.quiz || {};
    const att = opts.attempt || null;
    const course = opts.course || {};
    const k = itemKind(q, att);
    const lim = Number(q?.timeLimitMinutes);
    const graded = String(att?.status ?? "") === "graded";
    const e = Number(att?.score);
    const m = Number(att?.maxScore);
    const sc = graded && Number.isFinite(e) && Number.isFinite(m) && m > 0 ? { e, m, pct: Math.round((e / m) * 100) } : null;
    const fb = typeof att?.feedback === "string" ? att.feedback : "";
    const cls = k === "soon" ? "soon" : k === "missed" ? "miss" : k === "submitted" ? "sub" : k === "partial" ? "part" : k === "graded" ? "grad" : "take";

    host.innerHTML = `<div class="qr2-scrim" data-qr2-close></div>
      <aside class="qr2-draw" role="dialog" aria-modal="true">
        <div class="qr2-top">
          <div>
            <h2>${esc(q?.title || "Quiz")}</h2>
            <span class="qr2-chip">${esc(course?.title || q?.courseTitle || "Course")}</span>
            <span class="qr2-st ${cls}">${esc(kindLabel(k))}</span>
          </div>
          <button class="qr2-x" type="button" data-qr2-close aria-label="Close">×</button>
        </div>
        <div class="qr2-body">
          <div class="qr2-info">
            <span>Due ${esc(q?.dueDate || "—")}</span>
            ${Number.isFinite(lim) && lim > 0 ? `<span>Time limit ${esc(lim)} min</span>` : ""}
            ${att ? `<span>Submitted ${esc(fmtWhen(att.submittedAt) || "—")}</span>` : ""}
          </div>
          ${sc ? `<p class="qr2-score">${esc(sc.e)} / ${esc(sc.m)}</p>
            <div class="qz2-bar" style="height:10px;max-width:280px"><i style="width:${Math.max(0,Math.min(100,sc.pct))}%"></i></div>
            <p style="margin-top:6px;color:#64748b">${esc(sc.pct)}%</p>` : `<p>Waiting for your trainer to grade this.</p>`}
          ${fb ? `<blockquote class="qr2-quote">${esc(fb)}</blockquote>` : ""}
        </div>
        <div class="qr2-foot"><button class="btn btn-ghost" type="button" data-qr2-close>Close</button></div>
      </aside>`;
    const close = () => { closeQuizResultV2(); opts.onClose?.(); };
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-qr2-close]")) close(); };
    window.__qr2esc = (ev) => { if (ev.key === "Escape") close(); };
    document.addEventListener("keydown", window.__qr2esc);
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    host.innerHTML = `<div class="qr2-fail"><p>Could not open result (${esc(code)})</p><button class="btn btn-sm" type="button" data-qr2-close>Close</button></div>`;
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-qr2-close]")) closeQuizResultV2(); };
    return false;
  }
}
