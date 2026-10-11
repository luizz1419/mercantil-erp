const { verifyToken } = require('../utils/auth');
const { unauthorized, forbidden } = require('../utils/http');

// Retorna o usuário autenticado (ou null) a partir do header Authorization: Bearer <token>
function getAuthUser(req) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  return verifyToken(token); // { id, name, role, exp } ou null se inválido/expirado
}

// Exige autenticação. Retorna false (e já responde 401) se não autenticado.
function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    unauthorized(res, 'Token ausente, inválido ou expirado');
    return null;
  }
  req.user = user;
  return user;
}

// Exige que o usuário autenticado tenha um dos papéis permitidos.
function requireRole(req, res, roles) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!roles.includes(user.role)) {
    forbidden(res, `Esta ação requer o perfil: ${roles.join(' ou ')}`);
    return null;
  }
  return user;
}

module.exports = { getAuthUser, requireAuth, requireRole };
