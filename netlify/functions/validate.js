// netlify/functions/validate.js
const { getStore } = require('@netlify/blobs');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function ok(body)  { return { statusCode: 200, headers: CORS, body: JSON.stringify(body) }; }
function err(body) { return { statusCode: 200, headers: CORS, body: JSON.stringify({ valid: false, ...body }) }; }

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const p    = event.queryStringParameters || {};
  const key  = (p.key  || '').trim();
  const hwid = (p.hwid || '').trim();

  if (!key) return err({ error: 'KEY_INVALID' });

  // Dev key — sempre válida
  if (key === 'DEVK_REDUXSTUDIOS1#')
    return ok({ valid: true, type: 'dev', hwid_ok: true });

  try {
    const store = getStore({ name: 'redux-keys', context });
    const raw   = await store.get(key);

    if (!raw) return err({ error: 'KEY_INVALID' });

    const entry = JSON.parse(raw);

    if (!entry.active) return err({ error: 'KEY_REVOKED' });

    // Expiração
    if (entry.expiry && Date.now() > new Date(entry.expiry).getTime()) {
      entry.active = false;
      await store.set(key, JSON.stringify(entry));
      return err({ error: 'KEY_REVOKED' });
    }

    // HWID — vincula no primeiro uso
    if (!entry.hwid) {
      if (hwid) { entry.hwid = hwid; await store.set(key, JSON.stringify(entry)); }
      return ok({ valid: true, type: entry.type, hwid_ok: true });
    }

    // HWID já vinculado — verifica
    if (entry.hwid !== hwid) return err({ error: 'HWID_MISMATCH' });

    return ok({ valid: true, type: entry.type, hwid_ok: true });

  } catch (e) {
    console.error('validate error:', e.message);
    return err({ error: 'SERVER_ERROR', detail: e.message });
  }
};
