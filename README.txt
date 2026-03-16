# Redux Key System — Netlify Deploy

## Estrutura
```
redux-deploy/
├── netlify.toml               ← configuração do Netlify
├── netlify/
│   └── functions/
│       ├── package.json       ← dependência: @netlify/blobs
│       ├── validate.js        ← GET /api/validate?key=...&hwid=...
│       ├── generate.js        ← GET /api/generate?token=...&type=...
│       ├── revoke.js          ← GET /api/revoke?token=...&key=...
│       ├── reset-hwid.js      ← GET /api/reset-hwid?token=...&key=...
│       └── list.js            ← GET /api/list?token=...
└── public/
    ├── index.html             ← página pública
    └── admin.html             ← painel admin (reduxadminkey.netlify.app/admin)
```

## Como fazer o deploy no Netlify

### 1. Configurações de build (Site configuration → Build & deploy → Build settings)
- **Base directory:** (vazio — deixe em branco)
- **Publish directory:** `public`
- **Functions directory:** `netlify/functions`

### 2. Variável de ambiente OBRIGATÓRIA (Site configuration → Environment variables)
```
REDUX_ADMIN_TOKEN = redux-admin-secret
```
⚠️ Mude para um token seguro de sua escolha! Deve ser igual ao `ADMIN_API_TOKEN` no admin.html.

### 3. Habilitar Netlify Blobs
O Netlify Blobs é ativado automaticamente quando você usa `getStore()` nas functions.
Não precisa configurar nada extra — funciona naticamente com o deploy.

### 4. Depois do deploy, teste:
```
https://SEU-SITE.netlify.app/api/validate?key=DEVK_REDUXSTUDIOS1%23&hwid=teste
```
Deve retornar: `{"valid":true,"type":"dev","hwid_ok":true}`

## Endpoints da API

| Endpoint | Params | Auth | Descrição |
|---|---|---|---|
| `GET /api/validate` | `key`, `hwid` | — | Valida key + vincula HWID |
| `GET /api/generate` | `token`, `type`, `user`, `days` | Admin | Gera nova key |
| `GET /api/revoke` | `token`, `key` | Admin | Revoga key |
| `GET /api/reset-hwid` | `token`, `key` | Admin | Reseta HWID vinculado |
| `GET /api/list` | `token` | Admin | Lista todas as keys |

## Credenciais do painel admin
- Email: `ReduxStudiosLtd@gmail.com`
- Senha: `goham200@@`
- URL: `https://SEU-SITE.netlify.app/admin`

## Chave Dev (sempre válida, sem HWID)
```
DEVK_REDUXSTUDIOS1#
```
