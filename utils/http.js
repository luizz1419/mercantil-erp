function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function ok(res, data) { sendJson(res, 200, data); }
function created(res, data) { sendJson(res, 201, data); }
function badRequest(res, message) { sendJson(res, 400, { error: message }); }
function unauthorized(res, message = 'Não autenticado') { sendJson(res, 401, { error: message }); }
function forbidden(res, message = 'Sem permissão para esta ação') { sendJson(res, 403, { error: message }); }
function notFound(res, message = 'Recurso não encontrado') { sendJson(res, 404, { error: message }); }
function serverError(res, err) {
  console.error(err);
  sendJson(res, 500, { error: 'Erro interno do servidor' });
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5_000_000) req.destroy(); // limite simples anti-abuso
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('JSON inválido no corpo da requisição')); }
    });
    req.on('error', reject);
  });
}

module.exports = { ok, created, badRequest, unauthorized, forbidden, notFound, serverError, readJsonBody };
