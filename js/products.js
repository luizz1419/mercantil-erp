function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal">${html}</div></div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

async function loadCategoryOptions(selectedId) {
  const categories = await Api.get('/categories');
  return categories.map(c => `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${c.name}</option>`).join('');
}

function productForm(product = {}, categoryOptions) {
  const isEdit = !!product.id;
  return `
    <h2>${isEdit ? 'Editar produto' : 'Novo produto'}</h2>
    <form id="form-product" class="stack">
      <div class="grid-2">
        <label>Código<input name="code" value="${product.code || ''}" required /></label>
        <label>Código de barras<input name="barcode" value="${product.barcode || ''}" /></label>
      </div>
      <label>Nome<input name="name" value="${product.name || ''}" required /></label>
      <div class="grid-2">
        <label>Categoria
          <select name="category_id"><option value="">—</option>${categoryOptions}</select>
        </label>
        <label>Marca<input name="brand" value="${product.brand || ''}" /></label>
      </div>
      <label>Descrição<textarea name="description" rows="2">${product.description || ''}</textarea></label>
      <div class="grid-2">
        <label>Preço de compra (R$)<input type="number" step="0.01" min="0" name="purchase_price" value="${product.purchase_price ?? ''}" /></label>
        <label>Preço de venda (R$)<input type="number" step="0.01" min="0" name="sale_price" value="${product.sale_price ?? ''}" required /></label>
      </div>
      <div class="grid-2">
        ${isEdit ? '' : `<label>Quantidade inicial<input type="number" step="0.01" min="0" name="quantity" value="${product.quantity ?? 0}" /></label>`}
        <label>Estoque mínimo<input type="number" step="0.01" min="0" name="min_quantity" value="${product.min_quantity ?? 0}" /></label>
      </div>
      <div class="grid-2">
        <label>Unidade<input name="unit" value="${product.unit || 'un'}" /></label>
        <label>Localização no estoque<input name="location" value="${product.location || ''}" /></label>
      </div>
      <div class="grid-2">
        <label>Data de fabricação<input type="date" name="manufacture_date" value="${product.manufacture_date || ''}" /></label>
        <label>Data de validade<input type="date" name="expiry_date" value="${product.expiry_date || ''}" /></label>
      </div>
      <label>Status
        <select name="status">
          <option value="ativo" ${product.status === 'ativo' || !isEdit ? 'selected' : ''}>Ativo</option>
          <option value="inativo" ${product.status === 'inativo' ? 'selected' : ''}>Inativo</option>
        </select>
      </label>
      <div id="product-form-error" class="error-msg"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar alterações' : 'Cadastrar produto'}</button>
      </div>
    </form>
  `;
}

async function openProductForm(product = {}) {
  const options = await loadCategoryOptions(product.category_id);
  openModal(productForm(product, options));
  document.getElementById('form-product').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    ['category_id', 'purchase_price', 'sale_price', 'quantity', 'min_quantity'].forEach(k => {
      if (body[k] === '') delete body[k]; else if (k !== 'category_id' || body[k] !== '') body[k] = Number(body[k]);
    });
    try {
      if (product.id) await Api.put(`/products/${product.id}`, body);
      else await Api.post('/products', body);
      closeModal();
      showToast(product.id ? 'Produto atualizado.' : 'Produto cadastrado.');
      renderProducts(document.getElementById('page-content'));
    } catch (err) {
      document.getElementById('product-form-error').textContent = err.message;
    }
  });
}

async function renderProducts(container) {
  const user = Store.getUser();
  const isAdmin = user.role === 'admin';

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Produtos</h2>
        ${isAdmin ? '<button id="btn-new-product" class="btn btn-primary btn-sm">+ Novo produto</button>' : ''}
      </div>
      <div class="filters">
        <input id="filter-q" placeholder="Buscar por nome, código ou código de barras..." />
        <select id="filter-expiry">
          <option value="">Validade: todas</option>
          <option value="normal">🟢 Normal</option>
          <option value="atencao">🟡 Atenção</option>
          <option value="prioridade">🟠 Prioridade</option>
          <option value="vencido">🔴 Vencido</option>
        </select>
      </div>
      <div class="table-scroll"><table id="products-table">
        <thead><tr><th>Código</th><th>Nome</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Validade</th><th></th></tr></thead>
        <tbody></tbody>
      </table></div>
    </div>
  `;

  async function load() {
    const params = new URLSearchParams();
    const q = document.getElementById('filter-q').value.trim();
    const exp = document.getElementById('filter-expiry').value;
    if (q) params.set('q', q);
    if (exp) params.set('expiry_status', exp);
    const products = await Api.get('/products?' + params.toString());
    const tbody = document.querySelector('#products-table tbody');
    tbody.innerHTML = products.map(p => `
      <tr>
        <td>${p.code}</td>
        <td>${p.name}</td>
        <td>${p.category_name || '—'}</td>
        <td>${money(p.sale_price)}</td>
        <td>${p.low_stock ? `<span class="tag tag-low">${p.quantity} ${p.unit}</span>` : `${p.quantity} ${p.unit}`}</td>
        <td>${p.expiry_date ? expiryTag(p.expiry_status) : '—'}</td>
        <td>${isAdmin ? `<button class="btn btn-secondary btn-sm" data-edit="${p.id}">Editar</button> <button class="btn btn-danger btn-sm" data-del="${p.id}">Excluir</button>` : ''}</td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="muted">Nenhum produto encontrado.</td></tr>';

    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', async () => {
      const p = products.find(x => x.id === Number(btn.dataset.edit));
      openProductForm(p);
    }));
    tbody.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Remover este produto do catálogo?')) return;
      try { await Api.del(`/products/${btn.dataset.del}`); showToast('Produto removido.'); load(); }
      catch (err) { showToast(err.message, 'error'); }
    }));
  }

  document.getElementById('filter-q').addEventListener('input', debounce(load, 300));
  document.getElementById('filter-expiry').addEventListener('change', load);
  if (isAdmin) document.getElementById('btn-new-product').addEventListener('click', () => openProductForm());

  load();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
