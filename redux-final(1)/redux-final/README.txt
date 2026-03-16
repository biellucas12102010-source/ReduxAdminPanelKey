============================
 REDUX KEY SYSTEM — DEPLOY
============================

ESTRUTURA DO ZIP:
-----------------
redux-final/
  netlify.toml                   <- config do Netlify (nao apagar)
  public/
    index.html                   <- pagina inicial
    admin.html                   <- painel admin
  netlify/
    functions/
      keys.json                  <- banco de keys (editado automaticamente)
      validate.js                <- /api/validate
      generate.js                <- /api/generate
      revoke.js                  <- /api/revoke
      reset-hwid.js              <- /api/reset-hwid
  redux_bot_js/
    redux_bot.js                 <- bot em JavaScript
    package.json
  redux_bot_py/
    redux_bot.py                 <- bot em Python


DEPLOY NO NETLIFY:
------------------
1. Acesse https://app.netlify.com
2. "Add new site" -> "Deploy manually"
3. Arraste a pasta "redux-final" para o Netlify
4. Aguarde o deploy terminar

VARIAVEL DE AMBIENTE (OBRIGATORIO):
------------------------------------
Apos o deploy:
  Site settings -> Environment variables -> Add variable
  Nome:  REDUX_ADMIN_TOKEN
  Valor: REDUX_ADMIN_2026
  (Pode trocar por qualquer senha secreta)

REDEPLOY APOS MUDAR VARIAVEL:
  Deploys -> Trigger deploy -> Deploy site


LOGIN DO PAINEL ADMIN:
-----------------------
URL:   https://reduxadminkey.netlify.app/admin.html
Email: ReduxStudiosLtd@gmail.com
Senha: goham200@@


ENDPOINTS DA API:
-----------------
GET /api/validate?key=KEYP_...&hwid=XXXXXXXXXXXXXXXX
GET /api/generate?type=premium&user=Nome&token=REDUX_ADMIN_2026
GET /api/revoke?key=KEYP_...&token=REDUX_ADMIN_2026
GET /api/reset-hwid?key=KEYP_...&token=REDUX_ADMIN_2026


BOT DISCORD — JAVASCRIPT:
--------------------------
cd redux_bot_js
npm install
(edite DISCORD_TOKEN e ADMIN_TOKEN no redux_bot.js)
node redux_bot.js


BOT DISCORD — PYTHON:
----------------------
pip install discord.py requests
(edite DISCORD_TOKEN e ADMIN_TOKEN no redux_bot.py)
python redux_bot.py


COMANDOS DO BOT:
-----------------
!getkey premium     -> gera key premium e envia no DM
!getkey free        -> gera key free e envia no DM
!validatekey <key>  -> verifica se key e valida
!revokekey <key>    -> revoga uma key
!resethwid <key>    -> reseta HWID de uma key
!keyhelp            -> lista todos os comandos
