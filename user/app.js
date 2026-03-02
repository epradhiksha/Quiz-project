// user/app.js
// Redesigned for Firebase integration: authenticates anonymously, creates team
// document, listens to quiz state and submits answers via cloud function.

// --- Firebase references (initialized by shared firebase-config.js) ---
// NOTE: `auth` and `db` are already declared as global `const` in
// firebase-config.js. Re-declaring them here with `const` would throw
// "Identifier has already been declared" and kill the entire script.
// We simply reference them directly; they are available globally.
// `functions` is not declared in firebase-config.js so we create it here.
const functions = firebase.app().functions('asia-south1');

// --- Local state ---
let teamId = null;
let teamName = '';
let leadName = '';
let currentQuestionIndex = null;
let currentQuestion = null;
let timerInterval = null;
let timeRemaining = 0;
let hasSubmitted = false;
let selectedAnswer = null;  // tracks the user's selected answer index
let scorePopupShown = false;  // prevent duplicate popups

// --- DOM elements ---
const screens = {
    login: document.getElementById('login-screen'),
    lobby: document.getElementById('lobby-screen'),
    quiz: document.getElementById('quiz-screen'),
    results: document.getElementById('results-screen')
};

// --- Authentication & presence ---
auth.onAuthStateChanged(user => {
    console.log('auth.onAuthStateChanged, user=', user);
    if (user) {
        // restore team from storage
        teamId = localStorage.getItem('teamId');
        teamName = localStorage.getItem('teamName') || '';
        leadName = localStorage.getItem('leadName') || '';
        if (teamId && teamName) {
            populatePresence(user.uid);
            // if the user previously joined we can skip the login screen
            switchScreen('lobby');
            document.getElementById('display-team-id').textContent = `PROJECT: ${teamName.toUpperCase()}`;
        }
    } else {
        console.log('No auth user; attempting anonymous sign-in');
        auth.signInAnonymously().then(cred => {
            console.log('Signed in anonymously:', cred && cred.user && cred.user.uid);
        }).catch(err => {
            console.error('Anonymous sign-in failed', err);
            const errEl = document.getElementById('login-error');
            if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Auth failed: ' + err.message; }
        });
    }
});

function populatePresence(uid) {
    // write basic presence info into Firestore; timestamp is server time
    const presDoc = db.collection('presence').doc(uid);
    presDoc.set({ online: true, connectedAt: firebase.firestore.FieldValue.serverTimestamp(), displayName: teamName })
        .catch(console.error);
    // (no onDisconnect equivalent in Firestore; stale entries cleaned server-side)

    const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    db.collection('sessions').doc(uid + '_' + sessionId).set({ deviceInfo: navigator.userAgent, connectedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

// --- Initialization ---
function init() {
    // ensure user is authenticated early on
    auth.signInAnonymously().catch(err => {
        console.error('Anonymous sign-in failed during init:', err);
        const errEl = document.getElementById('login-error');
        if (errEl) {
            errEl.style.display = 'block';
            errEl.textContent = 'Auth error: ' + err.message;
        }
    });

    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
        joinBtn.addEventListener('click', async (ev) => {
            try {
                ev.preventDefault && ev.preventDefault();
                console.log('join-btn clicked');
                await handleLogin();
            } catch (e) {
                console.error('Error in join handler', e);
                const err = document.getElementById('login-error');
                if (err) {
                    err.style.display = 'block';
                    err.textContent = e.message || 'Unexpected error';
                }
            }
        });
    } else {
        console.warn('join-btn element not found');
    }
    document.getElementById('reboot-btn').onclick = () => location.reload();
    drawBackground();
    // run listeners but guard for errors so UI still responds to clicks
    try { listenQuizState(); } catch (e) { console.error('listenQuizState failed', e); }
    try { listenTeamsJoined(); } catch (e) { console.error('listenTeamsJoined failed', e); }
    try { listenTeamDeleted(); } catch (e) { console.error('listenTeamDeleted failed', e); }
    try { listenUserLeaderboard(); } catch (e) { console.error('listenUserLeaderboard failed', e); }
    setupTabSwitchDetection();
}

// --- Tab-switch / page-leave detection ---
function setupTabSwitchDetection() {
    let quizIsActive = false;

    // Listen to quiz state to know if a question is active
    db.doc('quiz/metadata').onSnapshot(snap => {
        if (!snap.exists) { quizIsActive = false; return; }
        const status = snap.data().status;
        const activeStatuses = ['active', 'LIVE', 'QUESTION_ACTIVE'];
        quizIsActive = activeStatuses.includes(status);
    });

    // Detect tab switching via Page Visibility API
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden && quizIsActive && teamId) {
            console.warn('⚠ Tab switch detected during active quiz!');
            await handleTabSwitch();
        }
    });

    // Detect page unload (closing tab, navigating away)
    window.addEventListener('beforeunload', (e) => {
        if (quizIsActive && teamId) {
            // Mark tab switch in Firestore (fire-and-forget via sendBeacon not available for Firestore)
            // The visibilitychange handler above will catch most cases
            e.returnValue = 'You will be disqualified if you leave during the quiz!';
        }
    });
}

async function handleTabSwitch() {
    try {
        // 1. Flag the team as "tab switched" so admin sees it
        if (teamId) {
            await db.collection('teams').doc(teamId).update({
                tabSwitched: true,
                tabSwitchedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // 2. Remove the team from the quiz
        if (teamId) {
            await db.collection('teams').doc(teamId).delete();
        }

        // 3. Clear local session
        localStorage.removeItem('teamId');
        localStorage.removeItem('teamName');
        localStorage.removeItem('leadName');
        teamId = null;

        // 4. Show the disqualified overlay
        const overlay = document.getElementById('kicked-overlay');
        if (overlay) overlay.classList.remove('hidden');

    } catch (e) {
        console.error('Error handling tab switch:', e);
        // Still show the overlay even if Firestore operations fail
        const overlay = document.getElementById('kicked-overlay');
        if (overlay) overlay.classList.remove('hidden');
    }
}

// --- Detect quiz restart (team deleted by admin) ---
function listenTeamDeleted() {
    // Only listen if we have a teamId from localStorage
    const storedTeamId = localStorage.getItem('teamId');
    if (!storedTeamId) return;

    db.collection('teams').doc(storedTeamId).onSnapshot(snap => {
        if (!snap.exists && teamId) {
            // Team was deleted (admin restarted quiz)
            console.log('⚠ Team deleted — quiz was restarted by admin');
            localStorage.removeItem('teamId');
            localStorage.removeItem('teamName');
            localStorage.removeItem('leadName');
            teamId = null;
            teamName = '';
            leadName = '';
            switchScreen('login');
            const errEl = document.getElementById('login-error');
            if (errEl) {
                errEl.style.display = 'block';
                errEl.textContent = 'Quiz was restarted by admin. Please rejoin.';
                errEl.style.color = 'var(--meth-blue)';
            }
        }
    });
}

// --- Login / team creation ---
async function handleLogin() {
    const tInput = document.getElementById('team-name');
    const lInput = document.getElementById('lead-name');
    const err = document.getElementById('login-error');

    teamName = tInput.value.trim();
    leadName = lInput.value.trim();
    if (!teamName || !leadName) {
        err.style.display = 'block';
        err.textContent = 'Team and lead are required';
        return;
    }

    document.getElementById('display-team-id').textContent = `PROJECT: ${teamName.toUpperCase()}`;
    err.style.display = 'none';

    try {
        console.log('handleLogin: starting with teamId=', teamId);
        // If we already have a teamId in localStorage respect that.
        if (!teamId) {
            // Check if a team with this name already exists. If so, join it.
            const existing = await db.collection('teams').where('teamName', '==', teamName).limit(1).get();
            if (!existing.empty) {
                const doc = existing.docs[0];
                teamId = doc.id;
                console.log('handleLogin: found existing team, joining:', teamId);
                // Merge lead into members array if not present
                const data = doc.data();
                const members = Array.isArray(data.members) ? data.members.slice() : [];
                if (leadName && !members.includes(leadName)) members.unshift(leadName);
                await db.collection('teams').doc(teamId).set({ teamName, members }, { merge: true });
                localStorage.setItem('teamId', teamId);
                localStorage.setItem('teamName', teamName);
                localStorage.setItem('leadName', leadName);
                console.log('✓ Joined existing team:', { teamId, teamName, leadName });
            } else {
                // No existing team — create on the spot
                console.log('handleLogin: creating new team:', teamName);
                const docRef = await db.collection('teams').add({
                    teamName,
                    score: 0,
                    createdAt: new Date(),
                    members: [leadName]
                });
                teamId = docRef.id;
                console.log('✓ Team created successfully in Firestore with ID:', teamId);
                localStorage.setItem('teamId', teamId);
                localStorage.setItem('teamName', teamName);
                localStorage.setItem('leadName', leadName);
            }
        } else {
            console.log('handleLogin: updating existing team from storage:', teamId);
            await db.collection('teams').doc(teamId).set({ teamName, members: [leadName] }, { merge: true });
            console.log('✓ Team updated successfully in Firestore');
            localStorage.setItem('teamName', teamName);
            localStorage.setItem('leadName', leadName);
        }

        console.log('handleLogin: calling populatePresence, auth.currentUser=', auth.currentUser);
        if (auth.currentUser) populatePresence(auth.currentUser.uid);

        // move into the lobby immediately, we don't care what the quiz state is
        console.log('handleLogin: switching to lobby');
        switchScreen('lobby');
        console.log('✓ Switched to lobby successfully');
    } catch (e) {
        console.error('✗ Login failed:', e);
        err.style.display = 'block';
        err.textContent = 'Unable to join: ' + (e.message || 'unknown error');
    }
}

function switchScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// --- Listen to all teams joined (for lobby display) ---
function listenTeamsJoined() {
    db.collection('teams').onSnapshot(snap => {
        const lobbyList = document.getElementById('lobby-list');
        lobbyList.innerHTML = '';

        snap.forEach(doc => {
            const data = doc.data();
            const badge = document.createElement('div');
            badge.className = 'team-badge';
            badge.style.cssText = 'display: inline-block; background: #1a1a1a; border: 1px solid #39ff14; color: #39ff14; padding: 8px 12px; margin: 4px; border-radius: 4px; font-size: 0.9rem; font-family: monospace;';
            badge.textContent = `${data.teamName.toUpperCase()} · ${data.members ? data.members[0] : 'N/A'}`;
            lobbyList.appendChild(badge);
        });

        console.log('Teams in lobby:', snap.size);
    }, err => {
        console.error('Error listening to teams:', err);
    });
}

// --- Quiz state listener ---
function listenQuizState() {
    db.doc('quiz/metadata').onSnapshot(async snap => {
        // if the metadata document hasn't been created yet we'll treat
        // that exactly the same as an "idle"/waiting state.
        if (!snap.exists) {
            if (teamId) switchScreen('lobby');
            return;
        }

        const state = snap.data();
        // IMPORTANT: rename destructured currentQuestion to stateQuestionIdx
        // to avoid shadowing the module-level `currentQuestion` variable
        const stateQuestionIdx = state.currentQuestion;
        const status = state.status;
        const questionStartTime = state.questionStartTime;
        const questionEndTime = state.questionEndTime;
        const totalQuestions = state.totalQuestions;
        const timeLimitSeconds = state.timeLimitSeconds || 15;
        const answerRevealed = state.answerRevealed;

        // Handle leaderboard visibility from admin toggle (runs for ALL statuses)
        const lbOverlay = document.getElementById('user-leaderboard');
        if (lbOverlay) {
            if (state.showLeaderboard) {
                lbOverlay.classList.remove('hidden');
            } else {
                lbOverlay.classList.add('hidden');
            }
        }

        // the admin panel uses a slightly different set of status strings
        const waitingStatuses = ['idle', 'waiting', 'NOT_STARTED'];
        if (waitingStatuses.includes(status)) {
            if (teamId) switchScreen('lobby');
            return;
        }

        // when the quiz goes live we switch into the question screen
        const activeStatuses = ['active', 'LIVE', 'QUESTION_ACTIVE'];
        if (activeStatuses.includes(status)) {
            if (stateQuestionIdx !== currentQuestionIndex || !currentQuestion) {
                currentQuestionIndex = stateQuestionIdx;
                currentQuestion = await fetchQuestion(currentQuestionIndex);
                displayQuestion(currentQuestion);
                hasSubmitted = false;
                selectedAnswer = null;
                scorePopupShown = false;
            }
            switchScreen('quiz');
            beginTimer(questionStartTime, questionEndTime, timeLimitSeconds);
            return;
        }

        if (status === 'ended') {
            endQuestion();
            if (answerRevealed && currentQuestion) revealCorrect(currentQuestion);
            if (totalQuestions && stateQuestionIdx >= totalQuestions - 1) {
                showResults();
            }
            return;
        }

        if (status === 'revealed') {
            endQuestion();
            if (currentQuestion) {
                revealCorrect(currentQuestion);
                showScorePopup(currentQuestion);
            }
            return;
        }
    });
}

async function fetchQuestion(idx) {
    // Firestore stores questions with auto-generated IDs but an `order` field.
    const qQuery = await db.collection('questions').where('order', '==', idx).limit(1).get();
    if (qQuery.empty) return null;
    const data = qQuery.docs[0].data();
    // convert letter answer to numeric index for convenience
    let correctIndex = null;
    if (typeof data.correctAnswer === 'number') correctIndex = data.correctAnswer;
    else if (typeof data.correctAnswer === 'string') {
        const map = { A: 0, B: 1, C: 2, D: 3 };
        correctIndex = map[data.correctAnswer.trim().toUpperCase()] ?? null;
    }
    return { ...data, correctIndex };
}

function displayQuestion(q) {
    if (!q) return;
    const qText = document.getElementById('question-text');
    const stack = document.getElementById('options-stack');
    qText.textContent = q.questionText || q.question || '...';
    stack.innerHTML = '';
    q.options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.className = 'option-node';
        b.textContent = opt;
        b.dataset.index = i;
        b.onclick = () => sendAnswer(i, b);
        stack.appendChild(b);
    });
}

function beginTimer(startStamp, endStamp, timeLimitSec) {
    if (timerInterval) clearInterval(timerInterval);
    const totalDuration = timeLimitSec || 15;
    const start = startStamp ? startStamp.toMillis() : Date.now();
    const end = endStamp ? endStamp.toMillis() : start + totalDuration * 1000;
    function tick() {
        const now = Date.now();
        timeRemaining = Math.max(0, (end - now) / 1000);
        document.getElementById('label-timer').textContent = timeRemaining.toFixed(1);
        const pct = (timeRemaining / totalDuration) * 100;
        document.getElementById('timer-line').style.width = pct + '%';
        if (timeRemaining <= 0) clearInterval(timerInterval);
    }
    tick();
    timerInterval = setInterval(tick, 100);
}

function endQuestion() {
    if (timerInterval) clearInterval(timerInterval);
}

function sendAnswer(choice, clickedBtn) {
    if (hasSubmitted || !teamId) return;
    hasSubmitted = true;
    selectedAnswer = choice;  // Track what the user picked

    // 1. Visual feedback: highlight the selected option and lock all
    const allBtns = document.querySelectorAll('.option-node');
    allBtns.forEach(b => {
        b.disabled = true;  // Lock ALL buttons so user can't change answer
    });

    // Highlight the selected one
    if (clickedBtn) {
        clickedBtn.classList.add('selected');
    }

    // 2. Save the answer directly to Firestore
    const answerKey = ['A', 'B', 'C', 'D'][choice] || choice;
    const isCorrect = currentQuestion && currentQuestion.correctIndex === choice;

    db.collection('responses').add({
        teamId: teamId,
        teamName: teamName,
        questionIndex: currentQuestionIndex,
        selectedOption: choice,
        selectedAnswer: answerKey,
        isCorrect: isCorrect,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        console.log('✓ Answer submitted:', answerKey, isCorrect ? '(correct)' : '(wrong)');

        // Update team score if answer is correct
        if (isCorrect) {
            db.collection('teams').doc(teamId).update({
                score: firebase.firestore.FieldValue.increment(10)
            }).then(() => console.log('✓ Score updated +10'));
        }

        // 3. Show instant score popup
        showScorePopup(currentQuestion);

    }).catch(err => {
        console.error('Submit error:', err);
        hasSubmitted = false;
        selectedAnswer = null;
        allBtns.forEach(b => {
            b.disabled = false;
        });
        if (clickedBtn) clickedBtn.classList.remove('selected');
    });
}

function revealCorrect(q) {
    const btns = document.querySelectorAll('.option-node');
    btns.forEach((b, i) => {
        b.disabled = true;
        if (i === q.correctIndex) {
            b.classList.add('correct');
        } else if (i === selectedAnswer && i !== q.correctIndex) {
            // Mark the user's wrong answer in red
            b.classList.add('wrong');
        }
    });
}

// --- Score popup when answer is revealed ---
function showScorePopup(q) {
    if (scorePopupShown || selectedAnswer === null) return;
    scorePopupShown = true;

    const popup = document.getElementById('score-popup');
    const popupValue = document.getElementById('score-popup-value');
    const popupLabel = document.getElementById('score-popup-label');
    if (!popup || !popupValue || !popupLabel) return;

    const isCorrect = q && q.correctIndex === selectedAnswer;

    if (isCorrect) {
        popupValue.textContent = '+10';
        popupValue.className = 'score-popup-value';
        popupLabel.textContent = 'CORRECT!';
        popupLabel.style.color = '#39ff14';
    } else {
        popupValue.textContent = '0';
        popupValue.className = 'score-popup-value wrong';
        popupLabel.textContent = 'WRONG ANSWER';
        popupLabel.style.color = '#ff3e3e';
    }

    // Force animation restart by toggling display
    popup.classList.add('hidden');
    void popup.offsetHeight; // force reflow
    popup.classList.remove('hidden');

    // Update the BATCH YIELD score display
    if (isCorrect) {
        const scoreEl = document.getElementById('label-score');
        if (scoreEl) scoreEl.textContent = parseInt(scoreEl.textContent || '0') + 10;
    }

    // Auto-hide after 3 seconds
    setTimeout(() => {
        popup.classList.add('hidden');
    }, 3000);
}

// --- User leaderboard listener ---
function listenUserLeaderboard() {
    db.collection('teams').orderBy('score', 'desc').onSnapshot(snap => {
        const lbList = document.getElementById('user-lb-list');
        if (!lbList) return;
        lbList.innerHTML = '';

        if (snap.empty) {
            lbList.innerHTML = '<div style="text-align:center;padding:20px;color:#888;font-family:monospace;">No teams yet</div>';
            return;
        }

        snap.docs.forEach((doc, i) => {
            const data = doc.data();
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            const rankCls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
            const isMe = doc.id === teamId;

            const row = document.createElement('div');
            row.className = 'user-lb-row' + (isMe ? ' my-team' : '');
            row.innerHTML = `
                <span class="user-lb-rank ${rankCls}">${medal}</span>
                <span class="user-lb-name">${data.teamName || 'Unknown'}${isMe ? ' (YOU)' : ''}</span>
                <span class="user-lb-score">${data.score || 0} pts</span>
            `;
            lbList.appendChild(row);
        });
    });
}

function showResults() {
    switchScreen('results');
    // Fetch team score for final display
    if (teamId) {
        db.collection('teams').doc(teamId).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                const scoreEl = document.getElementById('final-score');
                if (scoreEl) scoreEl.textContent = data.score || 0;
            }
        });
    }
}

function drawBackground() {
    const container = document.getElementById('background-canvas');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    container.appendChild(canvas);
    let w, h;
    let parts = [];
    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }
    class Particle { constructor() { this.reset(); } reset() { this.x = Math.random() * w; this.y = h + 10; this.s = Math.random() * 2 + 1; this.v = Math.random() * 0.5 + 0.5; this.o = Math.random() * 0.4; } draw() { this.y -= this.v; if (this.y < -10) this.reset(); ctx.fillStyle = `rgba(57,255,20,${this.o})`; ctx.beginPath(); ctx.arc(this.x, this.y, this.s, 0, Math.PI * 2); ctx.fill(); } };
    resize(); for (let i = 0; i < 50; i++) parts.push(new Particle());
    function loop() { ctx.clearRect(0, 0, w, h); parts.forEach(p => p.draw()); requestAnimationFrame(loop); } loop(); window.addEventListener('resize', resize);
}

// Ensure init runs after DOM is ready
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
} else {
    // already ready
    init();
}
