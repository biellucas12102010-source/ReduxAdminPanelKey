// netlify/functions/audit.js
// Log de auditoria das ações admin
// Endpoints:
//   GET  /api/audit?token=<admin>&limit=50&action=generate&key=KEYF_...
//   DELETE /api/audit?token=<admin>   → limpa logs antigos (>30 dias)

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS'
};

const ADMIN_TOKEN = process.env.REDUX_ADMIN_TOKEN || 'redux-admin-secret';
const MAX_LOGS = 1000; // máximo de logs armazenados

function res(body, code = 200) {
  return { statusCode: code, headers: CORS, body: JSON.stringify(body) };
}

function getAuditStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-audit', siteID, token });
  return getStore('redux-audit');
}

// Função utilitária exportada para uso nos outros endpoints
// Uso: await logAudit({ action, key, user, ip, result, detail })
async function logAudit({ action, key = null, user = null, ip = null, result = 'success', detail = null }) {
  try {
    const store = getAuditStore();
    const raw   = await store.get('__logs__').catch(() => null);
    const logs  = raw ? JSON.parse(raw) : [];

    logs.push({
      id:     Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      ts:     new Date().toISOString(),
      action,
      key,
      user,
      ip,
      result,
      detail
    });

    // Mantém no máximo MAX_LOGS entradas
    if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);

    await store.set('__logs__', JSON.stringify(logs));
  } catch (e) {
    // Nunca deixa o log quebrar a operação principal
    console.error('[audit] falha ao registrar:', e.message);
  }
}

exports.logAudit = logAudit;

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const auth  = (event.headers['authorization'] || '').replace('Bearer ', '');
  const p     = event.queryStringParameters || {};
  const token = p.token || auth;

  if (token !== ADMIN_TOKEN) return res({ error: 'UNAUTHORIZED' }, 401);

  // DELETE → purga logs com mais de 30 dias
  if (event.httpMethod === 'DELETE') {
    try {
      const store    = getAuditStore();
      const raw      = await store.get('__logs__').catch(() => null);
      const logs     = raw ? JSON.parse(raw) : [];
      const cutoff   = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const filtered = logs.filter(l => new Date(l.ts).getTime() > cutoff);
      await store.set('__logs__', JSON.stringify(filtered));
      return res({ success: true, removed: logs.length - filtered.length, remaining: filtered.length });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // GET → lista logs com filtros opcionais
  if (event.httpMethod === 'GET') {
    try {
      const store  = getAuditStore();
      const raw    = await store.get('__logs__').catch(() => null);
      let logs     = raw ? JSON.parse(raw) : [];

      // Filtros opcionais
      if (p.action) logs = logs.filter(l => l.action === p.action);
      if (p.key)    logs = logs.filter(l => l.key && l.key.includes(p.key));
      if (p.result) logs = logs.filter(l => l.result === p.result);
      if (p.from)   logs = logs.filter(l => new Date(l.ts) >= new Date(p.from));
      if (p.to)     logs = logs.filter(l => new Date(l.ts) <= new Date(p.to));

      // Mais recentes primeiro
      logs.reverse();

      const limit = Math.min(parseInt(p.limit || '50', 10), 500);
      logs = logs.slice(0, limit);

      return res({ success: true, count: logs.length, logs });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  return res({ error: 'METHOD_NOT_ALLOWED' }, 405);
};