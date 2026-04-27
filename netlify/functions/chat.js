// netlify/functions/chat.js
// API de chat entre amigos — Redux Key System
// Endpoints (via ?action=...):
//   GET  ?action=history&token=<email>&with=<friendEmail>   → lista mensagens
//   POST ?action=send&token=<email>                         → envia mensagem (body JSON)
//   POST ?action=react&token=<email>                        → reage a mensagem (body JSON)
//   GET  ?action=unread&token=<email>                       → contagem de não lidos por amigo
//   POST ?action=markread&token=<email>                     → marca conversa como lida (body JSON)

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function res(body, code = 200) {
  return { statusCode: code, headers: CORS, body: JSON.stringify(body) };
}

function getStore_() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_TOKEN   || process.env.TOKEN;
  if (siteID && token) return getStore({ name: 'redux-chat', siteID, token });
  return getStore('redux-chat');
}

// Gera chave de conversa estável entre dois emails (ordem alfabética)
function convKey(a, b) {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort();
  return `conv:${x}|${y}`;
}

// Chave de contagem de não lidos: unread:<recipient>:<sender>
function unreadKey(recipient, sender) {
  return `unread:${recipient.toLowerCase()}:${sender.toLowerCase()}`;
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return res({}, 204);

  const store  = getStore_();
  const p      = event.queryStringParameters || {};
  const action = (p.action || '').toLowerCase();
  const token  = (p.token  || '').trim().toLowerCase(); // email do usuário logado

  if (!token) return res({ error: 'TOKEN_REQUIRED' }, 400);

  // ── GET /api/chat?action=history&token=<me>&with=<friend> ─────────────
  if (action === 'history' && event.httpMethod === 'GET') {
    const friendEmail = (p.with || '').trim().toLowerCase();
    if (!friendEmail) return res({ error: 'WITH_REQUIRED' }, 400);
    try {
      const key = convKey(token, friendEmail);
      const raw = await store.get(key).catch(() => null);
      const messages = raw ? JSON.parse(raw) : [];
      return res({ success: true, messages });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── POST /api/chat?action=send&token=<me> ─────────────────────────────
  if (action === 'send' && event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return res({ error: 'INVALID_JSON' }, 400); }

    const to          = (body.to || '').toLowerCase();
    const text        = (body.text || '').substring(0, 2000);
    const type        = body.type || 'text';        // text | image | sticker
    const mediaBase64 = body.mediaBase64 || null;   // base64 da imagem (máx ~800KB)
    const mediaName   = body.mediaName   || null;
    const stickerUrl  = body.stickerUrl  || null;
    const stickerName = body.stickerName || null;

    if (!to) return res({ error: 'TO_REQUIRED' }, 400);
    if (!text && !mediaBase64 && !stickerUrl)
      return res({ error: 'CONTENT_REQUIRED' }, 400);

    try {
      const key     = convKey(token, to);
      const raw     = await store.get(key).catch(() => null);
      const msgs    = raw ? JSON.parse(raw) : [];

      const newMsg = {
        id:          Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        from:        token,
        to:          to,
        text,
        type,
        mediaBase64: mediaBase64 || undefined,
        mediaName:   mediaName   || undefined,
        stickerUrl:  stickerUrl  || undefined,
        stickerName: stickerName || undefined,
        reactions:   {},
        ts:          new Date().toISOString()
      };

      msgs.push(newMsg);

      // Mantém no máximo 500 mensagens por conversa
      if (msgs.length > 500) msgs.splice(0, msgs.length - 500);

      await store.set(key, JSON.stringify(msgs));

      // Incrementa contador de não lidos para o destinatário
      const uk     = unreadKey(to, token);
      const ukRaw  = await store.get(uk).catch(() => null);
      const ukVal  = ukRaw ? (parseInt(ukRaw, 10) || 0) : 0;
      await store.set(uk, String(ukVal + 1));

      return res({ success: true, message: newMsg });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── POST /api/chat?action=react&token=<me> ────────────────────────────
  if (action === 'react' && event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return res({ error: 'INVALID_JSON' }, 400); }

    const friendEmail = (body.with || '').toLowerCase();
    const msgId       = body.msgId || '';
    const emoji       = body.emoji || '';

    if (!friendEmail || !msgId || !emoji)
      return res({ error: 'PARAMS_REQUIRED' }, 400);

    try {
      const key  = convKey(token, friendEmail);
      const raw  = await store.get(key).catch(() => null);
      const msgs = raw ? JSON.parse(raw) : [];

      const idx = msgs.findIndex(m => m.id === msgId);
      if (idx === -1) return res({ error: 'MSG_NOT_FOUND' }, 404);

      if (!msgs[idx].reactions) msgs[idx].reactions = {};
      if (!msgs[idx].reactions[emoji]) msgs[idx].reactions[emoji] = [];

      const reactors = msgs[idx].reactions[emoji];
      const alreadyIdx = reactors.indexOf(token);
      if (alreadyIdx >= 0) {
        // Toggle: remove se já reagiu
        reactors.splice(alreadyIdx, 1);
        if (reactors.length === 0) delete msgs[idx].reactions[emoji];
      } else {
        reactors.push(token);
      }

      await store.set(key, JSON.stringify(msgs));
      return res({ success: true, message: msgs[idx] });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── GET /api/chat?action=unread&token=<me> ────────────────────────────
  if (action === 'unread' && event.httpMethod === 'GET') {
    try {
      // Lista todas as chaves unread:<token>:* para este usuário
      const prefix = `unread:${token}:`;
      let listResult;
      try { listResult = await store.list({ prefix }); } catch { listResult = { blobs: [] }; }

      const counts = {};
      const blobs  = listResult?.blobs || listResult?.keys || [];

      for (const blob of blobs) {
        const blobKey = blob.key || blob;
        const sender  = blobKey.replace(prefix, '');
        try {
          const raw = await store.get(blobKey).catch(() => null);
          const n   = raw ? (parseInt(raw, 10) || 0) : 0;
          if (n > 0) counts[sender] = n;
        } catch { }
      }

      return res({ success: true, counts });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  // ── POST /api/chat?action=markread&token=<me> ─────────────────────────
  if (action === 'markread' && event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return res({ error: 'INVALID_JSON' }, 400); }
    const sender = (body.from || '').toLowerCase();
    if (!sender) return res({ error: 'FROM_REQUIRED' }, 400);
    try {
      const uk = unreadKey(token, sender);
      await store.set(uk, '0');
      return res({ success: true });
    } catch (e) {
      return res({ error: 'SERVER_ERROR', detail: e.message }, 500);
    }
  }

  return res({ error: 'UNKNOWN_ACTION' }, 400);
};