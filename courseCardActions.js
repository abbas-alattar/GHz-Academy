import { canRegisterForCourse } from "./courseStatusLabel.js?v=r2";

const esc = (s) => String(s ?? "").replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/"/g,"&"+"quot;");

export function courseRelation(c, regsByCourse) {
  const map = regsByCourse && typeof regsByCourse === "object" ? regsByCourse : {};
  return map[c?.id] || null;
}

export function courseSlug(c) {
  const raw = String(c?.slug || c?.title || "").trim();
  const slug = raw.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || String(c?.id || "");
}

function loginHref(c) {
  return "./login.html?tab=signup&course=" + encodeURIComponent(c?.id || "") + "&next=register";
}

function closedState() {
  return { kind: "closed", label: "Registration closed", disabled: true };
}

function isClosedCourse(c) {
  const st = String(c?.status || "");
  return !canRegisterForCourse(c) || st === "Closed" || st === "Completed" || st === "Archived";
}

function registerGuest(c) {
  return { kind: "guest", label: "Register", href: loginHref(c) };
}
function registerStudent(c) {
  return { kind: "register", label: "Register", href: "./student.html#register/" + encodeURIComponent(c?.id || "") };
}
function registeredState() {
  return { kind: "enrolled", label: "Registered", disabled: true, enrolled: true };
}

/** Shared CTA for public cards AND the details window. */
export function getCourseAction(course, ctx = {}) {
  const forDetails = ctx.forDetails === true;
  const authReady = ctx.authReady === true || ctx.authKnown === true;
  const user = ctx.user === undefined ? (ctx.uid ? { uid: ctx.uid } : null) : ctx.user;
  const role = String(ctx.role || (user ? "student" : "guest")).toLowerCase();
  const regsReady = ctx.regsReady === true;
  const checkingTimedOut = ctx.checkingTimedOut === true;

  if (isClosedCourse(course)) return closedState();

  if (!authReady) {
    if (forDetails) return registerGuest(course);
    return registerGuest(course);
  }

  if (!user || role === "guest") return registerGuest(course);
  if (role === "admin") return { kind: "staff", label: "Open dashboard", href: "./admin.html" };
  if (role === "trainer") return { kind: "staff", label: "Open dashboard", href: "./trainer.html" };

  const rst = String(courseRelation(course, ctx.regsByCourse)?.status || "");
  if (rst === "enrolled" || rst === "confirmed") return registeredState();
  if (rst === "pending_payment" || rst === "payment_submitted") {
    return { kind: "pending", label: "View registration", href: "./student.html#registrations" };
  }
  if (forDetails && user && !regsReady && !checkingTimedOut) {
    return { kind: "checking", label: "Checking…", disabled: true, checking: true };
  }
  return registerStudent(course);
}

export function courseUserState(c, ctx = {}) {
  return getCourseAction(c, ctx);
}

function priHtml(st) {
  if (st.disabled) return `<button class="btn btn-sm" disabled>${esc(st.label)}</button>`;
  return `<a class="btn btn-sm v2-pri" href="${esc(st.href)}">${esc(st.label)}</a>`;
}

export function publicCardActions(c, ctx = {}) {
  const slug = courseSlug(c);
  const view = `<a class="v2-details" href="./courses.html?course=${encodeURIComponent(slug)}" data-view="${esc(c.id)}">View course</a>`;
  const st = getCourseAction(c, { ...ctx, forDetails: false });
  const chip = st.enrolled ? `<span class="v2-enrolled">Enrolled</span>` : (st.kind === "pending" ? `<span class="v2-enrolled" style="background:#FEF3C7;color:#92400E">Pending</span>` : (String(c?.status) === "Completed" ? `<span class="v2-enrolled" style="background:#E5E7EB;color:#374151">Completed</span>` : ""));
  return `${chip}${view}${priHtml(st)}`;
}

export function moneyLabel(c) {
  const n = Number(c?.price);
  if (!Number.isFinite(n) || n <= 0) return "Price on request";
  return n + " " + (c?.currency || "USD");
}

export { esc };
