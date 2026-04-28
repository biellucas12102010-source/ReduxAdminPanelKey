# RBX Key System V2 — Changelog & Deploy Guide

## ✅ Correções e Novidades

### 🔑 Duração de Keys (generate.js + validate.js) — CORRIGIDO
Antes: todas as keys free ficavam com 24h independente do valor.
Agora: duração correta baseada no tipo selecionado, contada a partir do 1º uso.

Tipos disponíveis no admin:
- `free`              → KEYF_ — 24 horas
- `free7`             → KEYF_ — 7 dias
- `free30`            → KEYF_ — 30 dias
- `free_unlimited`    → KEYF_ — Sem expiração
- `premium`           → KEYP_ — Sem expiração (padrão)
- `premium7`          → KEYP_ — 7 dias
- `premium30`         → KEYP_ — 30 dias

### ⏸️ RESET KEY vs REMOVE KEY (revoke.js) — CORRIGIDO
- **RESET KEY** = suspende a key (`suspended=true`). Key continua `active=true` mas é rejeitada pelo validador. O dono precisa inserir a key novamente para reativá-la (via /api/acc?action=activate).
- **REMOVE KEY** = revogação permanente (`active=false`). Não tem volta.

### 🖥️ Card de HWID Resetado no Executor
Quando o admin reseta o HWID, o executor deve mostrar:
```
"Seu HWID foi resetado pelo administrador.
 Insira sua key novamente para continuar usando o RBX."
[TextBox — Key]
[Botão: CONTINUAR]
[Botão: SAIR DA CONTA]
```
A notificação chega via `reason: "reset-hwid"` no campo `notifications[]` do login/acc.

### 👤 Nome/Email real no painel (list.js) — CORRIGIDO
O list.js agora busca nas stores `redux-accounts` e `redux-users` para enriquecer
cada key com o email e nome real do dono. O admin vê o email em vez de "Anonymous".

### 📁 acc.js — NOVO ARQUIVO
Salva e gerencia contas do executor (email + senha hasheada + key).
Store separada: `redux-accounts`.

Endpoints:
- `POST /api/acc` — cria/atualiza conta (email, password, key, name, hwid)
- `GET  /api/acc?action=login&email=&password=` — autentica
- `GET  /api/acc?action=activate&email=&password=&key=` — reativa key suspensa
- `GET  /api/acc?action=notifications&email=&password=` — notificações pendentes
- `GET  /api/acc?action=list&token=` — lista contas (admin)
- `GET  /api/acc?action=get&token=&email=` — detalhes de uma conta (admin)
- `GET  /api/acc?action=notify&token=&email=&msg=&reason=` — envia notificação
- `DELETE /api/acc?token=&email=` — remove conta (admin)

## 📂 Estrutura

```
rbx-system/
├── netlify.toml
├── netlify/
│   └── functions/
│       ├── package.json
│       ├── acc.js          ← NOVO — contas do executor
│       ├── audit.js
│       ├── chat.js
│       ├── generate.js     ← CORRIGIDO — duração correta
│       ├── list.js         ← CORRIGIDO — mostra email/nome real
│       ├── register.js
│       ├── reset-hwid.js   ← CORRIGIDO — notifica nas duas stores
│       ├── revoke.js       ← CORRIGIDO — reset vs remove separados
│       └── validate.js     ← CORRIGIDO — respeita daysOnFirstUse
└── public/
    ├── index.html
    └── admin.html          ← CORRIGIDO — tipos de key, reset/remove, aba Contas
```

## 🚀 Deploy Netlify

### Variável obrigatória
```
REDUX_ADMIN_TOKEN = seu-token-secreto
```

### Credenciais do painel admin (admin.html)
```
Email: RBXexploit@gmail.com
Senha: RBX1#
```

### Keys de teste
```
DEVK_REDUXSTUDIOS1#   ← sempre válida, sem HWID, tipo dev
```

## 🔄 Fluxo de Notificações no Executor (C#)

```csharp
// 1. Login
var url = $"{API}/acc?action=login&email={email}&password={pass}";
var json = await Http.GetStringAsync(url);
var res = JsonDocument.Parse(json);

// 2. Checa notificações
var notifs = res.RootElement.GetProperty("notifications");
if (notifs.GetArrayLength() > 0) {
    var notif = notifs[0];
    var reason = notif.GetProperty("reason").GetString();
    var msg    = notif.GetProperty("msg").GetString();

    if (reason == "reset-hwid") {
        // Mostra card especial:
        // "Seu HWID foi resetado pelo administrador."
        // "Insira sua key novamente para continuar."
        // [TextBox: key] [CONTINUAR] [SAIR]
        ShowHwidResetCard(msg);
    }
    else if (reason == "reset-key") {
        // Key suspensa — dono precisa reativar
        // "Sua key foi resetada. Insira a key para reativá-la."
        // [TextBox: key] [REATIVAR] [SAIR]
        ShowKeyResetCard(msg);
    }
    else if (reason == "removed-key") {
        // Key removida permanentemente
        ShowKeyRemovedCard(msg);
    }
}

// 3. Verificar se key está suspensa (keySuspended=true) e reativar
if (res.RootElement.GetProperty("keySuspended").GetBoolean()) {
    // POST: /api/acc?action=activate&email=...&password=...&key=...
}
```
