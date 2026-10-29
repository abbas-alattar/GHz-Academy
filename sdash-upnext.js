import { bound } from "./student-dash-data.js?v=stu7";

function startMs(s) {
  return new Date(`${s.date || ""}T${s.startTime || "00:00"}`).getTime();
}
function fmtRemain(ms) {
  if (ms <= 0) return "Starting now";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2,"0")}m ${String(sec).padStart(2,"0")}s`;
}

export function mountUpNext(el) {
  let timer;
  bound(el, (root, data) => {
    if (timer) clearInterval(timer);
    if (data.errors.sessions && !data.sessions.length) {
      root.innerHTML = `<div class="sdash-card"><h3>Up next</h3><p class="sdash-fail">This section could not load<br>sessions: ${data.errors.sessions.code || Object.values(data.errors)[0]?.code}</p></div>`;
      return;
    }
    const now = Date.now();
    const next = data.sessions.filter((s) => s.status !== "Cancelled" && startMs(s) > now - 3600000)
      .sort((a,b) => startMs(a) - startMs(b))
      .find((s) => startMs(s) >= now - 15 * 60000) || data.sessions.filter((s)=>s.status!=="Cancelled" && startMs(s)>=now).sort((a,b)=>startMs(a)-startMs(b))[0];
    if (!next) {
      root.innerHTML = `<div class="sdash-card"><h3>Up next</h3><p>No upcoming sessions</p></div>`;
      return;
    }
    root.innerHTML = `<div class="sdash-card"><h3>Up next</h3>
      <strong>${next.title || "Session"}</strong>
      <p style="color:var(--muted);margin:6px 0">${next.date || ""} · ${next.startTime || ""}${next.endTime ? "–" + next.endTime : ""}</p>
      <p id="sdashCount" style="font-weight:700;color:var(--navy)"></p>
      <button class="btn btn-sm sdash-join" type="button" id="sdashJoin" ${next.meetingLink ? "" : "disabled"}>Join</button>
    </div>`;
    const count = root.querySelector("#sdashCount");
    const join = root.querySelector("#sdashJoin");
    const tick = () => {
      const t = startMs(next);
      const left = t - Date.now();
      count.textContent = fmtRemain(left);
      const enable = next.meetingLink && left <= 15 * 60000;
      join.disabled = !enable;
    };
    tick();
    timer = setInterval(tick, 1000);
    join.onclick = () => { if (next.meetingLink) window.open(next.meetingLink, "_blank", "noopener"); };
  });
}
