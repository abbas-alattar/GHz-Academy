const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function clock(sec) {
  if (sec == null) return "—";
  const s = Math.max(0, Number(sec) || 0);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function ringSvg(left, total) {
  const t = total > 0 ? total : 1;
  const frac = Math.max(0, Math.min(1, left == null ? 1 : left / t));
  const c = 2 * Math.PI * 26;
  const dash = c * frac;
  const cls = left == null ? "" : left <= 60 ? "red" : left <= 300 ? "amber" : "";
  return `<svg class="qt2-ring ${cls}" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="26" fill="none" stroke="#e2e8f0" stroke-width="6"/>
    <circle class="fg" cx="32" cy="32" r="26" fill="none" stroke="#2563eb" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${dash} ${c}" transform="rotate(-90 32 32)"/>
    <text x="32" y="36" text-anchor="middle" font-size="11" font-weight="700" fill="#0f2744">${esc(clock(left))}</text>
  </svg>`;
}

export function renderQuizStartV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    const q = opts.quiz || {};
    const n = Number(opts.questionCount);
    const lim = Number(q.timeLimitMinutes);
    host.innerHTML = `<article class="qt2-start">
      <div class="qt2-hero">
        <h2>${esc(q.title || "Quiz")}</h2>
        <span class="qt2-chip">${esc(q.courseTitle || opts.courseName || "Course")}</span>
        <p>${esc(q.instructions || q.description || "")}</p>
      </div>
      <div class="qt2-pad">
        <div class="qt2-tiles">
          <div class="qt2-tile"><strong>${Number.isFinite(lim) && lim > 0 ? lim + " min" : "None"}</strong><span>Time limit</span></div>
          <div class="qt2-tile"><strong>${Number.isFinite(n) ? n : "—"}</strong><span>Questions</span></div>
          <div class="qt2-tile"><strong>${esc(q.dueDate || "—")}</strong><span>Due date</span></div>
        </div>
        <ul class="qt2-rules">
          <li>The timer starts when you press Begin</li>
          <li>You cannot pause the quiz</li>
          <li>Answers are submitted automatically when time ends</li>
        </ul>
        <div class="qt2-acts">
          <button class="btn btn-ghost" type="button" data-qt2-back>Back</button>
          <button class="btn" type="button" data-qt2-begin>Begin quiz</button>
        </div>
      </div>
    </article>`;
    host.onclick = (e) => {
      const t = e.target?.closest?.("[data-qt2-back],[data-qt2-begin]");
      if (!t) return;
      if (t.hasAttribute("data-qt2-back")) opts.onBack?.();
      else opts.onBegin?.();
    };
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    host.innerHTML = `<div class="qt2-fail"><p>Could not open start screen (${esc(code)})</p><button class="btn btn-sm" type="button" data-classic>Use classic view</button></div>`;
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-classic]")) opts.onClassic?.(); };
    return false;
  }
}

export function updateQuizTakeClock(host, left, total) {
  try {
    const sticky = host?.firstElementChild?.firstElementChild;
    const svg = sticky?.lastElementChild;
    if (!svg || svg.tagName !== "svg") return;
    const wrap = document.createElement("div");
    wrap.innerHTML = ringSvg(left, total);
    const next = wrap.firstElementChild;
    if (next) svg.replaceWith(next);
  } catch {}
}

export function renderQuizTakeV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    const q = opts.quiz || {};
    const qs = Array.isArray(opts.questions) ? opts.questions : [];
    const answers = opts.answers && typeof opts.answers === "object" ? opts.answers : {};
    const n = qs.filter((x) => answers[x.id] != null && answers[x.id] !== "").length;
    const total = Number(opts.totalSec);
    const left = opts.left;
    const overlay = opts.timesUp ? `<div class="qt2-over">Time's up, submitting your answers…</div>` : "";
    const dlg = opts.confirm ? `<div class="qt2-dlg"><div class="box">
      <p>You have ${esc(opts.missing)} unanswered question. Submit anyway?</p>
      <p style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button class="btn btn-ghost" type="button" data-qt2-review>Review</button>
        <button class="btn" type="button" data-qt2-force>Submit</button>
      </p>
    </div></div>` : "";

    host.innerHTML = `<div class="qt2-take">
      <div class="qt2-sticky">
        <h3>${esc(q.title || "Quiz")}</h3>
        ${ringSvg(left, total)}
      </div>
      <div class="qt2-pbar"><i style="width:${qs.length ? Math.round(n / qs.length * 100) : 0}%"></i></div>
      <p style="margin:6px 16px;font-size:.85rem;color:#64748b">${n} of ${qs.length} answered</p>
      <div class="qt2-nav">${qs.map((qq, i) => {
        const on = answers[qq.id] != null && answers[qq.id] !== "";
        return `<button type="button" class="${on?"on":""}" data-qt2-jump="${i}">${i+1}</button>`;
      }).join("")}</div>
      ${qs.map((qq, i) => {
        if (qq.type === "mcq") {
          return `<article class="qt2-q" data-qt2-q="${i}">
            <span class="qt2-badge">Q${i+1}</span>
            <p>${esc(qq.text || "")}</p>
            ${(qq.options || []).map((o, oi) => {
              const sel = String(answers[qq.id]) === String(oi);
              return `<button type="button" class="qt2-opt${sel?" sel":""}" data-qt2-ans="${esc(qq.id)}" data-oi="${oi}">
                <span class="qt2-let">${letters[oi]||oi}</span><span>${esc(o)}</span>${sel?`<span class="qt2-chk">✓</span>`:""}
              </button>`;
            }).join("")}
          </article>`;
        }
        return `<article class="qt2-q" data-qt2-q="${i}">
          <span class="qt2-badge">Q${i+1}</span>
          <p>${esc(qq.text || "")}</p>
          <textarea data-qt2-sa="${esc(qq.id)}" style="width:100%;min-height:80px;padding:12px;border:1px solid var(--line);border-radius:10px;font:inherit">${esc(answers[qq.id] || "")}</textarea>
        </article>`;
      }).join("")}
      <p class="banner" data-qt2-err ${opts.err ? "" : "hidden"}>${esc(opts.err || "")}</p>
      <div class="qt2-bot">
        <span>${n} of ${qs.length} answered</span>
        <button class="btn" type="button" data-qt2-sub>Submit quiz</button>
      </div>
      ${overlay}${dlg}
    </div>`;
    host.onclick = (e) => {
      const jump = e.target?.closest?.("[data-qt2-jump]");
      if (jump) {
        const idx = Number(jump.getAttribute("data-qt2-jump"));
        opts.onJump?.(idx);
        return;
      }
      const opt = e.target?.closest?.("[data-qt2-ans]");
      if (opt) {
        opts.onAnswer?.(opt.getAttribute("data-qt2-ans"), Number(opt.getAttribute("data-oi")));
        return;
      }
      if (e.target?.closest?.("[data-qt2-sub]")) { opts.onSubmit?.(false); return; }
      if (e.target?.closest?.("[data-qt2-review]")) { opts.onReview?.(); return; }
      if (e.target?.closest?.("[data-qt2-force]")) { opts.onForce?.(); return; }
    };
    host.oninput = (e) => {
      const ta = e.target?.closest?.("[data-qt2-sa]");
      if (ta) opts.onText?.(ta.getAttribute("data-qt2-sa"), ta.value);
    };
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    host.innerHTML = `<div class="qt2-fail"><p>Could not open quiz (${esc(code)})</p><button class="btn btn-sm" type="button" data-classic>Use classic view</button></div>`;
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-classic]")) opts.onClassic?.(); };
    return false;
  }
}

export function renderQuizDoneV2(opts) {
  const host = opts?.host;
  if (!host) return false;
  try {
    const sc = opts.score;
    const ring = sc && Number.isFinite(sc.pct)
      ? `<p style="font-size:2rem;font-weight:700">${esc(sc.pct)}%</p><p>${esc(sc.e)} / ${esc(sc.m)}</p>`
      : `<p>Your trainer will grade this soon</p>`;
    host.innerHTML = `<div class="qt2-done">
      <div class="qt2-ok">✓</div>
      <h2>Quiz submitted</h2>
      ${ring}
      <p style="margin-top:18px"><button class="btn" type="button" data-qt2-home>Back to quizzes</button></p>
    </div>`;
    host.onclick = (e) => { if (e.target?.closest?.("[data-qt2-home]")) opts.onBack?.(); };
    return true;
  } catch (e) {
    const code = (e?.code || "error") + ": " + (e?.message || e);
    host.innerHTML = `<div class="qt2-fail"><p>${esc(code)}</p><button class="btn" type="button" data-classic>Use classic view</button></div>`;
    host.onclick = (ev) => { if (ev.target?.closest?.("[data-classic]")) opts.onClassic?.(); };
    return false;
  }
}
