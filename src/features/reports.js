const {
  renderReports,
  updateBadgesAndAlerts,
} = (() => {
  function renderReports() {
    const pendingCount = db.withdrawals.filter(w => w.status !== 'done').length;
    const openLoansCount = db.loansOut.filter(l => l.status === 'open').length;
    const totalItemsCount = [...db.withdrawals, ...db.loansOut, ...db.loansIn]
      .reduce((acc, r) => acc + (r.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0), 0);

    document.getElementById('statTotal').textContent = db.withdrawals.length;
    for (const [id, count] of [['statPending', pendingCount], ['statLoansOpen', openLoansCount]]) {
      const value = document.getElementById(id);
      value.textContent = count;
      value.parentElement.classList.toggle('warn', count > 0);
    }
    document.getElementById('statItems').textContent = totalItemsCount;

    const bySector = new Map();
    db.withdrawals.forEach(w => {
      bySector.set(w.sector, (bySector.get(w.sector) || 0) + 1);
    });
    const entries = [...bySector].sort((a, b) => b[1] - a[1]);
    const maxVal = entries[0]?.[1] || 1;
    document.getElementById('sectorBars').innerHTML = entries.length
      ? entries.map(([sec, cnt]) => `
        <div class="bar-row">
          <div class="bar-head"><span>${escapeHtml(sec)}</span><b>${cnt}</b></div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((cnt / maxVal) * 100)}%"></div></div>
        </div>
      `).join('')
      : '<p class="muted">Sem dados de retiradas por setor ainda.</p>';

    const lastCopy = readBackupReceipt();
    document.getElementById('shiftSummary').innerHTML = `
      <dl class="shift-rows">
        <div><dt>Retiradas pendentes</dt><dd>${pendingCount}</dd></div>
        <div><dt>Empréstimos aguardando devolução</dt><dd>${openLoansCount}</dd></div>
        <div><dt>Última gravação em bkps</dt><dd>${lastCopy ? escapeHtml(new Date(lastCopy).toLocaleString('pt-BR')) : 'Sem cópia confirmada'}</dd></div>
        <div><dt>Último download JSON registrado</dt><dd>${escapeHtml(db.lastBackupAt || 'Nenhum')}</dd></div>
        <div><dt>Operador ativo</dt><dd>${escapeHtml(db.activeOperator)}</dd></div>
      </dl>
    `;
  }

  function readBackupReceipt() {
    try {
      const receipt = localStorage.getItem(BACKUP_RECEIPT_KEY);
      return Number.isFinite(Date.parse(receipt)) ? receipt : null;
    } catch {
      return null;
    }
  }

  function updateBadgesAndAlerts() {
    const pendingCount = db.withdrawals.filter(w => w.status !== 'done').length;
    const openLoansCount = db.loansOut.filter(l => l.status === 'open').length;
    for (const [id, count, label] of [
      ['pendingBadge', pendingCount, 'pendentes'],
      ['openLoansBadge', openLoansCount, 'abertos'],
      ['openLoansInBadge', openLoansCount, 'abertos']
    ]) {
      const badge = document.getElementById(id);
      badge.textContent = `${count} ${label}`;
      badge.hidden = count === 0;
    }

    const alertEl = document.getElementById('backupAlert');
    const totalRegs = db.withdrawals.length + db.loansOut.length + db.loansIn.length;
    if (!db.lastBackupAt && !readBackupReceipt() && totalRegs >= 5) {
      document.getElementById('backupAlertText').textContent = `Você já possui ${totalRegs} registros salvos e ainda não realizou backup.`;
      alertEl.classList.remove('hidden');
    } else {
      alertEl.classList.add('hidden');
    }
  }

  return {
    renderReports,
    updateBadgesAndAlerts,
  };
})();
