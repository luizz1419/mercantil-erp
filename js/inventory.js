async function renderInventory(container) {
  const [priority, movements] = await Promise.all([
    Api.get('/inventory/priority-sales'),
    Api.get('/inventory/movements')
  ]);
  const products = await Api.get('/products');

  container.innerHTML = `
    ${priority.length ? `<div class="priority-banner">⚠️ <b>${priority.length} produto(s)</b> em prioridade de venda (FEFO) — vendê-los antes dos demais reduz perdas por vencimento.</div>` : ''}

    <div class="card">
      <div class="card-header"><h2>🎯 Fila de prioridade de venda (First Expire, First Out)</h2></div>
      ${priority.length === 0 ? '<p class="muted">Nenhum produto em prioridade no momento.</p>' :
        `<div class="table-scroll"><table><thead><tr><th>Produto</th><th>Validade</th><th>Dias restantes</th><th>Qtd.</th><th>Status</th></tr></thead><tbody>
          ${priority.map(p => `<tr><td>${p.name}</td><td>${p.expiry_date}</td><td>${p.daysLeft}</td><td>${p.quantity} ${p.unit}</td><td>${expiryTag(p.status)}</td></tr>`).join('')}
        </tbody></table></div>`}
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Registrar movimentação de estoque</h2>
      </div>
      <form id="form-movement" class="grid-3">
        <label>Produto
          <select name="product_id" required>${products.map(p => `<option value="${p.id}">${p.name} (${p.quantity} ${p.unit})</option>`).join('')}</select>
        </label>
        <label>Tipo
          <select name="type" required>
            <option value="entrada">Entrada</option>
            <option value="devolucao">Devolução</option>
            <option value="perda">Perda</option>
            <option value="vencido">Produto vencido (retirada)</option>
            <option value="ajuste">Ajuste manual</option>
          </select>
        </label>
        <label>Quantidade<input type="number" name="quantity" min="0.01" step="0.01" required /></label>
        <label style="grid-column: 1 / -1">Motivo<input name="reason" placeholder="Ex.: recebimento do fornecedor X" /></label>
        <div style="grid-column: 1 / -1"><button class="btn btn-primary btn-sm" type="submit">Registrar movimentação</button></div>
      </form>
      <div id="movement-error" class="error-msg"></div>
    </div>

    <div class="card">
      <div class="card-header"><h2>Últimas movimentações</h2></div>
      <div class="table-scroll"><table><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Qtd.</th><th>Usuário</th><th>Motivo</th></tr></thead><tbody id="movements-body"></tbody></table></div>
    </div>
  `;

  const renderMovements = (rows) => {
    document.getElementById('movements-body').innerHTML = rows.map(m => `
      <tr><td>${m.created_at}</td><td>${m.product_name}</td><td>${m.type}</td><td>${m.quantity > 0 ? '+' : ''}${m.quantity}</td><td>${m.user_name || '—'}</td><td>${m.reason || '—'}</td></tr>
    `).join('') || '<tr><td colspan="6" class="muted">Nenhuma movimentação registrada.</td></tr>';
  };
  renderMovements(movements);

  document.getElementById('form-movement').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.product_id = Number(body.product_id);
    body.quantity = Number(body.quantity);
    try {
      await Api.post('/inventory/movements', body);
      showToast('Movimentação registrada.');
      renderInventory(container);
    } catch (err) {
      document.getElementById('movement-error').textContent = err.message;
    }
  });
}
