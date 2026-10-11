function showAuthScreen(id) {
  ['view-login', 'view-register', 'view-forgot', 'view-app'].forEach((v) => {
    document.getElementById(v).classList.toggle('hidden', v !== id);
  });
}

function renderLogin() { showAuthScreen('view-login'); }

function setupAuthScreens() {
  // ---- Login ----
  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    try {
      const data = await Api.post('/auth/login', { email, password });
      Store.setToken(data.token);
      Store.setUser(data.user);
      startApp();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  document.getElementById('link-register').addEventListener('click', (e) => {
    e.preventDefault(); showAuthScreen('view-register');
  });
  document.getElementById('link-forgot').addEventListener('click', (e) => {
    e.preventDefault(); showAuthScreen('view-forgot');
  });
  document.getElementById('link-back-login-1').addEventListener('click', (e) => { e.preventDefault(); renderLogin(); });
  document.getElementById('link-back-login-2').addEventListener('click', (e) => { e.preventDefault(); renderLogin(); });

  // ---- Cadastro (cliente) ----
  document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const errorEl = document.getElementById('register-error');
    errorEl.textContent = '';
    try {
      const data = await Api.post('/auth/register', { name, email, phone, password });
      Store.setToken(data.token);
      Store.setUser(data.user);
      showToast('Conta criada com sucesso!');
      startApp();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // ---- Esqueci a senha ----
  document.getElementById('form-forgot').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const resultEl = document.getElementById('forgot-result');
    try {
      const data = await Api.post('/auth/forgot-password', { email });
      resultEl.innerHTML = data.devOnlyResetToken
        ? `${data.message}<br><b>Token de teste (protótipo sem e-mail configurado):</b><br><code>${data.devOnlyResetToken}</code>`
        : data.message;
      document.getElementById('form-reset').classList.remove('hidden');
    } catch (err) {
      resultEl.textContent = err.message;
    }
  });

  document.getElementById('form-reset').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('reset-token').value.trim();
    const newPassword = document.getElementById('reset-password').value;
    try {
      await Api.post('/auth/reset-password', { token, newPassword });
      showToast('Senha redefinida! Faça login com a nova senha.');
      renderLogin();
    } catch (err) {
      document.getElementById('forgot-result').textContent = err.message;
    }
  });
}

async function doLogout() {
  try { await Api.post('/auth/logout'); } catch { /* ignora falha de rede no logout */ }
  Store.clearToken();
  Store.clearUser();
  renderLogin();
}
