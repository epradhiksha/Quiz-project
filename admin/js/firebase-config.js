// ============================================================
// HEISENBYTE QUIZ — Firebase Configuration
// Replace the values below with your actual Firebase project config
// ============================================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};


// ---- Initialize Firebase ----
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}


const db = firebase.firestore();
// Realtime Database removed; using Firestore for presence
const auth = firebase.auth();

// ---- Firestore Collection References ----
const quizStateRef = db.collection("quiz").doc("metadata");
const questionsRef = db.collection("questions");
const teamsRef = db.collection("teams");
const responsesRef = db.collection("responses");

// ---- Firestore Collections (replacing RTDB) ----
const presenceCollection = db.collection("presence");

// ---- Exports (global) ----
window.HB = {
  db,
  auth,
  quizStateRef,
  questionsRef,
  teamsRef,
  responsesRef,
  presenceCollection
};

// --------------------------------------------------
// If we're running locally via the emulator suite we want
// the client SDKs to talk to the emulators instead of the
// live production project.  The emulator hosting already
// serves this config, so we can just detect localhost.
//
// NOTE: these ports must match the ones configured in
// `firebase.json` under the `emulators` section.
//
// Treat common loopback hostnames as "local" so the SDKs connect
// to the emulator whether the page is served from localhost or 127.0.0.1.
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '::1') {
  console.log('Using Firebase emulators');
  // Firestore emulator runs on 8080
  db.useEmulator('localhost', 8080);
  // Auth emulator port 9099
  auth.useEmulator('http://localhost:9099');
  // Functions emulator port 5001 and region asia-south1
  firebase.app().functions('asia-south1').useEmulator('localhost', 5001);

  // Show an on‑page banner so it's obvious we're not talking to production
  const banner = document.createElement('div');
  banner.textContent = '⚠ Running in EMULATOR Mode – data is local only';
  banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#b71c1c;color:#fff;padding:4px;font-family:monospace;text-align:center;z-index:10000';
  document.addEventListener('DOMContentLoaded', () => document.body.prepend(banner));
}
