let receivingLines = [];
let receivingProducts = [];

function receivingLineRow(line, index) {
  const productOptions = receivingProducts.map((p) => `<option value="${p.id}" ${p.id === line.product_id ? 'selected' : ''}>${p.name}</option>`).join('');
  return `
    <tr data-line="${index}">
      <td><select data-field="product_id" style="min-width:180px">${productOptions}</select></td>
      <td><input data-field="quantity" type="number" min="0.01" step="0.01" value="${line.quantity}" style="width:90px" /></td>
      <td><input data-field="purchase_price" type="number" min="0" step="0.01" value="${line.purchase_price}" style="width:100px" /></td>
      <td><input data-field="expiry_date" type="date" value="${line.expiry_date || ''}" /></td>
      <td><button type="button" class="btn btn-danger btn-sm" data-remove-line="${index}">Remover</button></td>
    </tr>
  `;
}

function renderReceivingLines() {
  const tbody = document.getElementById('receiving-lines-body');
  if (!tbody) return;
  tbody.innerHTML = receivingLines.map((line, i) => receivingLineRow(line, i)).join('');

  tbody.querySelectorAll('select[data-field], input[data-field]').forEach((el) => {
    el.addEventListener('input', (e) => {
      const idx = Number(e.target.closest('tr').dataset.line);
      const field = e.target.dataset.field;
      receivingLines[idx][field] = field === 'quantity' || field === 'purchase_price' ? Number(e.target.value) : e.target.value;
    });
  });
  tbody.querySelectorAll('[data-remove-line]').forEach((btn) => {
    btn.addEventListener('click', () => {
      receivingLines.splice(Number(btn.dataset.removeLine), 1);
      renderReceivingLines();
    });
  });
}

async function renderReceiving(container) {
  const [suppliers, products, receipts] = await Promise.all([
    Api.get('/suppliers'), Api.get('/products'), Api.get('/receiving')
  ]);
  receivingProducts = products;
  receivingLines = [{ product_id: products[0]?.id, quantity: 1, purchase_price: products[0]?.purchase_price || 0, expiry_date: '' }];

  container.innerHTML = `
    <div class="card">
      <div class="card-header"><h2>Entrada de mercadoria</h2></div>
      <form id="form-receiving">
        <div class="grid-2">
          <label>Fornecedor
            <select name="supplier_id"><option value="">— não informado —</option>${suppliers.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
          </label>
          <label>Nota fiscal<input name="invoice_number" placeholder="Ex.: 000123" /></label>
        </div>

        <div class="table-scroll" style="margin-top:14px;">
          <table>
            <thead><tr><th>Produto</th><th>Qtd.</th><th>Preço de custo</th><th>Validade</th><th></th></tr></thead>
            <tbody id="receiving-lines-body"></tbody>
          </table>
        </div>
        <button type="button" id="btn-add-line" class="btn btn-secondary btn-sm" style="margin-top:10px;">+ Adicionar produto</button>

        <div id="receiving-form-error" class="error-msg" style="margin-top:10px;"></div>
        <button type="submit" class="btn btn-primary" style="margin-top:10px;">Confirmar entrada</button>
      </form>
    </div>

    <div class="card">
      <div class="card-header"><h2>Últimos recebimentos</h2></div>
      <div id="receipts-list"></div>
    </div>
  `;

  renderReceivingLines();

  document.getElementById('btn-add-line').addEventListener('click', () => {
    receivingLines.push({ product_id: products[0]?.id, quantity: 1, purchase_price: products[0]?.purchase_price || 0, expiry_date: '' });
    renderReceivingLines();
  });

  document.getElementById('receipts-list').innerHTML = receipts.length === 0 ? '<p class="muted">Nenhum recebimento registrado ainda.</p>' :
    receipts.map((r) => `
      <div style="padding:10px 0; border-bottom:1px solid var(--border);">
        <b>NF ${r.invoice_number || 's/nº'}</b> · ${r.supplier_name || 'fornecedor não informado'} · ${r.created_at} · ${r.user_name || ''}
        <div class="small muted">${r.items.map((i) => `${i.product_name} (+${i.quantity} ${i.unit})`).join(', ')}</div>
      </div>
    `).join('');

  document.getElementById('form-receiving').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('receiving-form-error');
    errorEl.textContent = '';
    const fd = new FormData(e.target);
    const supplier_id = fd.get('supplier_id') ? Number(fd.get('supplier_id')) : null;
    const invoice_number = fd.get('invoice_number') || null;

    if (receivingLines.length === 0) { errorEl.textContent = 'Adicione ao menos um produto.'; return; }

    try {
      await Api.post('/receiving', {
        supplier_id, invoice_number,
        items: receivingLines.map((l) => ({ product_id: Number(l.product_id), quantity: l.quantity, purchase_price: l.purchase_price, expiry_date: l.expiry_date || null }))
      });
      showToast('Entrada de mercadoria registrada.');
      renderReceiving(container);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}
