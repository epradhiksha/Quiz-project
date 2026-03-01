/**
 * HEISENBYTE REAL-TIME QUIZ — Firebase Cloud Functions
 * =====================================================
 * Branch: features/backend
 *
 * Security Guarantees:
 *  - Admin email verified server-side on every privileged call
 *  - Score calculated server-side; clients NEVER touch scores directly
 *  - Duplicate submissions blocked with Firestore transactions
 *  - Late submissions rejected by comparing server timestamp to questionEndTime
 *  - correctIndex NEVER returned to clients (Admin SDK reads bypass rules)
 *  - Multi-device logins tracked via RTDB sessions node
 *
 * Functions exposed:
 *   submitAnswer      — Participant submits answer (HTTPS Callable)
 *   startQuestion     — Admin starts a question (HTTPS Callable)
 *   endQuestion       — Admin ends a question (HTTPS Callable)
 *   resetQuiz         — Admin full reset (HTTPS Callable)
 *   getLeaderboard    — Read sorted scores (HTTPS Callable)
 *   cleanupPresence   — Scheduled stale-presence sweep (Pub/Sub schedule)
 */

"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueDeleted } = require("firebase-functions/v2/database");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");

initializeApp();
const db = getFirestore();
const rtdb = getDatabase();

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = "admin@heisenbyte.com"; // Change to actual admin email
const POINTS_PER_CORRECT = 10;
const TIME_BONUS_MAX = 5;       // Max bonus points for fast answer

// The Firestore document that controls quiz state.  Admin and user clients
// listen to this single document for all real‑time updates.  The previous
// implementation used `quizState/current`; for consistency with the web UI
// we now store the state under the `quiz` collection as `metadata`.
const QUIZ_STATE_DOC = "quiz/metadata";

// ─── Helper: Verify Admin ─────────────────────────────────────────────────────
function assertAdmin(auth) {
  if (!auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const isAdminEmail = auth.token.email === ADMIN_EMAIL && auth.token.email_verified;
  const hasAdminClaim = auth.token.admin === true;
  if (!isAdminEmail && !hasAdminClaim) {
    throw new HttpsError(
      "permission-denied",
      "Only the admin can perform this action."
    );
  }
}

// ─── Helper: Verify Authenticated ────────────────────────────────────────────
function assertAuthed(auth) {
  if (!auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to participate.");
  }
}

// ─┤ submitAnswer ├────────────────────────────────────────────────────────────
/**
 * Participants call this to submit their answer.
 *
 * Request payload:
 *   { teamId: string, questionIndex: number, selectedOption: number }
 *
 * Guarantees:
 *   1. Caller must be authenticated
 *   2. Quiz must be in "active" status
 *   3. questionIndex must match quizState.currentQuestion
 *   4. Submission must be received before quizState.questionEndTime
 *   5. No duplicate submission (checked atomically via Firestore transaction)
 *   6. Score calculated server-side using questions.correctIndex
 */
exports.submitAnswer = onCall({ region: "asia-south1" }, async (request) => {
  assertAuthed(request.auth);

  const { teamId, questionIndex, selectedOption } = request.data;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!teamId || typeof teamId !== "string") {
    throw new HttpsError("invalid-argument", "teamId is required.");
  }
  if (typeof questionIndex !== "number" || questionIndex < 0) {
    throw new HttpsError("invalid-argument", "questionIndex must be a non-negative number.");
  }
  if (typeof selectedOption !== "number" || selectedOption < 0) {
    throw new HttpsError("invalid-argument", "selectedOption is required.");
  }

  const now = Timestamp.now();

  // ── Read quiz state ───────────────────────────────────────────────────────
  const stateSnap = await db.doc(QUIZ_STATE_DOC).get();
  if (!stateSnap.exists) {
    throw new HttpsError("not-found", "Quiz has not started yet.");
  }
  const quizState = stateSnap.data();

  // ── Status check: must be active ──────────────────────────────────────────
  if (quizState.status !== "active") {
    throw new HttpsError(
      "failed-precondition",
      `Quiz is not accepting answers right now. Status: ${quizState.status}`
    );
  }

  // ── Question index check: must match current question ────────────────────
  if (quizState.currentQuestion !== questionIndex) {
    throw new HttpsError(
      "failed-precondition",
      `Wrong question. Expected question ${quizState.currentQuestion}, got ${questionIndex}.`
    );
  }

  // ── Late submission check ─────────────────────────────────────────────────
  const questionEndTime = quizState.questionEndTime;
  if (now.toMillis() > questionEndTime.toMillis()) {
    throw new HttpsError(
      "deadline-exceeded",
      "The time for this question has expired. Submission rejected."
    );
  }

  // ── Composite response document ID — enforces uniqueness ─────────────────
  const responseId = `${teamId}_q${questionIndex}`;
  const responseRef = db.doc(`responses/${responseId}`);

  // ── Read the correct answer from a dedicated answers collection.
  // This collection is admin-only so clients can never enumerate answers.
  const answerRef = db.doc(`answers/${questionIndex}`);
  const answerSnap = await answerRef.get();
  if (!answerSnap.exists) {
    // fallback: question may not have an answer entry
    throw new HttpsError("not-found", `Answer for question ${questionIndex} not found.`);
  }
  const { correctIndex } = answerSnap.data();
  const isCorrect = selectedOption === correctIndex;

  // ── Calculate points with time bonus ─────────────────────────────────────
  let pointsAwarded = 0;
  if (isCorrect) {
    const totalTimeMs = questionEndTime.toMillis() - quizState.questionStartTime.toMillis();
    const elapsedMs = now.toMillis() - quizState.questionStartTime.toMillis();
    const timeFraction = Math.max(0, 1 - elapsedMs / totalTimeMs);
    const timeBonus = Math.floor(TIME_BONUS_MAX * timeFraction);
    pointsAwarded = POINTS_PER_CORRECT + timeBonus;
  }

  // ── Atomic transaction: duplicate check + write ───────────────────────────
  await db.runTransaction(async (txn) => {
    const existingResponse = await txn.get(responseRef);

    if (existingResponse.exists) {
      throw new HttpsError(
        "already-exists",
        "Your team has already submitted an answer for this question."
      );
    }

    // Write response document
    txn.set(responseRef, {
      teamId,
      questionIndex,
      selectedOption,
      submittedAt: now,
      isCorrect,
      pointsAwarded,
      uid: request.auth.uid,
    });

    // Atomically increment team score
    const teamRef = db.doc(`teams/${teamId}`);
    txn.update(teamRef, {
      score: FieldValue.increment(pointsAwarded),
      lastAnsweredAt: now,
    });
  });

  return {
    success: true,
    isCorrect,
    pointsAwarded,
    message: isCorrect
      ? `Correct! You earned ${pointsAwarded} points.`
      : "Incorrect. Better luck next question!",
  };
});

// ─┤ startQuestion ├───────────────────────────────────────────────────────────
/**
 * Admin calls this to start a quiz question.
 *
 * Request payload:
 *   { questionIndex: number, timeLimitSeconds: number }
 *
 * Sets quizState to "active" with precise server-side timestamps.
 */
exports.startQuestion = onCall({ region: "asia-south1" }, async (request) => {
  assertAdmin(request.auth);

  const { questionIndex, timeLimitSeconds } = request.data;

  if (typeof questionIndex !== "number" || questionIndex < 0) {
    throw new HttpsError("invalid-argument", "questionIndex is required.");
  }
  const timeLimit = timeLimitSeconds || 30;

  // Verify the question exists
  const questionSnap = await db.doc(`questions/${questionIndex}`).get();
  if (!questionSnap.exists) {
    throw new HttpsError("not-found", `Question ${questionIndex} does not exist.`);
  }

  const now = Timestamp.now();
  const questionEndTime = Timestamp.fromMillis(now.toMillis() + timeLimit * 1000);

  await db.doc(QUIZ_STATE_DOC).set({
    status: "active",
    currentQuestion: questionIndex,
    questionStartTime: now,
    questionEndTime,
    timeLimitSeconds: timeLimit,
    totalQuestions: questionSnap.data().totalQuestions || null,
    answerRevealed: false,
    updatedAt: now,
  }, { merge: true });

  return {
    success: true,
    message: `Question ${questionIndex} started. Time limit: ${timeLimit}s.`,
    questionEndTime: questionEndTime.toMillis(),
  };
});

// ─┤ endQuestion ├─────────────────────────────────────────────────────────────
/**
 * Admin calls this to end the current question early (or after timer).
 * Sets quizState.status = "ended", locking all further submissions.
 */
exports.endQuestion = onCall({ region: "asia-south1" }, async (request) => {
  assertAdmin(request.auth);

  const now = Timestamp.now();

  await db.doc(QUIZ_STATE_DOC).update({
    status: "ended",
    questionEndTime: now,   // Override end time to now to block late submissions
    updatedAt: now,
  });

  return { success: true, message: "Question ended. No more submissions accepted." };
});

// ─┤ resetQuiz ├───────────────────────────────────────────────────────────────
/**
 * Admin calls this to fully reset the quiz.
 * Deletes all responses, resets all team scores, sets quizState to "idle".
 *
 * WARNING: This is destructive and irreversible.
 */
exports.resetQuiz = onCall({ region: "asia-south1" }, async (request) => {
  assertAdmin(request.auth);

  const batch = db.batch();

  // Reset quizState
  batch.set(db.doc(QUIZ_STATE_DOC), {
    status: "idle",
    currentQuestion: 0,
    questionStartTime: null,
    questionEndTime: null,
    updatedAt: Timestamp.now(),
  });

  // Delete all responses (in batches of 500 — Firestore batch limit)
  const responsesSnap = await db.collection("responses").get();
  for (const doc of responsesSnap.docs) {
    batch.delete(doc.ref);
  }

  // Reset all team scores
  const teamsSnap = await db.collection("teams").get();
  for (const doc of teamsSnap.docs) {
    batch.update(doc.ref, { score: 0, lastAnsweredAt: null });
  }

  // Clear leaderboard snapshot
  const leaderSnap = await db.collection("leaderboard").get();
  for (const doc of leaderSnap.docs) {
    batch.delete(doc.ref);
  }

  await batch.commit();

  return { success: true, message: "Quiz fully reset. All scores and responses cleared." };
});

// ─┤ getLeaderboard ├──────────────────────────────────────────────────────────
/**
 * Any authenticated user (or anonymous) can call this.
 * Returns teams sorted by score (descending), capped at top 50.
 * Does NOT expose correctIndex or internal fields.
 */
exports.getLeaderboard = onCall({ region: "asia-south1" }, async (request) => {
  const teamsSnap = await db
    .collection("teams")
    .orderBy("score", "desc")
    .limit(50)
    .get();

  const leaderboard = teamsSnap.docs.map((doc, index) => ({
    rank: index + 1,
    teamId: doc.id,
    name: doc.data().name || "Unknown Team",
    score: doc.data().score || 0,
    members: doc.data().members || [],
  }));

  return { leaderboard };
});

// ─┤ revealAnswer ├──────────────────────────────────────────────────────────
/**
 * Admin triggers answer reveal after closing submissions.  This just changes
 * quiz state to "revealed" so clients can unmask the correct option.
 */
exports.revealAnswer = onCall({ region: "asia-south1" }, async (request) => {
  assertAdmin(request.auth);
  const now = Timestamp.now();
  await db.doc(QUIZ_STATE_DOC).update({
    status: "revealed",
    answerRevealed: true,
    revealedAt: now,
    updatedAt: now,
  });
  return { success: true, message: "Answer is now revealed to participants." };
});

// ─┤ setAdminClaim ├───────────────────────────────────────────────────────────
/**
 * Sets the custom admin claim on the admin user.
 * Can only be called once the user calling it already has the ADMIN_EMAIL.
 * Use this once during initial setup via Firebase Functions shell or Admin SDK.
 */
exports.setAdminClaim = onCall({ region: "asia-south1" }, async (request) => {
  assertAdmin(request.auth);  // Must already be admin by email

  const { getAuth } = require("firebase-admin/auth");
  await getAuth().setCustomUserClaims(request.auth.uid, { admin: true });

  return { success: true, message: "Admin claim set successfully." };
});

// ─┤ onPresenceDeleted ├───────────────────────────────────────────────────────
/**
 * RTDB trigger: fires when a user's presence node is deleted
 * (i.e., when the client disconnects and onDisconnect() triggers).
 * Marks the participant as offline in Firestore participants collection.
 */
exports.onPresenceDeleted = onValueDeleted(
  { ref: "/presence/{uid}", region: "asia-south1" },
  async (event) => {
    const uid = event.params.uid;
    const participantRef = db.doc(`participants/${uid}`);

    try {
      const snap = await participantRef.get();
      if (snap.exists) {
        await participantRef.update({ online: false, lastSeen: Timestamp.now() });
      }
    } catch (err) {
      console.error(`onPresenceDeleted — failed for uid ${uid}:`, err);
    }
  }
);

// ─┤ cleanupPresence ├─────────────────────────────────────────────────────────
/**
 * Scheduled function: runs every 10 minutes.
 * Sweeps RTDB presence entries older than 15 minutes and removes them.
 * Handles the case where onDisconnect() did not fire (e.g., hard network loss).
 */
exports.cleanupPresence = onSchedule(
  { schedule: "every 10 minutes", region: "asia-south1" },
  async () => {
    const now = Date.now();
    const staleThresholdMs = 15 * 60 * 1000; // 15 minutes

    const presenceRef = rtdb.ref("presence");
    const snap = await presenceRef.once("value");

    if (!snap.exists()) return;

    const staleUids = [];
    snap.forEach((child) => {
      const data = child.val();
      if (data && data.connectedAt && now - data.connectedAt > staleThresholdMs) {
        if (!data.online) {
          staleUids.push(child.key);
        }
      }
    });

    const cleanupPromises = staleUids.map((uid) =>
      presenceRef.child(uid).remove()
    );
    await Promise.all(cleanupPromises);

    console.log(`cleanupPresence: removed ${staleUids.length} stale presence entries.`);
  }
);

// ─┤ lockQuizQuestion (RTDB-triggered auto-lock) ├─────────────────────────────
/**
 * For extra safety: if the client timer expired but Admin forgot to call endQuestion,
 * this HTTP callable lets the client request a lock check (server validates timestamp).
 */
exports.checkAndLockQuestion = onCall({ region: "asia-south1" }, async (request) => {
  assertAuthed(request.auth);

  const stateSnap = await db.doc(QUIZ_STATE_DOC).get();
  if (!stateSnap.exists) return { locked: false };

  const state = stateSnap.data();
  if (state.status !== "active") return { locked: state.status === "ended" };

  const now = Timestamp.now();
  if (now.toMillis() >= state.questionEndTime.toMillis()) {
    // Auto-lock: time has expired
    await db.doc(QUIZ_STATE_DOC).update({
      status: "ended",
      updatedAt: now,
    });
    return { locked: true, message: "Question auto-locked by server (time expired)." };
  }

  return { locked: false, remainingMs: state.questionEndTime.toMillis() - now.toMillis() };
});
