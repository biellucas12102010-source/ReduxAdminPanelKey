// netlify/functions/list.js
// Lista todas as keys (admin only)
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const auth  = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = event.queryStringParameters?.token || '';
  if (auth.replace('Bearer ', '') !== ADMIN_TOKEN && token !== ADMIN_TOKEN)
    return res({ error: 'UNAUTHORIZED' }, 401);

  try {
    const store  = getStore('redux-keys');
    const idxRaw = await store.get('__index__');
    const idx    = idxRaw ? JSON.parse(idxRaw) : [];

    const keys = [];
    for (const key of idx) {
      if (key === '__index__') continue;
      const raw = await store.get(key);
      if (raw) keys.push({ key, ...JSON.parse(raw) });
    }

    return res({ success: true, count: keys.length, keys });
  } catch (e) {
    return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
  }
};
