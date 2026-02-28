// ============================================================
// HEISENBYTE Admin — Authentication Module
// Hardcoded credentials validated client-side
// ============================================================

const ADMIN_EMAIL = "jecaids@gmail.com";
const ADMIN_PASSWORD = "JEC12345AIDS";

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
