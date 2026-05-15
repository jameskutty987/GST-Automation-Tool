const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const messageEl = document.getElementById("message");

function showMessage(msg, isError = false) {
  if (!messageEl) return;
  messageEl.textContent = msg;
  messageEl.style.color = isError ? "#dc2626" : "#059669";
}

async function handleLogin() {
  const email = (emailInput?.value || "").trim();
  const password = (passwordInput?.value || "").trim();

  if (!email || !password) {
    showMessage("Enter email and password.", true);
    return;
  }

  try {
    if (loginBtn) loginBtn.disabled = true;

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showMessage(error.message, true);
      return;
    }

    window.location.href = "../../dashboard.html";
  } catch (err) {
    showMessage(err.message || "Login failed.", true);
  } finally {
    if (loginBtn) loginBtn.disabled = false;
  }
}

loginBtn?.addEventListener("click", handleLogin);

passwordInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    handleLogin();
  }
});
