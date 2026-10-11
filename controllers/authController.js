const crypto = require('node:crypto');
const db = require('../config/db');
const { hashPassword, verifyPassword, signToken } = require('../utils/auth');
const { ok, created, badRequest, unauthorized, notFound, readJsonBody } = require('../utils/http');
const { logAction } = require('../services/expiryService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, active: !!u.active };
}

// POST /api/auth/register  -> auto-cadastro, sempre como 'cliente'
async function register(req, res) {
  const body = await readJsonBody(req);
  const { name, email, password, phone } = body;
  if (!name || !email || !password) return badRequest(res, 'Nome, e-mail e senha são obrigatórios');
  if (!EMAIL_RE.test(email)) return badRequest(res, 'E-mail inválido');
  if (password.length < 6) return badRequest(res, 'A senha deve ter ao menos 6 caracteres');

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return badRequest(res, 'Já existe uma conta com este e-mail');

  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email, hashPassword(password), 'cliente', phone ?? null);

  db.prepare('INSERT INTO customers (user_id, name, phone, email) VALUES (?, ?, ?, ?)')
    .run(info.lastInsertRowid, name, phone ?? null, email);

  logAction(info.lastInsertRowid, 'Cadastro de conta (cliente)', 'users', info.lastInsertRowid);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken({ id: user.id, name: user.name, role: user.role });
  created(res, { token, user: publicUser(user) });
}

// POST /api/auth/login
async function login(req, res) {
  const body = await readJsonBody(req);
  const { email, password } = body;
  if (!email || !password) return badRequest(res, 'Informe e-mail e senha');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return unauthorized(res, 'E-mail ou senha inválidos');
  }
  const token = signToken({ id: user.id, name: user.name, role: user.role });
  logAction(user.id, 'Login realizado', 'users', user.id);
  ok(res, { token, user: publicUser(user) });
}

// POST /api/auth/logout -> stateless (o cliente descarta o token); registrado para auditoria
async function logout(req, res) {
  if (req.user) logAction(req.user.id, 'Logout realizado', 'users', req.user.id);
  ok(res, { message: 'Sessão encerrada' });
}

// GET /api/auth/me
async function me(req, res) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return notFound(res, 'Usuário não encontrado');
  ok(res, publicUser(user));
}

// PUT /api/auth/change-password (autenticado)
async function changePassword(req, res) {
  const body = await readJsonBody(req);
  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) return badRequest(res, 'Informe a senha atual e a nova senha');
  if (newPassword.length < 6) return badRequest(res, 'A nova senha deve ter ao menos 6 caracteres');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(currentPassword, user.password_hash)) return badRequest(res, 'Senha atual incorreta');

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), user.id);
  logAction(user.id, 'Senha alterada pelo próprio usuário', 'users', user.id);
  ok(res, { message: 'Senha alterada com sucesso' });
}

// POST /api/auth/forgot-password
// Observação: este protótipo não tem serviço de e-mail configurado.
// O token é devolvido na resposta apenas para permitir testar o fluxo -
// em produção ele deve ser enviado por e-mail e nunca retornado na API.
async function forgotPassword(req, res) {
  const body = await readJsonBody(req);
  const { email } = body;
  if (!email) return badRequest(res, 'Informe o e-mail');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Não revelamos se o e-mail existe ou não (evita enumeração de contas)
  if (!user) return ok(res, { message: 'Se o e-mail existir, enviaremos instruções.' });

  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
    .run(token, expires, user.id);

  ok(res, {
    message: 'Se o e-mail existir, enviaremos instruções.',
    devOnlyResetToken: token // REMOVER quando um serviço de e-mail real for integrado
  });
}

// POST /api/auth/reset-password
async function resetPassword(req, res) {
  const body = await readJsonBody(req);
  const { token, newPassword } = body;
  if (!token || !newPassword) return badRequest(res, 'Token e nova senha são obrigatórios');
  if (newPassword.length < 6) return badRequest(res, 'A nova senha deve ter ao menos 6 caracteres');

  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
  if (!user || !user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
    return badRequest(res, 'Token inválido ou expirado');
  }
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
    .run(hashPassword(newPassword), user.id);
  logAction(user.id, 'Senha redefinida via recuperação', 'users', user.id);
  ok(res, { message: 'Senha redefinida com sucesso' });
}

module.exports = { register, login, logout, me, changePassword, forgotPassword, resetPassword, publicUser };
