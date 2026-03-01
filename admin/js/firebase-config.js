// ============================================================
// HEISENBYTE QUIZ — Firebase Configuration
// Replace the values below with your actual Firebase project config
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyC1QGATtd7i5_g_bvqOZeFq1VjzikjcS1E",
  authDomain: "quiz-project-3a083.firebaseapp.com",
  databaseURL: "https://quiz-project-3a083-default-rtdb.firebaseio.com",
  projectId: "quiz-project-3a083",
  storageBucket: "quiz-project-3a083.firebasestorage.app",
  messagingSenderId: "326199412801",
  appId: "1:326199412801:web:f61ac6362c32d499629ec0",
  measurementId: "G-JPK1C1YY1J"
};


// ---- Initialize Firebase ----
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}


const db = firebase.firestore();
const rtdb = firebase.database();   // Realtime DB (for presence/online count)
const auth = firebase.auth();

// ---- Firestore Collection References ----
const quizStateRef = db.collection("quiz").doc("metadata");
const questionsRef = db.collection("questions");
const teamsRef = db.collection("teams");
const responsesRef = db.collection("responses");

// ---- Realtime DB Refs ----
const presenceRef = rtdb.ref("presence");
const connectedRef = rtdb.ref(".info/connected");

// ---- Exports (global) ----
window.HB = {
  db,
  rtdb,
  auth,
  quizStateRef,
  questionsRef,
  teamsRef,
  responsesRef,
  presenceRef,
  connectedRef
};
