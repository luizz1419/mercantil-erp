const db = require('../config/db');
const { ok } = require('../utils/http');
const { classifyExpiry, getExpirySettings } = require('../services/expiryService');

// Resolve o período a partir da query string. Se nada for informado, usa o mês corrente.
function resolvePeriod(query) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  return { dateFrom: query.date_from || monthStart, dateTo: query.date_to || today };
}

// GET /api/reports/sales?date_from=&date_to=
async function salesReport(req, res, query) {
  const { dateFrom, dateTo } = resolvePeriod(query);

  const totals = db.prepare(`
    SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS count
    FROM sales WHERE date(created_at) BETWEEN date(?) AND date(?)
  `).get(dateFrom, dateTo);

  const topProducts = db.prepare(`
    SELECT p.name, SUM(si.quantity) AS qty_sold, SUM(si.total) AS revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    WHERE date(s.created_at) BETWEEN date(?) AND date(?)
    GROUP BY si.product_id ORDER BY qty_sold DESC LIMIT 10
  `).all(dateFrom, dateTo);

  const leastProducts = db.prepare(`
    SELECT p.name, SUM(si.quantity) AS qty_sold, SUM(si.total) AS revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    WHERE date(s.created_at) BETWEEN date(?) AND date(?)
    GROUP BY si.product_id ORDER BY qty_sold ASC LIMIT 10
  `).all(dateFrom, dateTo);

  ok(res, {
    period: { dateFrom, dateTo },
    revenue: totals.revenue,
    count: totals.count,
    average_ticket: totals.count > 0 ? Math.round((totals.revenue / totals.count) * 100) / 100 : 0,
    top_products: topProducts,
    least_products: leastProducts
  });
}

// GET /api/reports/inventory
async function inventoryReport(req, res) {
  const settings = getExpirySettings();
  const products = db.prepare("SELECT * FROM products WHERE status = 'ativo'").all();
  const classified = products.map((p) => ({ ...p, ...classifyExpiry(p.expiry_date, settings) }));

  const lowStock = classified.filter((p) => p.quantity <= p.min_quantity);
  const expired = classified.filter((p) => p.status === 'vencido');
  const nearExpiry = classified.filter((p) => ['atencao', 'prioridade'].includes(p.status));

  // Produtos sem nenhuma venda registrada (parado no estoque)
  const noMovement = db.prepare(`
    SELECT p.* FROM products p
    WHERE p.status = 'ativo' AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.product_id = p.id)
  `).all();

  ok(res, { low_stock: lowStock, expired, near_expiry: nearExpiry, no_movement: noMovement });
}

// GET /api/reports/losses?date_from=&date_to=
async function lossesReport(req, res, query) {
  const { dateFrom, dateTo } = resolvePeriod(query);

  const total = db.prepare(
    "SELECT COALESCE(SUM(value),0) AS total, COUNT(*) AS count FROM losses WHERE date(created_at) BETWEEN date(?) AND date(?)"
  ).get(dateFrom, dateTo);

  const byReason = db.prepare(`
    SELECT reason, SUM(value) AS total, COUNT(*) AS count FROM losses
    WHERE date(created_at) BETWEEN date(?) AND date(?) GROUP BY reason ORDER BY total DESC
  `).all(dateFrom, dateTo);

  const byProduct = db.prepare(`
    SELECT p.name AS product_name, SUM(l.value) AS total, SUM(l.quantity) AS quantity
    FROM losses l JOIN products p ON p.id = l.product_id
    WHERE date(l.created_at) BETWEEN date(?) AND date(?)
    GROUP BY l.product_id ORDER BY total DESC LIMIT 10
  `).all(dateFrom, dateTo);

  ok(res, { period: { dateFrom, dateTo }, total: total.total, count: total.count, by_reason: byReason, top_products: byProduct });
}

// GET /api/reports/customers?date_from=&date_to=
async function customersReport(req, res, query) {
  const { dateFrom, dateTo } = resolvePeriod(query);

  const topCustomers = db.prepare(`
    SELECT c.name, COUNT(s.id) AS purchase_count, SUM(s.total) AS total_spent
    FROM sales s JOIN customers c ON c.id = s.customer_id
    WHERE date(s.created_at) BETWEEN date(?) AND date(?)
    GROUP BY s.customer_id ORDER BY total_spent DESC LIMIT 10
  `).all(dateFrom, dateTo);

  ok(res, { period: { dateFrom, dateTo }, top_customers: topCustomers });
}

module.exports = { salesReport, inventoryReport, lossesReport, customersReport };
