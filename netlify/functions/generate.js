// netlify/functions/generate.js
// Gera novas keys (requer admin token)

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

function genKey(type) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const len   = type === 'premium' ? 20 : 15;
  let key = '';
  for (let i = 0; i < len; i++)
    key += chars[Math.floor(Math.random() * chars.length)];
  return (type === 'premium' ? 'KEYP_' : 'KEYF_') + key;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  // Verificação de admin
  const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = event.queryStringParameters?.token || '';
  if (auth.replace('Bearer ', '') !== ADMIN_TOKEN && token !== ADMIN_TOKEN)
    return res({ error: 'UNAUTHORIZED' }, 401);

  const p    = event.queryStringParameters || {};
  const type = (p.type || 'free').toLowerCase(); // 'free' ou 'premium'
  const user = p.user || 'Anonymous';
  const days = parseInt(p.days || '1', 10);

  const key   = genKey(type);
  const entry = {
    type,
    active: true,
    hwid: null,
    user,
    created: new Date().toISOString(),
    expiry: type === 'free'
      ? new Date(Date.now() + days * 86400000).toISOString()
      : null
  };

  try {
    const store = getStore('redux-keys');
    await store.set(key, JSON.stringify(entry));

    // Atualiza índice de keys
    const idxRaw = await store.get('__index__');
    const idx    = idxRaw ? JSON.parse(idxRaw) : [];
    idx.push(key);
    await store.set('__index__', JSON.stringify(idx));

    return res({ success: true, key, type, user, expiry: entry.expiry });
  } catch (e) {
    return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
  }
};
