# 🎯 Heisenbyte Real-Time Technical Quiz System

A real-time, admin-controlled technical quiz platform developed for symposium events.  
This system enables multiple teams to participate simultaneously with time-based scoring, centralized admin control, secure backend validation, and live leaderboard updates using Firebase.

---

# 📌 Project Overview

The Heisenbyte Quiz System is designed to conduct technical quiz events in a fully controlled and scalable manner.

The system allows:

- 👥 Multiple teams to participate
- 🎛 Admin to control question flow in real time
- ⏱ 15-second timer per question
- 🧮 Time-based dynamic scoring
- 🏆 Automatic leaderboard ranking
- 🔒 Secure score validation using Cloud Functions

This project follows a modular architecture with proper GitHub workflow and role-based development.

---

# 🚀 Key Features

## 👑 Admin Panel
- Secure login using Firebase Email Authentication
- Start and end quiz
- Activate questions
- Lock submissions
- Reveal correct answers
- Control question navigation
- Display leaderboard

## 👥 User Panel
- Anonymous login for fast access
- Team registration
- Real-time question updates
- 15-second countdown timer
- Single-answer submission per question
- Score display after submission

## 🧠 Backend Engine
- Prevents duplicate submissions
- Validates submission timing
- Calculates dynamic score
- Updates team scores securely
- Restricts unauthorized access

---

# 🏗 System Architecture
            Admin Panel
                 ↓
       Firestore (Quiz State)
                 ↓
    Users (Real-Time Listeners)
                 ↓
       Responses Collection
                 ↓
     Cloud Function (Scoring)
                 ↓
        Teams Score Updated
                 ↓
          Leaderboard


---

# 🛠 Tech Stack

| Component | Technology |
|------------|------------|
| Frontend | HTML, CSS, JavaScript |
| Database | Firebase Firestore |
| Authentication | Firebase Auth (Anonymous + Email) |
| Backend Logic | Firebase Cloud Functions |
| Hosting | Firebase Hosting |
| Version Control | GitHub (Branch-based workflow) |

---

# 📂 Project Structure


---

# 🗄 Firestore Database Structure

## 1️⃣ quiz (Collection)

Document: `metadata`

Fields:
- quizStatus (waiting | inProgress | ended)
- currentQuestionId
- questionStatus (inactive | active | locked | revealed)
- questionStartTime
- questionDuration

This document controls the entire quiz state.

---

## 2️⃣ questions (Collection)

Each document contains:
- questionText
- options (A, B, C, D)
- correctAnswer
- basePoints

---

## 3️⃣ teams (Collection)

Each document contains:
- teamName
- score
- createdAt

---

## 4️⃣ responses (Collection)

Each document contains:
- teamId
- questionId
- selectedAnswer
- submittedAt
- timeTaken
- pointsEarned

---

# 🔒 Security Model

✔ Users can read quiz state  
✔ Users can submit one response per question  
❌ Users cannot modify scores  
❌ Users cannot modify quiz state  
❌ Users cannot access correct answers  
✔ Only Admin can modify quiz metadata  
✔ Only Cloud Functions can update team scores  

---

# 🧮 Scoring Logic

If answer is correct:
Score = BasePoints + (RemainingTime × Multiplier)

If answer is incorrect:
Score=0 

Late submissions are automatically rejected.

Duplicate submissions are blocked.

---

# 🌿 GitHub Workflow

## Main Branches

- `main` → Production-ready code
- `develop` → Integration branch

## Feature Branches

- `feature/user-ui`
- `feature/admin-panel`
- `feature/backend-functions`

## Workflow Process

1. Create feature branch from `develop`
2. Implement module
3. Push to GitHub
4. Create Pull Request → `develop`
5. Code review and merge
6. Final merge → `main`

---

# ⚙️ Setup Instructions

## 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/heisenbyte-quiz.git
cd heisenbyte-quiz
```

## 2️⃣ Install Firebase CLI

```bash
npm install -g firebase-tools
```

## 3️⃣ Login to Firebase

```bash
firebase login
```

## 4️⃣ Initialize Firebase (First Time Only)

```bash
firebase init
```

Select:
- Firestore
- Functions
- Hosting

## 5️⃣ Run Locally

```bash
firebase emulators:start
```

## 6️⃣ Deploy to Production

```bash
firebase deploy
```
