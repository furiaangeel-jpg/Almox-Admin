const {
  renderLoanOutItems,
  renderLoanInItems,
  renderLoansOut,
  renderLoansInTab,
  getLoanOutDraftItems,
  removeLoanOutItem,
  removeLoanInItem,
  settleLoanOut,
  selectLoanReference,
} = (() => {
  let loanOutItems = [];
  let loanInItems = [];
  let editingLoanId = null;

  document.getElementById('loanSameAsRequester').addEventListener('click', () => {
    const req = document.getElementById('loanRequester').value.trim();
    if (req) document.getElementById('loanReceiver').value = req;
  });

  function renderLoanOutItems(highlightIndex = -1) {
    const el = document.getElementById('loanItemList');
    if (!loanOutItems.length) {
      el.innerHTML = '<p class="muted">Nenhum item adicionado à saída de empréstimo.</p>';
      return;
    }
    el.innerHTML = loanOutItems.map((it, i) => `
      <div class="item-row${i === highlightIndex ? ' recent-change' : ''}">
        <div>
          <strong>${escapeHtml(it.product)}</strong> — ${escapeHtml(it.quantity)} ${escapeHtml(it.unit)}
          <div class="item-meta">
            ${it.batch ? `<span class="tag">Lote/Pat.: ${escapeHtml(it.batch)}</span>` : ''}
            ${it.expiry ? `<span class="tag">Validade: ${escapeHtml(it.expiry)}</span>` : ''}
          </div>
        </div>
        <button type="button" class="danger sm" data-action="remove-loan-out-item" data-value="${i}">Remover</button>
      </div>
    `).join('');
  }

  function removeLoanOutItem(idx) {
    loanOutItems.splice(idx, 1);
    renderLoanOutItems();
  }

  function addLoanOutItem() {
    const prodEl = document.getElementById('loanProduct');
    const qtyEl = document.getElementById('loanQuantity');
    const unitEl = document.getElementById('loanUnit');
    const batchEl = document.getElementById('loanBatch');
    const expEl = document.getElementById('loanExpiry');
    const msgEl = document.getElementById('loanMessage');

    const product = prodEl.value.trim();
    const quantity = parseFloat(qtyEl.value);
    if (!product) {
      showMsg(msgEl, 'Informe a descrição do item de empréstimo.', 'err');
      prodEl.focus();
      return;
    }
    if (isNaN(quantity) || quantity <= 0) {
      showMsg(msgEl, 'Informe uma quantidade maior que zero.', 'err');
      qtyEl.focus();
      return;
    }

    loanOutItems.push({
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
    prodEl.focus();
    renderLoanOutItems(loanOutItems.length - 1);
  }

  document.getElementById('loanAddItem').addEventListener('click', addLoanOutItem);
  document.getElementById('loanEntryBox').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLoanOutItem();
    }
  });

  function resetLoanOutForm() {
    editingLoanId = null;
    document.getElementById('loanEditBanner').classList.add('hidden');
    document.getElementById('loanFormTitle').textContent = 'Saída de empréstimo (material / equipamento)';
    document.getElementById('loanRequester').value = '';
    document.getElementById('loanReceiver').value = '';
    document.getElementById('loanSector').value = '';
    document.getElementById('loanStorekeeper').value = db.activeOperator;
    document.getElementById('loanExpectedReturn').value = '';
    document.getElementById('loanReason').value = 'Empréstimo temporário entre setores';
    document.getElementById('loanNotes').value = '';
    loanOutItems = [];
    renderLoanOutItems();
  }

  document.getElementById('clearLoan').addEventListener('click', () => {
    resetLoanOutForm();
    clearMsg(document.getElementById('loanMessage'));
  });
  document.getElementById('cancelLoanEditBtn').addEventListener('click', () => {
    resetLoanOutForm();
    clearMsg(document.getElementById('loanMessage'));
  });

  function persistLoanOut(shouldPrint) {
    const msgEl = document.getElementById('loanMessage');
    const requester = document.getElementById('loanRequester').value.trim();
    const receiver = document.getElementById('loanReceiver').value.trim();
    const sector = document.getElementById('loanSector').value;
    const storekeeper = document.getElementById('loanStorekeeper').value.trim();

    if (!requester || !receiver || !sector || !storekeeper) {
      showMsg(msgEl, 'Preencha todos os campos obrigatórios (*).', 'err');
      return;
    }
    if (!loanOutItems.length) {
      showMsg(msgEl, 'Adicione pelo menos um item à saída de empréstimo.', 'err');
      return;
    }

    runWithPin('Confirme seu PIN para registrar esta saída de empréstimo.', (confirmedOp) => {
      const nowStr = new Date().toLocaleString('pt-BR');
      let proto;
      if (editingLoanId) {
        const idx = db.loansOut.findIndex(l => l.id === editingLoanId);
        if (idx !== -1) {
          proto = db.loansOut[idx].protocol;
          db.loansOut[idx] = {
            ...db.loansOut[idx],
            requester,
            receiver,
            sector,
            storekeeper,
            expectedReturn: document.getElementById('loanExpectedReturn').value,
            reason: document.getElementById('loanReason').value,
            notes: document.getElementById('loanNotes').value.trim(),
            items: [...loanOutItems],
            updatedAt: nowStr,
            updatedBy: confirmedOp
          };
          addAudit('Edição de empréstimo', `Protocolo ${proto} atualizado`, confirmedOp);
        }
      } else {
        proto = nextProtocol('EMP', db.loansOut);
        db.loansOut.unshift({
          id: 'l_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          protocol: proto,
          createdAt: nowStr,
          createdBy: confirmedOp,
          requester,
          receiver,
          sector,
          storekeeper,
          expectedReturn: document.getElementById('loanExpectedReturn').value,
          reason: document.getElementById('loanReason').value,
          notes: document.getElementById('loanNotes').value.trim(),
          items: [...loanOutItems],
          status: 'open',
          returnedAt: null
        });
        addAudit('Saída de empréstimo', `Protocolo ${proto} aberto — Empresa solicitante: ${sector}`, confirmedOp);
      }

      saveDb();
      refreshCatalogs();
      resetLoanOutForm();
      showMsg(msgEl, `Empréstimo ${proto} salvo com sucesso!`, 'ok');
      const savedLoan = db.loansOut.find(loan => loan.protocol === proto);
      renderLoansOut(savedLoan?.id);
      renderLoansInTab();
      renderReports();
      saveVoucherPdf(savedLoan || null, 'loan_out', 'loan_out');
      if (shouldPrint) {
        triggerVoucherPrint(savedLoan || null, 'loan_out', 'loan_out');
      }
    });
  }

  document.getElementById('saveLoan').addEventListener('click', () => persistLoanOut(false));
  document.getElementById('saveLoanAndPrint').addEventListener('click', () => persistLoanOut(true));

  function renderLoanInItems(highlightIndex = -1) {
    const el = document.getElementById('loanInItemList');
    if (!loanInItems.length) {
      el.innerHTML = '<p class="muted">Nenhum item adicionado à entrada de empréstimo.</p>';
      return;
    }
    el.innerHTML = loanInItems.map((it, i) => `
      <div class="item-row${i === highlightIndex ? ' recent-change' : ''}">
        <div>
          <strong>${escapeHtml(it.product)}</strong> — ${escapeHtml(it.quantity)} ${escapeHtml(it.unit)}
          <div class="item-meta">
            ${it.batch ? `<span class="tag">Lote/Pat.: ${escapeHtml(it.batch)}</span>` : ''}
            <span class="tag">${escapeHtml(it.condition)}</span>
          </div>
        </div>
        <button type="button" class="danger sm" data-action="remove-loan-in-item" data-value="${i}">Remover</button>
      </div>
    `).join('');
  }

  function removeLoanInItem(idx) {
    loanInItems.splice(idx, 1);
    renderLoanInItems();
  }

  function addLoanInItem() {
    const prodEl = document.getElementById('loanInProduct');
    const qtyEl = document.getElementById('loanInQuantity');
    const unitEl = document.getElementById('loanInUnit');
    const batchEl = document.getElementById('loanInBatch');
    const condEl = document.getElementById('loanInCondition');
    const msgEl = document.getElementById('loanInMessage');

    const product = prodEl.value.trim();
    const quantity = parseFloat(qtyEl.value);
    if (!product) {
      showMsg(msgEl, 'Informe a descrição do item recebido/devolvido.', 'err');
      prodEl.focus();
      return;
    }
    if (isNaN(quantity) || quantity <= 0) {
      showMsg(msgEl, 'Informe uma quantidade maior que zero.', 'err');
      qtyEl.focus();
      return;
    }

    loanInItems.push({
      product,
      quantity,
      unit: unitEl.value,
      batch: batchEl.value.trim(),
      condition: condEl.value
    });
    clearMsg(msgEl);
    prodEl.value = '';
    qtyEl.value = '1';
    batchEl.value = '';
    prodEl.focus();
    renderLoanInItems(loanInItems.length - 1);
  }

  document.getElementById('loanInAddItem').addEventListener('click', addLoanInItem);
  document.getElementById('loanInEntryBox').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLoanInItem();
    }
  });

  document.getElementById('clearLoanInBtn').addEventListener('click', () => {
    document.getElementById('loanInOrigin').value = '';
    document.getElementById('loanInReceiver').value = db.activeOperator;
    document.getElementById('loanInSector').value = '';
    document.getElementById('loanInRefProtocol').value = '';
    renderLoanReference();
    document.getElementById('loanInNotes').value = '';
    loanInItems = [];
    renderLoanInItems();
    clearMsg(document.getElementById('loanInMessage'));
  });

  document.getElementById('saveLoanInBtn').addEventListener('click', () => {
    const msgEl = document.getElementById('loanInMessage');
    const origin = document.getElementById('loanInOrigin').value.trim();
    const receiver = document.getElementById('loanInReceiver').value.trim();
    const sector = document.getElementById('loanInSector').value;
    const refProtocol = document.getElementById('loanInRefProtocol').value.trim();

    if (!origin || !receiver || !sector) {
      showMsg(msgEl, 'Preencha Origem, Quem recebeu e Setor vinculado (*).', 'err');
      return;
    }
    if (!loanInItems.length) {
      showMsg(msgEl, 'Adicione pelo menos um item à entrada de empréstimo.', 'err');
      return;
    }

    runWithPin('Confirme seu PIN para registrar esta entrada de empréstimo.', (confirmedOp) => {
      const nowStr = new Date().toLocaleString('pt-BR');
      const proto = nextProtocol('ENT', db.loansIn);
      const savedEntry = {
        id: 'li_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        protocol: proto,
        createdAt: nowStr,
        createdBy: confirmedOp,
        origin,
        receiver,
        sector,
        refProtocol,
        notes: document.getElementById('loanInNotes').value.trim(),
        items: [...loanInItems]
      };
      db.loansIn.unshift(savedEntry);

      if (refProtocol) {
        const matched = db.loansOut.find(l => l.protocol.toUpperCase() === refProtocol.toUpperCase() && l.status === 'open');
        if (matched) {
          matched.status = 'returned';
          matched.returnedAt = nowStr;
        }
      }

      addAudit('Entrada de empréstimo', `Protocolo ${proto} registrado (${sector})`, confirmedOp);
      saveDb();
      refreshCatalogs();
      document.getElementById('loanInOrigin').value = '';
      document.getElementById('loanInSector').value = '';
      document.getElementById('loanInRefProtocol').value = '';
      document.getElementById('loanInNotes').value = '';
      loanInItems = [];
      renderLoanInItems();
      showMsg(msgEl, `Entrada ${proto} registrada com sucesso!`, 'ok');
      renderLoansOut();
      renderLoansInTab();
      renderReports();
      saveVoucherPdf(savedEntry, 'loan_in', 'history');
    });
  });

  function settleLoanOut(loanId) {
    runWithPin('Confirme seu PIN para dar baixa na devolução deste empréstimo.', (confirmedOp) => {
      const loan = db.loansOut.find(l => l.id === loanId);
      if (!loan) return;
      const nowStr = new Date().toLocaleString('pt-BR');
      loan.status = 'returned';
      loan.returnedAt = nowStr;

      const entProto = nextProtocol('ENT', db.loansIn);
      const returnedEntry = {
        id: 'li_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        protocol: entProto,
        createdAt: nowStr,
        createdBy: confirmedOp,
        origin: loan.sector,
        receiver: confirmedOp,
        sector: loan.sector,
        refProtocol: loan.protocol,
        notes: `Devolução automática referente à saída ${loan.protocol}`,
        items: loan.items.map(i => ({ ...i, condition: 'Íntegro / Conforme' }))
      };
      db.loansIn.unshift(returnedEntry);

      addAudit('Baixa de empréstimo', `${loan.protocol} marcado como devolvido (${entProto})`, confirmedOp);
      saveDb();
      renderLoansOut();
      renderLoansInTab();
      renderReports();
      saveVoucherPdf(returnedEntry, 'loan_in', 'history');
    });
  }

  const loanDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });

  function loanStatus(loan) {
    if (loan.status === 'returned') return '<span class="tag loan-returned">Devolvido</span>';
    if (typeof loan.expectedReturn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(loan.expectedReturn)) {
      const today = loanDate.format(new Date());
      if (loan.expectedReturn === today) return '<span class="tag loan-due">Vence hoje</span>';
      if (loan.expectedReturn < today) return '<span class="tag loan-late">Atrasado</span>';
    }
    return '<span class="tag loan-open">Em aberto</span>';
  }

  function renderLoanReference() {
    const input = document.getElementById('loanInRefProtocol');
    const summary = document.getElementById('loanReferenceSummary');
    const protocol = input.value.trim().toUpperCase();
    const match = protocol && db.loansOut.find(loan => loan.status === 'open' && String(loan.protocol || '').toUpperCase() === protocol);
    summary.hidden = !match;
    summary.innerHTML = match ? `
      <strong>${escapeHtml(match.protocol)}</strong> · ${escapeHtml(match.sector)}
      <ul>${(match.items || []).map(item => `<li>${escapeHtml(item.product)} — ${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</li>`).join('')}</ul>
    ` : '';
  }

  document.getElementById('loanInRefProtocol').addEventListener('input', renderLoanReference);

  function selectLoanReference(id) {
    const loan = db.loansOut.find(record => record.id === id && record.status === 'open');
    if (!loan) return;
    const input = document.getElementById('loanInRefProtocol');
    input.value = loan.protocol;
    renderLoanReference();
    input.focus();
  }

  function renderLoansOut(highlightId) {
    const container = document.getElementById('loanRecords');
    const q = (document.getElementById('loanSearch').value || '').toLowerCase().trim();
    const st = document.getElementById('loanFilterStatus').value;

    const list = db.loansOut.filter(l => {
      if (st && l.status !== st) return false;
      if (!q) return true;
      const hay = [
        l.protocol, l.requester, l.receiver, l.sector, l.storekeeper, l.notes,
        ...(l.items || []).map(i => `${i.product} ${i.batch}`)
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

    if (!list.length) {
      container.innerHTML = '<p class="section-empty">' + (db.loansOut.length ?
        'Nenhum resultado para estes filtros.' : 'Nenhuma saída de empréstimo registrada.') + '</p>';
      return;
    }

    container.innerHTML = list.map(l => `
      <div class="record${l.id === highlightId ? ' recent-change' : ''}">
        <div class="record-head">
          <div class="record-heading">
            <span class="protocol">${escapeHtml(l.protocol)}</span>
            ${loanStatus(l)}
            <span class="tag">${escapeHtml(l.sector)}</span>
            ${l.expectedReturn ? `<span class="tag">Prev.: ${escapeHtml(l.expectedReturn)}</span>` : ''}
          </div>
          <span class="muted">${escapeHtml(l.createdAt)}</span>
        </div>
        <div class="record-grid">
          <div><b>Motivo:</b> ${escapeHtml(l.reason)}</div>
          <div><b>Solicitante:</b> ${escapeHtml(l.requester)}</div>
          <div><b>Recebedor:</b> ${escapeHtml(l.receiver)}</div>
          <div><b>Almoxarife:</b> ${escapeHtml(l.storekeeper)}</div>
          <div><b>Devolução:</b> ${escapeHtml(l.returnedAt || 'Em aberto')}</div>
        </div>
        <ul>
          ${(l.items || []).map(i => `<li><b>${escapeHtml(i.product)}</b> — ${escapeHtml(i.quantity)} ${escapeHtml(i.unit)}${i.batch ? ` (Lote/Pat.: ${escapeHtml(i.batch)})` : ''}</li>`).join('')}
        </ul>
        ${l.notes ? `<div class="muted"><b>Obs.:</b> ${escapeHtml(l.notes)}</div>` : ''}
        <div class="record-actions no-print">
          ${l.status === 'open' ? `<button type="button" class="primary sm" data-action="settle-loan-out" data-value="${escapeHtml(l.id)}">Registrar devolução</button>` : ''}
          <button type="button" class="secondary sm" data-action="print-loan-out" data-value="${escapeHtml(l.id)}">Imprimir</button>
        </div>
      </div>
    `).join('');
  }

  function renderLoansInTab() {
    const openContainer = document.getElementById('openLoansForEntryList');
    const q = (document.getElementById('loanOpenSearch').value || '').toLowerCase().trim();
    const sec = document.getElementById('loanOpenSectorFilter').value;

    const openLoans = db.loansOut.filter(l => {
      if (l.status !== 'open') return false;
      if (sec && l.sector !== sec) return false;
      if (!q) return true;
      const hay = [
        l.protocol, l.requester, l.receiver, l.sector,
        ...(l.items || []).map(i => `${i.product} ${i.batch}`)
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

    const hasOpenLoans = db.loansOut.some(loan => loan.status === 'open');
    document.getElementById('loanOpenFilters').hidden = !hasOpenLoans;
    renderLoanReference();
    if (!openLoans.length) {
      openContainer.innerHTML = '<p class="section-empty">' + (hasOpenLoans ?
        'Nenhum empréstimo em aberto corresponde aos filtros.' : 'Nenhum empréstimo aguardando devolução.') + '</p>';
    } else {
      openContainer.innerHTML = openLoans.map(l => `
        <div class="record">
          <div class="record-head">
            <div>
              <span class="protocol">${escapeHtml(l.protocol)}</span>
              ${loanStatus(l)}
              <span class="tag">Empresa: ${escapeHtml(l.sector)}</span>
            </div>
            <div class="actions inline-actions">
              <button type="button" class="secondary sm" data-action="select-loan-reference" data-value="${escapeHtml(l.id)}">Usar protocolo</button>
              <button type="button" class="primary sm" data-action="settle-loan-out" data-value="${escapeHtml(l.id)}">Dar baixa na devolução</button>
            </div>
          </div>
          <div class="muted">Solicitado por ${escapeHtml(l.requester)} • Recebido por ${escapeHtml(l.receiver)} (${escapeHtml(l.createdAt)})</div>
          <ul style="margin-top:6px">
            ${(l.items || []).map(i => `<li>${escapeHtml(i.product)} — ${escapeHtml(i.quantity)} ${escapeHtml(i.unit)}${i.batch ? ` (${escapeHtml(i.batch)})` : ''}</li>`).join('')}
          </ul>
        </div>
      `).join('');
    }

    const listEl = document.getElementById('loanInRecordsList');
    if (!db.loansIn.length) {
      listEl.innerHTML = '<p class="muted">Nenhuma entrada de empréstimo registrada.</p>';
      return;
    }
    listEl.innerHTML = db.loansIn.map(e => `
      <div class="record">
        <div class="record-head">
          <div>
            <span class="protocol">${escapeHtml(e.protocol)}</span>
            <span class="tag loan-in-tag">Entrada</span>
            <span class="tag">${escapeHtml(e.sector)}</span>
            ${e.refProtocol ? `<span class="tag">Ref.: ${escapeHtml(e.refProtocol)}</span>` : ''}
          </div>
          <span class="muted">${escapeHtml(e.createdAt)}</span>
        </div>
        <div class="record-grid">
          <div><b>Origem:</b> ${escapeHtml(e.origin)}</div>
          <div><b>Recebido por:</b> ${escapeHtml(e.receiver)}</div>
        </div>
        <ul>
          ${(e.items || []).map(i => `<li><b>${escapeHtml(i.product)}</b> — ${escapeHtml(i.quantity)} ${escapeHtml(i.unit)} <span class="tag ${i.condition && i.condition !== 'Íntegro / Conforme' ? 'pending' : 'done'}">${escapeHtml(i.condition || 'Íntegro')}</span></li>`).join('')}
        </ul>
        ${e.notes ? `<div class="muted"><b>Obs.:</b> ${escapeHtml(e.notes)}</div>` : ''}
      </div>
    `).join('');
  }

  ['loanSearch', 'loanFilterStatus'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderLoansOut);
    document.getElementById(id).addEventListener('change', renderLoansOut);
  });

  ['loanOpenSearch', 'loanOpenSectorFilter'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderLoansInTab);
    document.getElementById(id).addEventListener('change', renderLoansInTab);
  });

  function getLoanOutDraftItems() {
    return loanOutItems;
  }

  return {
    renderLoanOutItems,
    renderLoanInItems,
    renderLoansOut,
    renderLoansInTab,
    getLoanOutDraftItems,
    removeLoanOutItem,
    removeLoanInItem,
    settleLoanOut,
    selectLoanReference,
  };
})();
