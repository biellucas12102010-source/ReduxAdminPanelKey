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

  // Dev key — sem expiração
  if (key === 'DEVK_REDUXSTUDIOS1#')
    return ok({ valid: true, type: 'dev', hwid_ok: true, expiry: null });

  try {
    const store = getConfiguredStore();
    const raw   = await store.get(key);

    if (!raw) return err({ error: 'KEY_INVALID' });

    const entry = JSON.parse(raw);

    if (!entry.active) return err({ error: 'KEY_REVOKED' });

    if (entry.expiry && Date.now() > new Date(entry.expiry).getTime()) {
      entry.active = false;
      await store.set(key, JSON.stringify(entry));
      return err({ error: 'KEY_REVOKED' });
    }

    // Primeiro uso: ainda sem HWID — vincula agora
    // e inicia o timer a partir deste momento
    if (!entry.hwid) {
      if (hwid) {
        entry.hwid = hwid;

        // Se for key FREE sem expiry definido ainda, define agora (1 dia a partir do 1º uso)
        if (entry.type === 'free' && !entry.expiry) {
          entry.expiry = new Date(Date.now() + 86400000).toISOString(); // 24h a partir do 1º uso
        }

        await store.set(key, JSON.stringify(entry));
      }
      return ok({ valid: true, type: entry.type, hwid_ok: true, expiry: entry.expiry || null });
    }

    if (entry.hwid !== hwid) return err({ error: 'HWID_MISMATCH' });

    // Retorna expiry para o executor exibir o timer
    return ok({ valid: true, type: entry.type, hwid_ok: true, expiry: entry.expiry || null });

  } catch (e) {
    console.error('validate error:', e.message);
    return err({ error: 'SERVER_ERROR', detail: e.message });
  }
};