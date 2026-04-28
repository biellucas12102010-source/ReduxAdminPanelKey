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

function getConfiguredStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-keys', siteID, token });
  return getStore('redux-keys');
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const p    = event.queryStringParameters || {};
  const key  = (p.key  || '').trim();
  const hwid = (p.hwid || '').trim();

  if (!key) return err({ error: 'KEY_INVALID' });

  // Dev key — sempre válida, sem expiração
  if (key === 'DEVK_REDUXSTUDIOS1#')
    return ok({ valid: true, type: 'dev', hwid_ok: true, expiry: null });

  try {
    const store = getConfiguredStore();
    const raw   = await store.get(key);

    if (!raw) return err({ error: 'KEY_INVALID' });

    const entry = JSON.parse(raw);

    if (!entry.active) return err({ error: 'KEY_REVOKED' });

    // Key suspensa (resetada pelo admin) — válida mas aguarda reativação pelo dono
    if (entry.suspended) return err({ error: 'KEY_SUSPENDED' });

    // Verifica expiração (só se já tiver expiry definido)
    if (entry.expiry && Date.now() > new Date(entry.expiry).getTime()) {
      entry.active = false;
      await store.set(key, JSON.stringify(entry));
      return err({ error: 'KEY_EXPIRED' });
    }

    // Primeiro uso: ainda sem HWID — vincula e inicia timer
    if (!entry.hwid) {
      if (hwid) {
        entry.hwid = hwid;

        // Calcula expiry baseado em daysOnFirstUse
        // 0 = sem expiração (unlimited)
        // >0 = N dias a partir do 1º uso
        const days = entry.daysOnFirstUse;
        if (days === undefined || days === null) {
          // fallback legado: 1 dia
          entry.expiry = new Date(Date.now() + 86400000).toISOString();
        } else if (days === 0) {
          entry.expiry = null; // sem expiração
        } else {
          entry.expiry = new Date(Date.now() + days * 86400000).toISOString();
        }

        await store.set(key, JSON.stringify(entry));
      }
      return ok({ valid: true, type: entry.type, hwid_ok: true, expiry: entry.expiry || null });
    }

    if (entry.hwid !== hwid) return err({ error: 'HWID_MISMATCH' });

    return ok({ valid: true, type: entry.type, hwid_ok: true, expiry: entry.expiry || null });

  } catch (e) {
    console.error('validate error:', e.message);
    return err({ error: 'SERVER_ERROR', detail: e.message });
  }
};
