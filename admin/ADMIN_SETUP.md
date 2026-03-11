# ⚗️ HEISENBYTE ADMIN PANEL — Setup Guide

## 🚀 Quick Start (3 Steps)

### Step 1 — Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add Project** → name it `heisenbyte-quiz`
3. Disable Google Analytics (optional) → **Create Project**

Enable these services:
- **Firestore Database** → Start in **Test Mode** first
- **Realtime Database** → Start in **Test Mode** first
- **Authentication** → Enable **Email/Password** provider

---

### Step 2 — Configure Firebase in the App

Open `admin/js/firebase-config.js` and replace the placeholder values:

```js
const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",          // ← from Firebase console
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

**Where to find this config:**
- Firebase Console → Your Project → ⚙️ Project Settings → **Your apps** → Web app → **SDK setup and configuration** → select **Config**

---

### Step 3 — Add Admin User in Firebase Auth

Since we use Firebase Auth for secure admin writes:

1. Firebase Console → **Authentication** → Users → **Add User**
2. Email: `admin@example.com`
3. Password: `admin123`

> **Note:** The frontend hardcodes these credentials. The Firebase Auth user allows the admin to write to protected Firestore collections.

---

## 🌱 Seed the Database

1. Open `admin/seed.html` in your browser
2. Click **🌱 SEED QUESTIONS** — this adds 10 sample questions to Firestore
3. Click **🔄 RESET QUIZ STATE** — this initializes the quiz document

---

## 🔐 Deploy Security Rules

### Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### Firestore Rules (Realtime Database no longer used)
```bash
firebase deploy --only database
```

---

## 🎮 Admin Panel Flow

```
admin/index.html   →  Login Page
       ↓
admin/lobby.html   →  Admin Lobby (shows participant count, Start Quiz button)
       ↓
admin/control.html →  Live Control Panel
```

### Control Panel Button Logic

| Button | Enabled When | Action |
|--------|-------------|--------|
| **Activate Question** | Status = LIVE | Pushes question to users, starts 15s timer |
| **Reveal Answer** | Status = QUESTION_ACTIVE | Shows correct answer, locks submissions |
| **Next Question** | Status = ANSWER_REVEALED | Advances to next question |
| **Show Leaderboard** | Always | Toggles live leaderboard panel |
| **End Quiz** | Status ≠ QUESTION_ACTIVE | Ends session, final leaderboard shown |

---

## 🗄 Firestore Data Structure

### `quiz/metadata` (Document)
```json
{
  "status": "NOT_STARTED",
  "currentQuestionIndex": 0,
  "questionTotal": 10,
  "startedAt": null,
  "timerStart": null,
  "timerDuration": 15
}
```

### `questions/{id}` (Collection)
```json
{
  "order": 0,
  "questionText": "Which data structure uses LIFO?",
  "options": ["Queue", "Stack", "Linked List", "Tree"],
  "correctAnswer": "B",
  "basePoints": 100
}
```

### `teams/{id}` (Collection)
```json
{
  "teamName": "Team Alpha",
  "score": 450,
  "createdAt": "timestamp"
}
```

---

## 📁 File Structure

```
Quiz-project/
├── admin/
│   ├── index.html        ← Login page
│   ├── lobby.html        ← Admin Lobby
│   ├── control.html      ← Live Control Panel
│   ├── seed.html         ← Database seeder tool
│   ├── css/
│   │   └── admin.css     ← Full Breaking Bad theme
│   └── js/
│       ├── firebase-config.js  ← Firebase init (edit this!)
│       ├── auth.js             ← Login validation
│       ├── lobby.js            ← Lobby real-time logic
│       └── control.js          ← Control panel engine
├── firestore.rules       ← Firestore security rules
├── database.rules.json   ← (unused; previous RTDB rules)└── README.md
```

---

## 🎨 Theme

**Breaking Bad** style:
- Background: `#0a0a0a` (near black)
- Primary: `#00ff41` (neon toxic green)
- Danger: `#ff3333` (red)
- Warning: `#ffaa00` (amber)
- Font: Orbitron (titles), Share Tech Mono (code), Rajdhani (UI)

---

## ⚠️ Important Notes

1. **Firebase config is public** — use Firestore security rules (already provided) to protect data
2. **Admin credentials are hardcoded** — suitable for closed symposium events, not for production SaaS
3. **Questions load order** — add an `order` field (number) to each question document for consistent ordering
4. **Timer sync** — the 15-second timer uses `serverTimestamp` to stay in sync across devices
