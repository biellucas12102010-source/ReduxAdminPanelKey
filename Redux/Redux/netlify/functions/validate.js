const fs   = require('fs');
const path = require('path');

const DB = path.join(__dirname, 'keys.json');

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

  const p    = event.queryStringParameters || {};
  const key  = (p.key  || '').trim();
  const hwid = (p.hwid || '').trim();

  if (!key) return res({ valid: false, error: 'KEY_INVALID' });

  // Dev key — sempre valida, sem HWID
  if (key === 'DEVK_REDUXSTUDIOS1#')
    return res({ valid: true, type: 'dev', hwid_ok: true });

  const keys  = load();
  const entry = keys[key];

  if (!entry)          return res({ valid: false, error: 'KEY_INVALID' });
  if (!entry.active)   return res({ valid: false, error: 'KEY_REVOKED' });

  // Verifica expiracao
  if (entry.expiry && Date.now() > new Date(entry.expiry).getTime()) {
    keys[key].active = false;
    save(keys);
    return res({ valid: false, error: 'KEY_REVOKED' });
  }

  // HWID — vincula no primeiro uso
  if (!entry.hwid) {
    if (hwid) { keys[key].hwid = hwid; save(keys); }
    return res({ valid: true, type: entry.type, hwid_ok: true });
  }

  // HWID ja vinculado — verifica se bate
  if (entry.hwid !== hwid)
    return res({ valid: false, error: 'HWID_MISMATCH' });

  return res({ valid: true, type: entry.type, hwid_ok: true });
};
