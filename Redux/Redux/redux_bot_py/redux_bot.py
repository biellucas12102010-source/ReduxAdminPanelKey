# redux_bot.py — Bot Discord em Python
# Instalar: pip install discord.py requests
# Rodar:    python redux_bot.py

import discord
import requests
from discord.ext import commands

# ── CONFIGURACAO ──────────────────────────────
DISCORD_TOKEN = 'SEU_TOKEN_DISCORD'
ADMIN_TOKEN   = 'REDUX_ADMIN_2026'
API_BASE      = 'https://reduxadminkey.netlify.app/api'
PREFIX        = '!'
# ─────────────────────────────────────────────

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix=PREFIX, intents=intents)

def embed_ok(title, desc):
    e = discord.Embed(title='✅ ' + title, description=desc, color=0x2233CC)
    e.set_footer(text='Redux Key System')
    return e

def embed_err(title, desc):
    e = discord.Embed(title='❌ ' + title, description=desc, color=0xCC2233)
    e.set_footer(text='Redux Key System')
    return e

def embed_key(key, key_type, expiry):
    color = 0xDDAA33 if key_type == 'premium' else 0x44FF88
    t_str = '★ Premium' if key_type == 'premium' else '● Free'
    e_str = '∞ Ilimitado' if expiry == 'unlimited' else expiry
    e = discord.Embed(title='🔑 Sua Redux Key', color=color)
    e.add_field(name='Key',    value=f'`{key}`', inline=False)
    e.add_field(name='Tipo',   value=t_str,      inline=True)
    e.add_field(name='Expira', value=e_str,       inline=True)
    e.set_footer(text='Nao compartilhe sua key!')
    return e

@bot.event
async def on_ready():
    print(f'[Redux Bot] Online como {bot.user}')
    await bot.change_presence(activity=discord.Activity(
        type=discord.ActivityType.listening, name='Redux Key System'))

@bot.command(name='getkey')
async def getkey(ctx, tipo: str = 'premium'):
    tipo = tipo.lower()
    if tipo not in ('premium', 'free'):
        return await ctx.reply(embed=embed_err('Tipo invalido', 'Use `!getkey premium` ou `!getkey free`'))
    try:
        r    = requests.get(f'{API_BASE}/generate',
                            params={'type': tipo, 'user': str(ctx.author), 'token': ADMIN_TOKEN},
                            timeout=10)
        data = r.json()
    except Exception as ex:
        return await ctx.reply(embed=embed_err('Erro de servidor', str(ex)))

    if not data.get('success'):
        return await ctx.reply(embed=embed_err('Erro', data.get('error', 'Falha ao gerar key')))

    emb = embed_key(data['key'], data['type'], data['expiry'])
    try:
        await ctx.author.send(embed=emb)
        await ctx.reply(embed=embed_ok('Key enviada!', f'{ctx.author.mention}, verifique seu DM 📬'))
    except discord.Forbidden:
        await ctx.reply(embed=emb)

@bot.command(name='validatekey')
async def validatekey(ctx, key: str = None):
    if not key:
        return await ctx.reply(embed=embed_err('Uso', '`!validatekey KEYP_...`'))
    try:
        r    = requests.get(f'{API_BASE}/validate', params={'key': key, 'hwid': ''}, timeout=10)
        data = r.json()
    except Exception as ex:
        return await ctx.reply(embed=embed_err('Erro de servidor', str(ex)))

    if data.get('valid'):
        await ctx.reply(embed=embed_ok('Key valida', f'**Tipo:** {data["type"]}\n**Key:** `{key}`'))
    else:
        await ctx.reply(embed=embed_err('Key invalida', f'**Motivo:** {data.get("error")}\n**Key:** `{key}`'))

@bot.command(name='revokekey')
async def revokekey(ctx, key: str = None):
    if not key:
        return await ctx.reply(embed=embed_err('Uso', '`!revokekey KEYP_...`'))
    try:
        r    = requests.get(f'{API_BASE}/revoke', params={'key': key, 'token': ADMIN_TOKEN}, timeout=10)
        data = r.json()
    except Exception as ex:
        return await ctx.reply(embed=embed_err('Erro de servidor', str(ex)))

    if data.get('success'):
        await ctx.reply(embed=embed_ok('Key revogada', f'A key `{key}` foi revogada com sucesso.'))
    else:
        await ctx.reply(embed=embed_err('Erro', data.get('error', 'Falha ao revogar')))

@bot.command(name='resethwid')
async def resethwid(ctx, key: str = None):
    if not key:
        return await ctx.reply(embed=embed_err('Uso', '`!resethwid KEYP_...`'))
    try:
        r    = requests.get(f'{API_BASE}/reset-hwid', params={'key': key, 'token': ADMIN_TOKEN}, timeout=10)
        data = r.json()
    except Exception as ex:
        return await ctx.reply(embed=embed_err('Erro de servidor', str(ex)))

    if data.get('success'):
        await ctx.reply(embed=embed_ok('HWID resetado', f'HWID da key `{key}` resetado.\nUsuario pode usar em outro PC.'))
    else:
        await ctx.reply(embed=embed_err('Erro', data.get('error', 'Falha ao resetar HWID')))

@bot.command(name='keyhelp')
async def keyhelp(ctx):
    e = discord.Embed(title='Redux Key System — Comandos', color=0x2233CC)
    e.add_field(name='`!getkey premium`',    value='Gera key premium e envia no DM',     inline=False)
    e.add_field(name='`!getkey free`',       value='Gera key free e envia no DM',        inline=False)
    e.add_field(name='`!validatekey <key>`', value='Verifica se uma key e valida',       inline=False)
    e.add_field(name='`!revokekey <key>`',   value='Revoga uma key',                     inline=False)
    e.add_field(name='`!resethwid <key>`',   value='Reseta HWID de uma key',             inline=False)
    e.set_footer(text='Redux Key System')
    await ctx.reply(embed=e)

bot.run(DISCORD_TOKEN)
