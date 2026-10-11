const db = require('../config/db');
const { ok } = require('../utils/http');

// GET /api/notifications
async function list(req, res) {
  ok(res, db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100').all());
}

// PUT /api/notifications/:id/read
async function markRead(req, res, id) {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  ok(res, { message: 'Notificação marcada como lida' });
}

// GET /api/logs (admin)
async function listLogs(req, res) {
  const rows = db.prepare(`
    SELECT l.*, u.name AS user_name FROM system_logs l
    LEFT JOIN users u ON u.id = l.user_id
    ORDER BY l.created_at DESC LIMIT 300
  `).all();
  ok(res, rows);
}

module.exports = { list, markRead, listLogs };
