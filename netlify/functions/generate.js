// netlify/functions/generate.js
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

function genKey(type) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const len   = type === 'premium' ? 20 : 15;
  let key = '';
  for (let i = 0; i < len; i++)
    key += chars[Math.floor(Math.random() * chars.length)];
  return (type === 'premium' ? 'KEYP_' : 'KEYF_') + key;
}

function getIP(event) {
  return event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || event.headers['client-ip']
    || null;
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const auth  = (event.headers['authorization'] || '').replace('Bearer ', '');
  const token = (event.queryStringParameters || {}).token || auth;

  if (token !== ADMIN_TOKEN) {
    await logAudit({ action: 'generate', ip: getIP(event), result: 'unauthorized', detail: 'Token inválido' });
    return res({ error: 'UNAUTHORIZED' }, 401);
  }

  const p    = event.queryStringParameters || {};
  const type = (p.type || 'free').toLowerCase();
  const user = p.user || 'Anonymous';
  const days = parseInt(p.days ?? '1', 10);

  // premium ou days=0 → sem expiração
  // free com days > 0 → daysOnFirstUse salvo; expiry calculado no primeiro uso (validate.js)
  const daysOnFirstUse = (type === 'premium' || days === 0) ? 0 : days;

  const key   = genKey(type);
  const entry = {
    type,
    active: true,
    hwid: null,
    user,
    created: new Date().toISOString(),
    expiry: null,          // sempre null aqui; validate.js seta no primeiro uso
    daysOnFirstUse        // 0 = sem expiração; >0 = dias contados a partir do primeiro uso
  };

  try {
    const store = getConfiguredStore();
    await store.set(key, JSON.stringify(entry));

    let idx = [];
    try { const raw = await store.get('__index__'); if (raw) idx = JSON.parse(raw); } catch {}
    if (!idx.includes(key)) idx.push(key);
    await store.set('__index__', JSON.stringify(idx));

    await logAudit({
      action: 'generate',
      key,
      user,
      ip: getIP(event),
      result: 'success',
      detail: `type=${type}, daysOnFirstUse=${daysOnFirstUse === 0 ? 'infinito' : daysOnFirstUse}`
    });

    return res({ success: true, key, type, user, expiry: daysOnFirstUse === 0 ? 'unlimited' : `${daysOnFirstUse}d on first use` });
  } catch (e) {
    console.error('generate error:', e.message);
    await logAudit({ action: 'generate', user, ip: getIP(event), result: 'error', detail: e.message });
    return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
  }
};