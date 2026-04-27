// netlify/functions/register.js
// Vincula email + senha + key a uma conta de usuário
// POST /api/register  body: { email, password, key, name }
// GET  /api/register?action=login&email=...&password=...  → autentica
// GET  /api/register?action=get&email=...&token=...       → dados da conta (admin)

const { getStore } = require('@netlify/blobs');
const { logAudit } = require('./audit');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const ADMIN_TOKEN = process.env.REDUX_ADMIN_TOKEN || 'redux-admin-secret';

function res(body, code = 200) {
  return { statusCode: code, headers: CORS, body: JSON.stringify(body) };
}

function getUserStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-users', siteID, token });
  return getStore('redux-users');
}

function getKeyStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-keys', siteID, token });
  return getStore('redux-keys');
}

// Hash simples (não use em produção crítica — use bcrypt se possível)
async function hashPass(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'rbx-salt-2025');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const p      = event.queryStringParameters || {};
  const action = (p.action || '').toLowerCase();

  // ── POST /api/register — criar conta ──────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return res({ error: 'INVALID_JSON' }, 400); }

    const email    = (body.email    || '').toLowerCase().trim();
    const password = (body.password || '').trim();
    const key      = (body.key      || '').trim();
    const name     = (body.name     || '').trim();

    if (!email || !password || !key) return res({ error: 'FIELDS_REQUIRED' }, 400);
    if (password.length < 6) return res({ error: 'PASSWORD_TOO_SHORT' }, 400);

    try {
      const userStore = getUserStore();
      const keyStore  = getKeyStore();

      // Verifica se email já existe
      const existing = await userStore.get(`user:${email}`).catch(() => null);
      if (existing) return res({ error: 'EMAIL_ALREADY_REGISTERED' }, 400);

      // Verifica se a key existe e está ativa
      const keyRaw = await keyStore.get(key).catch(() => null);
      if (!keyRaw) return res({ error: 'KEY_INVALID' }, 400);
      const keyEntry = JSON.parse(keyRaw);
      if (!keyEntry.active) return res({ error: 'KEY_REVOKED' }, 400);

      // Verifica se key já está vinculada a outro email
      const keyOwner = await userStore.get(`key-owner:${key}`).catch(() => null);
      if (keyOwner) return res({ error: 'KEY_ALREADY_REGISTERED' }, 400);

      const hash = await hashPass(password);

      const userEntry = {
        email,
        name: name || email.split('@')[0],
        passwordHash: hash,
        key,
        keyType: keyEntry.type,
        registeredAt: new Date().toISOString(),
        status: 'active', // active | suspended
        notifications: [] // mensagens pendentes do executor
      };

      // Salva usuário
      await userStore.set(`user:${email}`, JSON.stringify(userEntry));
      // Índice key → email
      await userStore.set(`key-owner:${key}`, email);
      // Índice para listagem admin
      const idxRaw = await userStore.get('__user-index__').catch(() => null);
      const idx = idxRaw ? JSON.parse(idxRaw) : [];
      if (!idx.includes(email)) idx.push(email);
      await userStore.set('__user-index__', JSON.stringify(idx));

      await logAudit({ action: 'register', key, user: email, result: 'success', detail: `name=${name}` });
      return res({ success: true, email, name: userEntry.name, keyType: keyEntry.type });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── GET /api/register?action=login — autenticar ────────────────────────
  if (action === 'login' && event.httpMethod === 'GET') {
    const email    = (p.email    || '').toLowerCase().trim();
    const password = (p.password || '').trim();
    if (!email || !password) return res({ error: 'FIELDS_REQUIRED' }, 400);

    try {
      const userStore = getUserStore();
      const raw = await userStore.get(`user:${email}`).catch(() => null);
      if (!raw) return res({ error: 'INVALID_CREDENTIALS' }, 401);

      const user = JSON.parse(raw);
      const hash = await hashPass(password);
      if (hash !== user.passwordHash) return res({ error: 'INVALID_CREDENTIALS' }, 401);
      if (user.status === 'suspended') return res({ error: 'ACCOUNT_SUSPENDED' }, 403);

      // Busca dados atuais da key
      const keyStore = getKeyStore();
      const keyRaw   = await keyStore.get(user.key).catch(() => null);
      const keyEntry = keyRaw ? JSON.parse(keyRaw) : null;

      // Retorna notificações pendentes e limpa
      const notifications = user.notifications || [];
      user.notifications  = [];
      await userStore.set(`user:${email}`, JSON.stringify(user));

      return res({
        success: true,
        email: user.email,
        name: user.name,
        key: user.key,
        keyType: user.keyType,
        keyActive: keyEntry ? keyEntry.active : false,
        keyExpiry: keyEntry ? keyEntry.expiry : null,
        notifications
      });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── GET /api/register?action=notifications&email=...&password=... ──────
  if (action === 'notifications' && event.httpMethod === 'GET') {
    const email    = (p.email    || '').toLowerCase().trim();
    const password = (p.password || '').trim();
    if (!email || !password) return res({ error: 'FIELDS_REQUIRED' }, 400);

    try {
      const userStore = getUserStore();
      const raw = await userStore.get(`user:${email}`).catch(() => null);
      if (!raw) return res({ error: 'INVALID_CREDENTIALS' }, 401);

      const user = JSON.parse(raw);
      const hash = await hashPass(password);
      if (hash !== user.passwordHash) return res({ error: 'INVALID_CREDENTIALS' }, 401);

      const notifications = user.notifications || [];
      user.notifications  = [];
      await userStore.set(`user:${email}`, JSON.stringify(user));

      return res({ success: true, notifications });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── GET /api/register?action=list&token=... (admin) ───────────────────
  if (action === 'list' && event.httpMethod === 'GET') {
    const token = p.token || (event.headers['authorization'] || '').replace('Bearer ', '');
    if (token !== ADMIN_TOKEN) return res({ error: 'UNAUTHORIZED' }, 401);

    try {
      const userStore = getUserStore();
      const idxRaw    = await userStore.get('__user-index__').catch(() => null);
      const idx       = idxRaw ? JSON.parse(idxRaw) : [];
      const users     = [];

      for (const email of idx) {
        const raw = await userStore.get(`user:${email}`).catch(() => null);
        if (raw) {
          const u = JSON.parse(raw);
          users.push({
            email: u.email,
            name: u.name,
            key: u.key,
            keyType: u.keyType,
            status: u.status,
            registeredAt: u.registeredAt
          });
        }
      }

      return res({ success: true, count: users.length, users });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── GET /api/register?action=notify&token=...&email=...&msg=...&reason= (admin) ─
  if (action === 'notify' && event.httpMethod === 'GET') {
    const token = p.token || (event.headers['authorization'] || '').replace('Bearer ', '');
    if (token !== ADMIN_TOKEN) return res({ error: 'UNAUTHORIZED' }, 401);

    const email  = (p.email  || '').toLowerCase().trim();
    const msg    = (p.msg    || '').trim();
    const reason = (p.reason || 'generic').trim(); // reset-hwid | removed-key | reset-key | generic

    if (!email || !msg) return res({ error: 'FIELDS_REQUIRED' }, 400);

    try {
      const userStore = getUserStore();
      const raw = await userStore.get(`user:${email}`).catch(() => null);
      if (!raw) return res({ error: 'USER_NOT_FOUND' }, 404);

      const user = JSON.parse(raw);
      user.notifications = user.notifications || [];
      user.notifications.push({
        id: Date.now().toString(36),
        reason,
        msg,
        ts: new Date().toISOString(),
        read: false
      });

      await userStore.set(`user:${email}`, JSON.stringify(user));
      return res({ success: true, notified: email });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  return res({ error: 'UNKNOWN_ACTION' }, 400);
};