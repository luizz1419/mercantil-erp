const db = require('../config/db');
const { ok, created, badRequest, notFound, readJsonBody } = require('../utils/http');
const { classifyExpiry, getExpirySettings, logAction, pushNotification } = require('../services/expiryService');

function withExpiry(product, settings) {
  const { status, daysLeft } = classifyExpiry(product.expiry_date, settings);
  return { ...product, expiry_status: status, expiry_days_left: daysLeft, low_stock: product.quantity <= product.min_quantity };
}

// GET /api/products?q=&category_id=&status=&expiry_status=
async function list(req, res, query) {
  let rows = db.prepare(`
    SELECT p.*, c.name AS category_name, s.name AS supplier_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.name
  `).all();

  const settings = getExpirySettings();
  rows = rows.map((p) => withExpiry(p, settings));

  if (query.q) {
    const q = query.q.toLowerCase();
    rows = rows.filter((p) =>
      p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.barcode || '').includes(q)
    );
  }
  if (query.category_id) rows = rows.filter((p) => String(p.category_id) === query.category_id);
  if (query.status) rows = rows.filter((p) => p.status === query.status);
  if (query.expiry_status) rows = rows.filter((p) => p.expiry_status === query.expiry_status);

  ok(res, rows);
}

async function getById(req, res, id) {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) return notFound(res, 'Produto não encontrado');
  ok(res, withExpiry(p, getExpirySettings()));
}

async function getByBarcode(req, res, code) {
  const p = db.prepare('SELECT * FROM products WHERE barcode = ?').get(code);
  if (!p) return notFound(res, 'Produto não encontrado para este código de barras');
  ok(res, withExpiry(p, getExpirySettings()));
}

function validateProductBody(body) {
  if (!body.code || !body.name) return 'Código e nome são obrigatórios';
  if (body.sale_price !== undefined && Number(body.sale_price) < 0) return 'Preço de venda inválido';
  if (body.quantity !== undefined && Number(body.quantity) < 0) return 'Quantidade inválida';
  return null;
}

// POST /api/products (admin)
async function create(req, res) {
  const body = await readJsonBody(req);
  const err = validateProductBody(body);
  if (err) return badRequest(res, err);

  try {
    const info = db.prepare(`
      INSERT INTO products
        (code, barcode, name, category_id, brand, description, purchase_price, sale_price,
         quantity, min_quantity, unit, manufacture_date, expiry_date, supplier_id, location, image_url, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      body.code, body.barcode ?? null, body.name, body.category_id ?? null, body.brand ?? null,
      body.description ?? null, body.purchase_price ?? 0, body.sale_price ?? 0, body.quantity ?? 0,
      body.min_quantity ?? 0, body.unit ?? 'un', body.manufacture_date ?? null, body.expiry_date ?? null,
      body.supplier_id ?? null, body.location ?? null, body.image_url ?? null, body.status ?? 'ativo'
    );

    if (Number(body.quantity ?? 0) > 0) {
      db.prepare('INSERT INTO inventory_movements (product_id, quantity, type, user_id, reason) VALUES (?,?,?,?,?)')
        .run(info.lastInsertRowid, body.quantity, 'entrada', req.user.id, 'Estoque inicial do cadastro');
    }
    logAction(req.user.id, `Cadastrou produto: ${body.name}`, 'products', info.lastInsertRowid);
    created(res, db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    badRequest(res, 'Código ou código de barras já cadastrado para outro produto');
  }
}

// PUT /api/products/:id (admin)
async function update(req, res, id) {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) return notFound(res, 'Produto não encontrado');
  const body = await readJsonBody(req);

  const fields = ['code','barcode','name','category_id','brand','description','purchase_price','sale_price',
    'min_quantity','unit','manufacture_date','expiry_date','supplier_id','location','image_url','status'];
  const merged = Object.fromEntries(fields.map((f) => [f, body[f] !== undefined ? body[f] : p[f]]));

  db.prepare(`
    UPDATE products SET code=?, barcode=?, name=?, category_id=?, brand=?, description=?,
      purchase_price=?, sale_price=?, min_quantity=?, unit=?, manufacture_date=?, expiry_date=?,
      supplier_id=?, location=?, image_url=?, status=?, updated_at=datetime('now')
    WHERE id=?
  `).run(merged.code, merged.barcode, merged.name, merged.category_id, merged.brand, merged.description,
    merged.purchase_price, merged.sale_price, merged.min_quantity, merged.unit, merged.manufacture_date,
    merged.expiry_date, merged.supplier_id, merged.location, merged.image_url, merged.status, id);

  const priceChanged = body.sale_price !== undefined && Number(body.sale_price) !== p.sale_price;
  logAction(req.user.id, priceChanged
    ? `Alterou o preço do produto ${p.name} de ${p.sale_price} para ${body.sale_price}`
    : `Atualizou produto: ${p.name}`, 'products', id);

  ok(res, db.prepare('SELECT * FROM products WHERE id = ?').get(id));
}

// DELETE /api/products/:id (admin)
async function remove(req, res, id) {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) return notFound(res, 'Produto não encontrado');
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  logAction(req.user.id, `Removeu produto: ${p.name}`, 'products', id);
  ok(res, { message: 'Produto removido' });
}

// PUT /api/products/:id/quantity (admin/funcionario) - ajuste manual rápido
async function adjustQuantity(req, res, id) {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) return notFound(res, 'Produto não encontrado');
  const body = await readJsonBody(req);
  const delta = Number(body.delta);
  const reason = body.reason || 'Ajuste manual';
  if (Number.isNaN(delta)) return badRequest(res, 'Informe "delta" numérico (positivo ou negativo)');
  const newQty = p.quantity + delta;
  if (newQty < 0) return badRequest(res, 'Ajuste resultaria em estoque negativo');

  db.prepare("UPDATE products SET quantity = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, id);
  db.prepare('INSERT INTO inventory_movements (product_id, quantity, type, user_id, reason) VALUES (?,?,?,?,?)')
    .run(id, delta, 'ajuste', req.user.id, reason);

  if (newQty <= p.min_quantity) {
    pushNotification('estoque_baixo', `Estoque baixo: ${p.name} (${newQty} ${p.unit})`, id);
  }
  logAction(req.user.id, `Ajustou estoque de ${p.name} em ${delta}`, 'products', id, reason);
  ok(res, db.prepare('SELECT * FROM products WHERE id = ?').get(id));
}

module.exports = { list, getById, getByBarcode, create, update, remove, adjustQuantity };
