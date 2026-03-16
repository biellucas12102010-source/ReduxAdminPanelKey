const fs   = require('fs');
const path = require('path');

const DB          = path.join(__dirname, 'keys.json');
const ADMIN_TOKEN = process.env.REDUX_ADMIN_TOKEN || 'REDUX_ADMIN_2026';

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
  const key   = (p.key   || '').trim();

  if (token !== ADMIN_TOKEN) return res({ success: false, error: 'UNAUTHORIZED' }, 401);
  if (!key) return res({ success: false, error: 'KEY_MISSING' });

  const keys  = load();
  const entry = keys[key];

  if (!entry) return res({ success: false, error: 'KEY_NOT_FOUND' });

  keys[key].hwid = null;
  save(keys);

  return res({ success: true, key, message: 'HWID resetado. Usuario pode usar em outro PC.' });
};
