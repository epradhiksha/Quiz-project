// ============================================================
// HEISENBYTE Admin — Quiz Control Panel Module
// Full real-time control: activate, reveal, next, leaderboard, end
// ============================================================

const SESSION_KEY = "hb_admin_session";

// Guard
if (sessionStorage.getItem(SESSION_KEY) !== "true") {
    window.location.replace("index.html");
}

// ============================================================
// DOM refs
// ============================================================
const btnActivate = document.getElementById("btn-activate");
const btnReveal = document.getElementById("btn-reveal");
const btnNext = document.getElementById("btn-next");
const btnLeaderboard = document.getElementById("btn-leaderboard");
const btnEndQuiz = document.getElementById("btn-end");
const logoutBtn = document.getElementById("logout-btn");

const statusText = document.getElementById("status-text");
const statusDot = document.getElementById("status-dot");
const qNumDisplay = document.getElementById("q-num");
const qTotalDisplay = document.getElementById("q-total");
const questionText = document.getElementById("question-text");
const optionItems = document.querySelectorAll(".option-item");
const timerDisplay = document.getElementById("timer-display");
const timerBar = document.getElementById("timer-bar");

const lbPanel = document.getElementById("lb-panel");
const lbList = document.getElementById("lb-list");
const participantEl = document.getElementById("sidebar-participants");
const sidebarLbEl = document.getElementById("sidebar-lb");

const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmDesc = document.getElementById("confirm-desc");
const confirmIcon = document.getElementById("confirm-icon");
const confirmYes = document.getElementById("confirm-yes");
const confirmNo = document.getElementById("confirm-no");
const confirmYesBtn = document.getElementById("confirm-yes");

const toastContainer = document.getElementById("toast-container");

// ============================================================
// State
// ============================================================
let quizState = {};

// region-specific functions client (must match backend region)
const fns = firebase.app().functions('asia-south1');
let questions = [];
let currentQ = null;

// --- sample questions (same as seeder) in case the database is empty ---
const SAMPLE_QUESTIONS = [
    { order: 0, questionText: "Which data structure uses LIFO (Last In First Out) principle?", options: ["Queue", "Stack", "Linked List", "Tree"], correctAnswer: "B", basePoints: 100 },
    { order: 1, questionText: "What is the time complexity of binary search?", options: ["O(n)", "O(n²)", "O(log n)", "O(1)"], correctAnswer: "C", basePoints: 100 },
    { order: 2, questionText: "Which of the following is NOT a JavaScript data type?", options: ["Undefined", "Boolean", "Float", "Symbol"], correctAnswer: "C", basePoints: 100 },
    { order: 3, questionText: "What does HTTP stand for?", options: [
            "HyperText Transfer Protocol",
            "HyperText Transmission Protocol",
            "High Transfer Test Protocol",
            "Host Transfer Text Protocol"
        ], correctAnswer: "A", basePoints: 100 },
    { order: 4, questionText: "Which sorting algorithm has the best average-case complexity?", options: ["Bubble Sort", "Insertion Sort", "Merge Sort", "Selection Sort"], correctAnswer: "C", basePoints: 100 },
    { order: 5, questionText: "In Python, what is the output of: type([])?", options: ["<class 'array'>", "<class 'list'>", "<class 'tuple'>", "<class 'dict'>"], correctAnswer: "B", basePoints: 100 }
];
let timerInterval = null;
let timerSeconds = 15;
let TIMER_DURATION = 15;
let pendingAction = null;
let unsubState = null;
let unsubLeaderboard = null;
let unsubPresence = null;

// ============================================================
// Init
// ============================================================
async function init() {
    await loadQuestions();
    listenQuizState();
    listenLeaderboard();
    listenParticipants();
}

// ============================================================
// Load questions from Firestore
// ============================================================
async function loadQuestions() {
    try {
        const snap = await HB.questionsRef.orderBy("order").get();
        if (snap.empty) {
            // database empty – optionally seed sample set
            console.warn('No questions found, seeding sample data');
            if (SAMPLE_QUESTIONS && SAMPLE_QUESTIONS.length) {
                for (const q of SAMPLE_QUESTIONS) {
                    await HB.questionsRef.add(q);
                }
                showToast('📦 Database was empty; sample questions have been added.', 'warning');
            }
            // re-fetch after seeding
            const snap2 = await HB.questionsRef.orderBy("order").get();
            questions = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
            questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        qTotalDisplay.textContent = questions.length;
        showToast(`✓ Loaded ${questions.length} question${questions.length === 1 ? '' : 's'}`);

        // if there is no quiz metadata yet, create a default idle state so
        // the UI status and counters update immediately (avoids "LOADING...")
        const stateSnap = await HB.quizStateRef.get();
        if (!stateSnap.exists) {
            console.log('Creating default quiz metadata');
            await HB.quizStateRef.set({
                status: 'idle',
                currentQuestion: 0,
                totalQuestions: questions.length,
                questionStartTime: null,
                questionEndTime: null,
                timeLimitSeconds: 15,
                answerRevealed: false,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // If we already know current question (from state listener) render it
        if (quizState && typeof quizState.currentQuestion === 'number') {
            currentQ = questions[quizState.currentQuestion] || null;
            renderQuestion(currentQ, quizState.status, quizState.answerRevealed);
        }
    } catch (e) {
        console.error("Failed to load questions:", e);
        showToast("Failed to load questions from Firestore", "error");
    }
}

// ============================================================
// Real-time quiz state listener
// ============================================================
function listenQuizState() {
    unsubState = HB.quizStateRef.onSnapshot((doc) => {
        if (!doc.exists) return;
        quizState = doc.data();
        const {
            status,
            currentQuestion,
            questionStartTime,
            questionEndTime,
            timeLimitSeconds,
            totalQuestions,
            answerRevealed
        } = quizState;

        // Update UI badges and question counter
        updateStatusBadge(status);
        qNumDisplay.textContent = ((currentQuestion || 0) + 1);

        // Load and display current question content
        if (questions.length > 0) {
            currentQ = questions[currentQuestion || 0] || null;
            renderQuestion(currentQ, status, answerRevealed);
        }

        // Buttons should reflect current status
        updateButtonStates(status);

        // Timer logic based on status
        if (status === "active") {
            startTimer(questionStartTime, timeLimitSeconds || TIMER_DURATION);
        } else {
            stopTimer();
            if (status === "ended" || status === "revealed") {
                revealAnswerUI(currentQ);
            }
        }

        // If quiz is over entirely, show end state
        if (status === "ended" && totalQuestions && currentQuestion >= totalQuestions - 1) {
            showEndedState();
        }
    });
}

// ============================================================
// Listen to leaderboard (teams collection sorted by score)
// ============================================================
function listenLeaderboard() {
    unsubLeaderboard = HB.teamsRef
        .orderBy("score", "desc")
        .onSnapshot((snap) => {
            const teams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            updateLeaderboardUI(teams);
            updateSidebarLeaderboard(teams);
        });
}

// ============================================================
// Listen to participant count (Firestore presence collection)
// ============================================================
function listenParticipants() {
    HB.db.collection('presence').onSnapshot(snap => {
        const count = snap.size;
        if (participantEl) participantEl.textContent = count;
    }, () => {
        // Fallback: count teams
        HB.teamsRef.onSnapshot((snap) => {
            if (participantEl) participantEl.textContent = snap.size;
        });
    });
}

// ============================================================
// Render current question
// ============================================================
function renderQuestion(q, status, answerRevealed) {
    if (!q) {
        questionText.textContent = "No questions loaded. Add questions to Firestore.";
        optionItems.forEach(opt => { opt.dataset.label = ""; });
        return;
    }

    questionText.textContent = q.questionText || q.question || "Unknown question";

    const keys = ["A", "B", "C", "D"];
    optionItems.forEach((item, i) => {
        const key = keys[i];
        const text = q.options ? q.options[i] : (q[`option${key}`] || "");
        item.querySelector(".option-key").textContent = key;
        item.querySelector(".option-text").textContent = text;

        // Reset classes
        item.classList.remove("correct", "hidden-answer");

        // Hide answers until revealed
        if (!answerRevealed && status !== "revealed" && status !== "ended") {
            item.classList.add("hidden-answer");
        }
    });

    if (answerRevealed || status === "revealed" || status === "ended") {
        revealAnswerUI(q);
    }
}

function revealAnswerUI(q) {
    if (!q) return;
    const correct = q.correctAnswer; // "A" | "B" | "C" | "D" or index 0-3
    optionItems.forEach((item, i) => {
        item.classList.remove("hidden-answer");
        const key = ["A", "B", "C", "D"][i];
        const matchByKey = typeof correct === "string" && correct.toUpperCase() === key;
        const matchByIndex = typeof correct === "number" && correct === i;
        if (matchByKey || matchByIndex) {
            item.classList.add("correct");
        }
    });
}

// ============================================================
// Timer
// ============================================================
function startTimer(timerStart, duration) {
    stopTimer();
    TIMER_DURATION = duration || 15;

    function tick() {
        const elapsed = timerStart
            ? Math.floor((Date.now() - timerStart.toMillis()) / 1000)
            : 0;
        timerSeconds = Math.max(0, TIMER_DURATION - elapsed);

        timerDisplay.textContent = timerSeconds;
        const pct = (timerSeconds / TIMER_DURATION) * 100;
        timerBar.style.width = pct + "%";

        // Color transitions
        const cls = timerSeconds <= 5 ? "danger" : timerSeconds <= 8 ? "warning" : "";
        timerDisplay.className = "timer-display " + cls;
        timerBar.className = "timer-bar " + cls;

        if (timerSeconds <= 0) stopTimer();
    }

    tick();
    timerInterval = setInterval(tick, 500);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function resetTimerUI() {
    timerDisplay.textContent = TIMER_DURATION;
    timerDisplay.className = "timer-display";
    timerBar.style.width = "100%";
    timerBar.className = "timer-bar";
}

// ============================================================
// Button States
// ============================================================
function updateButtonStates(status) {
    const states = {
        // [activate, reveal, next, leaderboard, end]
        "idle": [true, false, false, true, true],
        "active": [false, true, false, true, false],
        "revealed": [false, false, true, true, true],
        "ended": [false, false, false, true, false],
    };

    const s = states[status] || states["idle"];
    setButtonEnabled(btnActivate, s[0]);
    setButtonEnabled(btnReveal, s[1]);
    setButtonEnabled(btnNext, s[2]);
    setButtonEnabled(btnLeaderboard, s[3]);
    setButtonEnabled(btnEndQuiz, s[4]);
}

function setButtonEnabled(btn, enabled) {
    if (!btn) return;
    if (enabled) {
        btn.removeAttribute("disabled");
        btn.removeAttribute("data-disabled");
    } else {
        btn.setAttribute("disabled", "true");
        btn.setAttribute("data-disabled", "true");
    }
}

// ============================================================
// STATUS BADGE
// ============================================================
function updateStatusBadge(status) {
    const map = {
        "idle": { text: "NOT STARTED", dotClass: "amber" },
        "active": { text: "QUESTION LIVE", dotClass: "" },
        "revealed": { text: "ANSWER REVEALED", dotClass: "amber" },
        "ended": { text: "ENDED", dotClass: "red" },
    };
    const s = map[status] || { text: status, dotClass: "" };
    if (statusText) statusText.textContent = s.text;
    if (statusDot) statusDot.className = "qsb-dot qsb-dot-" + s.dotClass;
}

// ============================================================
// CONTROL ACTIONS
// ============================================================

// ACTIVATE OR START QUESTION – use callable so server sets timestamps
btnActivate && btnActivate.addEventListener("click", async () => {
    const idx = quizState.currentQuestion || 0;
    if (!questions[idx]) { showToast("No question at index " + idx, "error"); return; }

    try {
        const startFn = fns.httpsCallable('startQuestion');
        const res = await startFn({ questionIndex: idx, timeLimitSeconds: TIMER_DURATION });
        showToast(res.data.message || "⚡ Question activated! Timer started.");
    } catch (e) {
        showToast("Failed to start question", "error");
        console.error(e);
    }
});

// REVEAL ANSWER – ask backend to update status so only admin can call
btnReveal && btnReveal.addEventListener("click", async () => {
    try {
        stopTimer();
        const revealFn = fns.httpsCallable('revealAnswer');
        const res = await revealFn();
        showToast(res.data.message || "✓ Answer revealed to participants.");
    } catch (e) {
        showToast("Failed to reveal answer", "error");
        console.error(e);
    }
});

// NEXT QUESTION – simply start the following question via callable
btnNext && btnNext.addEventListener("click", async () => {
    const idx = (quizState.currentQuestion || 0) + 1;
    const total = quizState.totalQuestions || questions.length;

    if (idx >= total) {
        showToast("⚠ That was the last question! Use End Quiz.", "warn");
        return;
    }

    try {
        resetTimerUI();
        const startFn = fns.httpsCallable('startQuestion');
        const res = await startFn({ questionIndex: idx, timeLimitSeconds: TIMER_DURATION });
        showToast(res.data.message || `➡ Moved to question ${idx + 1}`);
    } catch (e) {
        showToast("Failed to move to next question", "error");
        console.error(e);
    }
});

// SHOW / HIDE LEADERBOARD
btnLeaderboard && btnLeaderboard.addEventListener("click", () => {
    if (lbPanel.classList.contains("hidden")) {
        lbPanel.classList.remove("hidden");
        btnLeaderboard.querySelector(".btn-label").textContent = "HIDE LEADERBOARD";
    } else {
        lbPanel.classList.add("hidden");
        btnLeaderboard.querySelector(".btn-label").textContent = "SHOW LEADERBOARD";
    }
});

// END QUIZ — requires confirmation
btnEndQuiz && btnEndQuiz.addEventListener("click", () => {
    pendingAction = "end";
    confirmIcon.textContent = "🛑";
    confirmTitle.textContent = "END QUIZ";
    confirmDesc.textContent = "This will lock all submissions and display the final leaderboard. This action cannot be undone.";
    confirmModal.classList.remove("hidden");
});

confirmYes && confirmYes.addEventListener("click", async () => {
    confirmModal.classList.add("hidden");
    if (pendingAction === "end") {
        try {
            stopTimer();
            const endFn = fns.httpsCallable('endQuestion');
            const res = await endFn();
            showToast(res.data.message || "🏁 Quiz ended. Final leaderboard is live.");
            lbPanel.classList.remove("hidden");
        } catch (e) {
            showToast("Failed to end quiz", "error");
            console.error(e);
        }
    }
    pendingAction = null;
});

confirmNo && confirmNo.addEventListener("click", () => {
    confirmModal.classList.add("hidden");
    pendingAction = null;
});

// LOGOUT
logoutBtn && logoutBtn.addEventListener("click", () => {
    if (confirm("Logout from admin panel?")) {
        sessionStorage.removeItem(SESSION_KEY);
        window.location.replace("index.html");
    }
});

// ============================================================
// LEADERBOARD UI
// ============================================================
function updateLeaderboardUI(teams) {
    if (!lbList) return;
    lbList.innerHTML = "";

    if (teams.length === 0) {
        lbList.innerHTML = `<div class="text-dim mono" style="text-align:center;padding:20px;font-size:0.8rem;">No participants yet</div>`;
        return;
    }

    teams.forEach((t, i) => {
        const rank = i + 1;
        const rCls = rank === 1 ? "r1" : rank === 2 ? "r2" : rank === 3 ? "r3" : "rX";
        const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
        const row = document.createElement("div");
        row.className = "lb-row";
        row.innerHTML = `
      <div class="lb-rank ${rCls}">${medal}</div>
      <div class="lb-name">${escHtml(t.teamName || t.name || "Unknown")}</div>
      <div class="lb-score">${t.score || 0} pts</div>
    `;
        lbList.appendChild(row);
    });
}

function updateSidebarLeaderboard(teams) {
    if (!sidebarLbEl) return;
    sidebarLbEl.innerHTML = "";

    const top5 = teams.slice(0, 5);
    if (top5.length === 0) {
        sidebarLbEl.innerHTML = `<div class="text-dim mono" style="font-size:0.72rem;padding:6px 0;">No data yet</div>`;
        return;
    }

    top5.forEach((t, i) => {
        const rank = i + 1;
        const clsMap = ["gold", "silver", "bronze", "", ""];
        const item = document.createElement("div");
        item.className = "participant-item";
        item.innerHTML = `
      <span class="p-rank ${clsMap[i] || ""}">#${rank}</span>
      <span class="p-name">${escHtml(t.teamName || t.name || "Unknown")}</span>
      <span class="p-score">${t.score || 0}</span>
    `;
        sidebarLbEl.appendChild(item);
    });
}

// ============================================================
// ENDED STATE UI
// ============================================================
function showEndedState() {
    resetTimerUI();
    timerDisplay.textContent = "00";
    const qCard = document.getElementById("question-card");
    if (qCard) {
        qCard.style.borderColor = "rgba(255,51,51,0.4)";
    }
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = "") {
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 3200);
}

// ============================================================
// Escape HTML
// ============================================================
function escHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ============================================================
// Kick off
// ============================================================
init();
