import { db, auth } from "./firebase-config.js?v=auth8";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const SOURCES = [
  { id: "manual", label: "Manual (trainer enters)" },
  { id: "attendance", label: "Attendance (auto)" },
  { id: "homework", label: "Homework (auto)" },
  { id: "quiz", label: "Quiz (auto)" }
];
const normSource = (s) => (s === "attendance" || s === "homework" || s === "quiz" ? s : "manual");
const defaults = () => [
  { id: "c1", title: "Attendance", weight: 10, source: "attendance" },
  { id: "c2", title: "Homeworks", weight: 20, source: "homework" },
  { id: "c3", title: "Quizzes", weight: 15, source: "quiz" },
  { id: "c4", title: "Midterm Exam", weight: 20, source: "manual" },
  { id: "c5", title: "Final", weight: 25, source: "manual" },
  { id: "c6", title: "Project", weight: 10, source: "manual" }
];
const hues = ["#0e3a5d","#2563eb","#2EC8FF","#0f766e","#7c3aed","#d97706"];
const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

function nextId(rows) {
  let n = 1;
  const used = new Set(rows.map((r) => r.id));
  while (used.has("c" + n)) n += 1;
  return "c" + n;
}

export function openGradeDistribution(course, toast) {
  const modal = document.getElementById("modal");
  if (!course?.id) return;
  modal.classList.remove("hidden");
  modal.innerHTML = `<div class="sheet" style="width:min(1100px,100%)"><h2>Grade Distribution</h2><div id="gdBody"><p>Loading the scheme…</p></div></div>`;
  const body = modal.querySelector("#gdBody");
  const fail = (step, e) => {
    const code = (e && (e.code || e.message)) || e;
    body.innerHTML = `<p class="banner">This section could not load<br>${step}: ${code}</p><button class="btn btn-ghost" type="button" id="gdClose">Close</button>`;
    body.querySelector("#gdClose").onclick = () => modal.classList.add("hidden");
  };
  (async () => {
    let passMark = 60;
    let components = defaults();
    try {
      const snap = await getDoc(doc(db, "gradeSchemes", course.id));
      if (snap.exists()) {
        const d = snap.data();
        passMark = Number(d.passMark);
        if (!Number.isFinite(passMark)) passMark = 60;
        if (Array.isArray(d.components) && d.components.length) {
          components = d.components.map((c, i) => ({
            id: c.id || ("c" + (i + 1)),
            title: c.title || "",
            weight: Number(c.weight) || 0,
            source: normSource(c.source)
          }));
        }
      }
    } catch (e) { fail("gradeSchemes", e); return; }

    const paint = () => {
      const total = components.reduce((n, c) => n + Number(c.weight || 0), 0);
      const titlesOk = components.every((c) => String(c.title || "").trim());
      const ok = total === 100 && titlesOk && components.length > 0;
      const remain = 100 - total;
      body.innerHTML = `
        <p style="color:var(--muted);margin:-4px 0 16px">${esc(course.title || "")}</p>
        <div style="display:grid;grid-template-columns:1fr auto;gap:16px;align-items:end;margin-bottom:14px">
          <div><label>Pass mark (out of 100)</label><input id="gdPass" type="number" min="0" max="100" value="${passMark}" /></div>
          <div id="gdTotal" style="text-align:right;font-weight:700;font-size:1.2rem;color:${total===100?"#166534":"#b91c1c"}">Total ${total} / 100</div>
        </div>
        <div id="gdStack" style="display:flex;height:16px;border-radius:999px;overflow:hidden;background:#e2e8f0;margin-bottom:10px">
          ${components.map((c,i)=>`<div title="${esc(c.title)} ${c.weight}%" style="flex:0 0 ${Math.max(0,Number(c.weight)||0)}%;background:${hues[i%hues.length]}"></div>`).join("")}
        </div>
        <div id="gdLegend" style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-bottom:16px;font-size:.82rem">
          ${components.map((c,i)=>`<span style="display:flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:3px;background:${hues[i%hues.length]};display:inline-block"></i>${esc(c.title||"Untitled")} · ${c.weight}%</span>`).join("")}
        </div>
        <div class="table-wrap"><table class="data"><thead><tr>
          <th style="width:48px">#</th>
          <th>Section</th>
          <th style="width:210px">Source</th>
          <th style="width:100px">Weight %</th>
          <th style="width:140px">Share</th>
          <th style="width:220px">Order</th>
        </tr></thead><tbody>
        ${components.map((c,i)=>`<tr class="gd-row" data-i="${i}">
          <td style="color:var(--muted);font-weight:600;vertical-align:middle">${i+1}</td>
          <td style="vertical-align:middle"><input data-title placeholder="Section title" value="${esc(c.title)}" />${c.source!=="manual"?` <span class="badge badge-open">Auto</span>`:""}</td>
          <td style="vertical-align:middle"><select data-src>${SOURCES.map((s)=>`<option value="${s.id}" ${normSource(c.source)===s.id?"selected":""}>${s.label}</option>`).join("")}</select></td>
          <td style="vertical-align:middle"><input data-w type="number" min="0" max="100" value="${c.weight}" /></td>
          <td style="vertical-align:middle">
            <div style="display:flex;align-items:center;gap:8px;min-width:0">
              <div style="flex:1;height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden"><div data-bar style="height:100%;width:${Math.min(100,Number(c.weight)||0)}%;background:${hues[i%hues.length]}"></div></div>
              <span data-pct style="flex:0 0 42px;font-size:.8rem;color:var(--muted)">${c.weight}%</span>
            </div>
          </td>
          <td style="vertical-align:middle;white-space:nowrap">
            <button class="btn btn-sm btn-ghost" type="button" data-up>Up</button>
            <button class="btn btn-sm btn-ghost" type="button" data-dn>Down</button>
            <button class="btn btn-sm btn-warn" type="button" data-rm>Remove</button>
          </td>
        </tr>`).join("")}
        <tr><td></td><td style="color:var(--muted)">Remaining</td><td></td><td colspan="3" id="gdRemain" style="font-weight:700;color:${remain===0?"#166534":"#b91c1c"}">${remain}%</td></tr>
        </tbody></table></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center">
          <button class="btn btn-sm btn-ghost" type="button" id="gdAdd" style="width:auto;margin:0">Add section</button>
          <button class="btn" type="button" id="gdSave" style="width:auto;margin:0" ${ok?"":"disabled"}>Save</button>
          <button class="btn btn-ghost" type="button" id="gdClose" style="width:auto;margin:0">Close</button>
        </div>
        <p id="gdErr" class="err"></p>`;
      const sync = () => {
        body.querySelectorAll("tr.gd-row").forEach((el) => {
          const i = +el.dataset.i;
          components[i].title = el.querySelector("[data-title]").value;
          components[i].weight = Number(el.querySelector("[data-w]").value) || 0;
          components[i].source = normSource(el.querySelector("[data-src]")?.value);
          const w = components[i].weight;
          const bar = el.querySelector("[data-bar]");
          const pct = el.querySelector("[data-pct]");
          if (bar) bar.style.width = Math.min(100, w) + "%";
          if (pct) pct.textContent = w + "%";
        });
        passMark = Number(body.querySelector("#gdPass").value);
        const totalNow = components.reduce((n, c) => n + Number(c.weight || 0), 0);
        const titlesOkNow = components.every((c) => String(c.title || "").trim());
        const tot = body.querySelector("#gdTotal");
        tot.textContent = "Total " + totalNow + " / 100";
        tot.style.color = totalNow === 100 ? "#166534" : "#b91c1c";
        const rem = body.querySelector("#gdRemain");
        if (rem) { rem.textContent = (100 - totalNow) + "%"; rem.style.color = totalNow === 100 ? "#166534" : "#b91c1c"; }
        const autoDup = ["attendance","homework","quiz"].some((src) => components.filter((c) => c.source === src).length > 1);
        body.querySelector("#gdSave").disabled = !(totalNow === 100 && titlesOkNow && components.length > 0 && !autoDup);
        const err = body.querySelector("#gdErr");
        if (err) {
          if (autoDup) { err.style.display = "block"; err.textContent = "Only one section can use each auto source."; }
          else if (!err.textContent.startsWith("save:")) { err.style.display = "none"; err.textContent = ""; }
        }
        const stack = body.querySelector("#gdStack");
        if (stack) stack.innerHTML = components.map((c,i)=>`<div title="${esc(c.title)} ${c.weight}%" style="flex:0 0 ${Math.max(0,Number(c.weight)||0)}%;background:${hues[i%hues.length]}"></div>`).join("");
        const legend = body.querySelector("#gdLegend");
        if (legend) legend.innerHTML = components.map((c,i)=>`<span style="display:flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:3px;background:${hues[i%hues.length]};display:inline-block"></i>${esc(c.title||"Untitled")} · ${c.weight}%</span>`).join("");
      };
      body.querySelector("#gdPass").oninput = sync;
      body.querySelectorAll("[data-title]").forEach((inp) => inp.oninput = sync);
      body.querySelectorAll("[data-w]").forEach((inp) => inp.oninput = sync);
      body.querySelectorAll("[data-src]").forEach((sel) => sel.onchange = () => {
        const i = +sel.closest("tr.gd-row").dataset.i;
        const next = normSource(sel.value);
        if (next !== "manual" && components.some((c, j) => j !== i && c.source === next)) {
          sel.value = components[i].source || "manual";
          const err = body.querySelector("#gdErr");
          err.style.display = "block";
          err.textContent = "Only one section can use each auto source.";
          return;
        }
        components[i].source = next;
        paint();
      });
      body.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { components.splice(+b.closest("tr.gd-row").dataset.i, 1); paint(); });
      body.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => {
        const i = +b.closest("tr.gd-row").dataset.i;
        if (i) { [components[i-1], components[i]] = [components[i], components[i-1]]; paint(); }
      });
      body.querySelectorAll("[data-dn]").forEach((b) => b.onclick = () => {
        const i = +b.closest("tr.gd-row").dataset.i;
        if (i < components.length - 1) { [components[i+1], components[i]] = [components[i], components[i+1]]; paint(); }
      });
      body.querySelector("#gdAdd").onclick = () => { components.push({ id: nextId(components), title: "", weight: 0, source: "manual" }); paint(); };
      body.querySelector("#gdClose").onclick = () => modal.classList.add("hidden");
      body.querySelector("#gdSave").onclick = async () => {
        const totalNow = components.reduce((n, c) => n + Number(c.weight || 0), 0);
        if (totalNow !== 100 || components.some((c) => !String(c.title||"").trim())) return;
        const btn = body.querySelector("#gdSave");
        btn.disabled = true;
        try {
          await setDoc(doc(db, "gradeSchemes", course.id), {
            courseId: course.id,
            passMark: Number(body.querySelector("#gdPass").value) || 60,
            components: components.map((c) => ({ id: c.id, title: String(c.title).trim(), weight: Number(c.weight) || 0, source: normSource(c.source) })),
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid || ""
          });
          if (toast) toast("Grade distribution saved.");
          modal.classList.add("hidden");
        } catch (e) {
          const err = body.querySelector("#gdErr");
          err.style.display = "block";
          err.textContent = "save: " + ((e && (e.code || e.message)) || e);
          btn.disabled = false;
        }
      };
    };
    try { paint(); } catch (e) { fail("render", e); }
  })();
}
