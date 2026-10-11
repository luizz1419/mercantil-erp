// Router minimalista (sem dependências externas) que suporta parâmetros de rota (:id)
// e query string, no mesmo espírito de um Router do Express.
class Router {
  constructor() {
    this.routes = []; // { method, pattern: RegExp, keys: string[], handler }
  }

  _register(method, path, handler) {
    const keys = [];
    const pattern = new RegExp(
      '^' +
        path
          .split('/')
          .map((segment) => {
            if (segment.startsWith(':')) {
              keys.push(segment.slice(1));
              return '([^/]+)';
            }
            return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('/') +
        '/?$'
    );
    this.routes.push({ method, pattern, keys, handler });
  }

  get(path, handler) { this._register('GET', path, handler); }
  post(path, handler) { this._register('POST', path, handler); }
  put(path, handler) { this._register('PUT', path, handler); }
  delete(path, handler) { this._register('DELETE', path, handler); }

  // Retorna { handler, params } ou null
  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.pattern.exec(pathname);
      if (!m) continue;
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { handler: route.handler, params };
    }
    return null;
  }
}

module.exports = Router;
