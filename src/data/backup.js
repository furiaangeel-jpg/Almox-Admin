(() => {
  const status = document.getElementById('autoBackupStatus');
  const stationKey = 'almox_backup_installation_v1';
  const interval = 30 * 60 * 1000;
  const day = 24 * 60 * 60 * 1000;
  const writeAccess = { mode: 'readwrite' };
  const dateLabel = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const configure = document.getElementById('configureBackupFolder');
  const authorized = document.getElementById('backupFolderAuthorized');
  const forceBackup = document.getElementById('forceBackupBtn');
  const supported = typeof window.showDirectoryPicker === 'function' && !!navigator.locks;
  let folder;
  let lastCheckedCopy;
  let lastCleanupDay;

  function showBackupStatus(message, failure = false) {
    let lastSaved;
    try { lastSaved = localStorage.getItem(BACKUP_RECEIPT_KEY); } catch {}
    const suffix = lastSaved ? ' Última cópia: ' + new Date(lastSaved).toLocaleString('pt-BR') + '.' : '';
    status.hidden = false;
    status.classList.toggle('backup-status-error', failure);
    if (status.textContent !== message + suffix) status.textContent = message + suffix;
  }

  function hideBackupSetup() {
    configure.hidden = true;
    authorized.hidden = false;
    forceBackup.hidden = false;
    status.hidden = true;
    status.textContent = '';
  }

  async function folderPreference(value) {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('almox-backup-settings', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction('settings', value ? 'readwrite' : 'readonly');
        const store = transaction.objectStore('settings');
        const request = value ? store.put(value, 'project-backup-folder') : store.get('project-backup-folder');
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }

  async function stationBackups(destination, installation) {
    const result = [];
    const pattern = /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z_[a-f0-9-]{36}_(auto|restore|manual)\.json$/;
    for await (const [name, operator] of destination.entries()) {
      if (!name.startsWith('op-') || operator.kind !== 'directory') continue;
      const station = await operator.getDirectoryHandle(installation).catch(error => {
        if (error.name !== 'NotFoundError') throw error;
        return null;
      });
      if (!station) continue;
      for await (const [fileName, file] of station.entries()) {
        const match = pattern.exec(fileName);
        if (file.kind !== 'file' || !match) continue;
        const [, date, minutes, seconds, millis, kind] = match;
        const time = Date.parse(`${date}:${minutes}:${seconds}.${millis}Z`);
        if (Number.isFinite(time)) result.push({ station, fileName, file, time, kind });
      }
    }
    return result.sort((a, b) => b.time - a.time);
  }

  async function latestValid(entries) {
    for (const entry of entries) {
      const raw = await (await entry.file.getFile()).text();
      try {
        const snapshot = JSON.parse(raw);
        if (['users', 'withdrawals', 'loansOut', 'loansIn', 'auditLog'].every(key => Array.isArray(snapshot?.[key]))) {
          return { ...entry, raw };
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    return null;
  }

  async function prune(entries, latest, now) {
    if (!latest) return;
    const daily = new Map();
    for (const entry of entries) {
      if (entry.fileName === latest.fileName || now - entry.time <= day) continue;
      if (now - entry.time > 30 * day) {
        await entry.station.removeEntry(entry.fileName);
        continue;
      }
      const date = dateLabel.format(entry.time);
      if (!daily.has(date)) daily.set(date, []);
      daily.get(date).push(entry);
    }
    for (const files of daily.values()) {
      const keep = dateLabel.format(latest.time) === dateLabel.format(files[0].time) ? latest : await latestValid(files);
      if (!keep) continue;
      for (const entry of files) {
        if (entry.fileName !== keep.fileName) await entry.station.removeEntry(entry.fileName);
      }
    }
  }

  async function writeBackup(destination, installation, raw, kind, now) {
    const operator = String(JSON.parse(raw).activeOperator || 'operador').trim().toLowerCase().normalize('NFC');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(operator));
    const hash = Array.from(new Uint8Array(digest).slice(0, 8), byte => byte.toString(16).padStart(2, '0')).join('');
    const slug = operator.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 24);
    const operatorFolder = `op-${slug || 'operador'}-${hash}`;
    const directory = await destination.getDirectoryHandle(operatorFolder, { create: true });
    const station = await directory.getDirectoryHandle(installation, { create: true });
    const fileName = `${new Date(now).toISOString().replace(/[:.]/g, '-')}_${crypto.randomUUID()}_${kind}.json`;
    const file = await station.getFileHandle(fileName, { create: true });
    const output = await file.createWritable();
    try {
      await output.write(raw);
      await output.close();
    } catch (error) {
      await output.abort().catch(() => {});
      throw error;
    }
    return [destination.name, operatorFolder, installation, fileName].join('/');
  }

  function copyToFolder(raw, kind) {
    return navigator.locks.request('almox-backup-folder', async () => {
      const destination = folder;
      if (await destination.queryPermission(writeAccess) !== 'granted') {
        throw new Error('Autorize novamente a pasta de backup.');
      }
      let installation = localStorage.getItem(stationKey);
      if (!installation) {
        installation = crypto.randomUUID();
        localStorage.setItem(stationKey, installation);
      }
      const now = Date.now();
      const today = dateLabel.format(now);
      const entries = await stationBackups(destination, installation);
      const latest = await latestValid(entries);
      if (kind === 'auto' && lastCleanupDay !== today) {
        await prune(entries, latest, now);
        lastCleanupDay = today;
      }
      if (kind !== 'manual' && latest?.raw === raw) {
        localStorage.setItem(BACKUP_RECEIPT_KEY, new Date(latest.time).toISOString());
        lastCheckedCopy = raw;
        return;
      }
      const lastAuto = entries.find(entry => entry.kind === 'auto');
      if (kind === 'auto' && lastAuto && now - lastAuto.time < interval) return;
      const path = await writeBackup(destination, installation, raw, kind, now);
      localStorage.setItem(BACKUP_RECEIPT_KEY, new Date(now).toISOString());
      lastCheckedCopy = raw;
      return path;
    });
  }

  async function checkAutomaticBackup() {
    if (!folder) return;
    try {
      if (await folder.queryPermission(writeAccess) !== 'granted') {
        configure.hidden = false;
        authorized.hidden = true;
        forceBackup.hidden = true;
        showBackupStatus('Clique em Autorizar pasta de backup para renovar a permissão de gravação.', true);
        return;
      }
      hideBackupSetup();
      const raw = localStorage.getItem(DB_KEY);
      if (raw && (raw !== lastCheckedCopy || lastCleanupDay !== dateLabel.format(Date.now()))) {
        await copyToFolder(raw, 'auto');
      }
    } catch {
      showBackupStatus('Falha no backup automático. Verifique a pasta e suas permissões.', true);
    }
  }

  configure.hidden = !supported;
  showBackupStatus(supported ?
    'Para ativar o backup automático, selecione a pasta bkps ao lado do index.html.' :
    'O navegador não oferece acesso a pastas nesta página. A exportação manual está disponível.');
  if (supported) {
    configure.addEventListener('click', async () => {
      let selected;
      try {
        selected = await window.showDirectoryPicker({ ...writeAccess, id: 'almoxBackup' });
      } catch (error) {
        if (error.name === 'AbortError') {
          showBackupStatus('O seletor não liberou acesso. Abra-o novamente, selecione a pasta bkps e confirme a permissão de escrita.', true);
        } else {
          showBackupStatus('Não foi possível abrir o seletor de pastas (' + error.name + ').', true);
        }
        return;
      }

      try {
        let destination = selected;
        if (selected.name.toLowerCase() !== 'bkps') {
          try {
            await selected.getFileHandle('index.html');
          } catch (error) {
            if (error.name !== 'NotFoundError' && error.name !== 'TypeMismatchError') throw error;
            showBackupStatus('Selecione a pasta bkps ou a pasta do almoxarifado que contém o index.html.', true);
            return;
          }
          destination = await selected.getDirectoryHandle('bkps', { create: true });
        }
        if (await destination.queryPermission(writeAccess) !== 'granted') {
          showBackupStatus('A pasta foi selecionada, mas o navegador não concedeu permissão de escrita.', true);
          return;
        }
        folder = destination;
        lastCheckedCopy = undefined;
        lastCleanupDay = undefined;
        hideBackupSetup();
        await folderPreference(destination).catch(() => {
          // The authorization can still be used for the current session.
        });
        await checkAutomaticBackup();
      } catch (error) {
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
          showBackupStatus('O navegador ou a rede bloqueou o acesso. Confira a permissão de gravação da pasta do projeto.', true);
        } else if (error.name === 'TypeMismatchError') {
          showBackupStatus('Já existe um arquivo chamado bkps. O destino precisa ser uma pasta.', true);
        } else {
          showBackupStatus('Não foi possível abrir ou criar a pasta bkps (' + error.name + ').', true);
        }
      }
    });
    folderPreference().then(saved => {
      folder ??= saved;
      return checkAutomaticBackup();
    }).catch(() => {
      if (!folder) showBackupStatus('Não foi possível recuperar a autorização anterior. Autorize a pasta de backup novamente.', true);
    });
    setInterval(checkAutomaticBackup, 60000);
  }

  forceBackup.addEventListener('click', async () => {
    forceBackup.disabled = true;
    try {
      const raw = localStorage.getItem(DB_KEY) ?? JSON.stringify(db);
      const path = await copyToFolder(raw, 'manual');
      showBackupStatus('Arquivo gravado em ' + path + '.');
    } catch {
      showBackupStatus('Não foi possível gravar o backup. Verifique a pasta bkps e a permissão de escrita.', true);
    } finally {
      forceBackup.disabled = false;
    }
  });

  function exportBackup() {
    db.lastBackupAt = new Date().toLocaleString('pt-BR');
    addAudit('Backup JSON', 'Backup exportado pelo operador');
    saveDb();
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `almox_v44_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById('quickBackupBtn').addEventListener('click', exportBackup);
  document.getElementById('backupAlertBtn').addEventListener('click', exportBackup);

  const importInputEl = document.getElementById('importBackupInput');
  document.getElementById('importBackupBtn').addEventListener('click', () => {
    if (importInputEl) importInputEl.click();
  });

  importInputEl?.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target.result || '{}'));
        if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.withdrawals) && !Array.isArray(parsed.loansOut) && !Array.isArray(parsed.loansIn))) {
          alert('Arquivo de backup inválido ou incompatível.');
          return;
        }
        runWithPin('Confirme seu PIN para restaurar este backup (.json).', async (confirmedOp) => {
          const current = folder ? localStorage.getItem(DB_KEY) : null;
          if (folder) {
            if (current) {
              try {
                await copyToFolder(current, 'restore');
              } catch {
                showBackupStatus('Falha ao criar a cópia anterior à restauração.', true);
                alert('Restauração interrompida. Não foi possível gravar a cópia da base atual.');
                return;
              }
            }
          }
          if (folder && current !== localStorage.getItem(DB_KEY)) {
            alert('A base mudou durante o backup. Inicie a restauração novamente.');
            return;
          }
          const base = cloneDefaultDb();
          db = {
            ...base,
            ...parsed,
            users: Array.isArray(parsed.users) && parsed.users.length ? parsed.users : base.users,
            withdrawals: Array.isArray(parsed.withdrawals) ? parsed.withdrawals : [],
            loansOut: Array.isArray(parsed.loansOut) ? parsed.loansOut : [],
            loansIn: Array.isArray(parsed.loansIn) ? parsed.loansIn : [],
            auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : []
          };
          addAudit('Importação de backup JSON', `Backup "${file.name}" restaurado por ${confirmedOp}`, confirmedOp);
          saveDb();
          renderOperatorHeader();
          refreshCatalogs();
          renderWithdrawalItems();
          renderLoanOutItems();
          renderLoanInItems();
          renderHistory();
          renderLoansOut();
          renderLoansInTab();
          renderReports();
          renderUsersAndAudit();
          alert('Backup importado com sucesso!');
          checkAutomaticBackup();
        });
      } catch (err) {
        alert('Não foi possível ler o arquivo JSON selecionado.');
      } finally {
        ev.target.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  });
})();
