const db = require('../config/db');
const { ok, created, badRequest, readJsonBody } = require('../utils/http');
const { classifyExpiry, getExpirySettings, logAction, pushNotification } = require('../services/expiryService');

// GET /api/inventory/movements?product_id=
async function listMovements(req, res, query) {
  let sql = `
    SELECT m.*, p.name AS product_name, u.name AS user_name
    FROM inventory_movements m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN users u ON u.id = m.user_id
  `;
  const params = [];
  if (query.product_id) { sql += ' WHERE m.product_id = ?'; params.push(query.product_id); }
  sql += ' ORDER BY m.created_at DESC LIMIT 200';
  ok(res, db.prepare(sql).all(...params));
}

// POST /api/inventory/movements (admin/funcionario) - entrada, devolucao, perda, vencido, ajuste
// (movimentos "venda" são criados automaticamente pelo módulo de vendas)
async function createMovement(req, res) {
  const body = await readJsonBody(req);
  const { product_id, quantity, type, reason } = body;
  const allowed = ['entrada', 'devolucao', 'perda', 'vencido', 'ajuste', 'saida'];
  if (!product_id || !quantity || !type) return badRequest(res, 'product_id, quantity e type são obrigatórios');
  if (!allowed.includes(type)) return badRequest(res, `Tipo inválido. Use um de: ${allowed.join(', ')}`);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return badRequest(res, 'Produto não encontrado');

  const isPositive = ['entrada', 'devolucao'].includes(type);
  const delta = isPositive ? Math.abs(quantity) : -Math.abs(quantity);
  const newQty = product.quantity + delta;
  if (newQty < 0) return badRequest(res, 'Movimentação deixaria o estoque negativo');

  db.prepare("UPDATE products SET quantity = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, product_id);
  const info = db.prepare(
    'INSERT INTO inventory_movements (product_id, quantity, type, user_id, reason) VALUES (?,?,?,?,?)'
  ).run(product_id, delta, type, req.user.id, reason ?? null);

  if (newQty <= product.min_quantity) {
    pushNotification('estoque_baixo', `Estoque baixo: ${product.name} (${newQty} ${product.unit})`, product_id);
  }
  logAction(req.user.id, `Registrou movimentação (${type}) de ${quantity} un. em ${product.name}`, 'inventory_movements', info.lastInsertRowid, reason);

  created(res, db.prepare('SELECT * FROM inventory_movements WHERE id = ?').get(info.lastInsertRowid));
}

// GET /api/inventory/expiry-status - todos os produtos classificados por validade
async function expiryStatus(req, res) {
  const settings = getExpirySettings();
  const products = db.prepare("SELECT * FROM products WHERE status = 'ativo'").all();
  const classified = products.map((p) => ({ ...p, ...classifyExpiry(p.expiry_date, settings) }));
  const summary = { normal: 0, atencao: 0, prioridade: 0, vencido: 0 };
  classified.forEach((p) => summary[p.status]++);
  ok(res, { settings, summary, products: classified });
}

// GET /api/inventory/priority-sales - fila FEFO (First Expire, First Out) para os funcionários
async function prioritySales(req, res) {
  const settings = getExpirySettings();
  const products = db.prepare("SELECT * FROM products WHERE status = 'ativo' AND expiry_date IS NOT NULL").all();
  const priority = products
    .map((p) => ({ ...p, ...classifyExpiry(p.expiry_date, settings) }))
    .filter((p) => ['prioridade', 'atencao'].includes(p.status) && p.quantity > 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  ok(res, priority);
}

// PUT /api/inventory/settings (admin) - configurar limiares de validade
async function updateSettings(req, res) {
  const body = await readJsonBody(req);
  const { attentionDays, priorityDays } = body;
  if (attentionDays === undefined || priorityDays === undefined) {
    return badRequest(res, 'Informe attentionDays e priorityDays');
  }
  if (Number(priorityDays) >= Number(attentionDays)) {
    return badRequest(res, 'priorityDays deve ser menor que attentionDays');
  }
  db.prepare("UPDATE system_settings SET value = ? WHERE key = 'expiry_attention_days'").run(String(attentionDays));
  db.prepare("UPDATE system_settings SET value = ? WHERE key = 'expiry_priority_days'").run(String(priorityDays));
  logAction(req.user.id, `Atualizou limiares de validade: atenção=${attentionDays}d, prioridade=${priorityDays}d`, 'system_settings');
  ok(res, getExpirySettings());
}

module.exports = { listMovements, createMovement, expiryStatus, prioritySales, updateSettings };
