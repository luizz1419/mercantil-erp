const db = require('../config/db');
const { ok } = require('../utils/http');
const { classifyExpiry, getExpirySettings } = require('../services/expiryService');

// GET /api/dashboard - conteúdo adaptado ao perfil do usuário logado
async function summary(req, res) {
  const role = req.user.role;

  const salesToday = db.prepare(
    "SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS count FROM sales WHERE date(created_at) = date('now')"
  ).get();
  const salesMonth = db.prepare(
    "SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS count FROM sales WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
  ).get();

  const stockCount = db.prepare("SELECT COALESCE(SUM(quantity),0) AS total FROM products WHERE status='ativo'").get();
  const lowStock = db.prepare("SELECT * FROM products WHERE status='ativo' AND quantity <= min_quantity ORDER BY quantity ASC LIMIT 10").all();

  const settings = getExpirySettings();
  const activeProducts = db.prepare("SELECT * FROM products WHERE status='ativo' AND expiry_date IS NOT NULL").all();
  const classified = activeProducts.map((p) => ({ ...p, ...classifyExpiry(p.expiry_date, settings) }));
  const nearExpiry = classified.filter((p) => ['atencao', 'prioridade'].includes(p.status)).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 10);
  const expired = classified.filter((p) => p.status === 'vencido');

  const pendingOrders = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status NOT IN ('entregue','cancelado')").get();
  const deliveriesToday = db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE date(scheduled_date) = date('now')").get();

  const topProducts = db.prepare(`
    SELECT p.name, SUM(si.quantity) AS qty_sold, SUM(si.total) AS revenue
    FROM sale_items si JOIN products p ON p.id = si.product_id
    GROUP BY si.product_id ORDER BY qty_sold DESC LIMIT 5
  `).all();

  const avgTicket = salesMonth.count > 0 ? Math.round((salesMonth.total / salesMonth.count) * 100) / 100 : 0;

  const base = {
    sales_today: { total: salesToday.total, count: salesToday.count },
    sales_month: { total: salesMonth.total, count: salesMonth.count },
    average_ticket: avgTicket,
    stock_total_units: stockCount.total,
    low_stock_products: lowStock,
    near_expiry_products: nearExpiry,
    expired_products: expired,
    pending_orders: pendingOrders.count,
    deliveries_today: deliveriesToday.count,
    top_products: topProducts
  };

  if (role === 'cliente') {
    const customer = db.prepare('SELECT * FROM customers WHERE user_id = ?').get(req.user.id);
    const myOrders = customer
      ? db.prepare("SELECT * FROM orders WHERE customer_id = ? AND status NOT IN ('entregue','cancelado') ORDER BY created_at DESC").all(customer.id)
      : [];
    return ok(res, { role, my_open_orders: myOrders });
  }

  ok(res, { role, ...base });
}

module.exports = { summary };
