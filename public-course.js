export const PUBLIC_COURSE_STATUSES = ["Open", "Coming soon", "Closed"];

export function isPublicCourse(status) {
  return PUBLIC_COURSE_STATUSES.includes(status);
}

export function unavailableHtml() {
  return `<p>This course is not available</p><p><a href="./index.html">Back to the landing page</a></p>`;
}
