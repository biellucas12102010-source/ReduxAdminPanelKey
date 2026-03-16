// netlify/functions/revoke.js
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

  const key = ((event.queryStringParameters || {}).key || '').trim();
  if (!key) return res({ error: 'KEY_REQUIRED' });

  try {
    const store = getStore({ name: 'redux-keys', context });
    const raw   = await store.get(key);
    if (!raw) return res({ error: 'KEY_NOT_FOUND' });

    const entry  = JSON.parse(raw);
    entry.active = false;
    await store.set(key, JSON.stringify(entry));

    return res({ success: true, key, revoked: true });
  } catch (e) {
    return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
  }
};
