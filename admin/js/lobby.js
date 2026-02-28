// ============================================================
// HEISENBYTE Admin — Lobby Module
// Shows participant count, quiz status, and Start Quiz button
// ============================================================

const SESSION_KEY = "hb_admin_session";

// Guard: redirect to login if no session
if (sessionStorage.getItem(SESSION_KEY) !== "true") {
    window.location.replace("index.html");
}

// ---- DOM refs ----
const participantCount = document.getElementById("participant-count");
const questionCount = document.getElementById("question-count");
const quizStatusText = document.getElementById("quiz-status-text");
const quizStatusDot = document.getElementById("quiz-status-dot");
const startQuizBtn = document.getElementById("start-quiz-btn");
const logoutBtn = document.getElementById("logout-btn");
const confirmModal = document.getElementById("confirm-modal");
const confirmYes = document.getElementById("confirm-yes");
const confirmNo = document.getElementById("confirm-no");

// ---- State ----
let currentStatus = null;
let questionTotal = 0;
let unsubscribeState = null;

// ---- Listen to quiz state ----
function listenQuizState() {
    unsubscribeState = HB.quizStateRef.onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            currentStatus = data.status;
            updateStatusUI(currentStatus);

            // If quiz already started, go to control
            if (currentStatus !== "NOT_STARTED") {
                window.location.replace("control.html");
            }
        } else {
            // Initialize if doesn't exist
            HB.quizStateRef.set({
                status: "NOT_STARTED",
                currentQuestionIndex: 0,
                questionTotal: 0,
                startedAt: null
            });
        }
    }, (err) => {
        console.error("Firestore error:", err);
        showOfflineMode();
    });
}

// ---- Listen to participant count (Realtime DB presence) ----
function listenParticipants() {
    HB.presenceRef.on("value", (snap) => {
        const count = snap.numChildren ? snap.numChildren() : 0;
        animateCount(participantCount, count);
    }, () => {
        // Fallback: count from teams collection
        HB.teamsRef.onSnapshot((snap) => {
            animateCount(participantCount, snap.size);
        });
    });
}

// ---- Load question count ----
async function loadQuestionCount() {
    try {
        const snap = await HB.questionsRef.get();
        questionTotal = snap.size;
        animateCount(questionCount, questionTotal);
        await HB.quizStateRef.update({ questionTotal });
    } catch (e) {
        questionCount.textContent = "—";
    }
}

// ---- Update status UI ----
function updateStatusUI(status) {
    const map = {
        "NOT_STARTED": { text: "WAITING · NOT STARTED", dotClass: "amber" },
        "LIVE": { text: "LIVE · IN PROGRESS", dotClass: "" },
        "QUESTION_ACTIVE": { text: "LIVE · QUESTION ACTIVE", dotClass: "" },
        "ANSWER_REVEALED": { text: "LIVE · ANSWER REVEALED", dotClass: "amber" },
        "ENDED": { text: "ENDED · QUIZ COMPLETE", dotClass: "red" },
    };
    const s = map[status] || map["NOT_STARTED"];
    quizStatusText.textContent = s.text;
    quizStatusDot.className = "status-dot " + s.dotClass;

    // Manage button state
    if (status === "NOT_STARTED") {
        startQuizBtn.removeAttribute("disabled");
        startQuizBtn.removeAttribute("data-disabled");
    } else {
        startQuizBtn.setAttribute("data-disabled", "true");
        startQuizBtn.disabled = true;
    }
}

// ---- Start Quiz (with confirm) ----
startQuizBtn.addEventListener("click", () => {
    confirmModal.classList.remove("hidden");
});

confirmNo.addEventListener("click", () => {
    confirmModal.classList.add("hidden");
});

confirmYes.addEventListener("click", async () => {
    confirmModal.classList.add("hidden");
    startQuizBtn.disabled = true;
    startQuizBtn.textContent = "⚡ LAUNCHING...";

    try {
        await HB.quizStateRef.set({
            status: "LIVE",
            currentQuestionIndex: 0,
            questionTotal: questionTotal,
            startedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Redirect will happen via listener
    } catch (e) {
        console.error("Failed to start quiz:", e);
        startQuizBtn.disabled = false;
        startQuizBtn.innerHTML = '⚡ <span>START QUIZ</span>';
        showToast("Failed to start quiz. Check Firebase connection.", "error");
    }
});

// ---- Logout ----
logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.replace("index.html");
});

// ---- Animate count number ----
function animateCount(el, target) {
    const start = parseInt(el.textContent) || 0;
    const duration = 800;
    const step = 16;
    const steps = duration / step;
    const increment = (target - start) / steps;
    let current = start;
    let frame = 0;

    const interval = setInterval(() => {
        frame++;
        current += increment;
        el.textContent = Math.round(frame >= steps ? target : current);
        if (frame >= steps) clearInterval(interval);
    }, step);
}

function showOfflineMode() {
    quizStatusText.textContent = "OFFLINE · FIREBASE UNREACHABLE";
    quizStatusDot.style.background = "#ff3333";
}

function showToast(msg, type = "") {
    const tc = document.getElementById("toast-container");
    if (!tc) return;
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    tc.appendChild(t);
    setTimeout(() => t.remove(), 3200);
}

// ---- Init ----
listenQuizState();
listenParticipants();
loadQuestionCount();
