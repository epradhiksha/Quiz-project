// ============================================================
// HEISENBYTE QUIZ — Firebase Configuration
// Replace the values below with your actual Firebase project config
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ---- Initialize Firebase ----
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
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
