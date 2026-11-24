const {
  runWithPin,
  renderOperatorHeader,
  renderUsersAndAudit,
  selectOperatorFromList,
  toggleUserActive,
} = (() => {
  let pendingPinCallback = null;

  function getOperatorObj(name) {
    return db.users.find(u => u.name === name) || db.users[0];
  }

  // PIN modal
  function runWithPin(description, onSuccess, targetOperatorName = null) {
    const opName = targetOperatorName || db.activeOperator;
    const op = getOperatorObj(opName);
    if (!op || !op.pin) {
      onSuccess(opName);
      return;
    }
    pendingPinCallback = onSuccess;
    const modal = document.getElementById('pinModal');
    const opSelect = document.getElementById('pinModalOperator');
    opSelect.innerHTML = db.users
      .filter(u => u.active !== false)
      .map(u => `<option value="${escapeHtml(u.name)}" ${u.name === opName ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.role)})</option>`)
      .join('');
    document.getElementById('pinModalTitle').textContent = 'Confirmação por PIN';
    document.getElementById('pinModalDesc').textContent = description;
    const input = document.getElementById('pinModalInput');
    input.value = '';
    clearMsg(document.getElementById('pinModalError'));
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 40);
  }

  function closePinModal() {
    document.getElementById('pinModal').classList.add('hidden');
    pendingPinCallback = null;
  }

  document.getElementById('pinModalCancel').addEventListener('click', closePinModal);
  document.getElementById('pinModalConfirm').addEventListener('click', () => {
    const selectedName = document.getElementById('pinModalOperator').value;
    const pinVal = document.getElementById('pinModalInput').value.trim();
    const op = getOperatorObj(selectedName);
    const errEl = document.getElementById('pinModalError');

    if (op && op.pin && op.pin !== pinVal) {
      showMsg(errEl, 'PIN incorreto para o operador selecionado.', 'err');
      return;
    }
    const cb = pendingPinCallback;
    closePinModal();
    if (cb) cb(selectedName);
  });

  document.getElementById('pinModalInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('pinModalConfirm').click();
    }
  });

  function renderOperatorHeader() {
    const select = document.getElementById('activeOperator');
    const activeUsers = db.users.filter(u => u.active !== false);
    if (!activeUsers.some(u => u.name === db.activeOperator)) {
      db.activeOperator = activeUsers[0]?.name || 'Operador Padrão';
    }
    select.innerHTML = activeUsers
      .map(u => `<option value="${escapeHtml(u.name)}" ${u.name === db.activeOperator ? 'selected' : ''}>${escapeHtml(u.name)}</option>`)
      .join('');

    const currentOp = getOperatorObj(db.activeOperator);
    document.getElementById('operatorRoleBadge').textContent = currentOp?.role || 'Almoxarife';

    const sk = document.getElementById('storekeeper');
    const lsk = document.getElementById('loanStorekeeper');
    const lir = document.getElementById('loanInReceiver');
    if (sk && !sk.value.trim()) sk.value = db.activeOperator;
    if (lsk && !lsk.value.trim()) lsk.value = db.activeOperator;
    if (lir && !lir.value.trim()) lir.value = db.activeOperator;
  }

  document.getElementById('activeOperator').addEventListener('change', (e) => {
    const nextName = e.target.value;
    const targetOp = getOperatorObj(nextName);
    if (targetOp && targetOp.pin) {
      e.target.value = db.activeOperator;
      runWithPin(`Informe o PIN de ${nextName} para assumir a tela.`, (confirmedName) => {
        db.activeOperator = confirmedName;
        document.getElementById('storekeeper').value = confirmedName;
        addAudit('Troca de operador', `Operador alterado para ${confirmedName}`, confirmedName);
        saveDb();
        renderOperatorHeader();
      }, nextName);
    } else {
      db.activeOperator = nextName;
      document.getElementById('storekeeper').value = nextName;
      addAudit('Troca de operador', `Operador alterado para ${nextName}`, nextName);
      saveDb();
      renderOperatorHeader();
    }
  });

  document.getElementById('switchPinBtn').addEventListener('click', () => {
    runWithPin('Selecione o operador e valide o PIN se necessário.', (confirmedName) => {
      db.activeOperator = confirmedName;
      document.getElementById('storekeeper').value = confirmedName;
      addAudit('Validação de operador', `Sessão confirmada para ${confirmedName}`, confirmedName);
      saveDb();
      renderOperatorHeader();
    });
  });

  function renderUsersAndAudit() {
    const usersEl = document.getElementById('usersList');
    usersEl.innerHTML = db.users.map((u, idx) => `
      <div class="user-card${u.name === db.activeOperator ? ' is-current' : ''}">
        <div class="user-identity">
          <strong>${escapeHtml(u.name)}</strong>
          ${u.name === db.activeOperator ? '<span class="tag done">Em uso</span>' : ''}
          <span class="tag role-tag">${escapeHtml(u.role)}</span>
          <span class="tag pin-tag">${u.pin ? 'PIN ativo' : 'Sem PIN'}</span>
          ${u.active === false ? '<span class="tag inactive-tag">Inativo</span>' : ''}
        </div>
        <div class="actions" style="margin:0">
          <button type="button" class="secondary sm" data-action="select-operator" data-value="${escapeHtml(u.name)}">Usar na tela</button>
          <button type="button" class="secondary sm" data-action="toggle-user-active" data-value="${idx}">${u.active === false ? 'Ativar' : 'Desativar'}</button>
        </div>
      </div>
    `).join('');

    const logBody = document.getElementById('auditLogBody');
    logBody.innerHTML = db.auditLog.length
      ? db.auditLog.map(item => `
        <tr>
          <td>${escapeHtml(item.ts)}</td>
          <td>${escapeHtml(item.operator)}</td>
          <td><b>${escapeHtml(item.action)}</b></td>
          <td>${escapeHtml(item.details)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="4" class="muted">Nenhuma ação registrada no log.</td></tr>';
  }

  function selectOperatorFromList(name) {
    const op = getOperatorObj(name);
    if (op && op.pin) {
      runWithPin(`Confirme o PIN de ${name} para ativar este operador.`, (confirmed) => {
        db.activeOperator = confirmed;
        document.getElementById('storekeeper').value = confirmed;
        saveDb();
        renderOperatorHeader();
        renderUsersAndAudit();
      }, name);
    } else {
      db.activeOperator = name;
      document.getElementById('storekeeper').value = name;
      saveDb();
      renderOperatorHeader();
      renderUsersAndAudit();
    }
  }

  function toggleUserActive(idx) {
    const u = db.users[idx];
    if (!u) return;
    if (u.name === 'Operador Padrão') {
      showMsg(document.getElementById('usersMessage'), 'O Operador Padrão não pode ser desativado.', 'err');
      return;
    }
    u.active = u.active === false ? true : false;
    addAudit('Cadastro de usuário', `${u.name} marcado como ${u.active === false ? 'inativo' : 'ativo'}`);
    saveDb();
    renderOperatorHeader();
    renderUsersAndAudit();
    showMsg(document.getElementById('usersMessage'), `${u.name} ${u.active === false ? 'desativado' : 'ativado'}.`, 'ok');
  }

  document.getElementById('addUserBtn').addEventListener('click', () => {
    const name = document.getElementById('newUserName').value.trim();
    const role = document.getElementById('newUserRole').value;
    const pin = document.getElementById('newUserPin').value.trim();
    const msgEl = document.getElementById('usersMessage');

    if (!name) {
      showMsg(msgEl, 'Informe o nome do operador.', 'err');
      return;
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      showMsg(msgEl, 'O PIN deve conter de 4 a 6 números.', 'err');
      return;
    }

    const existing = db.users.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.role = role;
      existing.pin = pin;
      existing.active = true;
      addAudit('Atualização de usuário', `Operador ${existing.name} atualizado (${role})`);
    } else {
      db.users.push({ name, role, pin, active: true });
      addAudit('Novo usuário', `Operador ${name} cadastrado (${role})`);
    }

    document.getElementById('newUserName').value = '';
    document.getElementById('newUserPin').value = '';
    saveDb();
    renderOperatorHeader();
    renderUsersAndAudit();
    showMsg(msgEl, 'Operador salvo com sucesso!', 'ok');
  });

  return {
    runWithPin,
    renderOperatorHeader,
    renderUsersAndAudit,
    selectOperatorFromList,
    toggleUserActive,
  };
})();
