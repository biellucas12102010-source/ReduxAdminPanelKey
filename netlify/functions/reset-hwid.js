// netlify/functions/reset-hwid.js
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

function getConfiguredStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-keys', siteID, token });
  return getStore('redux-keys');
}

function getUserStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-users', siteID, token });
  return getStore('redux-users');
}

function getIP(event) {
  return event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || event.headers['client-ip']
    || null;
}

async function notifyUser(key, reason, msg) {
  try {
    const userStore  = getUserStore();
    const ownerEmail = await userStore.get('key-owner:' + key).catch(() => null);
    if (!ownerEmail) return;
    const raw = await userStore.get('user:' + ownerEmail).catch(() => null);
    if (!raw) return;
    const user = JSON.parse(raw);
    user.notifications = user.notifications || [];
    user.notifications.push({ id: Date.now().toString(36), reason, msg, ts: new Date().toISOString(), read: false });
    await userStore.set('user:' + ownerEmail, JSON.stringify(user));
  } catch (e) {
    console.error('[notify] erro:', e.message);
  }
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const auth  = (event.headers['authorization'] || '').replace('Bearer ', '');
  const token = (event.queryStringParameters || {}).token || auth;

  if (token !== ADMIN_TOKEN) {
    await logAudit({ action: 'reset-hwid', ip: getIP(event), result: 'unauthorized', detail: 'Token inválido' });
    return res({ error: 'UNAUTHORIZED' }, 401);
  }

  const key = ((event.queryStringParameters || {}).key || '').trim();
  if (!key) return res({ error: 'KEY_REQUIRED' });

  try {
    const store = getConfiguredStore();
    const raw   = await store.get(key);
    if (!raw) {
      await logAudit({ action: 'reset-hwid', key, ip: getIP(event), result: 'error', detail: 'Key não encontrada' });
      return res({ error: 'KEY_NOT_FOUND' });
    }

    const entry   = JSON.parse(raw);
    const oldHwid = entry.hwid;
    entry.hwid    = null;
    await store.set(key, JSON.stringify(entry));

    await notifyUser(key, 'reset-hwid',
      'Seu HWID foi resetado pelo administrador. Insira sua key novamente para continuar usando o RBX.');

    await logAudit({ action: 'reset-hwid', key, user: entry.user || null, ip: getIP(event), result: 'success', detail: 'hwid_anterior=' + (oldHwid || 'nenhum') });

    return res({ success: true, key, hwid_reset: true });
  } catch (e) {
    await logAudit({ action: 'reset-hwid', key, ip: getIP(event), result: 'error', detail: e.message });
    return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
  }
};