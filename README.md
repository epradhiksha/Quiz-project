# 🎯 Heisenbyte Real-Time Technical Quiz System

> **Last Updated:** 7 March 2026

A real-time, admin-controlled technical quiz platform built for symposium and hackathon events.  
Teams compete simultaneously with time-based scoring, live leaderboard updates, and a secure Firebase backend that validates every submission server-side.

---

## 📌 Project Overview

The Heisenbyte Quiz System is designed to conduct technical quiz events in a fully controlled and scalable manner.

The system allows:

- 👥 Multiple teams to register and participate simultaneously
- 🎛️ Admin to control the entire question flow in real time
- ⏱️ Automatic 15–30 second countdown timer per question
- 🏆 Live leaderboard ranking with time-bonus scoring
- 🔒 Secure server-side score calculation via Cloud Functions
- 🚫 Duplicate & late submission prevention using Firestore transactions
- 🔄 Full quiz reset capability (scores, responses, leaderboard)

---

## 🚀 Key Features

### 👑 Admin Panel (`/admin`)
| Feature | Description |
|---|---|
| Secure Login | Firebase Email/Password Authentication |
| Start Question | Activates a question with a configurable time limit |
| End Question | Locks submissions early (before timer expires) |
| Reveal Answer | Unmasks the correct option for participants |
| Reset Quiz | Clears all responses, scores, and leaderboard |
| Live Lobby | View connected teams and participant count |
| Leaderboard | Real-time ranked score display |

### 👥 User Panel (`/user`)
| Feature | Description |
|---|---|
| Anonymous Login | Fast access without account creation |
| Team Registration | Register with a team name |
| Live Question Feed | Real-time question updates via Firestore listeners |
| Countdown Timer | Synced server-side timer displayed per question |
| Single Submission | Only one answer accepted per team per question |
| Score Feedback | Immediate result shown after submission |
| Rejoin Support | Users can rejoin after an admin-triggered restart |

### 🧠 Backend Engine (`/functions`)
| Feature | Description |
|---|---|
| `submitAnswer` | Validates & records answers, calculates score atomically |
| `startQuestion` | Sets quiz state to `active` with server timestamps |
| `endQuestion` | Sets quiz state to `ended`, blocking further submissions |
| `revealAnswer` | Sets quiz state to `revealed` for client unmask |
| `resetQuiz` | Destructive full reset of all quiz data |
| `getLeaderboard` | Returns top 50 teams sorted by score |
| `setAdminClaim` | One-time setup: grants admin custom claim |
| `checkAndLockQuestion` | Auto-locks question when server timer expires |
| `cleanupPresence` | Scheduled (every 10 min): removes stale presence entries |
| `onPresenceDeleted` | Firestore trigger: marks participant offline on disconnect |

---

## 🏗️ System Architecture

```
Admin Panel (Browser)
        │
        ▼
Firebase Cloud Functions  ◄──── Security & Validation Layer
        │
        ▼
Firestore: quiz/metadata  ◄──── Single source of quiz state
        │
        ▼
User Clients (Real-Time Listeners)
        │
        ▼
Firestore: responses/{teamId_qN}  ◄──── Atomic transaction write
        │
        ▼
Firestore: teams/{teamId}.score   ◄──── FieldValue.increment (atomic)
        │
        ▼
Firestore: leaderboard  ◄──── Queried & ranked on getLeaderboard
```

---

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Database | Firebase Firestore (asia-south1) |
| Authentication | Firebase Auth — Anonymous + Email/Password |
| Backend Logic | Firebase Cloud Functions v2 (Node.js) |
| Hosting | Firebase Hosting |
| Version Control | GitHub (`epradhiksha/Quiz-project`) |

---

## 📂 Project Structure

```
Quiz-project/
├── admin/                      # Admin panel (protected route)
│   ├── index.html              # Admin login page
│   ├── control.html            # Quiz control dashboard
│   ├── lobby.html              # Participant lobby view
│   ├── seed.html               # Question seeder UI
│   ├── ADMIN_SETUP.md          # Admin-specific setup guide
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── auth.js             # Admin login / logout
│       ├── control.js          # Question flow, leaderboard control
│       ├── lobby.js            # Live lobby participant view
│       └── firebase-config.js  # Shared Firebase initialisation
│
├── user/                       # Participant-facing app
│   ├── index.html              # User quiz page
│   ├── app.js                  # All user-side logic (auth, answers, timer)
│   └── styles.css
│
├── functions/                  # Firebase Cloud Functions
│   ├── index.js                # All callable & scheduled functions
│   ├── package.json
│   └── .eslintrc.json
│
├── firebase.json               # Firebase project configuration
├── firestore.rules             # Firestore security rules
├── firestore.indexes.json      # Composite index definitions
├── database.rules.json         # Realtime Database rules (legacy)
├── .firebaserc                 # Active Firebase project alias
├── netlify.toml                # Netlify deployment config (optional)
└── package.json
```

---

## 🗄️ Firestore Data Model

### `quiz/metadata` — Quiz State Document
Controls the **entire** quiz in real time.

| Field | Type | Values |
|---|---|---|
| `status` | string | `idle` · `active` · `ended` · `revealed` |
| `currentQuestion` | number | Index of the active question (0-based) |
| `questionStartTime` | Timestamp | Server-set when question starts |
| `questionEndTime` | Timestamp | Server-set deadline for submissions |
| `timeLimitSeconds` | number | Duration of the question window |
| `answerRevealed` | boolean | `true` after admin reveals answer |
| `updatedAt` | Timestamp | Last state change timestamp |

---

### `questions/{docId}` — Question Bank
| Field | Type | Description |
|---|---|---|
| `order` | number | 0-based question index (used to query by `currentQuestion`) |
| `questionText` | string | The question prompt |
| `options` | array | `[optionA, optionB, optionC, optionD]` |
| `correctAnswer` | string \| number | Letter (`'A'`–`'D'`) or index (`0`–`3`) |
| `basePoints` | number | Base score for a correct answer |
| `difficulty` | string | `Easy` · `Medium` · `Hard` |

---

### `teams/{teamId}` — Registered Teams
| Field | Type | Description |
|---|---|---|
| `teamName` | string | Display name of the team |
| `score` | number | Cumulative score (updated atomically) |
| `members` | array | Optional list of member names |
| `createdAt` | Timestamp | Registration timestamp |
| `lastAnsweredAt` | Timestamp | Timestamp of last submission |

---

### `responses/{teamId_qN}` — Submission Log
Composite ID format: `{teamId}_q{questionIndex}` (enforces uniqueness).

| Field | Type | Description |
|---|---|---|
| `teamId` | string | Reference to the team |
| `questionIndex` | number | Which question was answered |
| `selectedOption` | number | Option index chosen (0–3) |
| `submittedAt` | Timestamp | Server-recorded submission time |
| `isCorrect` | boolean | Server-computed correctness flag |
| `pointsAwarded` | number | Points granted (0 if wrong) |
| `uid` | string | Firebase UID of the submitter |

---

### `presence/{uid}` — Live Presence Tracking
| Field | Type | Description |
|---|---|---|
| `connectedAt` | Timestamp | When the client connected |
| `teamId` | string | Associated team |

Stale entries (> 15 min) are swept by the `cleanupPresence` scheduled function.

---

## 🔒 Security Model

| Rule | Who |
|---|---|
| ✅ Read quiz state | Anyone authenticated |
| ✅ Submit one answer per question | Authenticated users (enforced in Cloud Function) |
| ✅ Read leaderboard | Anyone authenticated |
| ❌ Write scores directly | **No one** — only Cloud Functions via Admin SDK |
| ❌ Read `correctAnswer` via client | **Blocked** — only Admin SDK reads it |
| ❌ Modify quiz metadata | Only admin (email/claim verified server-side) |
| ❌ Submit after deadline | Rejected via server timestamp comparison |
| ❌ Submit duplicate answer | Rejected via Firestore atomic transaction |

> **Note:** Firestore rules currently expire **31 March 2026**. Update `firestore.rules` before that date.

---

## 🧮 Scoring Logic

```
If answer is correct:
    pointsAwarded = BASE_POINTS (10) + TIME_BONUS

    TIME_BONUS = floor(5 × (1 − elapsedMs / totalTimeMs))
    → Maximum bonus: 5 pts (instant answer)
    → Minimum bonus: 0 pts (answer at last second)

If answer is incorrect:
    pointsAwarded = 0
```

- Late submissions are **automatically rejected** (server clock comparison).
- Duplicate submissions are **blocked atomically** via Firestore transactions.
- Scores are **incremented atomically** using `FieldValue.increment`.

---

## 🌿 GitHub Workflow

### Branches
- `main` → Production-ready, deployed code
- `feature/user-ui` → User-facing UI changes
- `feature/admin-panel` → Admin control panel changes
- `feature/backend-functions` → Cloud Function changes

### Process
1. Branch off `main` for a new feature
2. Implement and test locally with the emulator
3. Push branch to GitHub
4. Open a Pull Request → `main`
5. Review, approve, and merge
6. Deploy with `firebase deploy`

---

## ⚙️ Setup & Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [Firebase CLI](https://firebase.google.com/docs/cli) v12+
- A Firebase project with **Firestore**, **Authentication**, **Functions**, and **Hosting** enabled

---

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/epradhiksha/Quiz-project.git
cd Quiz-project
```

### 2️⃣ Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 3️⃣ Install Cloud Function Dependencies
```bash
cd functions
npm install
cd ..
```

### 4️⃣ Login & Select Project
```bash
firebase login
firebase use heisenbyte-quiz
```

### 5️⃣ Run Locally with Emulators
```bash
firebase emulators:start
```

| Service | Local URL |
|---|---|
| Emulator UI | http://localhost:4000 |
| Hosting (User App) | http://localhost:5000 |
| Admin Panel | http://localhost:5000/admin |
| Firestore | http://localhost:8080 |
| Auth | http://localhost:9099 |
| Cloud Functions | http://localhost:5001 |

---

### 6️⃣ Seed Questions
Navigate to **http://localhost:5000/admin/seed.html** and use the seeder UI to populate the `questions` collection.

---

### 🧪 Test Scenarios (Emulator)

1. Sign in as admin (`jecaids@gmail.com`) and call `startQuestion` / `endQuestion` / `revealAnswer`.
2. Open a second browser tab, login anonymously as a user, join a team, and follow the live quiz.
3. Submit answers rapidly, attempt duplicates or late submissions — the Cloud Function must reject them.
4. Verify the `correctAnswer` field is **not readable** from a regular client session.
5. Confirm leaderboard updates in real time and that unauthorized score writes are blocked.

---

## 🚢 Deployment

```bash
# Deploy everything (rules, functions, hosting)
firebase deploy

# Deploy only Cloud Functions
firebase deploy --only functions

# Deploy only Hosting
firebase deploy --only hosting

# Deploy only Firestore rules
firebase deploy --only firestore:rules
```

---

## 👥 Contributors

- **epradhiksha** — Project Lead, Full-Stack Development

---

## 📄 License

ISC © 2026 Heisenbyte Quiz Team
