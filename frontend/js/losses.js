const LOSS_REASONS = {
  vencimento: 'Vencimento', avaria: 'Avaria', deterioracao: 'Deterioração',
  extravio: 'Extravio', furto: 'Furto', erro_estoque: 'Erro de estoque', outros: 'Outros'
};

async function renderLosses(container) {
  const [summary, products] = await Promise.all([Api.get('/losses/summary'), Api.get('/products')]);

  container.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Perdas no mês</div><div class="kpi-value" style="color:var(--danger)">${money(summary.total)}</div><div class="kpi-sub">${summary.count} registro(s)</div></div>
      <div class="kpi-card"><div class="kpi-label">Produto com maior perda</div><div class="kpi-value" style="font-size:16px">${summary.top_products[0]?.product_name || '—'}</div><div class="kpi-sub">${summary.top_products[0] ? money(summary.top_products[0].total) : ''}</div></div>
      <div class="kpi-card"><div class="kpi-label">Motivo mais frequente</div><div class="kpi-value" style="font-size:16px">${summary.by_reason[0]?.reason_label || '—'}</div><div class="kpi-sub">${summary.by_reason[0] ? money(summary.by_reason[0].total) : ''}</div></div>
    </div>

    <div class="card">
      <div class="card-header"><h2>Registrar quebra/perda</h2></div>
      <form id="form-loss" class="grid-3">
        <label>Produto
          <select name="product_id" required>${products.map((p) => `<option value="${p.id}">${p.name} (${p.quantity} ${p.unit})</option>`).join('')}</select>
        </label>
        <label>Quantidade perdida<input type="number" name="quantity" min="0.01" step="0.01" required /></label>
        <label>Motivo
          <select name="reason" required>${Object.entries(LOSS_REASONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        </label>
        <label style="grid-column: 1 / -1">Observação<input name="observation" placeholder="Detalhes adicionais (opcional)" /></label>
        <div style="grid-column: 1 / -1"><button class="btn btn-primary btn-sm" type="submit">Registrar perda</button></div>
      </form>
      <div id="loss-form-error" class="error-msg"></div>
    </div>

    <div class="card">
      <div class="card-header"><h2>Perdas por motivo (mês corrente)</h2></div>
      ${summary.by_reason.length === 0 ? '<p class="muted">Nenhuma perda registrada neste período.</p>' :
        `<div class="table-scroll"><table><thead><tr><th>Motivo</th><th>Ocorrências</th><th>Valor</th></tr></thead><tbody>
          ${summary.by_reason.map((r) => `<tr><td>${r.reason_label}</td><td>${r.count}</td><td>${money(r.total)}</td></tr>`).join('')}
        </tbody></table></div>`}
    </div>

    <div class="card">
      <div class="card-header"><h2>Últimas perdas registradas</h2></div>
      <div class="table-scroll"><table><thead><tr><th>Data</th><th>Produto</th><th>Qtd.</th><th>Motivo</th><th>Valor</th><th>Usuário</th></tr></thead><tbody id="losses-body"></tbody></table></div>
    </div>
  `;

  async function loadList() {
    const rows = await Api.get('/losses');
    document.getElementById('losses-body').innerHTML = rows.map((l) => `
      <tr><td>${l.created_at}</td><td>${l.product_name}</td><td>${l.quantity} ${l.unit}</td><td>${l.reason_label}</td><td>${money(l.value)}</td><td>${l.user_name || '—'}</td></tr>
    `).join('') || '<tr><td colspan="6" class="muted">Nenhuma perda registrada.</td></tr>';
  }
  loadList();

  document.getElementById('form-loss').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.quantity = Number(body.quantity);
    try {
      await Api.post('/losses', body);
      showToast('Perda registrada.');
      renderLosses(container);
    } catch (err) {
      document.getElementById('loss-form-error').textContent = err.message;
    }
  });
}
