const db = require('../config/db');
const { ok, created, badRequest, notFound, readJsonBody } = require('../utils/http');
const { logAction } = require('../services/expiryService');

// ---------------- Categorias ----------------
async function listCategories(req, res) {
  ok(res, db.prepare('SELECT * FROM categories ORDER BY name').all());
}

async function createCategory(req, res) {
  const body = await readJsonBody(req);
  if (!body.name) return badRequest(res, 'Nome da categoria é obrigatório');
  try {
    const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(body.name);
    logAction(req.user.id, `Criou categoria: ${body.name}`, 'categories', info.lastInsertRowid);
    created(res, db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid));
  } catch {
    badRequest(res, 'Já existe uma categoria com esse nome');
  }
}

// ---------------- Fornecedores ----------------
async function listSuppliers(req, res) {
  ok(res, db.prepare('SELECT * FROM suppliers ORDER BY name').all());
}

async function createSupplier(req, res) {
  const body = await readJsonBody(req);
  const { name, cnpj, phone, email, address } = body;
  if (!name) return badRequest(res, 'Nome do fornecedor é obrigatório');
  const info = db.prepare(
    'INSERT INTO suppliers (name, cnpj, phone, email, address) VALUES (?, ?, ?, ?, ?)'
  ).run(name, cnpj ?? null, phone ?? null, email ?? null, address ?? null);
  logAction(req.user.id, `Cadastrou fornecedor: ${name}`, 'suppliers', info.lastInsertRowid);
  created(res, db.prepare('SELECT * FROM suppliers WHERE id = ?').get(info.lastInsertRowid));
}

async function updateSupplier(req, res, id) {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  if (!supplier) return notFound(res, 'Fornecedor não encontrado');
  const body = await readJsonBody(req);
  const fields = ['name', 'cnpj', 'phone', 'email', 'address'];
  const merged = Object.fromEntries(fields.map((f) => [f, body[f] ?? supplier[f]]));
  db.prepare('UPDATE suppliers SET name=?, cnpj=?, phone=?, email=? , address=? WHERE id=?')
    .run(merged.name, merged.cnpj, merged.phone, merged.email, merged.address, id);
  logAction(req.user.id, `Atualizou fornecedor #${id}`, 'suppliers', id);
  ok(res, db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id));
}

module.exports = { listCategories, createCategory, listSuppliers, createSupplier, updateSupplier };
