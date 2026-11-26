const {
  saveReceiptHtml,
  saveReceiptElement,
} = (() => {
  const DB_NAME = 'almox-receipt-archive';
  const STORE_NAME = 'settings';
  const HANDLE_KEY = 'sharepoint-sync-folder';
  const writeMode = { mode: 'readwrite' };
  let rootHandle = null;

  function setStatus(message, state = 'info') {
    const el = document.getElementById('receiptArchiveStatus');
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    el.className = state === 'ok' ? 'status-msg ok'
      : state === 'error' ? 'status-msg err'
      : 'receipt-archive-status';
  }

  function openSettingsDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveFolderHandle(handle) {
    const database = await openSettingsDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { database.close(); }
  }

  async function loadFolderHandle() {
    const database = await openSettingsDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } finally { database.close(); }
  }

  function dateParts(record) {
    let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(record?.date || ''));
    if (match) return { year: match[1], month: match[2], day: match[3] };
    match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(record?.createdAt || ''));
    if (match) return { year: match[3], month: match[2], day: match[1] };
    const parsed = record?.createdAt ? new Date(record.createdAt) : new Date();
    const valid = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(valid);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return { year: values.year, month: values.month, day: values.day };
  }

  function safeFilePart(value) {
    return String(value || 'COMPROVANTE').trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 90) || 'COMPROVANTE';
  }

  async function monthlyDirectory(modulePath, date) {
    let directory = rootHandle;
    const segments = String(modulePath || '').split('/').filter(Boolean);
    for (const segment of [...segments, date.year, date.month]) {
      directory = await directory.getDirectoryHandle(segment, { create: true });
    }
    return directory;
  }

  async function archiveElement({ module, record, element, title = 'Comprovante' }) {
    if (!rootHandle) {
      setStatus('Pasta de comprovantes não configurada. Selecione a pasta “comprovantes” sincronizada pelo OneDrive.', 'info');
      return { saved: false, reason: 'not-configured' };
    }
    if (typeof window.html2pdf !== 'function') {
      setStatus('A biblioteca de PDF não carregou. Verifique a conexão com a internet ou o bloqueio do CDN.', 'error');
      return { saved: false, reason: 'pdf-library-unavailable' };
    }
    try {
      if (await rootHandle.queryPermission(writeMode) !== 'granted') {
        setStatus('A autorização de escrita expirou. Clique em “Selecionar / reautorizar pasta” antes do próximo registro.', 'error');
        return { saved: false, reason: 'permission-required' };
      }
      const date = dateParts(record);
      const directory = await monthlyDirectory(module, date);
      const protocol = safeFilePart(record?.protocol || title);
      const fileName = protocol + '_' + date.year + '-' + date.month + '-' + date.day + '.pdf';

      const container = document.createElement('div');
      container.className = 'receipt-pdf-export';
      Object.assign(container.style, {
        position: 'fixed', left: '-15000px', top: '0', width: '190mm',
        padding: '8mm', background: '#ffffff', color: '#17251e', zIndex: '-1'
      });
      const clone = element.cloneNode(true);
      clone.style.display = 'block';
      clone.style.width = '100%';
      container.appendChild(clone);
      document.body.appendChild(container);

      let blob;
      try {
        blob = await window.html2pdf().set({
          margin: [8, 8, 8, 8],
          image: { type: 'jpeg', quality: 0.96 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
        }).from(container).toPdf().output('blob');
      } finally { container.remove(); }

      if (!(blob instanceof Blob) || blob.size < 500) throw new Error('O PDF gerado está vazio ou inválido.');
      const fileHandle = await directory.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
      }

      const relativePath = [...String(module).split('/'), date.year, date.month, fileName].join('/');
      setStatus('Último comprovante salvo: ' + relativePath, 'ok');
      return { saved: true, path: relativePath, fileName };
    } catch (error) {
      setStatus('Não foi possível arquivar o PDF: ' + (error?.message || error?.name || 'erro desconhecido') + '. Verifique a pasta sincronizada e as permissões.', 'error');
      return { saved: false, reason: error?.name || 'write-error' };
    }
  }

  function saveReceiptHtml({ module, record, html, title = 'Comprovante' }) {
    const element = document.createElement('div');
    element.innerHTML = '<div style="font-family:Arial,sans-serif;color:#17251e;background:#fff;padding:12px;width:100%;box-sizing:border-box">' + html + '</div>';
    return archiveElement({ module, record, element, title });
  }

  function saveReceiptElement({ module, record, element, title = 'Comprovante' }) {
    if (!element) return Promise.resolve({ saved: false, reason: 'missing-element' });
    return archiveElement({ module, record, element, title });
  }

  async function configureFolder() {
    if (typeof window.showDirectoryPicker !== 'function' || !window.isSecureContext) {
      setStatus('Este navegador não permite escolher pastas para gravação. Abra o sistema no Chrome ou Edge pelo endereço HTTPS.', 'error');
      return;
    }
    try {
      const selected = await window.showDirectoryPicker({
        id: 'almoxComprovantes', mode: 'readwrite', startIn: 'documents'
      });
      const permission = await selected.queryPermission(writeMode);
      const granted = permission === 'granted' ? 'granted' : await selected.requestPermission(writeMode);
      if (granted !== 'granted') {
        setStatus('A pasta foi selecionada, mas a permissão de gravação não foi concedida.', 'error');
        return;
      }
      rootHandle = selected;
      await saveFolderHandle(selected);
      setStatus('Pasta autorizada: ' + selected.name + '. Os próximos PDFs serão gravados automaticamente e sincronizados pelo OneDrive.', 'ok');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setStatus('Não foi possível autorizar a pasta: ' + (error?.message || error?.name || 'erro desconhecido'), 'error');
    }
  }

  async function restoreFolder() {
    try {
      rootHandle = await loadFolderHandle();
      if (!rootHandle) {
        setStatus('Pasta não configurada. Selecione a pasta “comprovantes” dentro da biblioteca do SharePoint sincronizada pelo OneDrive.', 'info');
        return;
      }
      const permission = await rootHandle.queryPermission(writeMode);
      setStatus(permission === 'granted'
        ? 'Pasta pronta: ' + rootHandle.name + '. Os comprovantes novos serão salvos automaticamente.'
        : 'Pasta encontrada (' + rootHandle.name + '), mas precisa renovar a autorização de gravação. Clique abaixo.',
      permission === 'granted' ? 'ok' : 'info');
    } catch {
      rootHandle = null;
      setStatus('Não foi possível recuperar a pasta autorizada. Selecione-a novamente.', 'error');
    }
  }

  const configureButton = document.getElementById('configureReceiptFolder');
  if (configureButton) configureButton.addEventListener('click', configureFolder);
  restoreFolder();
  return { saveReceiptHtml, saveReceiptElement };
})();
