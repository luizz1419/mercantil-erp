const db = require('../config/db');
const { ok, created, badRequest, readJsonBody } = require('../utils/http');
const { logAction, pushNotification } = require('../services/expiryService');

// POST /api/receiving
// body: { supplier_id?, invoice_number?, items: [{ product_id, quantity, purchase_price?, expiry_date? }] }
async function create(req, res) {
  const body = await readJsonBody(req);
  const { supplier_id, invoice_number, items } = body;

  if (!Array.isArray(items) || items.length === 0) return badRequest(res, 'Informe ao menos um produto no recebimento');

  const resolvedItems = [];
  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
    if (!product) return badRequest(res, `Produto #${item.product_id} não encontrado`);
    const qty = Number(item.quantity);
    if (!qty || qty <= 0) return badRequest(res, `Quantidade inválida para "${product.name}"`);
    resolvedItems.push({ product, qty, purchasePrice: item.purchase_price !== undefined ? Number(item.purchase_price) : product.purchase_price, expiryDate: item.expiry_date || null });
  }

  db.exec('BEGIN');
  try {
    const receiptInfo = db.prepare(
      'INSERT INTO stock_receipts (supplier_id, invoice_number, user_id) VALUES (?,?,?)'
    ).run(supplier_id ?? null, invoice_number ?? null, req.user.id);
    const receiptId = receiptInfo.lastInsertRowid;

    for (const { product, qty, purchasePrice, expiryDate } of resolvedItems) {
      db.prepare(
        'INSERT INTO stock_receipt_items (receipt_id, product_id, quantity, purchase_price, expiry_date) VALUES (?,?,?,?,?)'
      ).run(receiptId, product.id, qty, purchasePrice, expiryDate);

      const newQty = product.quantity + qty;
      // Atualiza estoque e, se informado, o preço de custo/validade/fornecedor mais recentes.
      // Observação: este protótipo guarda 1 validade por produto (sem controle de lote).
      // Se o produto já tinha estoque de um lote com validade diferente, a validade antiga
      // é substituída pela nova — ver "O que expandir" no README para controle de lote (FIFO/FEFO por lote).
      db.prepare(`
        UPDATE products SET
          quantity = ?,
          purchase_price = ?,
          expiry_date = COALESCE(?, expiry_date),
          supplier_id = COALESCE(?, supplier_id),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(newQty, purchasePrice, expiryDate, supplier_id ?? null, product.id);

      db.prepare(
        'INSERT INTO inventory_movements (product_id, quantity, type, user_id, reason) VALUES (?,?,?,?,?)'
      ).run(product.id, qty, 'entrada', req.user.id, `Recebimento${invoice_number ? ' NF ' + invoice_number : ''}`);
    }

    db.exec('COMMIT');
    logAction(req.user.id, `Registrou entrada de mercadoria (NF ${invoice_number || 's/nº'}) com ${resolvedItems.length} produto(s)`, 'stock_receipts', receiptId);

    const items_out = db.prepare(`
      SELECT ri.*, p.name AS product_name, p.unit FROM stock_receipt_items ri
      JOIN products p ON p.id = ri.product_id WHERE ri.receipt_id = ?
    `).all(receiptId);
    created(res, { ...db.prepare('SELECT * FROM stock_receipts WHERE id = ?').get(receiptId), items: items_out });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// GET /api/receiving
async function list(req, res) {
  const receipts = db.prepare(`
    SELECT r.*, s.name AS supplier_name, u.name AS user_name
    FROM stock_receipts r
    LEFT JOIN suppliers s ON s.id = r.supplier_id
    LEFT JOIN users u ON u.id = r.user_id
    ORDER BY r.created_at DESC LIMIT 100
  `).all();

  const itemsStmt = db.prepare(`
    SELECT ri.*, p.name AS product_name, p.unit FROM stock_receipt_items ri
    JOIN products p ON p.id = ri.product_id WHERE ri.receipt_id = ?
  `);
  ok(res, receipts.map((r) => ({ ...r, items: itemsStmt.all(r.id) })));
}

module.exports = { create, list };
