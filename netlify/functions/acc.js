// netlify/functions/acc.js
// Salva contas do executor (email, senha hasheada, key) e permite consulta
// Endpoints:
//   POST /api/acc                        → cria/atualiza conta
//     body: { email, password, key, name, hwid? }
//   GET  /api/acc?action=list&token=...  → lista todas as contas (admin)
//   GET  /api/acc?action=get&email=...&token=...  → detalhes de uma conta (admin)
//   GET  /api/acc?action=activate&token=...&key=... → reativa key suspensa (dono digita key)
//   DELETE /api/acc?token=...&email=...  → remove conta (admin)

const { getStore } = require('@netlify/blobs');
const { logAudit } = require('./audit');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
};

const ADMIN_TOKEN = process.env.REDUX_ADMIN_TOKEN || 'redux-admin-secret';

function res(body, code = 200) {
  return { statusCode: code, headers: CORS, body: JSON.stringify(body) };
}

function getAccStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-accounts', siteID, token });
  return getStore('redux-accounts');
}

function getKeyStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-keys', siteID, token });
  return getStore('redux-keys');
}

async function hashPass(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'rbx-acc-salt-2025');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function getIP(event) {
  return event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || event.headers['client-ip'] || null;
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const p      = event.queryStringParameters || {};
  const action = (p.action || '').toLowerCase();
  const auth   = (event.headers['authorization'] || '').replace('Bearer ', '');
  const token  = p.token || auth;

  // ── POST /api/acc — criar ou atualizar conta ──────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return res({ error: 'INVALID_JSON' }, 400); }

    const email    = (body.email    || '').toLowerCase().trim();
    const password = (body.password || '').trim();
    const key      = (body.key      || '').trim();
    const name     = (body.name     || '').trim();
    const hwid     = (body.hwid     || '').trim();

    if (!email || !password || !key)
      return res({ error: 'FIELDS_REQUIRED: email, password, key' }, 400);
    if (password.length < 6)
      return res({ error: 'PASSWORD_TOO_SHORT' }, 400);

    try {
      const accStore = getAccStore();
      const keyStore = getKeyStore();

      // Valida a key
      const keyRaw = await keyStore.get(key).catch(() => null);
      if (!keyRaw) return res({ error: 'KEY_INVALID' }, 400);
      const keyEntry = JSON.parse(keyRaw);
      if (!keyEntry.active) return res({ error: 'KEY_REVOKED' }, 400);

      // Verifica se já existe conta com esta key (de outro email)
      const existingOwner = await accStore.get('key-owner:' + key).catch(() => null);
      if (existingOwner && existingOwner !== email)
        return res({ error: 'KEY_ALREADY_REGISTERED' }, 400);

      // Verifica se email já existe com outra key
      const existingAcc = await accStore.get('acc:' + email).catch(() => null);
      if (existingAcc) {
        const old = JSON.parse(existingAcc);
        if (old.key !== key) return res({ error: 'EMAIL_ALREADY_REGISTERED' }, 400);
      }

      const hash = await hashPass(password);

      const account = {
        email,
        name: name || email.split('@')[0],
        passwordHash: hash,
        key,
        keyType: keyEntry.type,
        hwid: hwid || null,
        registeredAt: existingAcc ? JSON.parse(existingAcc).registeredAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        notifications: existingAcc ? (JSON.parse(existingAcc).notifications || []) : []
      };

      await accStore.set('acc:' + email, JSON.stringify(account));
      await accStore.set('key-owner:' + key, email);

      // Índice
      const idxRaw = await accStore.get('__index__').catch(() => null);
      const idx    = idxRaw ? JSON.parse(idxRaw) : [];
      if (!idx.includes(email)) idx.push(email);
      await accStore.set('__index__', JSON.stringify(idx));

      await logAudit({
        action: 'acc-register', key, user: email, ip: getIP(event),
        result: 'success', detail: `name=${name}, keyType=${keyEntry.type}`
      });

      return res({
        success: true, email, name: account.name,
        keyType: keyEntry.type, status: account.status
      });

    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── GET ?action=login — autenticar conta ──────────────────────────────
  if (action === 'login' && event.httpMethod === 'GET') {
    const email    = (p.email    || '').toLowerCase().trim();
    const password = (p.password || '').trim();
    if (!email || !password) return res({ error: 'FIELDS_REQUIRED' }, 400);

    try {
      const accStore = getAccStore();
      const raw = await accStore.get('acc:' + email).catch(() => null);
      if (!raw) return res({ error: 'INVALID_CREDENTIALS' }, 401);

      const account = JSON.parse(raw);
      const hash    = await hashPass(password);
      if (hash !== account.passwordHash) return res({ error: 'INVALID_CREDENTIALS' }, 401);
      if (account.status === 'suspended') return res({ error: 'ACCOUNT_SUSPENDED' }, 403);

      // Busca dados atuais da key
      const keyStore = getKeyStore();
      const keyRaw   = await keyStore.get(account.key).catch(() => null);
      const keyEntry = keyRaw ? JSON.parse(keyRaw) : null;

      // Retorna e limpa notificações pendentes
      const notifications = account.notifications || [];
      account.notifications = [];
      await accStore.set('acc:' + email, JSON.stringify(account));

      return res({
        success: true,
        email:      account.email,
        name:       account.name,
        key:        account.key,
        keyType:    account.keyType,
        keyActive:  keyEntry ? (keyEntry.active && !keyEntry.suspended) : false,
        keySuspended: keyEntry ? !!keyEntry.suspended : false,
        keyExpiry:  keyEntry ? keyEntry.expiry : null,
        notifications
      });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── GET ?action=activate — reativa key suspensa (dono digita key) ─────
  if (action === 'activate' && event.httpMethod === 'GET') {
    const email    = (p.email    || '').toLowerCase().trim();
    const password = (p.password || '').trim();
    const key      = (p.key      || '').trim();
    if (!email || !password || !key) return res({ error: 'FIELDS_REQUIRED' }, 400);

    try {
      const accStore = getAccStore();
      const keyStore = getKeyStore();

      // Autentica
      const accRaw = await accStore.get('acc:' + email).catch(() => null);
      if (!accRaw) return res({ error: 'INVALID_CREDENTIALS' }, 401);
      const account = JSON.parse(accRaw);
      const hash    = await hashPass(password);
      if (hash !== account.passwordHash) return res({ error: 'INVALID_CREDENTIALS' }, 401);

      // Verifica se a key pertence a esta conta
      if (account.key !== key) return res({ error: 'KEY_NOT_YOURS' }, 403);

      // Reativa key suspensa
      const keyRaw = await keyStore.get(key).catch(() => null);
      if (!keyRaw) return res({ error: 'KEY_INVALID' }, 400);
      const keyEntry = JSON.parse(keyRaw);
      if (!keyEntry.active) return res({ error: 'KEY_PERMANENTLY_REVOKED' }, 400);
      if (!keyEntry.suspended) return res({ success: true, message: 'KEY_ALREADY_ACTIVE' });

      keyEntry.suspended = false;
      await keyStore.set(key, JSON.stringify(keyEntry));

      await logAudit({
        action: 'acc-activate', key, user: email, ip: getIP(event),
        result: 'success', detail: 'Key reativada pelo dono'
      });

      return res({ success: true, message: 'KEY_REACTIVATED', key });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── GET ?action=notifications — notificações pendentes ────────────────
  if (action === 'notifications' && event.httpMethod === 'GET') {
    const email    = (p.email    || '').toLowerCase().trim();
    const password = (p.password || '').trim();
    if (!email || !password) return res({ error: 'FIELDS_REQUIRED' }, 400);

    try {
      const accStore = getAccStore();
      const raw = await accStore.get('acc:' + email).catch(() => null);
      if (!raw) return res({ error: 'INVALID_CREDENTIALS' }, 401);
      const account = JSON.parse(raw);
      const hash    = await hashPass(password);
      if (hash !== account.passwordHash) return res({ error: 'INVALID_CREDENTIALS' }, 401);

      const notifications = account.notifications || [];
      account.notifications = [];
      await accStore.set('acc:' + email, JSON.stringify(account));
      return res({ success: true, notifications });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── GET ?action=list — listar contas (admin) ──────────────────────────
  if (action === 'list' && event.httpMethod === 'GET') {
    if (token !== ADMIN_TOKEN) return res({ error: 'UNAUTHORIZED' }, 401);
    try {
      const accStore = getAccStore();
      const idxRaw   = await accStore.get('__index__').catch(() => null);
      const idx      = idxRaw ? JSON.parse(idxRaw) : [];
      const accounts = [];

      for (const email of idx) {
        const raw = await accStore.get('acc:' + email).catch(() => null);
        if (raw) {
          const a = JSON.parse(raw);
          accounts.push({
            email:       a.email,
            name:        a.name,
            key:         a.key,
            keyType:     a.keyType,
            hwid:        a.hwid,
            status:      a.status,
            registeredAt: a.registeredAt,
            updatedAt:   a.updatedAt
            // passwordHash omitido intencionalmente
          });
        }
      }

      return res({ success: true, count: accounts.length, accounts });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── GET ?action=get — detalhes de uma conta (admin) ───────────────────
  if (action === 'get' && event.httpMethod === 'GET') {
    if (token !== ADMIN_TOKEN) return res({ error: 'UNAUTHORIZED' }, 401);
    const email = (p.email || '').toLowerCase().trim();
    if (!email) return res({ error: 'EMAIL_REQUIRED' }, 400);
    try {
      const accStore = getAccStore();
      const raw = await accStore.get('acc:' + email).catch(() => null);
      if (!raw) return res({ error: 'ACCOUNT_NOT_FOUND' }, 404);
      const a = JSON.parse(raw);
      return res({
        success: true,
        email: a.email, name: a.name, key: a.key,
        keyType: a.keyType, hwid: a.hwid, status: a.status,
        registeredAt: a.registeredAt, updatedAt: a.updatedAt,
        notificationsCount: (a.notifications || []).length
      });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── GET ?action=notify — envia notificação (admin) ───────────────────
  if (action === 'notify' && event.httpMethod === 'GET') {
    if (token !== ADMIN_TOKEN) return res({ error: 'UNAUTHORIZED' }, 401);
    const email  = (p.email  || '').toLowerCase().trim();
    const msg    = (p.msg    || '').trim();
    const reason = (p.reason || 'generic').trim();
    if (!email || !msg) return res({ error: 'FIELDS_REQUIRED' }, 400);

    try {
      const accStore = getAccStore();
      const raw = await accStore.get('acc:' + email).catch(() => null);
      if (!raw) return res({ error: 'ACCOUNT_NOT_FOUND' }, 404);
      const account = JSON.parse(raw);
      account.notifications = account.notifications || [];
      account.notifications.push({
        id: Date.now().toString(36), reason, msg,
        ts: new Date().toISOString(), read: false
      });
      await accStore.set('acc:' + email, JSON.stringify(account));
      return res({ success: true, notified: email });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── DELETE — remove conta (admin) ─────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    if (token !== ADMIN_TOKEN) return res({ error: 'UNAUTHORIZED' }, 401);
    const email = (p.email || '').toLowerCase().trim();
    if (!email) return res({ error: 'EMAIL_REQUIRED' }, 400);
    try {
      const accStore = getAccStore();
      const raw = await accStore.get('acc:' + email).catch(() => null);
      if (!raw) return res({ error: 'ACCOUNT_NOT_FOUND' }, 404);
      const account = JSON.parse(raw);

      await accStore.delete('acc:' + email).catch(() => {});
      await accStore.delete('key-owner:' + account.key).catch(() => {});

      const idxRaw = await accStore.get('__index__').catch(() => null);
      if (idxRaw) {
        const idx = JSON.parse(idxRaw).filter(e => e !== email);
        await accStore.set('__index__', JSON.stringify(idx));
      }

      await logAudit({
        action: 'acc-delete', user: email, ip: getIP(event),
        result: 'success', detail: 'Conta removida pelo admin'
      });

      return res({ success: true, deleted: email });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  return res({ error: 'UNKNOWN_ACTION' }, 400);
};
