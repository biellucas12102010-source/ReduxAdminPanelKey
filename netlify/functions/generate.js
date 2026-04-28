// netlify/functions/generate.js
const { getStore } = require('@netlify/blobs');
const { logAudit } = require('./audit');

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

function getConfiguredStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-keys', siteID, token });
  return getStore('redux-keys');
}

function genKey(type) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let prefix, len;
  if (type === 'premium') { prefix = 'KEYP_'; len = 20; }
  else if (type === 'free7') { prefix = 'KEYF_'; len = 15; }
  else if (type === 'free30') { prefix = 'KEYF_'; len = 15; }
  else { prefix = 'KEYF_'; len = 15; }
  let key = '';
  for (let i = 0; i < len; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return prefix + key;
}

function getIP(event) {
  return event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || event.headers['client-ip']
    || null;
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const auth  = (event.headers['authorization'] || '').replace('Bearer ', '');
  const token = (event.queryStringParameters || {}).token || auth;

  if (token !== ADMIN_TOKEN) {
    await logAudit({ action: 'generate', ip: getIP(event), result: 'unauthorized', detail: 'Token inválido' });
    return res({ error: 'UNAUTHORIZED' }, 401);
  }

  const p    = event.queryStringParameters || {};
  // type pode ser: premium, premium7, premium30, free, free7, free30
  // Para premium: sem expiração (exceto premium7/premium30)
  // Para free: 24h padrão, free7=7d, free30=30d
  const rawType = (p.type || 'free').toLowerCase();
  const user    = p.user || 'Anonymous';

  // Determina tipo real (premium ou free) e dias
  let keyType = 'free';
  let daysOnFirstUse = 1; // padrão: 1 dia (24h)

  if (rawType === 'premium') {
    keyType = 'premium'; daysOnFirstUse = 0; // sem expiração
  } else if (rawType === 'premium7') {
    keyType = 'premium'; daysOnFirstUse = 7;
  } else if (rawType === 'premium30') {
    keyType = 'premium'; daysOnFirstUse = 30;
  } else if (rawType === 'premiumunlimited' || rawType === 'premium_unlimited') {
    keyType = 'premium'; daysOnFirstUse = 0;
  } else if (rawType === 'free') {
    // Checa parâmetro days
    const days = parseInt(p.days ?? '1', 10);
    keyType = 'free';
    daysOnFirstUse = (days === 0) ? 0 : days; // 0 = unlimited
  } else if (rawType === 'free7') {
    keyType = 'free'; daysOnFirstUse = 7;
  } else if (rawType === 'free30') {
    keyType = 'free'; daysOnFirstUse = 30;
  } else if (rawType === 'freeunlimited' || rawType === 'free_unlimited') {
    keyType = 'free'; daysOnFirstUse = 0;
  } else {
    // fallback: lê o parâmetro days
    keyType = rawType.startsWith('premium') ? 'premium' : 'free';
    const days = parseInt(p.days ?? '1', 10);
    daysOnFirstUse = isNaN(days) ? 1 : days;
  }

  const key   = genKey(keyType);
  const entry = {
    type: keyType,
    active: true,
    hwid: null,
    suspended: false, // resetado = key inativa até o dono reativar
    user,
    created: new Date().toISOString(),
    expiry: null,
    daysOnFirstUse // 0 = sem expiração; >0 = dias a partir do 1º uso
  };

  try {
    const store = getConfiguredStore();
    await store.set(key, JSON.stringify(entry));

    let idx = [];
    try { const raw = await store.get('__index__'); if (raw) idx = JSON.parse(raw); } catch {}
    if (!idx.includes(key)) idx.push(key);
    await store.set('__index__', JSON.stringify(idx));

    const expiryLabel = daysOnFirstUse === 0 ? 'unlimited'
      : daysOnFirstUse === 1 ? '1d on first use'
      : `${daysOnFirstUse}d on first use`;

    await logAudit({
      action: 'generate', key, user, ip: getIP(event), result: 'success',
      detail: `type=${keyType}, rawType=${rawType}, daysOnFirstUse=${daysOnFirstUse === 0 ? 'infinito' : daysOnFirstUse}`
    });

    return res({ success: true, key, type: keyType, user, expiry: expiryLabel, daysOnFirstUse });
  } catch (e) {
    console.error('generate error:', e.message);
    await logAudit({ action: 'generate', user, ip: getIP(event), result: 'error', detail: e.message });
    return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
  }
};
