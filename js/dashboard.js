function money(v) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function expiryTag(status) {
  const labels = { normal: '🟢 Normal', atencao: '🟡 Atenção', prioridade: '🟠 Prioridade', vencido: '🔴 Vencido' };
  return `<span class="tag tag-${status}">${labels[status] || status}</span>`;
}

async function renderDashboard(container) {
  const user = Store.getUser();
  const data = await Api.get('/dashboard');

  if (user.role === 'cliente') {
    container.innerHTML = `
      <div class="card">
        <div class="card-header"><h2>Meus pedidos em andamento</h2></div>
        ${data.my_open_orders.length === 0
          ? '<p class="muted">Você ainda não tem pedidos em andamento. Explore o catálogo para começar a comprar.</p>'
          : `<div class="table-scroll"><table><thead><tr><th>Pedido</th><th>Status</th><th>Total</th><th>Data</th></tr></thead><tbody>
              ${data.my_open_orders.map(o => `<tr><td>#${o.id}</td><td>${o.status}</td><td>${money(o.total)}</td><td>${o.created_at}</td></tr>`).join('')}
             </tbody></table></div>`}
      </div>
      <div class="card">
        <h2>Bem-vindo(a) ao Mercantil</h2>
        <p class="muted">Este protótipo ainda não implementa o catálogo de compras do cliente — veja a seção "O que expandir primeiro" no README para os próximos passos.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Vendas hoje</div><div class="kpi-value">${money(data.sales_today.total)}</div><div class="kpi-sub">${data.sales_today.count} venda(s)</div></div>
      <div class="kpi-card"><div class="kpi-label">Vendas no mês</div><div class="kpi-value">${money(data.sales_month.total)}</div><div class="kpi-sub">${data.sales_month.count} venda(s)</div></div>
      <div class="kpi-card"><div class="kpi-label">Ticket médio</div><div class="kpi-value">${money(data.average_ticket)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Estoque total</div><div class="kpi-value">${data.stock_total_units}</div><div class="kpi-sub">unidades ativas</div></div>
      <div class="kpi-card"><div class="kpi-label">Produtos vencidos</div><div class="kpi-value" style="color:var(--danger)">${data.expired_products.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Pedidos pendentes</div><div class="kpi-value">${data.pending_orders}</div><div class="kpi-sub">${data.deliveries_today} entrega(s) hoje</div></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h2>Produtos mais vendidos</h2></div>
        <canvas id="chart-top-products" height="220"></canvas>
      </div>
      <div class="card">
        <div class="card-header"><h2>Situação de validade do estoque</h2></div>
        <canvas id="chart-expiry" height="220"></canvas>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2>⚠️ Produtos próximos do vencimento (prioridade de venda)</h2></div>
      ${data.near_expiry_products.length === 0 ? '<p class="muted">Nenhum produto próximo do vencimento no momento.</p>' :
        `<div class="table-scroll"><table><thead><tr><th>Produto</th><th>Validade</th><th>Dias restantes</th><th>Qtd.</th><th>Status</th></tr></thead><tbody>
          ${data.near_expiry_products.map(p => `<tr><td>${p.name}</td><td>${p.expiry_date}</td><td>${p.daysLeft}</td><td>${p.quantity} ${p.unit}</td><td>${expiryTag(p.status)}</td></tr>`).join('')}
         </tbody></table></div>`}
    </div>

    <div class="card">
      <div class="card-header"><h2>📉 Estoque baixo</h2></div>
      ${data.low_stock_products.length === 0 ? '<p class="muted">Nenhum produto com estoque abaixo do mínimo.</p>' :
        `<div class="table-scroll"><table><thead><tr><th>Produto</th><th>Qtd. atual</th><th>Estoque mínimo</th></tr></thead><tbody>
          ${data.low_stock_products.map(p => `<tr><td>${p.name}</td><td class="tag tag-low">${p.quantity} ${p.unit}</td><td>${p.min_quantity}</td></tr>`).join('')}
         </tbody></table></div>`}
    </div>
  `;

  renderChartsIfAvailable(data);
}

async function renderChartsIfAvailable(data) {
  // Os gráficos usam Chart.js via CDN. Se o CDN não estiver acessível (rede
  // bloqueada, offline, etc.) o resto do dashboard continua funcionando normalmente.
  if (typeof Chart === 'undefined') {
    ['chart-top-products', 'chart-expiry'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'Gráfico indisponível (biblioteca de gráficos não carregada).' }));
    });
    return;
  }
  try {
    new Chart(document.getElementById('chart-top-products'), {
      type: 'bar',
      data: {
        labels: data.top_products.map(p => p.name),
        datasets: [{ label: 'Unidades vendidas', data: data.top_products.map(p => p.qty_sold), backgroundColor: '#2f6f4f' }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    const expiryData = await Api.get('/inventory/expiry-status');
    new Chart(document.getElementById('chart-expiry'), {
      type: 'doughnut',
      data: {
        labels: ['Normal', 'Atenção', 'Prioridade', 'Vencido'],
        datasets: [{
          data: [expiryData.summary.normal, expiryData.summary.atencao, expiryData.summary.prioridade, expiryData.summary.vencido],
          backgroundColor: ['#16a34a', '#f59e0b', '#d97706', '#dc2626']
        }]
      },
      options: { plugins: { legend: { position: 'bottom' } } }
    });
  } catch (err) {
    console.error('Falha ao renderizar gráficos:', err);
  }
}
