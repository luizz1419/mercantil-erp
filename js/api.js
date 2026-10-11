// Quando a página é aberta via duplo clique (file://), caminhos relativos como "/api"
// não funcionam — nesse caso apontamos explicitamente para o backend em localhost.
// Quando a página é servida pelo próprio backend (http://localhost:3001), usamos
// caminho relativo normalmente, o que também funciona se a porta for alterada.
const API_BASE = location.protocol === 'file:' ? 'http://localhost:3001/api' : '/api';

const Store = {
  getToken: () => localStorage.getItem('mercantil_token'),
  setToken: (t) => localStorage.setItem('mercantil_token', t),
  clearToken: () => localStorage.removeItem('mercantil_token'),
  getUser: () => JSON.parse(localStorage.getItem('mercantil_user') || 'null'),
  setUser: (u) => localStorage.setItem('mercantil_user', JSON.stringify(u)),
  clearUser: () => localStorage.removeItem('mercantil_user')
};

function showToast(message, type = 'ok') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = Store.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch { /* resposta sem corpo */ }

  if (res.status === 401 && token) {
    // Um 401 com token presente significa sessão expirada/inválida.
    // Sem token (ex.: e-mail/senha errados no login), deixamos a mensagem
    // real do servidor seguir para quem chamou tratar no formulário.
    Store.clearToken();
    Store.clearUser();
    showToast('Sessão expirada. Faça login novamente.', 'error');
    renderLogin();
    throw new Error('unauthorized');
  }

  if (!res.ok) {
    const message = data?.error || `Erro (${res.status})`;
    throw new Error(message);
  }
  return data;
}

const Api = {
  get: (path) => api('GET', path),
  post: (path, body) => api('POST', path, body),
  put: (path, body) => api('PUT', path, body),
  del: (path) => api('DELETE', path)
};
