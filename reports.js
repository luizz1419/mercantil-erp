let reportsPeriod = { dateFrom: null, dateTo: null };
let reportsActiveTab = 'sales';

function periodPreset(preset) {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  let from = to;
  if (preset === '7d') { const d = new Date(today); d.setDate(d.getDate() - 7); from = d.toISOString().slice(0, 10); }
  if (preset === 'month') { from = to.slice(0, 8) + '01'; }
  return { dateFrom: from, dateTo: to };
}

async function renderReports(container) {
  reportsPeriod = periodPreset('month');
  reportsActiveTab = 'sales';

  container.innerHTML = `
    <div class="card">
      <div class="card-header"><h2>Relatórios</h2></div>
      <div class="filters">
        <select id="report-preset">
          <option value="today">Hoje</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="month" selected>Este mês</option>
          <option value="custom">Personalizado</option>
        </select>
        <input type="date" id="report-from" value="${reportsPeriod.dateFrom}" />
        <input type="date" id="report-to" value="${reportsPeriod.dateTo}" />
        <button id="btn-report-apply" class="btn btn-secondary btn-sm">Aplicar</button>
      </div>
      <nav style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
        ${[['sales', 'Vendas'], ['inventory', 'Estoque'], ['losses', 'Perdas'], ['customers', 'Clientes']]
          .map(([key, label]) => `<div class="nav-item" data-tab="${key}" style="display:inline-flex;">${label}</div>`).join('')}
      </nav>
    </div>
    <div id="report-content"></div>
  `;

  function markActiveTab() {
    document.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('active', el.dataset.tab === reportsActiveTab));
  }
  document.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => {
    reportsActiveTab = el.dataset.tab;
    markActiveTab();
    loadActiveReport();
  }));
  markActiveTab();

  document.getElementById('report-preset').addEventListener('change', (e) => {
    if (e.target.value === 'custom') return;
    reportsPeriod = periodPreset(e.target.value);
    document.getElementById('report-from').value = reportsPeriod.dateFrom;
    document.getElementById('report-to').value = reportsPeriod.dateTo;
    loadActiveReport();
  });
  document.getElementById('btn-report-apply').addEventListener('click', () => {
    reportsPeriod = { dateFrom: document.getElementById('report-from').value, dateTo: document.getElementById('report-to').value };
    loadActiveReport();
  });

  async function loadActiveReport() {
    const content = document.getElementById('report-content');
    content.innerHTML = '<p class="muted">Carregando...</p>';
    const qs = `?date_from=${reportsPeriod.dateFrom}&date_to=${reportsPeriod.dateTo}`;

    if (reportsActiveTab === 'sales') {
      const r = await Api.get('/reports/sales' + qs);
      content.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Faturamento</div><div class="kpi-value">${money(r.revenue)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Vendas</div><div class="kpi-value">${r.count}</div></div>
          <div class="kpi-card"><div class="kpi-label">Ticket médio</div><div class="kpi-value">${money(r.average_ticket)}</div></div>
        </div>
        <div class="grid-2">
          <div class="card"><div class="card-header"><h2>Mais vendidos</h2></div>
            ${reportTable(r.top_products, ['name', 'qty_sold', 'revenue'], ['Produto', 'Qtd.', 'Receita'])}
          </div>
          <div class="card"><div class="card-header"><h2>Menos vendidos</h2></div>
            ${reportTable(r.least_products, ['name', 'qty_sold', 'revenue'], ['Produto', 'Qtd.', 'Receita'])}
          </div>
        </div>
      `;
    }

    if (reportsActiveTab === 'inventory') {
      const r = await Api.get('/reports/inventory');
      content.innerHTML = `
        <div class="grid-2">
          <div class="card"><div class="card-header"><h2>📉 Estoque baixo (${r.low_stock.length})</h2></div>${reportTable(r.low_stock, ['name', 'quantity', 'min_quantity'], ['Produto', 'Atual', 'Mínimo'])}</div>
          <div class="card"><div class="card-header"><h2>🔴 Vencidos (${r.expired.length})</h2></div>${reportTable(r.expired, ['name', 'expiry_date', 'quantity'], ['Produto', 'Validade', 'Qtd.'])}</div>
          <div class="card"><div class="card-header"><h2>🟠 Próximos do vencimento (${r.near_expiry.length})</h2></div>${reportTable(r.near_expiry, ['name', 'expiry_date', 'daysLeft'], ['Produto', 'Validade', 'Dias'])}</div>
          <div class="card"><div class="card-header"><h2>📦 Sem movimentação (${r.no_movement.length})</h2></div>${reportTable(r.no_movement, ['name', 'quantity'], ['Produto', 'Qtd. parada'])}</div>
        </div>
      `;
    }

    if (reportsActiveTab === 'losses') {
      const r = await Api.get('/reports/losses' + qs);
      content.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total de perdas</div><div class="kpi-value" style="color:var(--danger)">${money(r.total)}</div><div class="kpi-sub">${r.count} registro(s)</div></div>
        </div>
        <div class="grid-2">
          <div class="card"><div class="card-header"><h2>Por motivo</h2></div>${reportTable(r.by_reason.map(x => ({ ...x, reason: LOSS_REASONS[x.reason] || x.reason })), ['reason', 'count', 'total'], ['Motivo', 'Qtd.', 'Valor'])}</div>
          <div class="card"><div class="card-header"><h2>Produtos que mais geram perda</h2></div>${reportTable(r.top_products, ['product_name', 'quantity', 'total'], ['Produto', 'Qtd.', 'Valor'])}</div>
        </div>
      `;
    }

    if (reportsActiveTab === 'customers') {
      const r = await Api.get('/reports/customers' + qs);
      content.innerHTML = `<div class="card"><div class="card-header"><h2>Clientes que mais compram</h2></div>${reportTable(r.top_customers, ['name', 'purchase_count', 'total_spent'], ['Cliente', 'Compras', 'Total gasto'])}</div>`;
    }
  }

  loadActiveReport();
}

function reportTable(rows, fields, labels) {
  if (!rows || rows.length === 0) return '<p class="muted">Sem dados neste período.</p>';
  const isMoney = (f) => ['revenue', 'total', 'total_spent', 'value'].includes(f);
  return `<div class="table-scroll"><table>
    <thead><tr>${labels.map((l) => `<th>${l}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${fields.map((f) => `<td>${isMoney(f) ? money(r[f]) : (r[f] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}
