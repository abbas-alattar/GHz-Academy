import { db } from "./firebase-config.js?v=auth8";
import { collection, deleteDoc, doc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export async function deleteCourseIfEmpty(id, toast, reload) {
  try {
    const [regs, ens] = await Promise.all([
      getDocs(query(collection(db, "registrations"), where("courseId", "==", id))),
      getDocs(query(collection(db, "enrollments"), where("courseId", "==", id)))
    ]);
    if (!regs.empty || !ens.empty) {
      toast("This course has registrations. Archive it instead.", "err");
      return;
    }
    if (!confirm("Delete this course? This cannot be undone.")) return;
    await deleteDoc(doc(db, "courses", id));
    toast("Course deleted");
    if (reload) await reload();
  } catch (e) {
    toast("Could not delete.", "err");
  }
}
