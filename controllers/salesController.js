const db = require('../config/db');
const { ok, created, badRequest, notFound, readJsonBody } = require('../utils/http');
const { classifyExpiry, logAction, pushNotification } = require('../services/expiryService');

const PAYMENT_METHODS = ['dinheiro', 'pix', 'debito', 'credito'];

// POST /api/sales (funcionario/admin)
// body: { customer_id?, discount?, payment_method, items: [{ product_id, quantity }] }
async function create(req, res) {
  const body = await readJsonBody(req);
  const { customer_id, payment_method, items } = body;
  const discount = Number(body.discount || 0);

  if (!Array.isArray(items) || items.length === 0) return badRequest(res, 'Informe ao menos um item na venda');
  if (!PAYMENT_METHODS.includes(payment_method)) return badRequest(res, `Forma de pagamento inválida. Use: ${PAYMENT_METHODS.join(', ')}`);
  if (discount < 0) return badRequest(res, 'Desconto inválido');

  // Carrega e valida todos os produtos antes de tocar no banco
  const resolvedItems = [];
  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
    if (!product) return badRequest(res, `Produto #${item.product_id} não encontrado`);
    if (product.status !== 'ativo') return badRequest(res, `Produto "${product.name}" está inativo`);

    const { status } = classifyExpiry(product.expiry_date);
    if (status === 'vencido') return badRequest(res, `Produto "${product.name}" está VENCIDO e não pode ser vendido`);

    const qty = Number(item.quantity);
    if (!qty || qty <= 0) return badRequest(res, `Quantidade inválida para "${product.name}"`);
    if (qty > product.quantity) return badRequest(res, `Estoque insuficiente para "${product.name}" (disponível: ${product.quantity})`);

    resolvedItems.push({ product, qty, unitPrice: product.sale_price });
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  const subtotal = round2(resolvedItems.reduce((sum, i) => sum + i.qty * i.unitPrice, 0));
  if (discount > subtotal) return badRequest(res, 'Desconto maior que o subtotal');
  const total = round2(subtotal - discount);

  db.exec('BEGIN');
  try {
    const saleInfo = db.prepare(
      'INSERT INTO sales (user_id, customer_id, subtotal, discount, total, payment_method) VALUES (?,?,?,?,?,?)'
    ).run(req.user.id, customer_id ?? null, subtotal, discount, total, payment_method);
    const saleId = saleInfo.lastInsertRowid;

    for (const { product, qty, unitPrice } of resolvedItems) {
      db.prepare(
        'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total) VALUES (?,?,?,?,?)'
      ).run(saleId, product.id, qty, unitPrice, round2(qty * unitPrice));

      const newQty = product.quantity - qty;
      db.prepare("UPDATE products SET quantity = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, product.id);
      db.prepare(
        'INSERT INTO inventory_movements (product_id, quantity, type, user_id, reason) VALUES (?,?,?,?,?)'
      ).run(product.id, -qty, 'venda', req.user.id, `Venda #${saleId}`);

      if (newQty <= product.min_quantity) {
        pushNotification('estoque_baixo', `Estoque baixo: ${product.name} (${newQty} ${product.unit})`, product.id);
      }
    }

    db.prepare('INSERT INTO payments (sale_id, method, amount, status) VALUES (?,?,?,?)')
      .run(saleId, payment_method, total, 'aprovado');

    db.exec('COMMIT');

    logAction(req.user.id, `Registrou venda #${saleId} no valor de R$ ${total.toFixed(2)}`, 'sales', saleId);

    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    const saleItems = db.prepare(`
      SELECT si.*, p.name AS product_name, p.unit FROM sale_items si
      JOIN products p ON p.id = si.product_id WHERE si.sale_id = ?
    `).all(saleId);
    created(res, { ...sale, items: saleItems }); // = comprovante da venda
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// GET /api/sales?date_from=&date_to=
async function list(req, res, query) {
  let sql = `
    SELECT s.*, u.name AS seller_name, c.name AS customer_name
    FROM sales s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE 1=1
  `;
  const params = [];
  if (query.date_from) { sql += ' AND date(s.created_at) >= date(?)'; params.push(query.date_from); }
  if (query.date_to) { sql += ' AND date(s.created_at) <= date(?)'; params.push(query.date_to); }
  sql += ' ORDER BY s.created_at DESC LIMIT 200';
  ok(res, db.prepare(sql).all(...params));
}

async function getById(req, res, id) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!sale) return notFound(res, 'Venda não encontrada');
  const items = db.prepare(`
    SELECT si.*, p.name AS product_name, p.unit FROM sale_items si
    JOIN products p ON p.id = si.product_id WHERE si.sale_id = ?
  `).all(id);
  ok(res, { ...sale, items });
}

module.exports = { create, list, getById };
