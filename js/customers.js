function customerForm() {
  return `
    <h2>Novo cliente</h2>
    <form id="form-customer" class="stack">
      <label>Nome<input name="name" required /></label>
      <div class="grid-2">
        <label>CPF<input name="cpf" /></label>
        <label>Telefone<input name="phone" /></label>
      </div>
      <label>E-mail<input type="email" name="email" /></label>
      <div class="grid-2">
        <label>Endereço<input name="address" /></label>
        <label>Número<input name="number" /></label>
      </div>
      <div class="grid-2">
        <label>Bairro<input name="neighborhood" /></label>
        <label>Cidade<input name="city" /></label>
      </div>
      <label>CEP<input name="zip" /></label>
      <div id="customer-form-error" class="error-msg"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Cadastrar</button>
      </div>
    </form>
  `;
}

async function openCustomerDetail(id) {
  const c = await Api.get(`/customers/${id}`);
  openModal(`
    <h2>${c.name}</h2>
    <p class="muted small">${c.cpf || 'CPF não informado'} · ${c.phone || 'sem telefone'} · ${c.email || 'sem e-mail'}</p>
    <div class="grid-2" style="margin: 14px 0;">
      <div class="kpi-card"><div class="kpi-label">Total gasto</div><div class="kpi-value">${money(c.total_spent)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Última compra</div><div class="kpi-value" style="font-size:15px">${c.last_purchase ? c.last_purchase.slice(0,10) : '—'}</div></div>
    </div>
    <h3 style="font-size:14px;">Histórico de vendas</h3>
    <div class="table-scroll">
      <table><thead><tr><th>Data</th><th>Total</th><th>Pagamento</th></tr></thead><tbody>
        ${c.sales.map(s => `<tr><td>${s.created_at}</td><td>${money(s.total)}</td><td>${s.payment_method}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Nenhuma venda registrada.</td></tr>'}
      </tbody></table>
    </div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>
  `);
}

async function renderCustomers(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Clientes</h2>
        <button id="btn-new-customer" class="btn btn-primary btn-sm">+ Novo cliente</button>
      </div>
      <div class="filters"><input id="filter-customer-q" placeholder="Buscar por nome ou CPF..." /></div>
      <div class="table-scroll"><table>
        <thead><tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>Cidade</th><th></th></tr></thead>
        <tbody id="customers-body"></tbody>
      </table></div>
    </div>
  `;

  async function load() {
    const q = document.getElementById('filter-customer-q').value.trim();
    const rows = await Api.get('/customers' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    document.getElementById('customers-body').innerHTML = rows.map(c => `
      <tr>
        <td>${c.name}</td><td>${c.cpf || '—'}</td><td>${c.phone || '—'}</td><td>${c.city || '—'}</td>
        <td><button class="btn btn-secondary btn-sm" data-view="${c.id}">Ver histórico</button></td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="muted">Nenhum cliente cadastrado.</td></tr>';

    document.querySelectorAll('[data-view]').forEach(btn =>
      btn.addEventListener('click', () => openCustomerDetail(btn.dataset.view)));
  }

  document.getElementById('filter-customer-q').addEventListener('input', debounce(load, 300));
  document.getElementById('btn-new-customer').addEventListener('click', () => {
    openModal(customerForm());
    document.getElementById('form-customer').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      try {
        await Api.post('/customers', body);
        closeModal();
        showToast('Cliente cadastrado.');
        load();
      } catch (err) {
        document.getElementById('customer-form-error').textContent = err.message;
      }
    });
  });

  load();
}
