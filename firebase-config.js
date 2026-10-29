import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  initializeAuth, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBBhCl5Y6JO1EzJYVIdnYh4ZIzxPw7mpCY",
  authDomain: "ghz-academy.firebaseapp.com",
  projectId: "ghz-academy",
  storageBucket: "ghz-academy.firebasestorage.app",
  messagingSenderId: "236794829579",
  appId: "1:236794829579:web:3b4d38c51ff80736eb200e"
};

export const app = initializeApp(firebaseConfig);
let authInst;
try {
  authInst = initializeAuth(app, {
    persistence: [browserLocalPersistence]
  });
} catch (_) {
  authInst = initializeAuth(app, {
    persistence: [browserLocalPersistence]
  });
}
export const auth = authInst;
export const db = getFirestore(app);

export const roleHome = { student: "./student.html", trainer: "./trainer.html", admin: "./admin.html" };
