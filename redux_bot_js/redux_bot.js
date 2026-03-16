// redux_bot.js — Bot Discord em JavaScript
// Instalar: npm install discord.js axios
// Rodar:    node redux_bot.js

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// ── CONFIGURACAO ──────────────────────────────
const DISCORD_TOKEN = 'SEU_TOKEN_DISCORD';
const ADMIN_TOKEN   = 'REDUX_ADMIN_2026';
const API_BASE      = 'https://reduxadminkey.netlify.app/api';
const PREFIX        = '!';
// ─────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

function embedOk(title, desc) {
  return new EmbedBuilder().setColor(0x2233CC).setTitle('✅ ' + title).setDescription(desc).setFooter({ text: 'Redux Key System' });
}
function embedErr(title, desc) {
  return new EmbedBuilder().setColor(0xCC2233).setTitle('❌ ' + title).setDescription(desc).setFooter({ text: 'Redux Key System' });
}
function embedKey(key, type, expiry) {
  const color  = type === 'premium' ? 0xDDAA33 : 0x44FF88;
  const tStr   = type === 'premium' ? '★ Premium' : '● Free';
  const eStr   = expiry === 'unlimited' ? '∞ Ilimitado' : expiry;
  return new EmbedBuilder()
    .setColor(color).setTitle('🔑 Sua Redux Key')
    .addFields(
      { name: 'Key',    value: '`' + key + '`', inline: false },
      { name: 'Tipo',   value: tStr,             inline: true },
      { name: 'Expira', value: eStr,             inline: true }
    )
    .setFooter({ text: 'Nao compartilhe sua key!' });
}

client.once('ready', () => {
  console.log('[Redux Bot] Online como ' + client.user.tag);
  client.user.setActivity('Redux Key System', { type: 2 });
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.content.startsWith(PREFIX)) return;
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd  = args.shift().toLowerCase();

  // !getkey [premium|free]
  if (cmd === 'getkey') {
    const tipo = (args[0] || 'premium').toLowerCase();
    if (tipo !== 'premium' && tipo !== 'free')
      return msg.reply({ embeds: [embedErr('Tipo invalido', 'Use `!getkey premium` ou `!getkey free`')] });
    try {
      const { data } = await axios.get(API_BASE + '/generate', {
        params: { type: tipo, user: msg.author.tag, token: ADMIN_TOKEN }
      });
      if (!data.success) return msg.reply({ embeds: [embedErr('Erro', data.error || 'Falha ao gerar key')] });
      try {
        await msg.author.send({ embeds: [embedKey(data.key, data.type, data.expiry)] });
        await msg.reply({ embeds: [embedOk('Key enviada!', msg.author + ', verifique seu DM 📬')] });
      } catch {
        await msg.reply({ embeds: [embedKey(data.key, data.type, data.expiry)] });
      }
    } catch (err) {
      msg.reply({ embeds: [embedErr('Erro de servidor', err.message)] });
    }
  }

  // !validatekey <key>
  else if (cmd === 'validatekey') {
    const key = args[0];
    if (!key) return msg.reply({ embeds: [embedErr('Uso', '`!validatekey KEYP_...`')] });
    try {
      const { data } = await axios.get(API_BASE + '/validate', { params: { key, hwid: '' } });
      if (data.valid)
        msg.reply({ embeds: [embedOk('Key valida', '**Tipo:** ' + data.type + '\n**Key:** `' + key + '`')] });
      else
        msg.reply({ embeds: [embedErr('Key invalida', '**Motivo:** ' + data.error + '\n**Key:** `' + key + '`')] });
    } catch (err) { msg.reply({ embeds: [embedErr('Erro', err.message)] }); }
  }

  // !revokekey <key>
  else if (cmd === 'revokekey') {
    const key = args[0];
    if (!key) return msg.reply({ embeds: [embedErr('Uso', '`!revokekey KEYP_...`')] });
    try {
      const { data } = await axios.get(API_BASE + '/revoke', { params: { key, token: ADMIN_TOKEN } });
      if (data.success)
        msg.reply({ embeds: [embedOk('Key revogada', 'A key `' + key + '` foi revogada.')] });
      else
        msg.reply({ embeds: [embedErr('Erro', data.error)] });
    } catch (err) { msg.reply({ embeds: [embedErr('Erro', err.message)] }); }
  }

  // !resethwid <key>
  else if (cmd === 'resethwid') {
    const key = args[0];
    if (!key) return msg.reply({ embeds: [embedErr('Uso', '`!resethwid KEYP_...`')] });
    try {
      const { data } = await axios.get(API_BASE + '/reset-hwid', { params: { key, token: ADMIN_TOKEN } });
      if (data.success)
        msg.reply({ embeds: [embedOk('HWID resetado', 'HWID da key `' + key + '` resetado.\nUsuario pode usar em outro PC.')] });
      else
        msg.reply({ embeds: [embedErr('Erro', data.error)] });
    } catch (err) { msg.reply({ embeds: [embedErr('Erro', err.message)] }); }
  }

  // !keyhelp
  else if (cmd === 'keyhelp') {
    msg.reply({ embeds: [
      new EmbedBuilder().setColor(0x2233CC).setTitle('Redux Key System — Comandos')
        .addFields(
          { name: '`!getkey premium`',   value: 'Gera key premium e envia no DM',       inline: false },
          { name: '`!getkey free`',      value: 'Gera key free e envia no DM',          inline: false },
          { name: '`!validatekey <key>`', value: 'Verifica se uma key e valida',        inline: false },
          { name: '`!revokekey <key>`',   value: 'Revoga uma key (admin)',              inline: false },
          { name: '`!resethwid <key>`',   value: 'Reseta HWID de uma key (admin)',      inline: false }
        ).setFooter({ text: 'Redux Key System' })
    ]});
  }
});

client.login(DISCORD_TOKEN);
