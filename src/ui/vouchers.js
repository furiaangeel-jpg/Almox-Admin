const {
  triggerVoucherPrint,
  printRecordVoucher,
} = (() => {
  let activePrintRecord = null;
  let activePrintType = 'withdrawal'; // 'withdrawal' | 'loan_out' | 'loan_in'

  function shouldPrintTwoCopies(sourceContext = 'withdrawal') {
    if (sourceContext === 'loan_out') {
      const cb = document.getElementById('loanTwoCopiesCheck');
      return cb ? !!cb.checked : true;
    }
    if (sourceContext === 'history') {
      const cb = document.getElementById('historyTwoCopies');
      return cb ? !!cb.checked : true;
    }
    const cb = document.getElementById('twoCopiesCheck');
    return cb ? !!cb.checked : true;
  }

  function buildSingleViaHtml(rec, type, viaLabel, isLoanOut) {
    const itemsRows = (rec.items || []).map((it, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><b>${escapeHtml(it.product)}</b></td>
        <td>${escapeHtml(it.quantity)} ${escapeHtml(it.unit || '')}</td>
        <td>${escapeHtml(it.batch || '-')}</td>
        <td>${escapeHtml(it.expiry || it.condition || '-')}</td>
      </tr>
    `).join('');

    const extraRows = isLoanOut
      ? `
        <div><b>Empresa solicitante:</b> ${escapeHtml(rec.sector || '-')}</div>
        <div><b>Previsão devolução:</b> ${escapeHtml(rec.expectedReturn || 'Não informada')}</div>
        <div><b>Solicitante:</b> ${escapeHtml(rec.requester || '-')}</div>
        <div><b>Recebedor:</b> ${escapeHtml(rec.receiver || '-')}</div>
        <div><b>Almoxarife:</b> ${escapeHtml(rec.storekeeper || '-')}</div>
        <div><b>Motivo:</b> ${escapeHtml(rec.reason || '-')}</div>
      `
      : type === 'loan_in'
      ? `
        <div><b>Setor vinculado:</b> ${escapeHtml(rec.sector || '-')}</div>
        <div><b>Ref. protocolo:</b> ${escapeHtml(rec.refProtocol || '-')}</div>
        <div><b>Origem:</b> ${escapeHtml(rec.origin || '-')}</div>
        <div><b>Recebido por:</b> ${escapeHtml(rec.receiver || '-')}</div>
      `
      : `
        <div><b>Setor destino:</b> ${escapeHtml(rec.sector || '-')}</div>
        <div><b>Motivo:</b> ${escapeHtml(rec.reason || '-')}</div>
        <div><b>Solicitante:</b> ${escapeHtml(rec.requester || '-')}</div>
        <div><b>Recebedor:</b> ${escapeHtml(rec.receiver || '-')}</div>
        <div><b>Almoxarife:</b> ${escapeHtml(rec.storekeeper || '-')}</div>
        <div><b>Req. ERP:</b> ${escapeHtml(rec.erpReq || 'Pendente')}</div>
      `;

    const docTitle = isLoanOut
      ? 'COMPROVANTE DE SAÍDA DE EMPRÉSTIMO'
      : type === 'loan_in'
      ? 'COMPROVANTE DE ENTRADA DE EMPRÉSTIMO'
      : 'COMPROVANTE DE RETIRADA AVULSA';

    return `
      <div class="print-via">
        <div class="print-via-head">
          <span class="print-via-title">ALMOX HOSPITALAR • ${docTitle}</span>
          <span class="print-via-badge">${escapeHtml(viaLabel)} • ${escapeHtml(rec.protocol || '')}</span>
        </div>
        <div class="print-meta">
          <div><b>Protocolo:</b> ${escapeHtml(rec.protocol || '-')}</div>
          <div><b>Data/Hora:</b> ${escapeHtml(rec.createdAt || new Date().toLocaleString('pt-BR'))}</div>
          ${extraRows}
        </div>
        <table class="print-items">
          <thead>
            <tr>
              <th style="width:36px">#</th>
              <th>Item / Material / Medicamento</th>
              <th style="width:95px">Qtd.</th>
              <th style="width:110px">Lote / Pat.</th>
              <th style="width:110px">Val. / Cond.</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows || '<tr><td colspan="5">Sem itens</td></tr>'}
          </tbody>
        </table>
        ${rec.notes ? `<div style="font-size:11.5px;margin-bottom:6px"><b>Observações:</b> ${escapeHtml(rec.notes)}</div>` : ''}
        <div class="print-sigs">
          <div class="print-sig-line">Entrega / Almoxarife (${escapeHtml(rec.storekeeper || rec.receiver || '')})</div>
          <div class="print-sig-line">Recebimento (${escapeHtml(rec.receiver || rec.origin || '')})</div>
        </div>
      </div>
    `;
  }

  function renderPrintVoucherArea(rec, type, twoCopies) {
    const area = document.getElementById('printVoucherArea');
    if (!area) return;
    const isLoanOut = type === 'loan_out';
    const recordObj = rec || {
      protocol: 'RASCUNHO',
      createdAt: new Date().toLocaleString('pt-BR'),
      requester: document.getElementById(isLoanOut ? 'loanRequester' : 'requester')?.value.trim() || '',
      receiver: document.getElementById(isLoanOut ? 'loanReceiver' : 'receiver')?.value.trim() || '',
      sector: document.getElementById(isLoanOut ? 'loanSector' : 'sector')?.value.trim() || '',
      storekeeper: document.getElementById(isLoanOut ? 'loanStorekeeper' : 'storekeeper')?.value.trim() || db.activeOperator,
      reason: document.getElementById(isLoanOut ? 'loanReason' : 'reason')?.value || '',
      expectedReturn: document.getElementById('loanExpectedReturn')?.value || '',
      notes: document.getElementById(isLoanOut ? 'loanNotes' : 'notes')?.value.trim() || '',
      items: isLoanOut ? getLoanOutDraftItems() : getWithdrawalDraftItems()
    };

    if (twoCopies) {
      area.innerHTML = `
        <div class="print-sheet">
          ${buildSingleViaHtml(recordObj, type, '1ª VIA — ALMOXARIFADO', isLoanOut)}
          <div class="print-cut-line">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂</div>
          ${buildSingleViaHtml(recordObj, type, '2ª VIA — SETOR / EMPRESA', isLoanOut)}
        </div>
      `;
    } else {
      area.innerHTML = `
        <div class="print-sheet">
          ${buildSingleViaHtml(recordObj, type, 'VIA ÚNICA', isLoanOut)}
        </div>
      `;
    }
  }

  function triggerVoucherPrint(rec = null, type = 'withdrawal', context = 'withdrawal') {
    const twoCopies = shouldPrintTwoCopies(context);
    activePrintRecord = rec;
    activePrintType = type;
    renderPrintVoucherArea(rec, type, twoCopies);
    window.print();
  }

  window.addEventListener('beforeprint', () => {
    const activeSec = document.querySelector('main > section.panel:not(.hidden)');
    const secId = activeSec ? activeSec.id : 'new';
    const ctx = secId === 'history' ? 'history' : secId === 'loan_out' ? 'loan_out' : 'withdrawal';
    const inferredType = activePrintRecord ? activePrintType : (secId === 'loan_out' ? 'loan_out' : secId === 'loan_in' ? 'loan_in' : 'withdrawal');
    renderPrintVoucherArea(activePrintRecord, inferredType, shouldPrintTwoCopies(ctx));
  });

  window.addEventListener('afterprint', () => {
    activePrintRecord = null;
  });

  function printRecordVoucher(id, type = 'withdrawal') {
    const list = type === 'loan_out' ? db.loansOut : type === 'loan_in' ? db.loansIn : db.withdrawals;
    const found = list.find(x => x.id === id) || null;
    const ctx = type === 'loan_out' ? 'loan_out' : 'history';
    triggerVoucherPrint(found, type, ctx);
  }

  return {
    triggerVoucherPrint,
    printRecordVoucher,
  };
})();
