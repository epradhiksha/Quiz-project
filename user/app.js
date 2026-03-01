// user/app.js
// Redesigned for Firebase integration: authenticates anonymously, creates team
// document, listens to quiz state and submits answers via cloud function.

// --- Firebase references (initialized by shared firebase-config.js) ---
const auth = firebase.auth();
const db = firebase.firestore();
const rtdb = firebase.database();
// use same region as backend functions
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

// --- DOM elements ---
const screens = {
    login: document.getElementById('login-screen'),
    lobby: document.getElementById('lobby-screen'),
    quiz: document.getElementById('quiz-screen'),
    results: document.getElementById('results-screen')
};

// --- Authentication & presence ---
auth.onAuthStateChanged(user => {
    if (user) {
        // restore team from storage
        teamId = localStorage.getItem('teamId');
        if (teamId && teamName) populatePresence(user.uid);
    } else {
        auth.signInAnonymously().catch(console.error);
    }
});

function populatePresence(uid) {
    const pres = rtdb.ref('presence/' + uid);
    pres.set({ online: true, connectedAt: Date.now(), displayName: teamName });
    pres.onDisconnect().remove();

    const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const sessRef = rtdb.ref(`sessions/${uid}/${sessionId}`);
    sessRef.set({ deviceInfo: navigator.userAgent, connectedAt: Date.now() });
    sessRef.onDisconnect().remove();
}

// --- Initialization ---
function init() {
    document.getElementById('join-btn').onclick = handleLogin;
    document.getElementById('reboot-btn').onclick = () => location.reload();
    drawBackground();
    listenQuizState();
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

    if (!teamId) {
        const docRef = await db.collection('teams').add({
            teamName,
            score: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            members: [leadName]
        });
        teamId = docRef.id;
        localStorage.setItem('teamId', teamId);
    } else {
        await db.collection('teams').doc(teamId).set({ teamName, members: [leadName] }, { merge: true });
    }

    if (auth.currentUser) populatePresence(auth.currentUser.uid);

    switchScreen('lobby');
}

function switchScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// --- Quiz state listener ---
function listenQuizState() {
    db.doc('quiz/metadata').onSnapshot(async snap => {
        if (!snap.exists) return;
        const state = snap.data();
        const { status, currentQuestion, questionStartTime, questionEndTime, totalQuestions, answerRevealed } = state;

        if (status === 'idle') {
            // waiting for start
            return;
        }

        if (status === 'active') {
            if (currentQuestion !== currentQuestionIndex) {
                currentQuestionIndex = currentQuestion;
                currentQuestion = await fetchQuestion(currentQuestionIndex);
                displayQuestion(currentQuestion);
                hasSubmitted = false;
                switchScreen('quiz');
            }
            beginTimer(questionStartTime, questionEndTime);
            return;
        }

        if (status === 'ended') {
            endQuestion();
            if (answerRevealed && currentQuestion) revealCorrect(currentQuestion);
            if (totalQuestions && currentQuestion >= totalQuestions - 1) {
                showResults();
            }
            return;
        }

        if (status === 'revealed') {
            revealCorrect(currentQuestion);
            return;
        }
    });
}

async function fetchQuestion(idx) {
    const doc = await db.collection('questions').doc(idx.toString()).get();
    return doc.exists ? doc.data() : null;
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
        b.onclick = () => sendAnswer(i);
        stack.appendChild(b);
    });
}

function beginTimer(startStamp, endStamp) {
    if (timerInterval) clearInterval(timerInterval);
    const start = startStamp ? startStamp.toMillis() : Date.now();
    const end = endStamp ? endStamp.toMillis() : start + 15000;
    function tick() {
        const now = Date.now();
        timeRemaining = Math.max(0, (end - now) / 1000);
        document.getElementById('label-timer').textContent = timeRemaining.toFixed(1);
        const pct = (timeRemaining / 15) * 100;
        document.getElementById('timer-line').style.width = pct + '%';
        if (timeRemaining <= 0) clearInterval(timerInterval);
    }
    tick();
    timerInterval = setInterval(tick, 100);
}

function endQuestion() {
    if (timerInterval) clearInterval(timerInterval);
}

function sendAnswer(choice) {
    if (hasSubmitted || !teamId) return;
    hasSubmitted = true;
    const sms = firebase.functions().httpsCallable('submitAnswer');
    sms({ teamId, questionIndex: currentQuestionIndex, selectedOption: choice })
        .then(res => {
            console.log('submitted', res.data);
        })
        .catch(err => {
            console.error('submit error', err);
        });
}

function revealCorrect(q) {
    const btns = document.querySelectorAll('.option-node');
    btns.forEach((b, i) => {
        b.disabled = true;
        if (i === q.correctIndex) b.classList.add('correct');
    });
}

function showResults() {
    switchScreen('results');
    // optionally, fetch leaderboard
    functions.httpsCallable('getLeaderboard')().then(r => {
        console.log('leaderboard', r.data.leaderboard);
    });
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
    class Particle { constructor(){ this.reset(); } reset(){ this.x=Math.random()*w; this.y=h+10; this.s=Math.random()*2+1; this.v=Math.random()*0.5+0.5; this.o=Math.random()*0.4;} draw(){this.y-=this.v; if(this.y<-10) this.reset(); ctx.fillStyle=`rgba(57,255,20,${this.o})`; ctx.beginPath(); ctx.arc(this.x,this.y,this.s,0,Math.PI*2); ctx.fill();}};
    resize(); for(let i=0;i<50;i++) parts.push(new Particle());
    function loop(){ctx.clearRect(0,0,w,h); parts.forEach(p=>p.draw()); requestAnimationFrame(loop);} loop(); window.addEventListener('resize',resize);
}

init();
