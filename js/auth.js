const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const messageEl = document.getElementById("message");

function showMessage(msg, isError = false) {
  if (!messageEl) return;
  messageEl.textContent = msg;
  messageEl.style.color = isError ? "#dc2626" : "#059669";
}

function showDashboard() {
  document.getElementById("authScreen")?.classList.add("hidden");
  document.getElementById("dashboard")?.classList.remove("hidden");
}

async function handleSignup() {
  const email = (emailInput?.value || "").trim();
  const password = (passwordInput?.value || "").trim();

  if (!email || !password) {
    showMessage("Enter email and password.", true);
    return;
  }

  try {
    if (signupBtn) signupBtn.disabled = true;
    if (loginBtn) loginBtn.disabled = true;

    const { error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (error) {
      showMessage(error.message, true);
      return;
    }

    showMessage("Signup successful. Check your email if confirmation is enabled.");
  } catch (err) {
    showMessage(err.message || "Signup failed.", true);
  } finally {
    if (signupBtn) signupBtn.disabled = false;
    if (loginBtn) loginBtn.disabled = false;
  }
}

async function handleLogin() {
  const email = (emailInput?.value || "").trim();
  const password = (passwordInput?.value || "").trim();

  if (!email || !password) {
    showMessage("Enter email and password.", true);
    return;
  }

  try {
    if (signupBtn) signupBtn.disabled = true;
    if (loginBtn) loginBtn.disabled = true;

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showMessage(error.message, true);
      return;
    }

    showMessage("Login successful.");
    showDashboard();
  } catch (err) {
    showMessage(err.message || "Login failed.", true);
  } finally {
    if (signupBtn) signupBtn.disabled = false;
    if (loginBtn) loginBtn.disabled = false;
  }
}

signupBtn?.addEventListener("click", handleSignup);
loginBtn?.addEventListener("click", handleLogin);

passwordInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    handleLogin();
  }
});