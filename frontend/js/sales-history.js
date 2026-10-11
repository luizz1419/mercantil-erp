async function openSaleDetail(id) {
  const sale = await Api.get(`/sales/${id}`);
  openModal(`
    <h2>Venda #${sale.id}</h2>
    <p class="muted small">${sale.created_at} · ${sale.seller_name || ''} ${sale.customer_name ? '· Cliente: ' + sale.customer_name : ''}</p>
    <div class="table-scroll"><table>
      <thead><tr><th>Produto</th><th>Qtd.</th><th>Unit.</th><th>Total</th></tr></thead>
      <tbody>${sale.items.map((i) => `<tr><td>${i.product_name}</td><td>${i.quantity}</td><td>${money(i.unit_price)}</td><td>${money(i.total)}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="pos-total-row"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
    <div class="pos-total-row"><span>Desconto</span><span>${money(sale.discount)}</span></div>
    <div class="pos-total-row grand"><span>Total (${sale.payment_method})</span><span>${money(sale.total)}</span></div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>
  `);
}

async function renderSalesHistory(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><h2>Histórico de vendas</h2></div>
      <div class="filters">
        <label style="flex-direction:row; align-items:center; gap:6px;">De <input type="date" id="hist-date-from" /></label>
        <label style="flex-direction:row; align-items:center; gap:6px;">Até <input type="date" id="hist-date-to" /></label>
        <button id="btn-hist-filter" class="btn btn-secondary btn-sm">Filtrar</button>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th>Nº</th><th>Data</th><th>Vendedor</th><th>Cliente</th><th>Total</th><th>Pagamento</th><th></th></tr></thead>
        <tbody id="sales-history-body"></tbody>
      </table></div>
    </div>
  `;

  async function load() {
    const params = new URLSearchParams();
    const from = document.getElementById('hist-date-from').value;
    const to = document.getElementById('hist-date-to').value;
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    const rows = await Api.get('/sales?' + params.toString());
    document.getElementById('sales-history-body').innerHTML = rows.map((s) => `
      <tr>
        <td>#${s.id}</td><td>${s.created_at}</td><td>${s.seller_name}</td><td>${s.customer_name || 'Não identificado'}</td>
        <td>${money(s.total)}</td><td>${s.payment_method}</td>
        <td><button class="btn btn-secondary btn-sm" data-view="${s.id}">Ver detalhes</button></td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="muted">Nenhuma venda no período.</td></tr>';

    document.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => openSaleDetail(btn.dataset.view)));
  }

  document.getElementById('btn-hist-filter').addEventListener('click', load);
  load();
}
