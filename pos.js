let posCart = []; // [{ product, quantity }]
let posCustomerId = null;

function posCalcTotals(discount) {
  const subtotal = posCart.reduce((sum, i) => sum + i.product.sale_price * i.quantity, 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0));
  return { subtotal, total };
}

async function renderPos(container) {
  posCart = [];
  posCustomerId = null;
  const priority = await Api.get('/inventory/priority-sales');

  container.innerHTML = `
    ${priority.length ? `<div class="priority-banner">⚠️ PRIORIDADE DE VENDA: ${priority.slice(0,3).map(p => `${p.name} (${p.daysLeft}d, ${p.quantity} ${p.unit})`).join(' · ')}${priority.length > 3 ? ` e mais ${priority.length - 3}...` : ''}</div>` : ''}
    <div class="pos-layout">
      <div class="card">
        <div class="card-header"><h2>Buscar produto</h2></div>
        <input id="pos-search" placeholder="Nome, código ou código de barras... (Enter para adicionar o primeiro resultado)" autofocus />
        <div id="pos-results" class="pos-search-results"></div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Carrinho</h2></div>
        <div id="pos-cart"><p class="muted">Nenhum item adicionado ainda.</p></div>

        <div style="margin-top:14px;">
          <label>Cliente (opcional)
            <select id="pos-customer"><option value="">Consumidor não identificado</option></select>
          </label>
        </div>
        <div class="grid-2" style="margin-top:10px;">
          <label>Desconto (R$)<input id="pos-discount" type="number" min="0" step="0.01" value="0" /></label>
          <label>Pagamento
            <select id="pos-payment">
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="debito">Cartão de débito</option>
              <option value="credito">Cartão de crédito</option>
            </select>
          </label>
        </div>

        <div style="margin-top:14px;">
          <div class="pos-total-row"><span>Subtotal</span><span id="pos-subtotal">R$ 0,00</span></div>
          <div class="pos-total-row grand"><span>Total</span><span id="pos-total">R$ 0,00</span></div>
        </div>
        <div id="pos-error" class="error-msg"></div>
        <button id="btn-finalize-sale" class="btn btn-primary btn-block" style="margin-top:10px;">Finalizar venda</button>
      </div>
    </div>
  `;

  Api.get('/customers').then(customers => {
    const sel = document.getElementById('pos-customer');
    sel.innerHTML += customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  });

  const searchInput = document.getElementById('pos-search');
  const resultsBox = document.getElementById('pos-results');
  let lastResults = [];

  const search = debounce(async () => {
    const q = searchInput.value.trim();
    if (!q) { resultsBox.innerHTML = ''; lastResults = []; return; }
    const products = await Api.get('/products?q=' + encodeURIComponent(q));
    lastResults = products.filter(p => p.status === 'ativo');
    resultsBox.innerHTML = lastResults.map(p => `
      <div class="pos-product-row" data-add="${p.id}">
        <span>${p.name} ${p.expiry_status !== 'normal' ? expiryTag(p.expiry_status) : ''}</span>
        <span>${money(p.sale_price)} · ${p.quantity} ${p.unit} disp.</span>
      </div>
    `).join('') || '<p class="muted">Nenhum produto encontrado.</p>';
    resultsBox.querySelectorAll('[data-add]').forEach(row =>
      row.addEventListener('click', () => addToCart(Number(row.dataset.add))));
  }, 250);

  searchInput.addEventListener('input', search);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && lastResults.length) { e.preventDefault(); addToCart(lastResults[0].id); }
  });

  function addToCart(productId) {
    const product = lastResults.find(p => p.id === productId) || posCart.find(i => i.product.id === productId)?.product;
    if (!product) return;
    if (product.expiry_status === 'vencido') { showToast('Produto vencido não pode ser vendido.', 'error'); return; }
    const existing = posCart.find(i => i.product.id === productId);
    if (existing) {
      if (existing.quantity + 1 > product.quantity) { showToast('Quantidade indisponível em estoque.', 'error'); return; }
      existing.quantity += 1;
    } else {
      posCart.push({ product, quantity: 1 });
    }
    searchInput.value = ''; resultsBox.innerHTML = '';
    searchInput.focus();
    renderCart();
  }

  function changeQty(productId, delta) {
    const item = posCart.find(i => i.product.id === productId);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) { posCart = posCart.filter(i => i.product.id !== productId); }
    else if (newQty > item.product.quantity) { showToast('Quantidade indisponível em estoque.', 'error'); return; }
    else { item.quantity = newQty; }
    renderCart();
  }

  function renderCart() {
    const cartBox = document.getElementById('pos-cart');
    cartBox.innerHTML = posCart.length === 0 ? '<p class="muted">Nenhum item adicionado ainda.</p>' :
      posCart.map(i => `
        <div class="cart-row">
          <div>
            <div>${i.product.name}</div>
            <div class="small muted">${money(i.product.sale_price)} un.</div>
          </div>
          <div class="qty-controls">
            <button class="qty-btn" data-dec="${i.product.id}">−</button>
            <span>${i.quantity}</span>
            <button class="qty-btn" data-inc="${i.product.id}">+</button>
            <b style="margin-left:8px;">${money(i.product.sale_price * i.quantity)}</b>
          </div>
        </div>
      `).join('');
    cartBox.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => changeQty(Number(b.dataset.inc), 1)));
    cartBox.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => changeQty(Number(b.dataset.dec), -1)));
    updateTotals();
  }

  function updateTotals() {
    const discount = document.getElementById('pos-discount').value;
    const { subtotal, total } = posCalcTotals(discount);
    document.getElementById('pos-subtotal').textContent = money(subtotal);
    document.getElementById('pos-total').textContent = money(total);
  }

  document.getElementById('pos-discount').addEventListener('input', updateTotals);

  document.getElementById('btn-finalize-sale').addEventListener('click', async () => {
    const errorEl = document.getElementById('pos-error');
    errorEl.textContent = '';
    if (posCart.length === 0) { errorEl.textContent = 'Adicione ao menos um produto ao carrinho.'; return; }
    const customerId = document.getElementById('pos-customer').value;
    const payment_method = document.getElementById('pos-payment').value;
    const discount = Number(document.getElementById('pos-discount').value) || 0;

    try {
      const receipt = await Api.post('/sales', {
        customer_id: customerId ? Number(customerId) : null,
        payment_method,
        discount,
        items: posCart.map(i => ({ product_id: i.product.id, quantity: i.quantity }))
      });
      showReceipt(receipt);
      renderPos(container);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function showReceipt(sale) {
  openModal(`
    <h2>✅ Venda #${sale.id} concluída</h2>
    <div class="table-scroll"><table>
      <thead><tr><th>Produto</th><th>Qtd.</th><th>Unit.</th><th>Total</th></tr></thead>
      <tbody>${sale.items.map(i => `<tr><td>${i.product_name}</td><td>${i.quantity}</td><td>${money(i.unit_price)}</td><td>${money(i.total)}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="pos-total-row"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
    <div class="pos-total-row"><span>Desconto</span><span>${money(sale.discount)}</span></div>
    <div class="pos-total-row grand"><span>Total (${sale.payment_method})</span><span>${money(sale.total)}</span></div>
    <div class="modal-actions"><button class="btn btn-primary" onclick="closeModal()">Nova venda</button></div>
  `);
}
