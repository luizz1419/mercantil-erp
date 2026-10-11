// ============================================================
// DADOS DE TESTE - use apenas em desenvolvimento.
// Rode com: npm run seed
// Cria usuários de exemplo e alguns produtos para você testar
// o fluxo completo (login -> PDV -> dashboard -> validade).
// NÃO utilize estes dados/senhas em um ambiente de produção.
// ============================================================
const db = require('./src/config/db');
const { hashPassword } = require('./src/utils/auth');

function upsertUser(name, email, password, role) {
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return exists.id;
  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)'
  ).run(name, email, hashPassword(password), role);
  return info.lastInsertRowid;
}

console.log('Inserindo dados de TESTE...');

upsertUser('Administrador (TESTE)', 'admin@mercantil.test', 'admin123', 'admin');
upsertUser('Funcionário Caixa (TESTE)', 'caixa@mercantil.test', 'caixa123', 'funcionario');
const clienteId = upsertUser('Cliente Exemplo (TESTE)', 'cliente@mercantil.test', 'cliente123', 'cliente');
if (!db.prepare('SELECT id FROM customers WHERE user_id = ?').get(clienteId)) {
  db.prepare('INSERT INTO customers (user_id, name, email) VALUES (?,?,?)')
    .run(clienteId, 'Cliente Exemplo (TESTE)', 'cliente@mercantil.test');
}

function upsertCategory(name) {
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (row) return row.id;
  return db.prepare('INSERT INTO categories (name) VALUES (?)').run(name).lastInsertRowid;
}
const catLaticinios = upsertCategory('Laticínios');
const catMercearia = upsertCategory('Mercearia');
const catHigiene = upsertCategory('Higiene e Limpeza');

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const testProducts = [
  // [code, barcode, name, category, brand, purchase, sale, qty, min, unit, expiryInDays]
  ['LEI001', '7891000100103', 'Leite Integral 1L (TESTE)', catLaticinios, 'Marca X', 3.2, 4.99, 40, 10, 'un', 5],
  ['LEI002', '7891000100110', 'Iogurte Natural 170g (TESTE)', catLaticinios, 'Marca X', 1.8, 2.99, 20, 15, 'un', 20],
  ['ARR001', '7891000200103', 'Arroz Branco 5kg (TESTE)', catMercearia, 'Marca Y', 18.0, 24.9, 60, 10, 'un', 180],
  ['FEI001', '7891000200110', 'Feijão Carioca 1kg (TESTE)', catMercearia, 'Marca Y', 5.5, 7.99, 8, 10, 'un', 120],
  ['SAB001', '7891000300103', 'Sabonete 90g (TESTE)', catHigiene, 'Marca Z', 1.1, 2.49, 50, 20, 'un', 400],
  ['IOG002', '7891000300110', 'Iogurte Vencido Exemplo (TESTE)', catLaticinios, 'Marca X', 1.8, 2.99, 5, 10, 'un', -2]
];

const insertProduct = db.prepare(`
  INSERT INTO products (code, barcode, name, category_id, brand, purchase_price, sale_price, quantity, min_quantity, unit, expiry_date, status)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,'ativo')
`);

for (const [code, barcode, name, cat, brand, buy, sell, qty, min, unit, expDays] of testProducts) {
  const exists = db.prepare('SELECT id FROM products WHERE code = ?').get(code);
  if (exists) continue;
  insertProduct.run(code, barcode, name, cat, brand, buy, sell, qty, min, unit, daysFromNow(expDays));
}

console.log('Concluído. Usuários de teste:');
console.log('  admin@mercantil.test / admin123 (Administrador)');
console.log('  caixa@mercantil.test / caixa123 (Funcionário)');
console.log('  cliente@mercantil.test / cliente123 (Cliente)');
