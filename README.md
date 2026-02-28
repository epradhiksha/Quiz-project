# 🧪 Heisenbyte Real-Time Quiz — Backend

**Branch:** `features/backend`

This branch contains the complete Firebase backend for the Heisenbyte Real-Time Quiz symposium app.

---

## 📁 File Structure

```
features/backend/
├── firebase.json              # Firebase deploy config (Functions + Firestore + RTDB)
├── .firebaserc                # Project alias
├── firestore.rules            # Firestore Security Rules
├── firestore.indexes.json     # Composite indexes (leaderboard, responses)
├── database.rules.json        # Realtime Database Rules (presence/sessions)
└── functions/
    ├── package.json
    ├── index.js               # All Cloud Functions
    ├── .eslintrc.json
    └── test/
        └── index.test.js      # Unit tests
```

---

## 🔐 Security Guarantees

| Threat | How it's handled |
|---|---|
| **Score tampering** | `teams.score` is written ONLY by Cloud Functions (Admin SDK). Clients get a hard deny. |
| **Duplicate submissions** | Response doc ID = `{teamId}_q{questionIndex}` — Firestore transaction rejects if doc exists |
| **Late submissions** | `submitAnswer` compares server `Timestamp.now()` to `questionEndTime` stored in `quizState` |
| **Refresh during active Q** | `quizState` is real-time; client rehydrates from Firestore on reconnect |
| **Internet disconnect** | RTDB `onDisconnect()` hook + `cleanupPresence` scheduled function sweeps stale entries |
| **Multiple device logins** | RTDB `sessions/{uid}/{sessionId}` tracks all active sessions per user |
| **Unauthorized admin actions** | All admin functions verify `request.auth.token.email === ADMIN_EMAIL` server-side |
| **Anonymous tampering** | Anonymous users can read quiz state + submit answers but cannot write quiz metadata |
| **correctIndex exposure** | Never returned to clients; only readable by Cloud Functions via Admin SDK |

---

## ⚙️ Cloud Functions

| Function | Trigger | Access |
|---|---|---|
| `submitAnswer` | HTTPS Callable | Any authenticated user |
| `startQuestion` | HTTPS Callable | **Admin only** |
| `endQuestion` | HTTPS Callable | **Admin only** |
| `resetQuiz` | HTTPS Callable | **Admin only** |
| `getLeaderboard` | HTTPS Callable | Public |
| `setAdminClaim` | HTTPS Callable | Admin email only |
| `checkAndLockQuestion` | HTTPS Callable | Any authenticated user |
| `onPresenceDeleted` | RTDB trigger | Automatic |
| `cleanupPresence` | Scheduled (every 10 min) | Automatic |

---

## 📊 Firestore Data Model

```
quizState/current           ← singleton doc
  status: "idle" | "active" | "ended" | "locked"
  currentQuestion: number
  questionStartTime: Timestamp
  questionEndTime: Timestamp

questions/{questionIndex}
  text: string
  options: string[]
  correctIndex: number      ← NEVER sent to clients (Admin SDK only)
  timeLimit: number

teams/{teamId}
  name: string
  members: string[]
  score: number             ← Cloud Functions only
  createdAt: Timestamp

responses/{teamId}_q{index}
  teamId, questionIndex, selectedOption
  isCorrect: boolean        ← Server calculated
  pointsAwarded: number     ← Server calculated
  submittedAt: Timestamp
```

---

## 🚀 Setup & Deployment

### 1. Prerequisites

```bash
npm install -g firebase-tools
firebase login
```

### 2. Update Admin Email

In `functions/index.js`, update line 30:
```js
const ADMIN_EMAIL = "your-admin@email.com";
```

Also update in `firestore.rules`, line 35.

### 3. Install Function Dependencies

```bash
cd functions
npm install
```

### 4. Run Tests

```bash
npm test
```

### 5. Local Testing with Emulator

```bash
firebase emulators:start
# Open http://localhost:4000 for Emulator UI
```

Load seed data in Emulator UI:
- Create `quizState/current` doc with `status: "idle"`
- Create test questions in `questions/` collection (include `correctIndex`)
- Create test teams in `teams/` collection

### 6. Deploy to Firebase

```bash
firebase deploy
# OR deploy specific parts:
firebase deploy --only firestore:rules
firebase deploy --only database
firebase deploy --only functions
```

---

## 🧩 Role-Based Access

| Role | What they can do |
|---|---|
| **Admin** (approved email) | Start/End/Reset quiz, manage questions, view all responses |
| **Authenticated User** | Register team, submit answers, view leaderboard |
| **Anonymous User** | View quiz state, view leaderboard, submit answers (as anonymous participant) |

> Admin identity is verified by matching `request.auth.token.email` to the `ADMIN_EMAIL` constant on the **server side** in every Cloud Function. Additionally, a custom claim `admin: true` can be set via `setAdminClaim`.

---

## 📡 Scoring Formula

```
pointsAwarded = POINTS_PER_CORRECT + floor(TIME_BONUS_MAX × (1 - elapsed/total))
             = 10 + floor(5 × timeRemainingFraction)

Answer instantly → 10 + 5 = 15 pts
Answer at 50%   → 10 + 2 = 12 pts
Answer at 99%   → 10 + 0 = 10 pts
Wrong answer    → 0 pts
```

---

## 🤝 Integration with Other Branches

- **`features/admin`** calls `startQuestion`, `endQuestion`, `resetQuiz` via Firebase SDK
- **`features/user`** calls `submitAnswer`, `getLeaderboard`, `checkAndLockQuestion`
- Both branches need to use the same Firebase project (configured in `.firebaserc`)
