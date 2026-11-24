function activateTab(tabId) {
  const target = document.getElementById(tabId);
  if (!target || !target.matches('main > section.panel')) return;
  const wasHidden = target.classList.contains('hidden');
  document.querySelectorAll('.tab[data-tab]').forEach(t => {
    const isActive = t.dataset.tab === tabId;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-pressed', String(isActive));
  });
  document.querySelectorAll('main > section.panel').forEach(sec => {
    sec.classList.toggle('hidden', sec.id !== tabId);
    if (sec !== target) sec.classList.remove('panel-enter');
  });
  if (wasHidden) {
    target.classList.add('panel-enter');
  }
  if (tabId === 'history') renderHistory();
  if (tabId === 'loan_out') renderLoansOut();
  if (tabId === 'loan_in') renderLoansInTab();
  if (tabId === 'reports') renderReports();
  if (tabId === 'users') renderUsersAndAudit();
  if (tabId === 'stock') renderStock();
  if (tabId === 'handover') renderHandover();
}

document.querySelector('main').addEventListener('animationend', event => {
  if (event.animationName === 'panel-enter') event.target.classList.remove('panel-enter');
});

const navigationToggle = document.getElementById('navigationToggle');
const navigationDrawer = document.getElementById('navigationDrawer');

navigationToggle.addEventListener('click', () => {
  navigationDrawer.showModal();
  navigationToggle.setAttribute('aria-expanded', 'true');
});

document.getElementById('navigationClose').addEventListener('click', () => navigationDrawer.close());
navigationDrawer.addEventListener('close', () => navigationToggle.setAttribute('aria-expanded', 'false'));
navigationDrawer.addEventListener('click', event => {
  if (event.target !== navigationDrawer) return;
  const bounds = navigationDrawer.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX >= bounds.right ||
      event.clientY < bounds.top || event.clientY >= bounds.bottom) navigationDrawer.close();
});

navigationDrawer.querySelector('.tabs').addEventListener('click', event => {
  const button = event.target.closest('.tab[data-tab]');
  if (!button) return;
  activateTab(button.dataset.tab);
  navigationDrawer.close();
  window.scrollTo(0, 0);
});

function updateClock() {
  const el = document.getElementById('clockDisplay');
  if (el) el.textContent = new Date().toLocaleString('pt-BR');
}
setInterval(updateClock, 1000);
updateClock();

function openFilteredTab(tab, filter, search, value, additionalFilter) {
  document.getElementById(filter).value = value;
  document.getElementById(search).value = '';
  if (additionalFilter) document.getElementById(additionalFilter).value = '';
  activateTab(tab);
  document.getElementById(search).focus();
}

const recordActions = {
  'show-pending-withdrawals': () => openFilteredTab('history', 'filterStatus', 'search', 'pending', 'filterSector'),
  'show-open-loans': () => openFilteredTab('loan_out', 'loanFilterStatus', 'loanSearch', 'open'),
  'remove-withdrawal-item': value => removeWithdrawalItem(Number(value)),
  'remove-loan-out-item': value => removeLoanOutItem(Number(value)),
  'remove-loan-in-item': value => removeLoanInItem(Number(value)),
  'toggle-withdrawal-status': toggleWithdrawalStatus,
  'set-erp-req': setErpReq,
  'edit-withdrawal': editWithdrawal,
  'print-withdrawal': id => printRecordVoucher(id, 'withdrawal'),
  'delete-withdrawal': deleteWithdrawal,
  'settle-loan-out': settleLoanOut,
  'select-loan-reference': selectLoanReference,
  'print-loan-out': id => printRecordVoucher(id, 'loan_out'),
  'select-operator': selectOperatorFromList,
  'toggle-user-active': value => toggleUserActive(Number(value))
};

document.querySelector('main').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || !Object.hasOwn(recordActions, button.dataset.action)) return;
  recordActions[button.dataset.action](button.dataset.value);
});

// Inicialização
renderOperatorHeader();
refreshCatalogs();
renderWithdrawalItems();
renderLoanOutItems();
renderLoanInItems();
updateBadgesAndAlerts();
renderHistory();
renderLoansOut();
renderLoansInTab();
renderReports();
renderUsersAndAudit();
