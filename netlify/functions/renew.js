// netlify/functions/renew.js
// Estende (ou zera) a data de expiração de uma key existente sem precisar gerar uma nova.
//
// GET /api/renew?token=<admin>&key=<KEY>&days=<N>
//   days=0  → remove expiração (ilimitado)
//   days>0  → adiciona N dias a partir de AGORA (ou da expiração atual, o que for maior)

const { getStore } = require('@netlify/blobs');
const { logAudit } = require('./audit');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const ADMIN_TOKEN = process.env.REDUX_ADMIN_TOKEN || 'redux-admin-secret';

function res(body, code = 200) {
  return { statusCode: code, headers: CORS, body: JSON.stringify(body) };
}

function getConfiguredStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-keys', siteID, token });
  return getStore('redux-keys');
}

function getIP(event) {
  return event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || event.headers['client-ip'] || null;
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const auth  = (event.headers['authorization'] || '').replace('Bearer ', '');
  const p     = event.queryStringParameters || {};
  const token = p.token || auth;

  if (token !== ADMIN_TOKEN) {
    await logAudit({ action: 'renew', ip: getIP(event), result: 'unauthorized', detail: 'Token inválido' });
    return res({ error: 'UNAUTHORIZED' }, 401);
  }

  const key  = (p.key  || '').trim();
  const days = parseInt(p.days ?? '30', 10);

  if (!key) return res({ error: 'KEY_REQUIRED' }, 400);
  if (isNaN(days) || days < 0) return res({ error: 'DAYS_INVALID' }, 400);

  try {
    const store = getConfiguredStore();
    const raw   = await store.get(key).catch(() => null);
    if (!raw) return res({ error: 'KEY_NOT_FOUND' }, 404);

    const entry = JSON.parse(raw);

    if (!entry.active) return res({ error: 'KEY_REVOKED' }, 400);

    const oldExpiry = entry.expiry || null;

    if (days === 0) {
      // Ilimitado
      entry.expiry         = null;
      entry.daysOnFirstUse = 0;
    } else {
      // Se a key ainda não expirou, estende a partir da expiração atual.
      // Se já expirou (ou nunca teve), estende a partir de agora.
      const base = entry.expiry && new Date(entry.expiry) > new Date()
        ? new Date(entry.expiry)
        : new Date();

      entry.expiry         = new Date(base.getTime() + days * 86400000).toISOString();
      entry.daysOnFirstUse = days; // atualiza campo de referência
    }

    // Reativa se estava expirada (mas não revogada/suspensa)
    entry.active    = true;
    // Não altera suspended — admin deve usar /revoke?reason=reset-key para isso

    await store.set(key, JSON.stringify(entry));

    const expiryLabel = entry.expiry
      ? new Date(entry.expiry).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : 'Ilimitado';

    await logAudit({
      action: 'renew', key, user: entry.user || null, ip: getIP(event),
      result: 'success',
      detail: `days=${days === 0 ? 'ilimitado' : days}, old=${oldExpiry || 'null'}, new=${entry.expiry || 'null'}`
    });

    return res({ success: true, key, expiry: expiryLabel, days });
  } catch (e) {
    await logAudit({ action: 'renew', key, ip: getIP(event), result: 'error', detail: e.message });
    return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
  }
};