const Router = require('../router');
const { requireAuth, requireRole } = require('../middlewares/auth');

const auth = require('../controllers/authController');
const users = require('../controllers/userController');
const catalog = require('../controllers/catalogController');
const products = require('../controllers/productController');
const inventory = require('../controllers/inventoryController');
const sales = require('../controllers/salesController');
const customers = require('../controllers/customerController');
const dashboard = require('../controllers/dashboardController');
const notifications = require('../controllers/notificationController');
const losses = require('../controllers/lossController');
const receiving = require('../controllers/receivingController');
const reports = require('../controllers/reportController');

const ADMIN = ['admin'];
const STAFF = ['admin', 'funcionario'];
const ANY = ['admin', 'funcionario', 'cliente'];

const router = new Router();

// ---------- Auth (público) ----------
router.post('/api/auth/register', (req, res) => auth.register(req, res));
router.post('/api/auth/login', (req, res) => auth.login(req, res));
router.post('/api/auth/forgot-password', (req, res) => auth.forgotPassword(req, res));
router.post('/api/auth/reset-password', (req, res) => auth.resetPassword(req, res));

// ---------- Auth (autenticado) ----------
router.get('/api/auth/me', (req, res) => { if (requireAuth(req, res)) auth.me(req, res); });
router.post('/api/auth/logout', (req, res) => { if (requireAuth(req, res)) auth.logout(req, res); });
router.put('/api/auth/change-password', (req, res) => { if (requireAuth(req, res)) auth.changePassword(req, res); });

// ---------- Usuários (admin) ----------
router.get('/api/users', (req, res) => { if (requireRole(req, res, ADMIN)) users.list(req, res); });
router.post('/api/users', (req, res) => { if (requireRole(req, res, ADMIN)) users.create(req, res); });
router.put('/api/users/:id', (req, res, p) => { if (requireRole(req, res, ADMIN)) users.update(req, res, p.id); });

// ---------- Categorias ----------
router.get('/api/categories', (req, res) => { if (requireAuth(req, res)) catalog.listCategories(req, res); });
router.post('/api/categories', (req, res) => { if (requireRole(req, res, ADMIN)) catalog.createCategory(req, res); });

// ---------- Fornecedores (admin) ----------
router.get('/api/suppliers', (req, res) => { if (requireRole(req, res, ADMIN)) catalog.listSuppliers(req, res); });
router.post('/api/suppliers', (req, res) => { if (requireRole(req, res, ADMIN)) catalog.createSupplier(req, res); });
router.put('/api/suppliers/:id', (req, res, p) => { if (requireRole(req, res, ADMIN)) catalog.updateSupplier(req, res, p.id); });

// ---------- Produtos ----------
router.get('/api/products', (req, res, p, q) => { if (requireAuth(req, res)) products.list(req, res, q); });
router.get('/api/products/barcode/:code', (req, res, p) => { if (requireAuth(req, res)) products.getByBarcode(req, res, p.code); });
router.get('/api/products/:id', (req, res, p) => { if (requireAuth(req, res)) products.getById(req, res, p.id); });
router.post('/api/products', (req, res) => { if (requireRole(req, res, ADMIN)) products.create(req, res); });
router.put('/api/products/:id', (req, res, p) => { if (requireRole(req, res, ADMIN)) products.update(req, res, p.id); });
router.put('/api/products/:id/quantity', (req, res, p) => { if (requireRole(req, res, STAFF)) products.adjustQuantity(req, res, p.id); });
router.delete('/api/products/:id', (req, res, p) => { if (requireRole(req, res, ADMIN)) products.remove(req, res, p.id); });

// ---------- Estoque ----------
router.get('/api/inventory/movements', (req, res, p, q) => { if (requireRole(req, res, STAFF)) inventory.listMovements(req, res, q); });
router.post('/api/inventory/movements', (req, res) => { if (requireRole(req, res, STAFF)) inventory.createMovement(req, res); });
router.get('/api/inventory/expiry-status', (req, res) => { if (requireRole(req, res, STAFF)) inventory.expiryStatus(req, res); });
router.get('/api/inventory/priority-sales', (req, res) => { if (requireRole(req, res, STAFF)) inventory.prioritySales(req, res); });
router.put('/api/inventory/settings', (req, res) => { if (requireRole(req, res, ADMIN)) inventory.updateSettings(req, res); });

// ---------- Vendas (PDV) ----------
router.post('/api/sales', (req, res) => { if (requireRole(req, res, STAFF)) sales.create(req, res); });
router.get('/api/sales', (req, res, p, q) => { if (requireRole(req, res, STAFF)) sales.list(req, res, q); });
router.get('/api/sales/:id', (req, res, p) => { if (requireRole(req, res, STAFF)) sales.getById(req, res, p.id); });

// ---------- Clientes ----------
router.get('/api/customers', (req, res, p, q) => { if (requireRole(req, res, STAFF)) customers.list(req, res, q); });
router.post('/api/customers', (req, res) => { if (requireRole(req, res, STAFF)) customers.create(req, res); });
router.get('/api/customers/:id', (req, res, p) => { if (requireRole(req, res, STAFF)) customers.getById(req, res, p.id); });

// ---------- Dashboard ----------
router.get('/api/dashboard', (req, res) => { if (requireRole(req, res, ANY)) dashboard.summary(req, res); });

// ---------- Notificações ----------
router.get('/api/notifications', (req, res) => { if (requireRole(req, res, STAFF)) notifications.list(req, res); });
router.put('/api/notifications/:id/read', (req, res, p) => { if (requireRole(req, res, STAFF)) notifications.markRead(req, res, p.id); });
router.get('/api/logs', (req, res) => { if (requireRole(req, res, ADMIN)) notifications.listLogs(req, res); });

// ---------- Quebras e Perdas ----------
router.get('/api/losses', (req, res, p, q) => { if (requireRole(req, res, STAFF)) losses.list(req, res, q); });
router.post('/api/losses', (req, res) => { if (requireRole(req, res, STAFF)) losses.create(req, res); });
router.get('/api/losses/summary', (req, res, p, q) => { if (requireRole(req, res, STAFF)) losses.summary(req, res, q); });

// ---------- Entrada de Mercadorias ----------
router.post('/api/receiving', (req, res) => { if (requireRole(req, res, STAFF)) receiving.create(req, res); });
router.get('/api/receiving', (req, res) => { if (requireRole(req, res, STAFF)) receiving.list(req, res); });

// ---------- Relatórios (admin) ----------
router.get('/api/reports/sales', (req, res, p, q) => { if (requireRole(req, res, ADMIN)) reports.salesReport(req, res, q); });
router.get('/api/reports/inventory', (req, res) => { if (requireRole(req, res, ADMIN)) reports.inventoryReport(req, res); });
router.get('/api/reports/losses', (req, res, p, q) => { if (requireRole(req, res, ADMIN)) reports.lossesReport(req, res, q); });
router.get('/api/reports/customers', (req, res, p, q) => { if (requireRole(req, res, ADMIN)) reports.customersReport(req, res, q); });

module.exports = router;
