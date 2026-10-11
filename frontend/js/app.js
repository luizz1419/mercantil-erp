const ROUTES = {
  dashboard: { label: '📊 Dashboard', roles: ['admin', 'funcionario', 'cliente'], render: renderDashboard },
  pos: { label: '🧾 PDV / Vendas', roles: ['admin', 'funcionario'], render: renderPos },
  products: { label: '📦 Produtos', roles: ['admin', 'funcionario', 'cliente'], render: renderProducts },
  inventory: { label: '🗂️ Estoque e Validade', roles: ['admin', 'funcionario'], render: renderInventory },
  customers: { label: '👥 Clientes', roles: ['admin', 'funcionario'], render: renderCustomers },
  // ---- Rotas adicionadas (aprimoramentos) ----
  salesHistory: { label: '📜 Histórico de Vendas', roles: ['admin', 'funcionario'], render: renderSalesHistory },
  receiving: { label: '📥 Entrada de Mercadorias', roles: ['admin', 'funcionario'], render: renderReceiving },
  losses: { label: '❌ Quebras e Perdas', roles: ['admin', 'funcionario'], render: renderLosses },
  suppliers: { label: '🚚 Fornecedores', roles: ['admin'], render: renderSuppliers },
  reports: { label: '📊 Relatórios', roles: ['admin'], render: renderReports }
};

function currentRoute() {
  const hash = (location.hash || '#dashboard').replace('#', '');
  return ROUTES[hash] ? hash : 'dashboard';
}

function buildNav() {
  const user = Store.getUser();
  const nav = document.getElementById('nav-menu');
  nav.innerHTML = Object.entries(ROUTES)
    .filter(([, r]) => r.roles.includes(user.role))
    .map(([key, r]) => `<div class="nav-item" data-route="${key}">${r.label}</div>`)
    .join('');
  nav.querySelectorAll('[data-route]').forEach((el) =>
    el.addEventListener('click', () => { location.hash = '#' + el.dataset.route; }));
}

async function renderRoute() {
  const key = currentRoute();
  const route = ROUTES[key];
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.route === key));
  document.getElementById('page-title').textContent = route.label.replace(/^\S+\s/, '');
  const container = document.getElementById('page-content');
  container.innerHTML = '<p class="muted">Carregando...</p>';
  try {
    await route.render(container);
  } catch (err) {
    if (err.message !== 'unauthorized') {
      container.innerHTML = `<div class="card"><p class="error-msg">${err.message}</p></div>`;
    }
  }
  document.getElementById('sidebar').classList.remove('open');
}

async function refreshNotifications() {
  const user = Store.getUser();
  if (user.role === 'cliente') return;
  try {
    const list = await Api.get('/notifications');
    const unread = list.filter((n) => !n.read);
    const badge = document.getElementById('notif-count');
    badge.textContent = unread.length;
    badge.classList.toggle('hidden', unread.length === 0);

    const panel = document.getElementById('notif-panel');
    panel.innerHTML = list.slice(0, 20).map((n) => `
      <div class="notif-item"><b>${n.type.replace('_', ' ')}</b><br>${n.message}<br><span class="muted small">${n.created_at}</span></div>
    `).join('') || '<div class="notif-item muted">Nenhuma notificação.</div>';
  } catch { /* ignora falha silenciosa de polling */ }
}

function setupTheme() {
  const saved = localStorage.getItem('mercantil_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeButton(saved);
  document.getElementById('btn-theme').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mercantil_theme', next);
    updateThemeButton(next);
  });
}
function updateThemeButton(theme) {
  document.getElementById('btn-theme').textContent = theme === 'dark' ? '☀️ Modo claro' : '🌙 Modo escuro';
}

function startApp() {
  const user = Store.getUser();
  const roleLabels = { admin: 'Administrador', funcionario: 'Funcionário', cliente: 'Cliente' };
  document.getElementById('user-badge').textContent = `${user.name} · ${roleLabels[user.role]}`;

  showAuthScreen('view-app');
  buildNav();
  renderRoute();
  refreshNotifications();
  clearInterval(window.__notifInterval);
  window.__notifInterval = setInterval(refreshNotifications, 20000);
}

window.addEventListener('hashchange', renderRoute);

document.addEventListener('DOMContentLoaded', () => {
  setupAuthScreens();
  setupTheme();

  document.getElementById('btn-logout').addEventListener('click', doLogout);
  document.getElementById('btn-menu-toggle').addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open'));

  const notifBtn = document.getElementById('btn-notifications');
  const notifPanel = document.getElementById('notif-panel');
  notifBtn.addEventListener('click', () => notifPanel.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!notifPanel.contains(e.target) && e.target !== notifBtn) notifPanel.classList.add('hidden');
  });

  const token = Store.getToken();
  const user = Store.getUser();
  if (token && user) {
    Api.get('/auth/me').then(() => startApp()).catch(() => renderLogin());
  } else {
    renderLogin();
  }
});
