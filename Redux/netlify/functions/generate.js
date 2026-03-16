const fs   = require('fs');
const path = require('path');

const DB          = path.join(__dirname, 'keys.json');
const ADMIN_TOKEN = process.env.REDUX_ADMIN_TOKEN || 'REDUX_ADMIN_2026';
const CHARS       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randStr(n) {
  let r = '';
  for (let i = 0; i < n; i++) r += CHARS[Math.floor(Math.random() * CHARS.length)];
  return r;
}
function load() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return {}; }
}
function save(keys) {
  try { fs.writeFileSync(DB, JSON.stringify(keys, null, 2), 'utf8'); } catch {}
}
function res(body, code) {
  return {
    statusCode: code || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const p     = event.queryStringParameters || {};
  const token = (p.token || '').trim();
  const type  = (p.type  || 'premium').trim().toLowerCase();
  const user  = (p.user  || 'Anonymous').trim();

  if (token !== ADMIN_TOKEN) return res({ success: false, error: 'UNAUTHORIZED' }, 401);
  if (type !== 'premium' && type !== 'free') return res({ success: false, error: 'INVALID_TYPE' });

  const keys = load();

  // Gera key unica
  let key, attempts = 0;
  do {
    key = type === 'premium' ? 'KEYP_' + randStr(20) : 'KEYF_' + randStr(15);
    if (++attempts > 100) return res({ success: false, error: 'GENERATION_FAILED' });
  } while (keys[key]);

  const expiry = type === 'free'
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  keys[key] = {
    type, active: true, hwid: null, user,
    created: new Date().toISOString(),
    expiry
  };
  save(keys);

  return res({ success: true, key, type, user, expiry: expiry || 'unlimited' });
};
