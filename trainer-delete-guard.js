import { collection, query, where, getDocs, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { db } from "./firebase-config.js?v=auth8";

export async function homeworkHasSubs(courseId, assignmentId) {
  const snap = await getDocs(query(collection(db, "submissions"), where("courseId", "==", courseId)));
  return snap.docs.some((d) => d.data().assignmentId === assignmentId);
}

export async function quizHasAttempts(courseId, quizId) {
  const snap = await getDocs(query(collection(db, "quizAttempts"), where("courseId", "==", courseId)));
  return snap.docs.some((d) => d.data().quizId === quizId);
}

export function blockedMsg(kind) {
  return kind === "quiz"
    ? "This quiz has student attempts. Unpublish it instead."
    : "This homework has student submissions. Unpublish it instead.";
}

export async function unpublishHomework(id) {
  await updateDoc(doc(db, "assignments", id), { status: "Draft" });
}

export async function unpublishQuiz(id) {
  await updateDoc(doc(db, "quizzes", id), { status: "Draft" });
}

export async function deleteQuizCascade(courseId, quizId) {
  const qq = await getDocs(query(collection(db, "quizQuestions"), where("courseId", "==", courseId), where("quizId", "==", quizId)));
  for (const d of qq.docs) await deleteDoc(d.ref);
  try { await deleteDoc(doc(db, "quizKeys", quizId)); } catch (_) {}
  await deleteDoc(doc(db, "quizzes", quizId));
}

export async function deleteHomework(id) {
  await deleteDoc(doc(db, "assignments", id));
}

export function showUnpublishPrompt(host, message, onUnpublish) {
  const wrap = document.createElement("div");
  wrap.className = "banner";
  wrap.innerHTML = `<p>${message}</p><button class="btn btn-sm" type="button">Unpublish</button>`;
  wrap.querySelector("button").onclick = onUnpublish;
  host.prepend(wrap);
}
