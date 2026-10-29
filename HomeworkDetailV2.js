const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

function dueMs(a) {
  const d = String(a?.dueDate ?? "").trim();
  if (!d) return 0;
  const n = Date.parse(d.length <= 10 ? d + "T12:00:00" : d);
  return Number.isFinite(n) ? n : 0;
}

function itemKind(a, sub) {
  if (sub?.status === "graded") return "graded";
  if (sub) return "submitted";
  const due = dueMs(a);
  const now = Date.now();
  if (due && due < now) return "overdue";
  if (due && due - now <= 3 * 86400000) return "soon";
  return "todo";
}

function kindLabel(k) {
  if (k === "graded") return "Graded";
  if (k === "submitted") return "Submitted";
  if (k === "overdue") return "Overdue";
  if (k === "soon") return "Due soon";
  return "To do";
}

function relDue(a) {
  const due = dueMs(a);
  if (!due) return "";
  const days = Math.round((due - Date.now()) / 86400000);
  if (days > 0) return `in ${days} day${days===1?"":"s"}`;
  if (days < 0) return `${Math.abs(days)} day${days===-1?"":"s"} overdue`;
  return "due today";
}

function fmtWhen(v) {
  try {
    if (v && typeof v.toDate === "function") return v.toDate().toLocaleString();
  } catch {}
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = Date.parse(s);
  return Number.isFinite(n) ? new Date(n).toLocaleString() : s;
}

function linkify(text) {
  const t = String(text ?? "");
  return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, "\n");
}

function scoreLine(a, sub) {
  const max = Number(a?.maxPoints);
  const g = Number(sub?.grade);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(g)) return null;
  const pct = Math.round((g / max) * 100);
  return { g, max, pct };
}

export function closeHomeworkDetailV2() {
  try { document.removeEventListener("keydown", window.__hd2esc); } catch {}
  const el = document.getElementById("hd2Root");
  if (el) el.innerHTML = "";
}

export function renderHomeworkDetailV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    const a = opts.assignment || {};
    const sub = opts.sub || null;
    const course = opts.course || {};
    const readonly = String(course?.status ?? "") === "Completed";
    const graded = sub?.status === "graded";
    const k = itemKind(a, sub);
    const due = String(a?.dueDate ?? "—");
    const rel = relDue(a);
    const max = Number(a?.maxPoints);
    const maxOk = Number.isFinite(max) ? max : 0;
    const sc = graded ? scoreLine(a, sub) : null;
    const trainer = sub?.gradedByName || sub?.trainerName || course?.trainerName || "";
    const canEdit = !readonly && !graded;
    const showForm = canEdit && (!sub || sub.status !== "graded");

    host.innerHTML = `<div class="hd2-scrim" data-hd2-close></div>
      <aside class="hd2-draw" role="dialog" aria-modal="true">
        <div class="hd2-top">
          <div>
            <h2>${esc(a?.title || "Homework")}</h2>
            <span class="hd2-chip">${esc(course?.title || a?.courseTitle || "Course")}</span>
            <span class="hd2-st ${k==="soon"?"soon":k==="overdue"?"over":k==="submitted"?"sub":k==="graded"?"grad":"todo"}">${esc(kindLabel(k))}</span>
          </div>
          <button class="hd2-x" type="button" data-hd2-close aria-label="Close">×</button>
        </div>
        <div class="hd2-body">
          <div class="hd2-info">
            <span>📅 ${esc(due)}${rel ? " · " + esc(rel) : ""}</span>
            <span>★ Max ${esc(maxOk)} pts</span>
            ${sub ? `<span>↑ Submitted ${esc(fmtWhen(sub.submittedAt) || "—")}</span>` : ""}
            ${graded ? `<span>✓ Graded ${esc(fmtWhen(sub.gradedAt) || "—")}</span>` : ""}
          </div>
          <section class="hd2-sec">
            <h3>Instructions</h3>
            <div class="hd2-inst">${linkify(a?.instructions || a?.description || "No instructions yet.")}</div>
            ${a?.link ? `<p><a href="${esc(a.link)}" target="_blank" rel="noopener">Attached link</a></p>` : ""}
          </section>
          <section class="hd2-sec">
            <h3>Your submission</h3>
            ${showForm ? `<form data-hd2-form>
              <label>Your answer</label><textarea name="text" style="width:100%;min-height:90px;padding:12px;border:1px solid var(--line);border-radius:10px;font:inherit">${esc(sub?.text||"")}</textarea>
              <label>Link (optional)</label><input name="link" value="${esc(sub?.link||"")}" />
              <p class="err" data-hd2-err hidden></p>
              <p style="margin-top:10px"><button class="btn" type="submit">${sub?"Update submission":"Submit"}</button></p>
            </form>`
              : `<p class="hd2-inst">${esc(sub?.text || "No answer submitted.")}</p>${sub?.link?`<p><a href="${esc(sub.link)}" target="_blank" rel="noopener">${esc(sub.link)}</a></p>`:""}`}
          </section>
          <section class="hd2-sec">
            <h3>Result</h3>
            ${graded && sc ? `<p class="hd2-score">Grade: ${esc(sc.g)} / ${esc(sc.max)}</p>
              <div class="hw2-bar" style="height:10px;max-width:280px"><i style="width:${Math.max(0,Math.min(100,sc.pct))}%"></i></div>
              <p style="margin-top:6px;color:#64748b">${esc(sc.pct)}%</p>
              <blockquote class="hd2-quote">${esc(sub?.feedback || "No feedback.")}${trainer?`<br><em>— ${esc(trainer)}</em>`:""}</blockquote>`
              : `<p>Waiting for your trainer to grade this.</p>`}
          </section>
        </div>
        <div class="hd2-foot"><button class="btn btn-ghost" type="button" data-hd2-close>Close</button></div>
      </aside>`;

    let errNode = null;
    const close = () => { closeHomeworkDetailV2(); opts.onClose?.(); };
    host.onclick = (e) => {
      const t = e.target?.closest?.("[data-hd2-close]");
      if (t) close();
    };
    host.onsubmit = (e) => {
      const form = e.target?.closest?.("[data-hd2-form]");
      if (!form) return;
      e.preventDefault();
      const fd = new FormData(form);
      if (!errNode) {
        const nodes = form.getElementsByClassName("err");
        errNode = nodes && nodes[0] ? nodes[0] : null;
      }
      opts.onSave?.({
        text: String(fd.get("text") || ""),
        link: String(fd.get("link") || "").trim(),
        assignment: a,
        onError: (msg) => {
          if (errNode) { errNode.hidden = false; errNode.style.display = "block"; errNode.textContent = msg; }
        }
      });
    };
    window.__hd2esc = (ev) => { if (ev.key === "Escape") close(); };
    document.addEventListener("keydown", window.__hd2esc);
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    host.innerHTML = `<div class="hd2-fail"><p>Could not open homework (${esc(code)})</p><button class="btn btn-sm" type="button" data-hd2-close>Close</button></div>`;
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-hd2-close]")) closeHomeworkDetailV2(); };
    return false;
  }
}
