const db = require('../config/db');

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function getExpirySettings() {
  const rows = db.prepare(
    "SELECT key, value FROM system_settings WHERE key IN ('expiry_attention_days','expiry_priority_days')"
  ).all();
  const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  return {
    attentionDays: map.expiry_attention_days ?? 30, // > attentionDays => normal
    priorityDays: map.expiry_priority_days ?? 15     // <= attentionDays e > priorityDays => atencao
                                                       // <= priorityDays e >= 0 => prioridade
                                                       // < 0 => vencido
  };
}

// Classifica um produto: 'normal' | 'atencao' | 'prioridade' | 'vencido'
function classifyExpiry(expiryDate, settings = getExpirySettings()) {
  const d = daysUntil(expiryDate);
  if (d === null) return { status: 'normal', daysLeft: null };
  if (d < 0) return { status: 'vencido', daysLeft: d };
  if (d <= settings.priorityDays) return { status: 'prioridade', daysLeft: d };
  if (d <= settings.attentionDays) return { status: 'atencao', daysLeft: d };
  return { status: 'normal', daysLeft: d };
}

function logAction(userId, action, entity, entityId, details) {
  db.prepare(
    'INSERT INTO system_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)'
  ).run(userId ?? null, action, entity ?? null, entityId ?? null, details ? String(details) : null);
}

function pushNotification(type, message, relatedId) {
  db.prepare(
    'INSERT INTO notifications (type, message, related_id) VALUES (?, ?, ?)'
  ).run(type, message, relatedId ?? null);
}

module.exports = { daysUntil, getExpirySettings, classifyExpiry, logAction, pushNotification };
