import { db } from "./firebase-config.js?v=auth8";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { courseCardHtml } from "./CourseCard.js";

const PUBLIC = ["Open", "Coming soon", "Closed"];
const ORDER = { Open: 0, "Coming soon": 1, Closed: 2 };

function applyFilter(f) {
  document.querySelectorAll("#courseGrid .cc1-card[data-status]").forEach((el) => {
    el.classList.toggle("hide", f !== "all" && el.dataset.status !== f);
  });
}

try {
  const grid = document.getElementById("courseGrid");
  const filters = document.getElementById("filters");
  const sub = document.getElementById("coursesSub");
  const openLabel = document.getElementById("openRegLabel");
  if (grid) {
    grid.classList.add("cc1-grid");
    grid.innerHTML = Array.from({ length: 3 }, () => `<article class="cc1-card"><div class="cc1-cover"></div><div class="cc1-body"></div></article>`).join("");
  }

  const snap = await getDocs(query(collection(db, "courses"), where("status", "in", PUBLIC)));
  const list = snap.docs.map((d) => {
    const data = d.data() || {};
    return { id: d.id, ...data, coverImage: data.coverImage || data.cover || "" };
  })
    .filter((c) => PUBLIC.includes(c.status))
    .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || String(a.title || "").localeCompare(String(b.title || "")));

  const openCount = list.filter((c) => c.status === "Open").length;
  if (openLabel) openLabel.hidden = openCount < 1;
  if (sub) {
    if (openCount < 1) sub.textContent = "Build your knowledge from wireless fundamentals to advanced telecom engineering applications.";
    else sub.textContent = openCount === 1
      ? "Build your knowledge from wireless fundamentals to advanced telecom engineering applications. One course is open for registration."
      : `Build your knowledge from wireless fundamentals to advanced telecom engineering applications. ${openCount} courses are open for registration.`;
  }

  if (grid) {
    if (!list.length) grid.innerHTML = `<p class="empty-courses">New courses are coming soon.</p>`;
    else grid.innerHTML = list.map((c) => courseCardHtml(c, { viewMode: "link" })).join("");
  }

  if (filters) {
    filters.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        filters.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        applyFilter(b.dataset.f);
      };
    });
  }
} catch (err) {
  console.error(err);
  const grid = document.getElementById("courseGrid");
  if (grid) grid.innerHTML = `<p class="empty-courses">Courses are temporarily unavailable</p>`;
}
