const {
  renderWithdrawalItems,
  renderHistory,
  getWithdrawalDraftItems,
  removeWithdrawalItem,
  toggleWithdrawalStatus,
  setErpReq,
  editWithdrawal,
  deleteWithdrawal,
} = (() => {
  let withdrawalItems = [];
  let editingWithdrawalId = null;

  function checkExpiryHint() {
    const val = document.getElementById('expiry').value;
    const hint = document.getElementById('expiryHint');
    if (!val) {
      hint.className = 'expiry-hint';
      hint.textContent = '';
      return;
    }
    const [y, m] = val.split('-').map(Number);
    const expEnd = new Date(y, m, 0);
    const now = new Date();
    const diffDays = Math.ceil((expEnd - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      hint.className = 'expiry-hint err';
      hint.textContent = 'Atenção: validade vencida!';
    } else if (diffDays <= 60) {
      hint.className = 'expiry-hint warn';
      hint.textContent = `Atenção: item vence em ~${diffDays} dias.`;
    } else {
      hint.className = 'expiry-hint';
      hint.textContent = '';
    }
  }
  document.getElementById('expiry').addEventListener('change', checkExpiryHint);

  document.getElementById('sameAsRequester').addEventListener('click', () => {
    const req = document.getElementById('requester').value.trim();
    if (req) document.getElementById('receiver').value = req;
  });

  function renderWithdrawalItems(highlightIndex = -1) {
    const el = document.getElementById('itemList');
    if (!withdrawalItems.length) {
      el.innerHTML = '<p class="muted">Nenhum produto adicionado à ficha.</p>';
      return;
    }
    el.innerHTML = withdrawalItems.map((it, i) => `
      <div class="item-row${i === highlightIndex ? ' recent-change' : ''}">
        <div>
          <strong>${escapeHtml(it.product)}</strong> — ${escapeHtml(it.quantity)} ${escapeHtml(it.unit)}
          <div class="item-meta">
            ${it.batch ? `<span class="tag">Lote: ${escapeHtml(it.batch)}</span>` : ''}
            ${it.expiry ? `<span class="tag">Validade: ${escapeHtml(it.expiry)}</span>` : ''}
          </div>
        </div>
        <button type="button" class="danger sm" data-action="remove-withdrawal-item" data-value="${i}">Remover</button>
      </div>
    `).join('');
  }

  function removeWithdrawalItem(idx) {
    withdrawalItems.splice(idx, 1);
    renderWithdrawalItems();
  }

  function addWithdrawalItem() {
    const prodEl = document.getElementById('product');
    const qtyEl = document.getElementById('quantity');
    const unitEl = document.getElementById('unit');
    const batchEl = document.getElementById('batch');
    const expEl = document.getElementById('expiry');
    const msgEl = document.getElementById('formMessage');

    const product = prodEl.value.trim();
    const quantity = parseFloat(qtyEl.value);

    if (!product) {
      showMsg(msgEl, 'Informe a descrição do produto.', 'err');
      prodEl.focus();
      return;
    }
    if (isNaN(quantity) || quantity <= 0) {
      showMsg(msgEl, 'Informe uma quantidade maior que zero.', 'err');
      qtyEl.focus();
      return;
    }

    withdrawalItems.push({
      product,
      quantity,
      unit: unitEl.value,
      batch: batchEl.value.trim(),
      expiry: expEl.value
    });

    clearMsg(msgEl);
    prodEl.value = '';
    qtyEl.value = '1';
    batchEl.value = '';
    expEl.value = '';
    checkExpiryHint();
    prodEl.focus();
    renderWithdrawalItems(withdrawalItems.length - 1);
  }

  document.getElementById('addItem').addEventListener('click', addWithdrawalItem);
  document.getElementById('entryBox').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addWithdrawalItem();
    }
  });

  function resetWithdrawalForm() {
    editingWithdrawalId = null;
    document.getElementById('editBanner').classList.add('hidden');
    document.getElementById('formTitle').textContent = 'Registrar retirada avulsa';
    document.getElementById('requester').value = '';
    document.getElementById('receiver').value = '';
    document.getElementById('sector').value = '';
    document.getElementById('storekeeper').value = db.activeOperator;
    document.getElementById('reason').value = 'Urgência / Emergência assistencial';
    document.getElementById('notes').value = '';
    withdrawalItems = [];
    renderWithdrawalItems();
  }

  document.getElementById('clearFormBtn').addEventListener('click', () => {
    resetWithdrawalForm();
    clearMsg(document.getElementById('formMessage'));
  });

  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    resetWithdrawalForm();
    clearMsg(document.getElementById('formMessage'));
  });

  function persistWithdrawal(shouldPrint) {
    const msgEl = document.getElementById('formMessage');
    const requester = document.getElementById('requester').value.trim();
    const receiver = document.getElementById('receiver').value.trim();
    const sector = document.getElementById('sector').value;
    const storekeeper = document.getElementById('storekeeper').value.trim();

    if (!requester || !receiver || !sector || !storekeeper) {
      showMsg(msgEl, 'Preencha todos os campos obrigatórios (*).', 'err');
      return;
    }
    if (!withdrawalItems.length) {
      showMsg(msgEl, 'Adicione pelo menos um item à retirada.', 'err');
      return;
    }

    runWithPin('Confirme seu PIN para registrar ou atualizar esta retirada.', (confirmedOp) => {
      const nowStr = new Date().toLocaleString('pt-BR');
      let proto;

      if (editingWithdrawalId) {
        const idx = db.withdrawals.findIndex(w => w.id === editingWithdrawalId);
        if (idx !== -1) {
          proto = db.withdrawals[idx].protocol;
          db.withdrawals[idx] = {
            ...db.withdrawals[idx],
            requester,
            receiver,
            sector,
            storekeeper,
            reason: document.getElementById('reason').value,
            notes: document.getElementById('notes').value.trim(),
            items: [...withdrawalItems],
            updatedAt: nowStr,
            updatedBy: confirmedOp
          };
          addAudit('Edição de retirada', `Protocolo ${proto} atualizado por ${confirmedOp}`, confirmedOp);
        }
      } else {
        proto = nextProtocol('SAI', db.withdrawals);
        db.withdrawals.unshift({
          id: 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          protocol: proto,
          createdAt: nowStr,
          createdBy: confirmedOp,
          requester,
          receiver,
          sector,
          storekeeper,
          reason: document.getElementById('reason').value,
          notes: document.getElementById('notes').value.trim(),
          items: [...withdrawalItems],
          status: 'pending',
          erpReq: ''
        });
        addAudit('Nova retirada', `Protocolo ${proto} criado para ${sector} (${withdrawalItems.length} item/itens)`, confirmedOp);
      }

      saveDb();
      refreshCatalogs();
      resetWithdrawalForm();
      showMsg(msgEl, `Registro ${proto} salvo com sucesso!`, 'ok');
      renderHistory();
      renderReports();
      if (shouldPrint) {
        const savedRec = db.withdrawals.find(w => w.protocol === proto) || null;
        triggerVoucherPrint(savedRec, 'withdrawal', 'withdrawal');
      }
    });
  }

  document.getElementById('save').addEventListener('click', () => persistWithdrawal(false));
  document.getElementById('saveAndPrint').addEventListener('click', () => persistWithdrawal(true));

  function renderHistory(highlightId) {
    const container = document.getElementById('historyRecords');
    const q = (document.getElementById('search').value || '').toLowerCase().trim();
    const secFilter = document.getElementById('filterSector').value;
    const stFilter = document.getElementById('filterStatus').value;

    const list = db.withdrawals.filter(r => {
      if (secFilter && r.sector !== secFilter) return false;
      if (stFilter && r.status !== stFilter) return false;
      if (!q) return true;
      const hay = [
        r.protocol, r.requester, r.receiver, r.sector, r.storekeeper,
        r.reason, r.notes, r.erpReq,
        ...(r.items || []).map(i => `${i.product} ${i.batch}`)
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

    if (!list.length) {
      container.innerHTML = '<p class="section-empty">' + (db.withdrawals.length ?
        'Nenhum resultado para estes filtros.' : 'Nenhuma retirada registrada.') + '</p>';
      return;
    }

    const openDetails = new Set([...container.querySelectorAll('details[open]')].map(detail => detail.dataset.record));
    container.innerHTML = list.map(r => `
      <article class="record${r.id === highlightId ? ' recent-change' : ''}">
        <div class="record-head">
          <div class="record-heading">
            <span class="protocol">${escapeHtml(r.protocol)}</span>
            <span class="tag ${r.status === 'done' ? 'done' : 'pending'}">${r.status === 'done' ? 'Lançado no sistema' : 'Pendente lançamento'}</span>
            <span class="tag">${escapeHtml(r.sector)}</span>
            ${r.erpReq ? `<span class="tag">Req: ${escapeHtml(r.erpReq)}</span>` : ''}
          </div>
          <span class="muted">${escapeHtml(r.createdAt)}</span>
        </div>
        <ul>
          ${(r.items || []).map(i => `<li><b>${escapeHtml(i.product)}</b> — ${escapeHtml(i.quantity)} ${escapeHtml(i.unit)}${i.batch ? ` (Lote: ${escapeHtml(i.batch)})` : ''}${i.expiry ? ` (Val.: ${escapeHtml(i.expiry)})` : ''}</li>`).join('')}
        </ul>
        ${r.notes ? `<div class="muted"><b>Obs.:</b> ${escapeHtml(r.notes)}</div>` : ''}
        <details class="record-details" data-record="${escapeHtml(r.id)}"${openDetails.has(String(r.id)) ? ' open' : ''}>
          <summary>Ver detalhes da retirada</summary>
          <div class="record-grid">
            <div><b>Motivo:</b> ${escapeHtml(r.reason)}</div>
            <div><b>Solicitante:</b> ${escapeHtml(r.requester)}</div>
            <div><b>Recebedor:</b> ${escapeHtml(r.receiver)}</div>
            <div><b>Almoxarife:</b> ${escapeHtml(r.storekeeper)}</div>
            <div><b>Operador:</b> ${escapeHtml(r.createdBy || r.storekeeper)}</div>
          </div>
          <div class="audit-box">
            <div>Criado em ${escapeHtml(r.createdAt)} por <b>${escapeHtml(r.createdBy || '-')}</b>${r.updatedAt ? ` • Editado em ${escapeHtml(r.updatedAt)} por <b>${escapeHtml(r.updatedBy || '-')}</b>` : ''}</div>
          </div>
        </details>
        <div class="record-actions no-print">
          <button type="button" class="secondary sm" data-action="toggle-withdrawal-status" data-value="${escapeHtml(r.id)}">${r.status === 'done' ? 'Marcar pendente' : 'Marcar lançado'}</button>
          <button type="button" class="secondary sm" data-action="set-erp-req" data-value="${escapeHtml(r.id)}">Req. sistema</button>
          <button type="button" class="secondary sm" data-action="edit-withdrawal" data-value="${escapeHtml(r.id)}">Editar</button>
          <button type="button" class="secondary sm" data-action="print-withdrawal" data-value="${escapeHtml(r.id)}">Imprimir</button>
          <button type="button" class="danger sm" data-action="delete-withdrawal" data-value="${escapeHtml(r.id)}">Excluir</button>
        </div>
      </article>
    `).join('');
  }

  function toggleWithdrawalStatus(id) {
    const r = db.withdrawals.find(x => x.id === id);
    if (!r) return;
    r.status = r.status === 'done' ? 'pending' : 'done';
    addAudit('Status de retirada', `${r.protocol} marcado como ${r.status === 'done' ? 'lançado' : 'pendente'}`);
    saveDb();
    renderHistory(id);
    renderReports();
  }

  function setErpReq(id) {
    const r = db.withdrawals.find(x => x.id === id);
    if (!r) return;
    const req = prompt('Informe o número da requisição / lançamento no sistema:', r.erpReq || '');
    if (req === null) return;
    r.erpReq = req.trim();
    if (r.erpReq) r.status = 'done';
    addAudit('Requisição ERP', `${r.protocol} vinculado à req. ${r.erpReq || '(vazio)'}`);
    saveDb();
    renderHistory(id);
    renderReports();
  }

  function editWithdrawal(id) {
    const r = db.withdrawals.find(x => x.id === id);
    if (!r) return;
    editingWithdrawalId = r.id;
    document.getElementById('editBanner').classList.remove('hidden');
    document.getElementById('editBannerText').textContent = `Editando protocolo ${r.protocol}`;
    document.getElementById('formTitle').textContent = `Editar retirada ${r.protocol}`;
    document.getElementById('requester').value = r.requester;
    document.getElementById('receiver').value = r.receiver;
    document.getElementById('sector').value = r.sector;
    document.getElementById('storekeeper').value = r.storekeeper;
    document.getElementById('reason').value = r.reason;
    document.getElementById('notes').value = r.notes || '';
    withdrawalItems = (r.items || []).map(i => ({ ...i }));
    renderWithdrawalItems();
    activateTab('new');
  }

  function deleteWithdrawal(id) {
    runWithPin('Confirme seu PIN para excluir esta retirada.', (confirmedOp) => {
      const idx = db.withdrawals.findIndex(x => x.id === id);
      if (idx === -1) return;
      const proto = db.withdrawals[idx].protocol;
      db.withdrawals.splice(idx, 1);
      addAudit('Exclusão de retirada', `Protocolo ${proto} removido`, confirmedOp);
      saveDb();
      renderHistory();
      renderReports();
    });
  }

  ['search', 'filterSector', 'filterStatus'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderHistory);
    document.getElementById(id).addEventListener('change', renderHistory);
  });
  
  function getWithdrawalDraftItems() {
    return withdrawalItems;
  }

  return {
    renderWithdrawalItems,
    renderHistory,
    getWithdrawalDraftItems,
    removeWithdrawalItem,
    toggleWithdrawalStatus,
    setErpReq,
    editWithdrawal,
    deleteWithdrawal,
  };
})();
