// netlify/functions/list.js
const { getStore } = require('@netlify/blobs');

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

function getAccStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-accounts', siteID, token });
  return getStore('redux-accounts');
}

// Suporte legado
function getUserStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-users', siteID, token });
  return getStore('redux-users');
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const auth  = (event.headers['authorization'] || '').replace('Bearer ', '');
  const token = (event.queryStringParameters || {}).token || auth;
  if (token !== ADMIN_TOKEN) return res({ error: 'UNAUTHORIZED' }, 401);

  try {
    const store  = getConfiguredStore();
    const idxRaw = await store.get('__index__');
    const idx    = idxRaw ? JSON.parse(idxRaw) : [];

    // Carrega mapa de contas para enriquecer dados
    let accByKey = {};
    try {
      const accStore = getAccStore();
      const aIdxRaw  = await accStore.get('__index__').catch(() => null);
      if (aIdxRaw) {
        const aIdx = JSON.parse(aIdxRaw);
        for (const email of aIdx) {
          const raw = await accStore.get('acc:' + email).catch(() => null);
          if (raw) {
            const a = JSON.parse(raw);
            if (a.key) accByKey[a.key] = { email: a.email, name: a.name };
          }
        }
      }
    } catch {}

    // Suporte legado: redux-users
    try {
      const userStore = getUserStore();
      const uIdxRaw   = await userStore.get('__user-index__').catch(() => null);
      if (uIdxRaw) {
        const uIdx = JSON.parse(uIdxRaw);
        for (const email of uIdx) {
          const raw = await userStore.get('user:' + email).catch(() => null);
          if (raw) {
            const u = JSON.parse(raw);
            if (u.key && !accByKey[u.key]) accByKey[u.key] = { email: u.email, name: u.name };
          }
        }
      }
    } catch {}

    const keys = [];
    for (const k of idx) {
      if (k === '__index__') continue;
      try {
        const raw = await store.get(k);
        if (raw) {
          const entry = JSON.parse(raw);
          const acc   = accByKey[k] || null;
          keys.push({
            key:          k,
            type:         entry.type,
            active:       entry.active,
            suspended:    entry.suspended || false,
            hwid:         entry.hwid || null,
            user:         acc ? (acc.name || acc.email) : (entry.user || 'Anonymous'),
            email:        acc ? acc.email : null,
            accountName:  acc ? (acc.name || null) : null,
            created:      entry.created,
            expiry:       entry.expiry,
            daysOnFirstUse: entry.daysOnFirstUse ?? null,
            hasAccount:   !!acc,
            deletedVia:   entry.deletedVia || null,
            revokedAt:    entry.revokedAt  || null,
            deletedAt:    entry.deletedAt  || null
          });
        }
      } catch {}
    }

    return res({ success: true, count: keys.length, keys });
  } catch (e) {
    return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
  }
};