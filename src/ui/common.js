const {
  showMsg,
  clearMsg,
  escapeHtml,
  refreshCatalogs,
} = (() => {
  function showMsg(el, text, type = 'ok') {
    if (!el) return;
    el.textContent = text;
    el.className = `status-msg ${type}`;
  }

  function clearMsg(el) {
    if (!el) return;
    el.textContent = '';
    el.className = 'status-msg';
  }

  function nextProtocol(prefix, list) {
    return `${prefix}-${String(list.length + 1).padStart(6, '0')}`;
  }

  function getOperatorObj(name) {
    return db.users.find(u => u.name === name) || db.users[0];
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function refreshCatalogs() {
    const people = new Set();
    const products = new Set();

    [...db.withdrawals, ...db.loansOut].forEach(r => {
      if (r.requester) people.add(r.requester);
      if (r.receiver) people.add(r.receiver);
      if (r.storekeeper) people.add(r.storekeeper);
      (r.items || []).forEach(it => { if (it.product) products.add(it.product); });
    });
    db.loansIn.forEach(r => {
      if (r.origin) people.add(r.origin);
      if (r.receiver) people.add(r.receiver);
      (r.items || []).forEach(it => { if (it.product) products.add(it.product); });
    });

    const companies = new Set();
    db.loansOut.forEach(l => {
      if (l.sector) companies.add(l.sector);
    });
    db.loansIn.forEach(e => {
      if (e.sector) companies.add(e.sector);
    });

    document.getElementById('peopleCatalog').innerHTML = [...people]
      .map(p => `<option value="${escapeHtml(p)}"></option>`).join('');
    const compEl = document.getElementById('companyCatalog');
    if (compEl) {
      compEl.innerHTML = [...companies]
        .map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
    }
    document.getElementById('productCatalog').innerHTML = [...products]
      .map(pr => `<option value="${escapeHtml(pr)}"></option>`).join('');
  }

  return {
    showMsg,
    clearMsg,
    escapeHtml,
    refreshCatalogs,
  };
})();
