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
let questions = [];
let currentQ = null;
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
            // Try without orderBy
            const snap2 = await HB.questionsRef.get();
            questions = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
            questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        qTotalDisplay.textContent = questions.length;
        showToast(`✓ Loaded ${questions.length} questions`);
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
        const { status, currentQuestionIndex } = quizState;

        // Update UI
        updateStatusBadge(status);
        qNumDisplay.textContent = (currentQuestionIndex || 0) + 1;

        // Load and display current question
        if (questions.length > 0) {
            currentQ = questions[currentQuestionIndex || 0] || null;
            renderQuestion(currentQ, status);
        }

        // Update button states based on quiz status
        updateButtonStates(status);

        // Handle timer
        if (status === "QUESTION_ACTIVE") {
            startTimer(quizState.timerStart, quizState.timerDuration || TIMER_DURATION);
        } else {
            stopTimer();
            if (status === "ANSWER_REVEALED") {
                revealAnswerUI(currentQ);
            }
        }

        // If quiz ended → show final state
        if (status === "ENDED") {
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
// Listen to participant count (Realtime DB presence)
// ============================================================
function listenParticipants() {
    HB.presenceRef.on("value", (snap) => {
        const count = snap.numChildren ? snap.numChildren() : 0;
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
function renderQuestion(q, status) {
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
        if (status !== "ANSWER_REVEALED" && status !== "ENDED") {
            item.classList.add("hidden-answer");
        }
    });

    if (status === "ANSWER_REVEALED" || status === "ENDED") {
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
        "NOT_STARTED": [true, false, false, true, true],
        "LIVE": [true, false, false, true, true],
        "QUESTION_ACTIVE": [false, true, false, true, false],
        "ANSWER_REVEALED": [false, false, true, true, true],
        "ENDED": [false, false, false, true, false],
    };

    const s = states[status] || states["LIVE"];
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
        "NOT_STARTED": { text: "NOT STARTED", dotClass: "amber" },
        "LIVE": { text: "LIVE", dotClass: "" },
        "QUESTION_ACTIVE": { text: "Q ACTIVE", dotClass: "" },
        "ANSWER_REVEALED": { text: "REVEALED", dotClass: "amber" },
        "ENDED": { text: "ENDED", dotClass: "red" },
    };
    const s = map[status] || { text: status, dotClass: "" };
    if (statusText) statusText.textContent = s.text;
    if (statusDot) statusDot.className = "qsb-dot qsb-dot-" + s.dotClass;
}

// ============================================================
// CONTROL ACTIONS
// ============================================================

// ACTIVATE QUESTION
btnActivate && btnActivate.addEventListener("click", async () => {
    const idx = quizState.currentQuestionIndex || 0;
    if (!questions[idx]) { showToast("No question at index " + idx, "error"); return; }

    try {
        await HB.quizStateRef.update({
            status: "QUESTION_ACTIVE",
            timerStart: firebase.firestore.FieldValue.serverTimestamp(),
            timerDuration: TIMER_DURATION,
            questionActivatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("⚡ Question activated! Timer started.");
    } catch (e) {
        showToast("Failed to activate question", "error");
        console.error(e);
    }
});

// REVEAL ANSWER
btnReveal && btnReveal.addEventListener("click", async () => {
    try {
        stopTimer();
        await HB.quizStateRef.update({
            status: "ANSWER_REVEALED",
            revealedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("✓ Answer revealed to participants.");
    } catch (e) {
        showToast("Failed to reveal answer", "error");
        console.error(e);
    }
});

// NEXT QUESTION
btnNext && btnNext.addEventListener("click", async () => {
    const idx = (quizState.currentQuestionIndex || 0) + 1;
    const total = quizState.questionTotal || questions.length;

    if (idx >= total) {
        showToast("⚠ That was the last question! Use End Quiz.", "warn");
        return;
    }

    try {
        resetTimerUI();
        await HB.quizStateRef.update({
            status: "LIVE",
            currentQuestionIndex: idx,
            timerStart: null
        });
        showToast(`➡ Moved to question ${idx + 1}`);
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
            await HB.quizStateRef.update({
                status: "ENDED",
                endedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast("🏁 Quiz ended. Final leaderboard is live.");
            // Show leaderboard automatically
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
