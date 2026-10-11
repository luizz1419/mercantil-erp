function supplierForm(supplier = {}) {
  const isEdit = !!supplier.id;
  return `
    <h2>${isEdit ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
    <form id="form-supplier" class="stack">
      <label>Nome / Razão social<input name="name" value="${supplier.name || ''}" required /></label>
      <div class="grid-2">
        <label>CNPJ<input name="cnpj" value="${supplier.cnpj || ''}" /></label>
        <label>Telefone<input name="phone" value="${supplier.phone || ''}" /></label>
      </div>
      <label>E-mail<input type="email" name="email" value="${supplier.email || ''}" /></label>
      <label>Endereço<input name="address" value="${supplier.address || ''}" /></label>
      <div id="supplier-form-error" class="error-msg"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar' : 'Cadastrar'}</button>
      </div>
    </form>
  `;
}

async function renderSuppliers(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Fornecedores</h2>
        <button id="btn-new-supplier" class="btn btn-primary btn-sm">+ Novo fornecedor</button>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th>Nome</th><th>CNPJ</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead>
        <tbody id="suppliers-body"></tbody>
      </table></div>
    </div>
  `;

  async function load() {
    const rows = await Api.get('/suppliers');
    document.getElementById('suppliers-body').innerHTML = rows.map((s) => `
      <tr>
        <td>${s.name}</td><td>${s.cnpj || '—'}</td><td>${s.phone || '—'}</td><td>${s.email || '—'}</td>
        <td><button class="btn btn-secondary btn-sm" data-edit="${s.id}">Editar</button></td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="muted">Nenhum fornecedor cadastrado.</td></tr>';

    document.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => {
      const s = rows.find((x) => x.id === Number(btn.dataset.edit));
      openForm(s);
    }));
  }

  function openForm(supplier) {
    openModal(supplierForm(supplier));
    document.getElementById('form-supplier').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      try {
        if (supplier?.id) await Api.put(`/suppliers/${supplier.id}`, body);
        else await Api.post('/suppliers', body);
        closeModal();
        showToast(supplier?.id ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
        load();
      } catch (err) {
        document.getElementById('supplier-form-error').textContent = err.message;
      }
    });
  }

  document.getElementById('btn-new-supplier').addEventListener('click', () => openForm());
  load();
}
