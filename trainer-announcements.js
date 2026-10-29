import { protect } from "./auth-guard.js?v=auth8";
import { renderTrainerAnnouncementsV2 } from "./TrainerAnnouncementsV2.js";
import { bootNotify } from "./portal-notify.js";
import { loadAnnouncementReads } from "./announcementReads.js";

const root = document.getElementById("annRoot");
try {
  const { user } = await protect("trainer");
  bootNotify({ role: "trainer", uid: user?.uid });
  loadAnnouncementReads(user?.uid).catch((e) => console.error("announcementReads", e?.code || e?.message || e));
  renderTrainerAnnouncementsV2(root, { onClassic: () => {} });
} catch (e) {
  if (root) root.innerHTML = `<p class="banner">This page could not load<br>${(e && (e.code || e.message)) || e}</p><button class="btn btn-sm" type="button" id="annRetry">Try again</button>`;
  document.getElementById("annRetry")?.addEventListener("click", () => location.reload());
}
