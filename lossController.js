const db = require('../config/db');
const { ok, created, badRequest, readJsonBody } = require('../utils/http');
const { logAction, pushNotification } = require('../services/expiryService');

// Rótulos amigáveis para cada motivo (o banco guarda a chave em minúsculo/sem acento)
const REASON_LABELS = {
  vencimento: 'Vencimento',
  avaria: 'Avaria',
  deterioracao: 'Deterioração',
  extravio: 'Extravio',
  furto: 'Furto',
  erro_estoque: 'Erro de estoque',
  outros: 'Outros'
};
const REASON_KEYS = Object.keys(REASON_LABELS);

// GET /api/losses?date_from=&date_to=&reason=
async function list(req, res, query) {
  let sql = `
    SELECT l.*, p.name AS product_name, p.unit, u.name AS user_name
    FROM losses l
    JOIN products p ON p.id = l.product_id
    LEFT JOIN users u ON u.id = l.user_id
    WHERE 1=1
  `;
  const params = [];
  if (query.date_from) { sql += ' AND date(l.created_at) >= date(?)'; params.push(query.date_from); }
  if (query.date_to) { sql += ' AND date(l.created_at) <= date(?)'; params.push(query.date_to); }
  if (query.reason) { sql += ' AND l.reason = ?'; params.push(query.reason); }
  sql += ' ORDER BY l.created_at DESC LIMIT 200';

  const rows = db.prepare(sql).all(...params).map((r) => ({ ...r, reason_label: REASON_LABELS[r.reason] || r.reason }));
  ok(res, rows);
}

// GET /api/losses/summary?date_from=&date_to=  (usado no card do Dashboard/tela de perdas)
async function summary(req, res, query) {
  const dateFrom = query.date_from || new Date().toISOString().slice(0, 8) + '01'; // início do mês corrente por padrão
  const dateTo = query.date_to || new Date().toISOString().slice(0, 10);

  const total = db.prepare(
    "SELECT COALESCE(SUM(value),0) AS total, COUNT(*) AS count FROM losses WHERE date(created_at) BETWEEN date(?) AND date(?)"
  ).get(dateFrom, dateTo);

  const byReason = db.prepare(`
    SELECT reason, COALESCE(SUM(value),0) AS total, COUNT(*) AS count
    FROM losses WHERE date(created_at) BETWEEN date(?) AND date(?)
    GROUP BY reason ORDER BY total DESC
  `).all(dateFrom, dateTo).map((r) => ({ ...r, reason_label: REASON_LABELS[r.reason] || r.reason }));

  const byProduct = db.prepare(`
    SELECT p.name AS product_name, SUM(l.value) AS total, SUM(l.quantity) AS quantity
    FROM losses l JOIN products p ON p.id = l.product_id
    WHERE date(l.created_at) BETWEEN date(?) AND date(?)
    GROUP BY l.product_id ORDER BY total DESC LIMIT 5
  `).all(dateFrom, dateTo);

  ok(res, { period: { dateFrom, dateTo }, total: total.total, count: total.count, by_reason: byReason, top_products: byProduct });
}

// POST /api/losses  { product_id, quantity, reason, observation }
async function create(req, res) {
  const body = await readJsonBody(req);
  const { product_id, reason, observation } = body;
  const quantity = Number(body.quantity);

  if (!product_id || !reason || !quantity || quantity <= 0) {
    return badRequest(res, 'Informe produto, quantidade (maior que zero) e motivo');
  }
  if (!REASON_KEYS.includes(reason)) {
    return badRequest(res, `Motivo inválido. Use um de: ${REASON_KEYS.join(', ')}`);
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return badRequest(res, 'Produto não encontrado');
  if (quantity > product.quantity) return badRequest(res, `Quantidade maior que o estoque atual (${product.quantity} ${product.unit})`);

  const value = Math.round(quantity * product.purchase_price * 100) / 100;
  const movementType = reason === 'vencimento' ? 'vencido' : 'perda';

  db.exec('BEGIN');
  try {
    const info = db.prepare(
      'INSERT INTO losses (product_id, quantity, reason, value, observation, user_id) VALUES (?,?,?,?,?,?)'
    ).run(product_id, quantity, reason, value, observation ?? null, req.user.id);

    const newQty = product.quantity - quantity;
    db.prepare("UPDATE products SET quantity = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, product_id);
    db.prepare(
      'INSERT INTO inventory_movements (product_id, quantity, type, user_id, reason) VALUES (?,?,?,?,?)'
    ).run(product_id, -quantity, movementType, req.user.id, `Quebra/perda: ${REASON_LABELS[reason]}${observation ? ' — ' + observation : ''}`);

    db.exec('COMMIT');

    if (newQty <= product.min_quantity) {
      pushNotification('estoque_baixo', `Estoque baixo: ${product.name} (${newQty} ${product.unit})`, product_id);
    }
    logAction(req.user.id, `Registrou perda de ${quantity} ${product.unit} de ${product.name} (${REASON_LABELS[reason]}) — R$ ${value.toFixed(2)}`, 'losses', info.lastInsertRowid);

    created(res, db.prepare('SELECT * FROM losses WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { list, summary, create, REASON_LABELS };
