const BACKUP_RECEIPT_KEY = 'almox_backup_receipt_v1';
const DB_KEY = 'almox_v44_db_v1';

const defaultDb = {
  users: [
    { name: 'Operador Padrão', role: 'Almoxarife', pin: '', active: true },
    { name: 'Almoxarife 01', role: 'Almoxarife', pin: '1234', active: true },
    { name: 'Supervisor Plantão', role: 'Supervisor', pin: '9999', active: true }
  ],
  activeOperator: 'Operador Padrão',
  withdrawals: [],
  loansOut: [],
  loansIn: [],
  auditLog: [],
  lastBackupAt: null
};

function cloneDefaultDb() {
  return JSON.parse(JSON.stringify(defaultDb));
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return cloneDefaultDb();
    const parsed = JSON.parse(raw);
    return {
      ...cloneDefaultDb(),
      ...parsed,
      users: Array.isArray(parsed.users) && parsed.users.length ? parsed.users : cloneDefaultDb().users
    };
  } catch (e) {
    return cloneDefaultDb();
  }
}

let db = loadDb();

function saveDb() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {}
  updateBadgesAndAlerts();
}

function addAudit(action, details, operatorOverride = null) {
  db.auditLog.unshift({
    ts: new Date().toLocaleString('pt-BR'),
    operator: operatorOverride || db.activeOperator,
    action,
    details
  });
  if (db.auditLog.length > 200) db.auditLog.length = 200;
}

function nextProtocol(prefix, list) {
  return `${prefix}-${String(list.length + 1).padStart(6, '0')}`;
}
