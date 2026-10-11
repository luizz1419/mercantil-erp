-- ============================================================
-- SCHEMA DO BANCO DE DADOS - SISTEMA MERCANTIL
-- SQLite (node:sqlite). Compatível conceitualmente com
-- PostgreSQL/MySQL para migração futura (ver README).
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','funcionario','cliente')),
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  reset_token TEXT,
  reset_token_expires TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  number TEXT,
  neighborhood TEXT,
  city TEXT,
  zip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cnpj TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- "inventory" (quantidade atual) fica no próprio produto por simplicidade;
-- todo o histórico/movimentação fica em inventory_movements (auditável).
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  brand TEXT,
  description TEXT,
  purchase_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 0,
  min_quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'un',
  manufacture_date TEXT,
  expiry_date TEXT,
  supplier_id INTEGER REFERENCES suppliers(id),
  location TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','inativo')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('entrada','saida','venda','devolucao','perda','vencido','ajuste')),
  user_id INTEGER REFERENCES users(id),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  customer_id INTEGER REFERENCES customers(id),
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('dinheiro','pix','debito','credito')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pedido_realizado' CHECK(status IN
    ('pedido_realizado','pagamento_aprovado','separando','pronto','saiu_para_entrega','entregue','cancelado')),
  delivery_type TEXT NOT NULL CHECK(delivery_type IN ('entrega','retirada')),
  scheduled_date TEXT,
  scheduled_time TEXT,
  address TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_method TEXT CHECK(payment_method IN ('dinheiro','pix','debito','credito')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  cpf TEXT,
  status TEXT NOT NULL DEFAULT 'disponivel' CHECK(status IN ('disponivel','em_entrega','indisponivel'))
);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  driver_id INTEGER REFERENCES delivery_drivers(id),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','em_rota','entregue','atrasado')),
  scheduled_date TEXT,
  scheduled_time TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER REFERENCES sales(id),
  order_id INTEGER REFERENCES orders(id),
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'aprovado',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('percentual','valor','quantidade','combo')),
  value REAL NOT NULL,
  product_id INTEGER REFERENCES products(id),
  start_date TEXT,
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  related_id INTEGER,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_expiry ON products(expiry_date);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

-- ============================================================
-- TABELAS NOVAS (adicionadas depois, para Quebras/Perdas e
-- Entrada de Mercadorias). Nenhuma tabela acima foi alterada —
-- isto só cria tabelas extras, então nada do que já funcionava
-- é afetado.
-- ============================================================

-- Quebras e Perdas: cada registro é uma perda de estoque com motivo,
-- valor (calculado a partir do preço de custo no momento da perda) e
-- observação. Também gera automaticamente um registro espelho em
-- inventory_movements (para o estoque continuar consistente e a tela
-- de Estoque continuar mostrando tudo certinho).
CREATE TABLE IF NOT EXISTS losses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('vencimento','avaria','deterioracao','extravio','furto','erro_estoque','outros')),
  value REAL NOT NULL,
  observation TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Entrada de Mercadorias: agrupa uma "nota de recebimento" (fornecedor +
-- nº da nota fiscal) com várias linhas de produto/quantidade/custo/validade.
CREATE TABLE IF NOT EXISTS stock_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER REFERENCES suppliers(id),
  invoice_number TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES stock_receipts(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL,
  purchase_price REAL NOT NULL,
  expiry_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_losses_product ON losses(product_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON stock_receipt_items(receipt_id);
