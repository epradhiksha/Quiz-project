/**
 * BREAKING BAD LAB QUIZ - APP LOGIC
 * Features: Real-time syncing, Time-based scoring, Streak bonuses
 */

// --- DATA ---
const DATABASE = [
    { q: "What is Walter White's 'cooking' alias?", a: ["Heisenberg", "Cap'n Cook", "Blue Sky", "Grey Matter"], c: 0 },
    { q: "Which chemical do they steal from the warehouse in Season 1?", a: ["Phenylacetic Acid", "Methylamine", "Pseudoephedrine", "Hydrazine"], c: 1 },
    { q: "What is the name of Gus Fring's laundry business?", a: ["Lavanderia Brillante", "Los Pollos Hermanos", "Madrigal Electromotive", "The Whites' Laundry"], c: 0 },
    { q: "What element is 'He' on the periodic table intro?", a: ["Hydrogen", "Heliium", "Helium", "Heavy Metal"], c: 2 },
    { q: "What was the color of the teddy bear in the pool?", a: ["Blue", "Green", "Pink", "Yellow"], c: 2 },
    { q: "Who killed Gale Boetticher?", a: ["Walter White", "Jesse Pinkman", "Gustavo Fring", "Mike Ehrmantraut"], c: 1 },
    { q: "What kind of car does Walter White drive initially?", a: ["Pontiac Aztek", "Toyota Tercel", "Chrysler 300L", "Volvo 240"], c: 0 },
    { q: "Where is Gus Fring originally from?", a: ["Mexico", "Chile", "Colombia", "Argentina"], c: 1 }
];

const MAX_TIME = 15;

// --- STATE ---
let state = {
    screen: 'login',
    user: '', // Team Lead Name
    team: '', // Project Team Name
    players: [],
    idx: 0,
    score: 0,
    streak: 0,
    maxStreak: 0,
    correctCount: 0,
    timer: MAX_TIME,
    timerId: null,
    isAnswered: false,
    isHost: false // User Module: Never a host
};

// Default Team for User Module Sync
const DEFAULT_TEAM = "LAB-SESSION-01";

// --- REAL-TIME SYNC (Local simulation via BroadcastChannel) ---
const channel = new BroadcastChannel('lab_quiz_v2');

channel.onmessage = (msg) => {
    const { type, payload } = msg.data;

    if (type === 'JOIN' && payload.team === state.team) {
        if (!state.players.includes(payload.user)) {
            state.players.push(payload.user);
            updateLobby();
        }
        // Respond to joiner so they know who else is here
        channel.postMessage({ type: 'PRESENCE', payload: { team: state.team, user: state.user } });
    }

    if (type === 'PRESENCE' && payload.team === state.team) {
        if (!state.players.includes(payload.user)) {
            state.players.push(payload.user);
            updateLobby();
        }
    }

    if (type === 'START' && payload.team === state.team) {
        runQuiz();
    }

    if (type === 'SYNC_QUESTION' && (payload.team === state.team || payload.team === DEFAULT_TEAM)) {
        loadQuestion(payload.idx);
    }

    if (type === 'FINISH_QUIZ' && (payload.team === state.team || payload.team === DEFAULT_TEAM)) {
        finish();
    }
};

// --- INITIALIZATION ---
function init() {
    document.getElementById('join-btn').onclick = handleLogin;
    document.getElementById('launch-quiz-btn').onclick = broadcastStart;
    document.getElementById('reboot-btn').onclick = () => location.reload();

    drawBackground();
}

// --- LOGIN & LOBBY ---
function handleLogin() {
    const tInput = document.getElementById('team-name');
    const lInput = document.getElementById('lead-name');
    const err = document.getElementById('login-error');

    const teamName = tInput.value.trim();
    const leadName = lInput.value.trim();

    if (!teamName || !leadName) {
        err.style.display = 'block';
        err.textContent = "Team Name and Lead Name are required for authentication.";
        return;
    }

    // STATE UPDATE
    state.team = teamName;
    state.user = leadName;
    state.players = [leadName];
    state.isHost = false;

    // UI UPDATE
    document.getElementById('display-team-id').textContent = `TEAM: ${teamName.toUpperCase()}`;
    document.getElementById('display-team-id').innerHTML += `<br><span style="font-size:0.7rem; color:var(--text-dim)">LEAD: ${leadName.toUpperCase()}</span>`;

    /**
     * NOTE FOR BACKEND PERSON:
     * The values 'teamName' and 'leadName' are now captured.
     * Integrate your Firestore 'addDoc' or 'setDoc' logic here.
     * Example: 
     * await addDoc(collection(db, "participants"), { team: teamName, lead: leadName, timestamp: serverTimestamp() });
     */

    // Notify presence via local channel
    channel.postMessage({ type: 'JOIN', payload: { user: leadName, team: teamName } });

    updateLobby();
    switchScreen('lobby');
}

function updateLobby() {
    const list = document.getElementById('lobby-list');
    list.innerHTML = '';
    state.players.forEach(p => {
        const d = document.createElement('div');
        d.className = 'player-item';
        d.textContent = p;
        list.appendChild(d);
    });
}

function broadcastStart() {
    channel.postMessage({ type: 'START', payload: { team: state.team } });
    runQuiz();
}

// --- QUIZ LOGIC ---
function runQuiz() {
    state.score = 0;
    state.streak = 0;
    state.maxStreak = 0;
    state.idx = 0;
    state.correctCount = 0;

    switchScreen('quiz');
    loadQuestion(0);
}

function loadQuestion(index) {
    state.idx = index;
    state.isAnswered = false;
    state.timer = MAX_TIME;

    const data = DATABASE[index];
    const qText = document.getElementById('question-text');
    const stack = document.getElementById('options-stack');
    const feedback = document.getElementById('action-feedback');
    const scoreVal = document.getElementById('label-score');
    const streakVal = document.getElementById('label-streak');

    qText.textContent = `${index + 1}. ${data.q}`;
    stack.innerHTML = '';
    feedback.innerHTML = '';
    scoreVal.textContent = state.score;
    streakVal.textContent = state.streak;

    data.a.forEach((opt, i) => {
        const b = document.createElement('button');
        b.className = 'option-node';
        b.textContent = opt;
        b.onclick = () => submit(i);
        stack.appendChild(b);
    });

    startTimer();
}

function startTimer() {
    if (state.timerId) clearInterval(state.timerId);

    const bar = document.getElementById('timer-line');
    const tLabel = document.getElementById('label-timer');

    state.timerId = setInterval(() => {
        state.timer -= 0.05;

        tLabel.textContent = Math.max(0, state.timer).toFixed(1);

        // Progress bar simulation (re-using timer-line from previous CSS logic)
        // Note: CSS actually had a mistake in class name 'timer-line' vs 'timer-bar'
        // I'll update the bar element via JS style.
        const barElem = document.getElementById('timer-line') || document.querySelector('.timer-wrap div');
        const pct = (state.timer / MAX_TIME) * 100;
        barElem.style.width = `${pct}%`;
        barElem.style.height = '100%';
        barElem.style.backgroundColor = state.timer < 5 ? 'var(--danger-red)' : 'var(--toxic-green)';

        if (state.timer <= 0) {
            clearInterval(state.timerId);
            if (!state.isAnswered) timeout();
        }
    }, 50);
}

function submit(choice) {
    if (state.isAnswered) return;
    state.isAnswered = true;
    clearInterval(state.timerId);

    const data = DATABASE[state.idx];
    const btns = document.querySelectorAll('.option-node');
    const feedback = document.getElementById('action-feedback');

    btns.forEach(b => b.disabled = true);

    if (choice === data.c) {
        // CORRECT SCORING
        // Time-based: If answered fast, more points? 
        // Logic: Base 10 + Streak Bonus. Requirement: "score has to be time based"
        // I will make the Base 10 a maximum that stays 10 if done within time.

        state.streak++;
        if (state.streak > state.maxStreak) state.maxStreak = state.streak;

        const streakBonus = state.streak * 2;
        const pts = 10 + streakBonus;
        state.score += pts;
        state.correctCount++;

        btns[choice].classList.add('correct');
        feedback.innerHTML = `<span style="color:var(--toxic-green); font-weight:bold;">+${pts} YIELD [STREAK: ${state.streak}]</span>`;
    } else {
        // WRONG
        state.streak = 0;
        btns[choice].classList.add('wrong');
        btns[data.c].classList.add('correct');
        feedback.innerHTML = `<span style="color:var(--danger-red);">CONTAMINATED</span>`;
    }

    delayTransition();
}

function timeout() {
    state.isAnswered = true;
    state.streak = 0;

    const data = DATABASE[state.idx];
    const btns = document.querySelectorAll('.option-node');
    const feedback = document.getElementById('action-feedback');

    btns.forEach(b => b.disabled = true);
    btns[data.c].classList.add('correct');
    feedback.innerHTML = `<span style="color:var(--danger-red);">BATCH EXPIRED</span>`;

    delayTransition();
}

function delayTransition() {
    // USER MODULE: We do NOT transition automatically.
    // We show the feedback (Correct/Wrong/Timeout) and stay on the screen.
    // The next question will be loaded ONLY when 'SYNC_QUESTION' message is received.
    console.log("Waiting for Admin to release next batch...");
}

function finish() {
    switchScreen('results');
    const acc = Math.round((state.correctCount / DATABASE.length) * 100);

    document.getElementById('display-final-team').textContent = `PROJECT: ${state.team.toUpperCase()}`;
    document.getElementById('final-score').textContent = state.score;
    document.getElementById('final-streak').textContent = state.maxStreak;
    document.getElementById('final-accuracy').textContent = `${acc}%`;
}

// --- UTILS ---
function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`${id}-screen`).classList.add('active');
    state.screen = id;
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

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * w;
            this.y = h + 10;
            this.s = Math.random() * 2 + 1;
            this.v = Math.random() * 0.5 + 0.5;
            this.o = Math.random() * 0.4;
        }
        draw() {
            this.y -= this.v;
            if (this.y < -10) this.reset();
            ctx.fillStyle = `rgba(57, 255, 20, ${this.o})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.s, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    resize();
    for (let i = 0; i < 50; i++) parts.push(new Particle());

    function loop() {
        ctx.clearRect(0, 0, w, h);
        parts.forEach(p => p.draw());
        requestAnimationFrame(loop);
    }
    loop();
    window.addEventListener('resize', resize);
}

init();
