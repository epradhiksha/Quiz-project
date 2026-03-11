// ============================================================
// HEISENBYTE Admin — Authentication Module
// Hardcoded credentials validated client-side
// ============================================================

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "admin123";

const SESSION_KEY = "hb_admin_session";

// ---- DOM refs ----
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("admin-email");
const passInput = document.getElementById("admin-password");
const errorMsg = document.getElementById("error-msg");
const loginBtn = document.getElementById("login-btn");
const btnText = document.getElementById("btn-text");
const btnLoader = document.getElementById("btn-loader");

// ---- Prevent back-nav if already logged-in ----
if (sessionStorage.getItem(SESSION_KEY) === "true") {
    window.location.replace("lobby.html");
}

// ---- Form submit ----
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);

    const email = emailInput.value.trim();
    const pass = passInput.value.trim();

    // Small artificial delay for UX polish
    await sleep(700);

    if (email === ADMIN_EMAIL && pass === ADMIN_PASSWORD) {
        try {
            // Sign into Firebase Auth so Cloud Functions can verify admin identity.
            // In emulator mode, the auth emulator will auto-create the user if needed.
            await auth.signInWithEmailAndPassword(email, pass).catch(async (err) => {
                if (err.code === 'auth/user-not-found') {
                    // First time: create the user in the emulator
                    await auth.createUserWithEmailAndPassword(email, pass);
                } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                    // Emulator may have a different password; recreate
                    // For emulator mode, we just create a new account
                    try {
                        await auth.createUserWithEmailAndPassword(email, pass);
                    } catch (createErr) {
                        // If the account already exists with a different password in the emulator,
                        // just log the warning and continue (session auth will still work)
                        console.warn('Firebase Auth sign-in issue (emulator):', createErr.message);
                    }
                } else {
                    throw err;
                }
            });
            console.log('✓ Admin signed into Firebase Auth:', auth.currentUser?.uid);
        } catch (authErr) {
            console.warn('Firebase Auth sign-in warning:', authErr.message);
            // In emulator mode, even if auth fails, we can still proceed with session-based auth
            // The cloud functions may fail, but the admin panel UI will work
        }

        sessionStorage.setItem(SESSION_KEY, "true");
        // Flash success before redirect
        loginBtn.style.background = "#00ff41";
        btnText.textContent = "ACCESS GRANTED";
        await sleep(500);
        window.location.replace("lobby.html");
    } else {
        setLoading(false);
        showError("⚠ Invalid credentials. Access denied.");
        passInput.value = "";
        passInput.focus();
        // Dramatic red flash
        loginBtn.classList.add("btn-danger");
        loginBtn.classList.remove("btn-primary");
        setTimeout(() => {
            loginBtn.classList.remove("btn-danger");
            loginBtn.classList.add("btn-primary");
        }, 1200);
    }
});

// ---- Helpers ----
function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add("show");
}
function clearError() {
    errorMsg.classList.remove("show");
}
function setLoading(state) {
    loginBtn.disabled = state;
    btnText.textContent = state ? "VERIFYING..." : "ACCESS SYSTEM";
    btnLoader.classList.toggle("hidden", !state);
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ---- Eye toggle for password ----
const eyeToggle = document.getElementById("eye-toggle");
if (eyeToggle) {
    eyeToggle.addEventListener("click", () => {
        const isText = passInput.type === "text";
        passInput.type = isText ? "password" : "text";
        eyeToggle.textContent = isText ? "👁" : "🙈";
    });
}
