const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

const state = { tab: "active", q: "", status: "all", open: {} };

function courseGroup(c) {
  const s = String(c?.status ?? "");
  if (s === "Completed") return "completed";
  if (s === "Open" || s === "Closed") return "active";
  return "other";
}

function dueMs(a) {
  const d = String(a?.dueDate ?? "").trim();
  if (!d) return 0;
  const n = Date.parse(d);
  return Number.isFinite(n) ? n : 0;
}

function dueLabel(a) {
  const d = String(a?.dueDate ?? "").trim();
  if (!d) return "Due —";
  try {
    const dt = new Date(d + (d.length <= 10 ? "T12:00:00" : ""));
    if (Number.isNaN(dt.getTime())) return "Due " + esc(d);
    return "Due " + dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch {
    return "Due " + d;
  }
}

function subFor(a, subs) {
  const map = subs && typeof subs === "object" ? subs : {};
  return map[a?.id] || null;
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

function gradePct(a, sub) {
  if (sub?.status !== "graded") return null;
  const max = Number(a?.maxPoints);
  const g = Number(sub?.grade);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(g)) return null;
  return Math.round((g / max) * 100);
}

function filterItem(a, sub, q, status) {
  const title = String(a?.title ?? "").toLowerCase();
  if (q && !title.includes(q)) return false;
  const k = itemKind(a, sub);
  if (status === "all") return true;
  if (status === "todo") return k === "todo" || k === "soon";
  if (status === "submitted") return k === "submitted";
  if (status === "graded") return k === "graded";
  if (status === "overdue") return k === "overdue";
  return true;
}

function chipCounts(assigns, subs, courses) {
  const activeIds = new Set((courses || []).filter((c) => courseGroup(c) === "active").map((c) => c.id));
  let todo = 0, submitted = 0, graded = 0, overdue = 0;
  for (const a of assigns || []) {
    if (!activeIds.has(a?.courseId)) continue;
    const k = itemKind(a, subFor(a, subs));
    if (k === "graded") graded++;
    else if (k === "submitted") submitted++;
    else if (k === "overdue") overdue++;
    else todo++;
  }
  return { todo, submitted, graded, overdue };
}

function unseenFeedback(a, sub) {
  if (sub?.status !== "graded") return false;
  try {
    const seen = Number(localStorage.getItem("ghz-hw-seen-" + a.id) || 0);
    const t = sub.gradedAt?.toMillis ? sub.gradedAt.toMillis() : 0;
    return t && t > seen;
  } catch { return !!sub.feedback; }
}
function cardHtml(a, sub, readonly) {
  const k = itemKind(a, sub);
  const pct = gradePct(a, sub);
  const label = readonly || k === "submitted" || k === "graded" ? "View" : k === "todo" || k === "soon" || k === "overdue" ? "Submit" : "Open";
  const max = Number(a?.maxPoints);
  const earned = Number(sub?.grade);
  const dot = unseenFeedback(a, sub) ? `<span class="hs2-newdot" title="New feedback"></span>` : "";
  const g = (sub?.status === "graded" && Number.isFinite(max) && max > 0 && Number.isFinite(earned))
    ? `<div class="hw2-g"><p>${earned} / ${max}${dot}</p><div class="hw2-bar"><i style="width:${Math.max(0,Math.min(100,pct||0))}%"></i></div></div>` : "";
  const cal = `<svg class="hw2-cal" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  return `<article class="hw2-card">
    <div style="flex:1;min-width:0">
      <h4>${esc(a?.title || "Homework")}</h4>
      <p class="due">${cal}<span>${esc(dueLabel(a))}</span></p>
      <span class="hw2-st ${k==="soon"?"soon":k==="overdue"?"over":k==="submitted"?"sub":k==="graded"?"grad":"todo"}">${esc(kindLabel(k))}</span>
    </div>
    ${g}
    <button class="btn btn-sm" type="button" data-hw2-open="${esc(a?.id ?? "")}">${esc(label)}</button>
  </article>`;
}

function sectionHtml(c, assigns, subs, q, status) {
  const cid = c?.id ?? "";
  const list = (assigns || []).filter((a) => (a?.courseId ?? "") === cid).sort((a, b) => dueMs(a) - dueMs(b));
  const shown = list.filter((a) => filterItem(a, subFor(a, subs), q, status));
  const submittedN = list.filter((a) => !!subFor(a, subs)).length;
  const group = courseGroup(c);
  const open = state.open[cid] !== undefined ? !!state.open[cid] : group === "active";
  const readonly = group === "completed";
  const body = shown.length
    ? shown.map((a) => cardHtml(a, subFor(a, subs), readonly)).join("")
    : `<p class="hw2-none">No homework yet</p>`;
  const w = list.length ? Math.round((submittedN / list.length) * 100) : 0;
  return `<section class="hw2-sec">
    <button type="button" class="hw2-sec-h" data-hw2-tog="${esc(cid)}">
      <strong>${esc(c?.title || "Course")}</strong>
      <span class="hw2-cbadge ${group==="completed"?"done":"act"}">${group==="completed"?"Completed":"Active"}</span>
      <div class="hw2-prog"><p>${submittedN} of ${list.length} submitted</p><div class="hw2-bar"><i style="width:${w}%"></i></div></div>
    </button>
    <div class="hw2-body" ${open ? "" : "hidden"}>${body}</div>
  </section>`;
}

export function renderHomeworkV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    if (opts.loading) {
      host.innerHTML = `<div class="hw2-wrap"><div class="hw2-skel"></div><div class="hw2-skel"></div></div>`;
      return true;
    }
    const courses = Array.isArray(opts.courses) ? opts.courses : [];
    const assigns = Array.isArray(opts.assigns) ? opts.assigns : [];
    const subs = opts.subs && typeof opts.subs === "object" ? opts.subs : {};
    const q = String(state.q || "").toLowerCase();
    const status = state.status || "all";
    const tab = state.tab === "completed" ? "completed" : "active";
    const chips = chipCounts(assigns, subs, courses);
    const list = courses.filter((c) => courseGroup(c) === tab).sort((a, b) => {
      const an = (assigns || []).filter((x) => (x?.courseId ?? "") === (a?.id ?? "")).length;
      const bn = (assigns || []).filter((x) => (x?.courseId ?? "") === (b?.id ?? "")).length;
      return (bn > 0) - (an > 0);
    });
    const nAct = courses.filter((c) => courseGroup(c) === "active").length;
    const nDone = courses.filter((c) => courseGroup(c) === "completed").length;

    const emptyTab = tab === "active"
      ? `<div class="hw2-empty"><div class="ico">📡</div><p>No active courses</p></div>`
      : `<div class="hw2-empty"><div class="ico">🎓</div><p>No completed courses</p></div>`;

    host.innerHTML = `<div class="hw2-wrap">
      <div class="hw2-head">
        <div>
          <h2>Homeworks</h2>
          <p class="hw2-sub">Your assignments, grouped by course</p>
        </div>
      </div>
      <div class="hw2-sum">
        <div class="hw2-stat todo"><span class="ico">☐</span><div><div class="n">${chips.todo}</div><div class="l">To do</div></div></div>
        <div class="hw2-stat sub"><span class="ico">↑</span><div><div class="n">${chips.submitted}</div><div class="l">Submitted</div></div></div>
        <div class="hw2-stat grad"><span class="ico">✓</span><div><div class="n">${chips.graded}</div><div class="l">Graded</div></div></div>
        <div class="hw2-stat over"><span class="ico">!</span><div><div class="n">${chips.overdue}</div><div class="l">Overdue</div></div></div>
      </div>
      <div class="hw2-tabs">
        <button type="button" class="${tab==="active"?"on":""}" data-hw2-tab="active">Active courses (${nAct})</button>
        <button type="button" class="${tab==="completed"?"on":""}" data-hw2-tab="completed">Completed courses (${nDone})</button>
      </div>
      <div class="hw2-filters">
        <input type="search" data-hw2-q placeholder="Search by title" value="${esc(state.q)}" />
        <label class="hw2-stlab">Status:
          <select data-hw2-st>
            <option value="all"${status==="all"?" selected":""}>All</option>
            <option value="todo"${status==="todo"?" selected":""}>To do</option>
            <option value="submitted"${status==="submitted"?" selected":""}>Submitted</option>
            <option value="graded"${status==="graded"?" selected":""}>Graded</option>
            <option value="overdue"${status==="overdue"?" selected":""}>Overdue</option>
          </select>
        </label>
      </div>
      <div data-hw2-list>${list.length ? list.map((c) => sectionHtml(c, assigns, subs, q, status)).join("") : emptyTab}</div>
    </div>`;

    host.onclick = (e) => {
      const t = e.target?.closest?.("[data-hw2-tab],[data-hw2-tog],[data-hw2-open]");
      if (!t) return;
      if (t.hasAttribute("data-hw2-tab")) {
        state.tab = t.getAttribute("data-hw2-tab") === "completed" ? "completed" : "active";
        renderHomeworkV2(opts);
        return;
      }
      if (t.hasAttribute("data-hw2-tog")) {
        const id = t.getAttribute("data-hw2-tog");
        const cur = state.open[id] !== undefined ? !!state.open[id] : courseGroup(courses.find((c) => c.id === id)) === "active";
        state.open[id] = !cur;
        renderHomeworkV2(opts);
        return;
      }
      const id = t.getAttribute("data-hw2-open");
      if (id) opts.onOpen?.(id);
    };
    host.oninput = (e) => {
      const qel = e.target?.closest?.("[data-hw2-q]");
      if (!qel) return;
      state.q = qel.value || "";
      const listEl = e.target?.closest?.(".hw2-wrap")?.lastElementChild;
      if (listEl && listEl.hasAttribute("data-hw2-list")) {
        const qq = String(state.q || "").toLowerCase();
        const st = state.status || "all";
        const tabNow = state.tab === "completed" ? "completed" : "active";
        const rows = courses.filter((c) => courseGroup(c) === tabNow).sort((a, b) => {
          const an = (assigns || []).filter((x) => (x?.courseId ?? "") === (a?.id ?? "")).length;
          const bn = (assigns || []).filter((x) => (x?.courseId ?? "") === (b?.id ?? "")).length;
          return (bn > 0) - (an > 0);
        });
        const emptyNow = tabNow === "active"
          ? `<div class="hw2-empty"><div class="ico">📡</div><p>No active courses</p></div>`
          : `<div class="hw2-empty"><div class="ico">🎓</div><p>No completed courses</p></div>`;
        listEl.innerHTML = rows.length ? rows.map((c) => sectionHtml(c, assigns, subs, qq, st)).join("") : emptyNow;
      }
    };
    host.onchange = (e) => {
      const qel = e.target?.closest?.("[data-hw2-q]");
      const sel = e.target?.closest?.("[data-hw2-st]");
      if (qel) state.q = qel.value || "";
      if (sel) state.status = sel.value || "all";
      if (qel || sel) renderHomeworkV2(opts);
    };
    opts.onReady?.();
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    host.innerHTML = `<div class="hw2-fail"><p>Could not load homework (${esc(code)})</p><button class="btn btn-sm" type="button" data-classic>Use classic view</button></div>`;
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-classic]")) opts.onClassic?.(); };
    return false;
  }
}
