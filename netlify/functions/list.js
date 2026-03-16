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

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const auth  = (event.headers['authorization'] || '').replace('Bearer ', '');
  const token = (event.queryStringParameters || {}).token || auth;
  if (token !== ADMIN_TOKEN) return res({ error: 'UNAUTHORIZED' }, 401);

  try {
    const store  = getStore({ name: 'redux-keys', context });
    const idxRaw = await store.get('__index__');
    const idx    = idxRaw ? JSON.parse(idxRaw) : [];

    const keys = [];
    for (const k of idx) {
      if (k === '__index__') continue;
      try {
        const raw = await store.get(k);
        if (raw) keys.push({ key: k, ...JSON.parse(raw) });
      } catch {}
    }

    return res({ success: true, count: keys.length, keys });
  } catch (e) {
    return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
  }
};
