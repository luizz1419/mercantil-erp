const db = require('../config/db');
const { ok, created, badRequest, notFound, readJsonBody } = require('../utils/http');
const { logAction } = require('../services/expiryService');

async function list(req, res, query) {
  let rows = db.prepare('SELECT * FROM customers ORDER BY name').all();
  if (query.q) {
    const q = query.q.toLowerCase();
    rows = rows.filter((c) => c.name.toLowerCase().includes(q) || (c.cpf || '').includes(q));
  }
  ok(res, rows);
}

// POST /api/customers (funcionario/admin) - cadastro no balcão
async function create(req, res) {
  const body = await readJsonBody(req);
  const { name, cpf, phone, email, address, number, neighborhood, city, zip } = body;
  if (!name) return badRequest(res, 'Nome é obrigatório');
  const info = db.prepare(`
    INSERT INTO customers (name, cpf, phone, email, address, number, neighborhood, city, zip)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(name, cpf ?? null, phone ?? null, email ?? null, address ?? null, number ?? null, neighborhood ?? null, city ?? null, zip ?? null);
  logAction(req.user.id, `Cadastrou cliente: ${name}`, 'customers', info.lastInsertRowid);
  created(res, db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid));
}

// GET /api/customers/:id - detalhe + histórico de compras
async function getById(req, res, id) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return notFound(res, 'Cliente não encontrado');

  const sales = db.prepare('SELECT * FROM sales WHERE customer_id = ? ORDER BY created_at DESC').all(id);
  const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(id);
  const totalSpent = sales.reduce((sum, s) => sum + s.total, 0) + orders.reduce((sum, o) => sum + (o.status !== 'cancelado' ? o.total : 0), 0);
  const lastPurchase = sales[0]?.created_at ?? orders[0]?.created_at ?? null;

  ok(res, { ...customer, sales, orders, total_spent: totalSpent, last_purchase: lastPurchase });
}

module.exports = { list, create, getById };
