const db = require('../config/db');
const { hashPassword } = require('../utils/auth');
const { ok, created, badRequest, notFound, readJsonBody } = require('../utils/http');
const { logAction } = require('../services/expiryService');
const { publicUser } = require('./authController');

// GET /api/users (admin) - lista funcionarios e admins (não clientes, que ficam em /customers)
async function list(req, res) {
  const users = db.prepare(
    "SELECT * FROM users WHERE role IN ('admin','funcionario') ORDER BY name"
  ).all();
  ok(res, users.map(publicUser));
}

// POST /api/users (admin) - cria funcionario ou admin
async function create(req, res) {
  const body = await readJsonBody(req);
  const { name, email, password, role, phone } = body;
  if (!name || !email || !password || !role) return badRequest(res, 'Nome, e-mail, senha e perfil são obrigatórios');
  if (!['admin', 'funcionario'].includes(role)) return badRequest(res, 'Perfil inválido para este endpoint');
  if (password.length < 6) return badRequest(res, 'A senha deve ter ao menos 6 caracteres');

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return badRequest(res, 'Já existe uma conta com este e-mail');

  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email, hashPassword(password), role, phone ?? null);

  logAction(req.user.id, `Criou usuário ${role}: ${name}`, 'users', info.lastInsertRowid);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  created(res, publicUser(user));
}

// PUT /api/users/:id (admin) - editar dados/ativar-desativar
async function update(req, res, id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return notFound(res, 'Usuário não encontrado');

  const body = await readJsonBody(req);
  const name = body.name ?? user.name;
  const phone = body.phone ?? user.phone;
  const active = body.active !== undefined ? (body.active ? 1 : 0) : user.active;

  db.prepare('UPDATE users SET name = ?, phone = ?, active = ? WHERE id = ?').run(name, phone, active, id);
  logAction(req.user.id, `Atualizou usuário #${id}`, 'users', id);
  ok(res, publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
}

module.exports = { list, create, update };
