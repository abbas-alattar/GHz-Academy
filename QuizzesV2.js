const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const state = { tab: "active", q: "", status: "all", open: {} };

function courseGroup(c) {
  const s = String(c?.status ?? "");
  if (s === "Completed") return "completed";
  if (s === "Open" || s === "Closed") return "active";
  return "other";
}

function tsMs(v) {
  if (!v) return 0;
  try {
    const d = v.toDate ? v.toDate() : new Date(v);
    return isNaN(d) ? 0 : d.getTime();
  } catch { return 0; }
}
function startMs(q) { return tsMs(q?.startAt); }
function endMs(q) {
  const e = tsMs(q?.endAt);
  if (e) return e;
  return dueMsLegacy(q);
}
function dueMsLegacy(q) {
  const d = String(q?.dueDate ?? "").trim();
  if (!d) return 0;
  const n = Date.parse(d.length <= 10 ? d + "T23:59:00" : d);
  return Number.isFinite(n) ? n : 0;
}
function dueMs(q) { return endMs(q) || dueMsLegacy(q); }
function windowState(q) {
  const now = Date.now();
  const s = startMs(q); const e = endMs(q);
  if (s && now < s) return "scheduled";
  if (e && now > e) return "closed";
  return "open";
}
function fmtOpen(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function dueLabel(q) {
  const d = String(q?.dueDate ?? "").trim();
  if (!d) return "Due —";
  try {
    const dt = new Date(d.length <= 10 ? d + "T12:00:00" : d);
    if (Number.isNaN(dt.getTime())) return "Due " + d;
    return "Due " + dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch { return "Due " + d; }
}

function attFor(q, attempts) {
  const list = Array.isArray(attempts) ? attempts : [];
  return list.find((a) => (a?.quizId ?? "") === (q?.id ?? "")) || null;
}

function itemKind(q, att) {
  const st = String(att?.status ?? "");
  if (st === "graded") return "graded";
  if (st === "partial") return "partial";
  if (att) return "submitted";
  const win = windowState(q);
  if (win === "closed") return "missed";
  if (win === "scheduled") return "soon";
  const due = dueMs(q);
  const now = Date.now();
  if (due && due < now) return "missed";
  if (due && due - now <= 3 * 86400000) return "soon";
  return "take";
}

function kindLabel(k) {
  if (k === "graded") return "Graded";
  if (k === "partial") return "In review";
  if (k === "submitted") return "In review";
  if (k === "missed") return "Missed";
  if (k === "soon") return "Due soon";
  return "Not started";
}

function filterKind(k, status) {
  if (status === "all") return true;
  if (status === "take") return k === "take" || k === "soon";
  if (status === "review") return k === "submitted" || k === "partial";
  if (status === "graded") return k === "graded";
  if (status === "missed") return k === "missed";
  return true;
}

function chipCounts(quizzes, attempts, courses) {
  const activeIds = new Set((courses || []).filter((c) => courseGroup(c) === "active").map((c) => c.id));
  let take = 0, review = 0, graded = 0, missed = 0;
  for (const q of quizzes || []) {
    if (!activeIds.has(q?.courseId)) continue;
    const k = itemKind(q, attFor(q, attempts));
    if (k === "graded") graded++;
    else if (k === "submitted" || k === "partial") review++;
    else if (k === "missed") missed++;
    else take++;
  }
  return { take, review, graded, missed };
}

function scoreBlock(att) {
  if (String(att?.status ?? "") !== "graded") return "";
  const e = Number(att?.score);
  const m = Number(att?.maxScore);
  if (!Number.isFinite(e) || !Number.isFinite(m) || m <= 0) return "";
  const pct = Math.round((e / m) * 100);
  return `<div class="qz2-g"><p>${e} / ${m}</p><div class="qz2-bar"><i style="width:${Math.max(0,Math.min(100,pct))}%"></i></div><p style="font-weight:500;color:#64748b">${pct}%</p></div>`;
}

function cardHtml(q, att, readonly) {
  const k = itemKind(q, att);
  const cal = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  const clk = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v6l4 2" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  const lim = Number(q?.timeLimitMinutes);
  const time = Number.isFinite(lim) && lim > 0 ? `<span>${clk} ${lim} min</span>` : "";
  let btn = "";
  if (readonly || k === "graded" || k === "submitted" || k === "partial") {
    if (att) btn = `<button class="btn btn-sm" type="button" data-qz2-view="${esc(q?.id ?? "")}">View result</button>`;
  } else if (!readonly && (k === "take" || k === "soon")) {
    const pub = String(q?.status || "") === "Published";
    const win = windowState(q);
    const can = pub && win === "open";
    btn = can
      ? `<button class="btn btn-sm" type="button" data-qz2-start="${esc(q?.id ?? "")}">Start</button>`
      : `<button class="btn btn-sm" type="button" disabled title="${win === "scheduled" ? "Opens later" : "This quiz is not available"}">Start</button>`;
  }
  const win = windowState(q);
  const when = win === "scheduled" && startMs(q) ? "Opens " + fmtOpen(startMs(q)) : (win === "closed" ? "Closed" : dueLabel(q));
  const cls = win === "closed" || k === "missed" ? "miss" : k === "soon" || win === "scheduled" ? "soon" : k === "submitted" ? "sub" : k === "partial" ? "part" : k === "graded" ? "grad" : "take";
  const stLab = win === "scheduled" ? "Opens " + fmtOpen(startMs(q)) : (win === "closed" && !att ? "Closed" : kindLabel(k));
  return `<article class="qz2-card">
    <div style="flex:1;min-width:0">
      <h4>${esc(q?.title || "Quiz")}</h4>
      <p class="qz2-meta"><span>${cal} ${esc(when)}</span>${time}</p>
      <span class="qz2-st ${cls}">${esc(stLab)}</span>
    </div>
    ${scoreBlock(att)}
    ${btn}
  </article>`;
}

function sectionHtml(c, quizzes, attempts, q, status) {
  const cid = c?.id ?? "";
  const list = (quizzes || []).filter((x) => (x?.courseId ?? "") === cid).sort((a, b) => dueMs(a) - dueMs(b));
  const shown = list.filter((x) => {
    const k = itemKind(x, attFor(x, attempts));
    const title = String(x?.title ?? "").toLowerCase();
    if (q && !title.includes(q)) return false;
    return filterKind(k, status);
  });
  const doneN = list.filter((x) => {
    const k = itemKind(x, attFor(x, attempts));
    return k === "graded" || k === "submitted" || k === "partial";
  }).length;
  const group = courseGroup(c);
  const open = state.open[cid] !== undefined ? !!state.open[cid] : group === "active";
  const readonly = group === "completed";
  const body = shown.length
    ? shown.map((x) => cardHtml(x, attFor(x, attempts), readonly)).join("")
    : `<p class="qz2-none">No quizzes yet</p>`;
  const w = list.length ? Math.round((doneN / list.length) * 100) : 0;
  return `<section class="qz2-sec">
    <button type="button" class="qz2-sec-h" data-qz2-tog="${esc(cid)}">
      <strong>${esc(c?.title || "Course")}</strong>
      <span class="qz2-cbadge ${group==="completed"?"done":"act"}">${group==="completed"?"Completed":"Active"}</span>
      <div class="qz2-prog"><p>${doneN} of ${list.length} completed</p><div class="qz2-bar"><i style="width:${w}%"></i></div></div>
    </button>
    <div class="qz2-body" ${open ? "" : "hidden"}>${body}</div>
  </section>`;
}

function sortCourses(courses, quizzes) {
  return [...courses].sort((a, b) => {
    const an = (quizzes || []).filter((x) => (x?.courseId ?? "") === (a?.id ?? "")).length;
    const bn = (quizzes || []).filter((x) => (x?.courseId ?? "") === (b?.id ?? "")).length;
    return (bn > 0) - (an > 0);
  });
}

export function renderQuizzesV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    if (opts.loading) {
      host.innerHTML = `<div class="qz2-wrap"><div class="qz2-skel"></div><div class="qz2-skel"></div></div>`;
      return true;
    }
    const courses = Array.isArray(opts.courses) ? opts.courses : [];
    const quizzes = Array.isArray(opts.quizzes) ? opts.quizzes : [];
    const attempts = Array.isArray(opts.attempts) ? opts.attempts : [];
    const q = String(state.q || "").toLowerCase();
    const status = state.status || "all";
    const tab = state.tab === "completed" ? "completed" : "active";
    const chips = chipCounts(quizzes, attempts, courses);
    const list = sortCourses(courses.filter((c) => courseGroup(c) === tab), quizzes);
    const nAct = courses.filter((c) => courseGroup(c) === "active").length;
    const nDone = courses.filter((c) => courseGroup(c) === "completed").length;
    const emptyTab = tab === "active"
      ? `<div class="qz2-empty"><div>📡</div><p>No active courses</p></div>`
      : `<div class="qz2-empty"><div>🎓</div><p>No completed courses</p></div>`;

    host.innerHTML = `<div class="qz2-wrap">
      <div class="qz2-head">
        <h2>Quizzes</h2>
        <p class="qz2-sub">Your quizzes, grouped by course</p>
      </div>
      <div class="qz2-sum">
        <div class="qz2-stat take"><span class="ico">▶</span><div><div class="n">${chips.take}</div><div class="l">To take</div></div></div>
        <div class="qz2-stat rev"><span class="ico">…</span><div><div class="n">${chips.review}</div><div class="l">In review</div></div></div>
        <div class="qz2-stat grad"><span class="ico">✓</span><div><div class="n">${chips.graded}</div><div class="l">Graded</div></div></div>
        <div class="qz2-stat miss"><span class="ico">!</span><div><div class="n">${chips.missed}</div><div class="l">Missed</div></div></div>
      </div>
      <div class="qz2-tabs">
        <button type="button" class="${tab==="active"?"on":""}" data-qz2-tab="active">Active courses (${nAct})</button>
        <button type="button" class="${tab==="completed"?"on":""}" data-qz2-tab="completed">Completed courses (${nDone})</button>
      </div>
      <div class="qz2-filters">
        <input type="search" data-qz2-q placeholder="Search by title" value="${esc(state.q)}" />
        <label class="qz2-stlab">Status:
          <select data-qz2-st>
            <option value="all"${status==="all"?" selected":""}>All</option>
            <option value="take"${status==="take"?" selected":""}>To take</option>
            <option value="review"${status==="review"?" selected":""}>In review</option>
            <option value="graded"${status==="graded"?" selected":""}>Graded</option>
            <option value="missed"${status==="missed"?" selected":""}>Missed</option>
          </select>
        </label>
      </div>
      <div data-qz2-list>${list.length ? list.map((c) => sectionHtml(c, quizzes, attempts, q, status)).join("") : emptyTab}</div>
    </div>`;

    host.onclick = (e) => {
      const t = e.target?.closest?.("[data-qz2-tab],[data-qz2-tog],[data-qz2-start],[data-qz2-view]");
      if (!t) return;
      if (t.hasAttribute("data-qz2-tab")) {
        state.tab = t.getAttribute("data-qz2-tab") === "completed" ? "completed" : "active";
        renderQuizzesV2(opts);
        return;
      }
      if (t.hasAttribute("data-qz2-tog")) {
        const id = t.getAttribute("data-qz2-tog");
        const cur = state.open[id] !== undefined ? !!state.open[id] : courseGroup(courses.find((c) => c.id === id)) === "active";
        state.open[id] = !cur;
        renderQuizzesV2(opts);
        return;
      }
      if (t.hasAttribute("data-qz2-start")) { opts.onStart?.(t.getAttribute("data-qz2-start")); return; }
      if (t.hasAttribute("data-qz2-view")) { opts.onView?.(t.getAttribute("data-qz2-view")); return; }
    };
    host.oninput = (e) => {
      const qel = e.target?.closest?.("[data-qz2-q]");
      if (!qel) return;
      state.q = qel.value || "";
      const listEl = e.target?.closest?.(".qz2-wrap")?.lastElementChild;
      if (listEl && listEl.hasAttribute("data-qz2-list")) {
        const qq = String(state.q || "").toLowerCase();
        const st = state.status || "all";
        const tabNow = state.tab === "completed" ? "completed" : "active";
        const rows = sortCourses(courses.filter((c) => courseGroup(c) === tabNow), quizzes);
        const emptyNow = tabNow === "active"
          ? `<div class="qz2-empty"><div>📡</div><p>No active courses</p></div>`
          : `<div class="qz2-empty"><div>🎓</div><p>No completed courses</p></div>`;
        listEl.innerHTML = rows.length ? rows.map((c) => sectionHtml(c, quizzes, attempts, qq, st)).join("") : emptyNow;
      }
    };
    host.onchange = (e) => {
      const sel = e.target?.closest?.("[data-qz2-st]");
      const qel = e.target?.closest?.("[data-qz2-q]");
      if (qel) state.q = qel.value || "";
      if (sel) state.status = sel.value || "all";
      if (qel || sel) renderQuizzesV2(opts);
    };
    opts.onReady?.();
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    host.innerHTML = `<div class="qz2-fail"><p>Could not load quizzes (${esc(code)})</p><button class="btn btn-sm" type="button" data-classic>Use classic view</button></div>`;
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-classic]")) opts.onClassic?.(); };
    return false;
  }
}
