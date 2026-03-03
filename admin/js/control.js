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
const btnRestart = document.getElementById("btn-restart");
const logoutBtn = document.getElementById("logout-btn");
const timerSelect = document.getElementById("timer-select");
const participantWarning = document.getElementById("participant-warning");

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
    // 🟢 EASY — Python Basics, Trivia & Simple Output (100 pts)
    { order: 0, difficulty: "easy", questionText: "Which function returns the length of a list, tuple, or string?", options: ["size()", "count()", "length()", "len()"], correctAnswer: "D", basePoints: 100 },
    { order: 1, difficulty: "easy", questionText: "Which function converts an iterable into a list of (index, value) pairs?", options: ["iter()", "zip()", "enumerate()", "map()"], correctAnswer: "C", basePoints: 100 },
    { order: 2, difficulty: "easy", questionText: "What function is used to check if all elements in an iterable are true?", options: ["any()", "all()", "bool()", "true()"], correctAnswer: "B", basePoints: 100 },
    { order: 3, difficulty: "easy", questionText: "Which function returns the ASCII value of a character?", options: ["ascii()", "char()", "ord()", "chr()"], correctAnswer: "C", basePoints: 100 },
    { order: 4, difficulty: "easy", questionText: "Which function converts a number to its corresponding Unicode character?", options: ["ord()", "unicode()", "char()", "chr()"], correctAnswer: "D", basePoints: 100 },
    { order: 5, difficulty: "easy", questionText: "In which year was Python officially released?", options: ["1985", "1989", "1991", "2000"], correctAnswer: "C", basePoints: 100 },
    { order: 6, difficulty: "easy", questionText: "Python was created as a successor to which programming language?", options: ["Java", "ABC", "C++", "Pascal"], correctAnswer: "B", basePoints: 100 },
    { order: 7, difficulty: "easy", questionText: "a = [1,2,3]\nb = [1,2,3]\nprint(a is b)\nprint(a in b)\n\nWhat is the output?", options: ["True True", "False True", "False False", "Error"], correctAnswer: "C", basePoints: 100 },
    { order: 8, difficulty: "easy", questionText: "a = [1,2,3]\nb = [[1,2,3]]\nprint(a in b)\n\nWhat is the output?", options: ["True", "False", "Error", "None"], correctAnswer: "A", basePoints: 100 },
    { order: 9, difficulty: "easy", questionText: "print(5/2)\nprint(5//2)\n\nWhat is the output?", options: ["2 and 2", "2 and 2.5", "2.5 and 2.5", "2.5 and 2"], correctAnswer: "D", basePoints: 100 },
    { order: 10, difficulty: "easy", questionText: "print(5 or 10)\nprint(5 and 10)\n\nWhat is the output?", options: ["5 5", "5 10", "10 10", "Error"], correctAnswer: "B", basePoints: 100 },
    // 🟡 MEDIUM — ML / AI Concepts (150 pts)
    { order: 11, difficulty: "medium", questionText: "Which function in NumPy computes the dot product of two arrays?", options: ["numpy.multiply()", "numpy.dot()", "numpy.sum()", "numpy.cross()"], correctAnswer: "B", basePoints: 150 },
    { order: 12, difficulty: "medium", questionText: "Which Scikit-learn function splits data into training and testing sets?", options: ["split_data()", "train_test()", "train_test_split()", "data_split()"], correctAnswer: "C", basePoints: 150 },
    { order: 13, difficulty: "medium", questionText: "Which metric function evaluates how far predictions deviate from actual values?", options: ["accuracy_score()", "recall_score()", "mean_squared_error()", "f1_score()"], correctAnswer: "C", basePoints: 150 },
    { order: 14, difficulty: "medium", questionText: "Which activation function outputs values between 0 and 1?", options: ["ReLU", "Softmax", "Tanh", "Sigmoid"], correctAnswer: "D", basePoints: 150 },
    { order: 15, difficulty: "medium", questionText: "Which loss function is commonly used for binary classification?", options: ["mean_squared_error", "categorical_crossentropy", "binary_crossentropy", "hinge_loss"], correctAnswer: "C", basePoints: 150 },
    { order: 16, difficulty: "medium", questionText: "Which algorithm uses a heuristic function to find the optimal path?", options: ["Breadth First Search", "Depth First Search", "A* Search", "Minimax"], correctAnswer: "C", basePoints: 150 },
    // 🔴 HARD — Code Debugging & Fix-the-Bug (200 pts)
    { order: 17, difficulty: "hard", questionText: "X = np.array([1, 2, 3])\nw = np.array([[0.2], [0.5], [0.1]])\ny = X @ w\n\nWhat will fix the shape issue to make output (1,1)?", options: ["X = np.array([[1, 2, 3]])", "w = np.array([0.2, 0.5, 0.1])", "y = np.dot(w, X)", "X = X.reshape(3, 1)"], correctAnswer: "A", basePoints: 200 },
    { order: 18, difficulty: "hard", questionText: "X = [[1],[2],[3],[4]]\ny = [0,1,0]\nX_train, X_test, y_train, y_test = train_test_split(X, y)\n\nWhich option fixes the error?", options: ["y = [0,1,0,1]", "X = [[1],[2],[3]]", "X = [1,2,3]", "train_test_split(y, X)"], correctAnswer: "A", basePoints: 200 },
    { order: 19, difficulty: "hard", questionText: "a = [[1,2],[3,4]]\nb = a.copy()\nb[0][0] = 99\nprint(a)\n\nHow do you prevent modifying `a`?", options: ["import copy; b = copy.deepcopy(a)", "b = list(a)", "b = a[:]", "b = tuple(a)"], correctAnswer: "A", basePoints: 200 },
    { order: 20, difficulty: "hard", questionText: "x = [1,2,3]\ny = [1,2,3]\nif x is y:\n    print(\"Equal\")\n\nWhich fix correctly compares values?", options: ["if x == y:", "if id(x) == id(y):", "if x.equals(y):", "if list(x) is list(y):"], correctAnswer: "A", basePoints: 200 },
    { order: 21, difficulty: "hard", questionText: "def update(d, key, value):\n    temp = d\n    temp[key] = value\n    return temp\n\ndata = {\"a\":1}\nnew_data = update(data, \"b\", 2)\n\nWhat is the correct fix to avoid mutating `data`?", options: ["temp = d.copy()", "temp = dict(d)", "import copy; temp = copy.deepcopy(d)", "All of the above"], correctAnswer: "D", basePoints: 200 }
];
let timerInterval = null;
let timerSeconds = 15;
let TIMER_DURATION = 15;
let pendingAction = null;
let unsubState = null;
let unsubLeaderboard = null;
let unsubPresence = null;
let participantCount = 0;  // tracks live team count for min-1 check

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
// Listen to participant count (teams collection)
// ============================================================
function listenParticipants() {
    // Primary: count teams (more reliable than presence for "at least 1 user")
    HB.teamsRef.onSnapshot((snap) => {
        participantCount = snap.size;
        if (participantEl) participantEl.textContent = participantCount;

        // Show/hide warning about needing participants
        if (participantWarning) {
            participantWarning.style.display = participantCount === 0 ? 'block' : 'none';
        }

        // Re-evaluate button states based on participant count
        if (quizState && quizState.status) {
            updateButtonStates(quizState.status);
        }
    }, (err) => {
        console.error('Teams listener error:', err);
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

        // Admin always sees options clearly for preview.
        // Only the correct-answer highlight is hidden until revealed.
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

    // ACTIVATE requires at least 1 team
    const canActivate = s[0] && participantCount > 0;
    setButtonEnabled(btnActivate, canActivate);
    setButtonEnabled(btnReveal, s[1]);
    setButtonEnabled(btnNext, s[2]);
    setButtonEnabled(btnLeaderboard, s[3]);
    setButtonEnabled(btnEndQuiz, s[4]);

    // Timer select should be disabled during active question
    if (timerSelect) {
        timerSelect.disabled = (status === 'active');
    }
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
        "idle": { text: "READY TO ACTIVATE", dotClass: "amber" },
        "active": { text: "QUESTION LIVE", dotClass: "" },
        "revealed": { text: "ANSWER REVEALED", dotClass: "amber" },
        "ended": { text: "ENDED", dotClass: "red" },
    };
    const s = map[status] || { text: status, dotClass: "" };
    if (statusText) statusText.textContent = s.text;
    if (statusDot) statusDot.className = "qsb-dot qsb-dot-" + s.dotClass;

    // Update the question card status tag
    const qcardTag = document.getElementById("qcard-status-tag");
    if (qcardTag) {
        if (status === "idle") {
            qcardTag.textContent = "👁 PREVIEW — SET TIMER → ACTIVATE";
            qcardTag.style.color = "var(--meth-blue, #00d4ff)";
        } else if (status === "active") {
            qcardTag.textContent = "⏱ TIMER RUNNING";
            qcardTag.style.color = "#39ff14";
        } else if (status === "revealed") {
            qcardTag.textContent = "✓ ANSWER VISIBLE";
            qcardTag.style.color = "#39ff14";
        } else if (status === "ended") {
            qcardTag.textContent = "🏁 QUIZ ENDED";
            qcardTag.style.color = "#ff3e3e";
        } else {
            qcardTag.textContent = "ANSWER HIDDEN";
            qcardTag.style.color = "";
        }
    }
}

// ============================================================
// CONTROL ACTIONS
// ============================================================

// ACTIVATE OR START QUESTION – direct Firestore write (avoids CORS issues with emulator)
btnActivate && btnActivate.addEventListener("click", async () => {
    const idx = quizState.currentQuestion || 0;
    if (!questions[idx]) { showToast("No question at index " + idx, "error"); return; }

    // Check minimum 1 participant
    if (participantCount < 1) {
        showToast("⚠ At least 1 team must join before activating!", "error");
        return;
    }

    // Read timer duration from dropdown
    TIMER_DURATION = parseInt(timerSelect ? timerSelect.value : 15) || 15;

    try {
        const now = firebase.firestore.Timestamp.now();
        const endTime = firebase.firestore.Timestamp.fromMillis(now.toMillis() + TIMER_DURATION * 1000);

        await HB.quizStateRef.set({
            status: "active",
            currentQuestion: idx,
            questionStartTime: now,
            questionEndTime: endTime,
            timeLimitSeconds: TIMER_DURATION,
            totalQuestions: questions.length,
            answerRevealed: false,
            updatedAt: now
        }, { merge: true });
        showToast(`⚡ Question ${idx + 1} activated! Timer: ${TIMER_DURATION}s`);
    } catch (e) {
        showToast("Failed to start question", "error");
        console.error(e);
    }
});

// REVEAL ANSWER – direct Firestore write
btnReveal && btnReveal.addEventListener("click", async () => {
    try {
        stopTimer();
        const now = firebase.firestore.Timestamp.now();
        await HB.quizStateRef.update({
            status: "revealed",
            answerRevealed: true,
            revealedAt: now,
            updatedAt: now
        });
        showToast("✓ Answer revealed to participants.");
    } catch (e) {
        showToast("Failed to reveal answer", "error");
        console.error(e);
    }
});

// NEXT QUESTION – preview only (admin sees it, users wait until ACTIVATE)
btnNext && btnNext.addEventListener("click", async () => {
    const idx = (quizState.currentQuestion || 0) + 1;
    const total = quizState.totalQuestions || questions.length;

    if (idx >= total) {
        showToast("⚠ That was the last question! Use End Quiz.", "warn");
        return;
    }

    try {
        resetTimerUI();
        // Move to next question but keep status 'idle' so users stay on waiting screen.
        // Admin can preview the question, set the timer, then click ACTIVATE.
        await HB.quizStateRef.set({
            status: "idle",
            currentQuestion: idx,
            questionStartTime: null,
            questionEndTime: null,
            timeLimitSeconds: TIMER_DURATION,
            totalQuestions: questions.length,
            answerRevealed: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast(`📋 Question ${idx + 1} loaded for preview. Set timer and click ACTIVATE when ready.`);
    } catch (e) {
        showToast("Failed to move to next question", "error");
        console.error(e);
    }
});

// SHOW / HIDE LEADERBOARD — also syncs to Firestore so users see it
btnLeaderboard && btnLeaderboard.addEventListener("click", async () => {
    const isHidden = lbPanel.classList.contains("hidden");
    if (isHidden) {
        lbPanel.classList.remove("hidden");
        btnLeaderboard.querySelector(".btn-label").textContent = "HIDE LEADERBOARD";
    } else {
        lbPanel.classList.add("hidden");
        btnLeaderboard.querySelector(".btn-label").textContent = "SHOW LEADERBOARD";
    }
    // Sync to Firestore so users also see/hide the leaderboard
    try {
        await HB.quizStateRef.update({ showLeaderboard: isHidden });
    } catch (e) {
        console.error("Failed to sync leaderboard state:", e);
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



// LOGOUT
logoutBtn && logoutBtn.addEventListener("click", () => {
    if (confirm("Logout from admin panel?")) {
        sessionStorage.removeItem(SESSION_KEY);
        window.location.replace("index.html");
    }
});

// ============================================================
// RESTART QUIZ — clears all teams, responses, presence, resets state
// ============================================================
btnRestart && btnRestart.addEventListener("click", () => {
    pendingAction = "restart";
    confirmIcon.textContent = "🔄";
    confirmTitle.textContent = "RESTART QUIZ";
    confirmDesc.textContent = "This will DELETE all teams, their data, scores, and responses. The quiz will reset to a clean state. This cannot be undone!";
    confirmModal.classList.remove("hidden");
});

// Handle confirm for both end and restart
confirmYes && confirmYes.addEventListener("click", async () => {
    confirmModal.classList.add("hidden");

    if (pendingAction === "end") {
        try {
            stopTimer();
            const now = firebase.firestore.Timestamp.now();
            await HB.quizStateRef.update({
                status: "ended",
                questionEndTime: now,
                updatedAt: now
            });
            showToast("🏁 Quiz ended. Final leaderboard is live.");
            lbPanel.classList.remove("hidden");
        } catch (e) {
            showToast("Failed to end quiz", "error");
            console.error(e);
        }
    }

    if (pendingAction === "restart") {
        try {
            showToast("🔄 Restarting quiz... Clearing all data.", "warning");
            stopTimer();

            // Delete all teams
            const teamsSnap = await HB.teamsRef.get();
            const deletePromises = [];
            teamsSnap.forEach(doc => deletePromises.push(doc.ref.delete()));

            // Delete all responses
            const respSnap = await HB.responsesRef.get();
            respSnap.forEach(doc => deletePromises.push(doc.ref.delete()));

            // Delete all presence
            const presSnap = await HB.presenceCollection.get();
            presSnap.forEach(doc => deletePromises.push(doc.ref.delete()));

            // Delete all sessions
            const sessSnap = await HB.db.collection('sessions').get();
            sessSnap.forEach(doc => deletePromises.push(doc.ref.delete()));

            await Promise.all(deletePromises);

            // Reset quiz metadata to idle
            await HB.quizStateRef.set({
                status: 'idle',
                currentQuestion: 0,
                totalQuestions: questions.length,
                questionStartTime: null,
                questionEndTime: null,
                timeLimitSeconds: TIMER_DURATION,
                answerRevealed: false,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            resetTimerUI();
            participantCount = 0;
            if (participantEl) participantEl.textContent = '0';

            showToast("✓ Quiz restarted! All teams and data cleared.");
        } catch (e) {
            showToast("Failed to restart quiz", "error");
            console.error(e);
        }
    }

    pendingAction = null;
});

confirmNo && confirmNo.addEventListener("click", () => {
    confirmModal.classList.add("hidden");
    pendingAction = null;
});

// ============================================================
// TIMER SELECT — update TIMER_DURATION when admin changes dropdown
// ============================================================
timerSelect && timerSelect.addEventListener("change", () => {
    TIMER_DURATION = parseInt(timerSelect.value) || 15;
    timerDisplay.textContent = TIMER_DURATION;
    resetTimerUI();
    showToast(`⏱ Timer set to ${TIMER_DURATION} seconds`);
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
        const tabFlag = t.tabSwitched ? ` <span style="color:#ff3e3e;font-size:0.7rem;">⚠ TAB SWITCH</span>` : "";
        const row = document.createElement("div");
        row.className = "lb-row";
        if (t.tabSwitched) row.style.borderColor = "#ff3e3e";
        row.innerHTML = `
      <div class="lb-rank ${rCls}">${medal}</div>
      <div class="lb-name">${escHtml(t.teamName || t.name || "Unknown")}${tabFlag}</div>
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
        const tabIcon = t.tabSwitched ? ' <span style="color:#ff3e3e;">⚠</span>' : "";
        item.innerHTML = `
      <span class="p-rank ${clsMap[i] || ""}">#${rank}</span>
      <span class="p-name">${escHtml(t.teamName || t.name || "Unknown")}${tabIcon}</span>
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
