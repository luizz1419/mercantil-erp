const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', '..', 'data', 'mercantil.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Configurações padrão de validade (dias antes do vencimento) - editável pelo admin
const defaultSettings = {
  expiry_attention_days: '30',   // acima disso = normal
  expiry_priority_days: '15',    // 15-30 = atencao, 1-14 = prioridade
  low_stock_notify: '1'
};
const getSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?');
const insertSetting = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  if (!getSetting.get(key)) insertSetting.run(key, value);
}

module.exports = db;
