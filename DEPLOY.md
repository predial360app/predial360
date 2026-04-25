# Predial360 — Deploy do Protótipo (Opção 3)

> Backend no Railway · App via EAS Preview Build · Compartilhável por QR Code

---

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                    RAILWAY (cloud)                   │
│                                                      │
│  ┌──────────────┐   ┌────────────┐  ┌────────────┐  │
│  │  NestJS API  │──▶│ PostgreSQL │  │   Redis    │  │
│  │  (Docker)    │   │ (add-on)   │  │  (add-on)  │  │
│  └──────┬───────┘   └────────────┘  └────────────┘  │
│         │                                            │
└─────────┼────────────────────────────────────────────┘
          │ HTTPS / WSS
          │
┌─────────▼──────────────────────┐
│   Expo Go / APK Preview        │
│   (celular do investidor)      │
└────────────────────────────────┘
```

**Serviços externos (contas gratuitas):**
| Serviço | Uso | Plano gratuito |
|---|---|---|
| Railway | API + PostgreSQL + Redis | $5 de crédito mensal |
| Cloudflare R2 | Armazenamento de vídeos/fotos | 10 GB grátis |
| Firebase | Push notifications | Spark (gratuito) |
| Asaas Sandbox | Pagamentos Pix | Sandbox grátis |
| Anthropic | IA | ~$5 de crédito inicial |
| EAS (Expo) | Build do app | 30 builds/mês grátis |

---

## Pré-requisitos

```bash
# Ferramentas necessárias
node --version   # >= 20
npm --version    # >= 10
git --version

# CLIs a instalar
npm install -g @railway/cli       # Railway CLI
npm install -g eas-cli            # Expo Application Services
npm install -g turbo              # Turborepo (já em devDeps)
```

---

## PARTE 1 — Backend no Railway

### 1.1 Criar conta e projeto

1. Acesse [railway.app](https://railway.app) → **Login com GitHub**
2. Clique em **New Project** → **Deploy from GitHub repo**
3. Selecione o repositório `predial360` → **Deploy Now**

### 1.2 Adicionar banco de dados

No painel do projeto Railway:
```
+ New → Database → Add PostgreSQL
+ New → Database → Add Redis
```

Railway injetará `DATABASE_URL` e `REDIS_URL` automaticamente no serviço da API.

### 1.3 Configurar variáveis de ambiente

```bash
# Faça login no Railway CLI
railway login

# Selecione o projeto
railway link

# Configure as variáveis (copie de .env.deploy.example e preencha)
railway variables set NODE_ENV=production
railway variables set JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
railway variables set JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
railway variables set JWT_ACCESS_EXPIRES=15m
railway variables set JWT_REFRESH_EXPIRES=7d

# AWS / Cloudflare R2
railway variables set AWS_REGION=auto
railway variables set AWS_S3_BUCKET=predial360
railway variables set AWS_ACCESS_KEY_ID=SUA_CHAVE
railway variables set AWS_SECRET_ACCESS_KEY=SEU_SECRET
# Se usar Cloudflare R2:
railway variables set AWS_ENDPOINT_URL=https://SEU_ID.r2.cloudflarestorage.com

# Firebase
railway variables set FIREBASE_PROJECT_ID=SEU_PROJETO
railway variables set FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
railway variables set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# Anthropic
railway variables set ANTHROPIC_API_KEY=sk-ant-api03-...

# Asaas (sandbox para demo)
railway variables set ASAAS_API_KEY='$aact_SANDBOX_...'
railway variables set ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3
railway variables set ASAAS_WEBHOOK_TOKEN=qualquer-token-secreto
```

### 1.4 Configurar o build

No Railway Dashboard → seu serviço → **Settings**:

| Campo | Valor |
|---|---|
| **Root Directory** | `.` (raiz do monorepo) |
| **Build Command** | *(deixar vazio — usa Dockerfile)* |
| **Start Command** | *(deixar vazio — definido no Dockerfile)* |
| **Dockerfile Path** | `apps/api/Dockerfile` |

### 1.5 Fazer o deploy

```bash
# Via CLI (ou deixe automático pelo push no GitHub)
railway up

# Acompanhe os logs
railway logs
```

Quando aparecer `Application is running on: http://0.0.0.0:3000`, o deploy foi concluído.

**URL pública gerada:** `https://predial360-xxxxxxx.up.railway.app`

### 1.6 Rodar migrations e seed

```bash
# Conecta ao serviço e executa via Railway CLI
railway run npx prisma migrate deploy
railway run npx ts-node prisma/seed.ts
```

### 1.7 Verificar o deploy

```bash
# Health check
curl https://SEU-SERVICO.up.railway.app/api/v1/health

# Swagger (documentação interativa)
# Abra no browser: https://SEU-SERVICO.up.railway.app/api/docs
```

---

## PARTE 2 — App Mobile via EAS Preview Build

### 2.1 Configurar conta Expo

```bash
# Criar conta em expo.dev e fazer login
eas login

# Criar o projeto EAS (só na primeira vez)
cd apps/mobile
eas init --id TROQUE_PELO_EAS_PROJECT_ID
```

Após criar, copie o `projectId` gerado e:
- Substitua `TROQUE_PELO_EAS_PROJECT_ID` em `app.config.ts`
- Substitua em `eas.json`

### 2.2 Configurar variável de ambiente do app

```bash
# Aponta o app para o backend no Railway
eas env:create \
  --scope project \
  --name EXPO_PUBLIC_API_URL \
  --value "https://SEU-SERVICO.up.railway.app/api/v1" \
  --environment preview
```

### 2.3 Gerar o Google Maps API Key (para a tela de rastreamento)

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. APIs & Services → Enable → **Maps SDK for Android** + **Maps SDK for iOS**
3. Credentials → Create → API Key
4. Adicione a chave em `apps/mobile/app.config.ts`:

```typescript
android: {
  config: {
    googleMaps: { apiKey: 'SUA_MAPS_API_KEY' }
  }
}
```

### 2.4 Configurar Firebase no mobile

1. Baixe `google-services.json` (Android) do Firebase Console
2. Coloque em `apps/mobile/google-services.json`
3. Para iOS, baixe `GoogleService-Info.plist` e configure em `app.config.ts`

### 2.5 Gerar o build de preview (Android APK)

```bash
cd apps/mobile

# Build Android (APK instalável — mais simples para demo)
eas build --platform android --profile preview

# Acompanhe em: https://expo.dev/accounts/SEU_USER/projects/predial360/builds
```

O EAS envia um e-mail quando o build estiver pronto (~10-15 minutos).

**Resultado:** link de download do APK + QR Code para instalação direta.

### 2.6 Distribuir para testadores

```bash
# Enviar convite por e-mail (acesso ao download do APK)
eas build:distribute --id BUILD_ID --email testador@email.com

# Ou compartilhe o link público gerado:
# https://expo.dev/artifacts/eas/XXXXXXXX.apk
```

---

## PARTE 3 — Verificação final

### Checklist pré-demo

```
□ Backend online: GET /api/v1/health retorna { status: "ok" }
□ Swagger acessível: /api/docs
□ Seed executado: credenciais de demo funcionando
□ App instalado no celular de demo
□ Login funcionando (joao.silva@email.com / Demo@2025!)
□ OS-2025-00001 visível na lista (status: Em andamento)
□ Tela de pagamento Pix carregando
□ Mapa de rastreamento abrindo (pode estar sem localização real)
```

### Fluxo de demonstração sugerido (15 min)

| Tempo | Ação | Perfil |
|---|---|---|
| 0-2min | Login como proprietário, ver dashboard com 4 OS | OWNER |
| 2-5min | Abrir OS em andamento → ver técnico no mapa | OWNER |
| 5-8min | Login como técnico → ver lista de OS atribuídas | TECH |
| 8-11min | Abrir OS → preencher checklist → assinar laudo | TECH |
| 11-14min | Voltar como proprietário → aprovar laudo → gerar Pix | OWNER |
| 14-15min | Mostrar laudo técnico com score ABNT e IA | OWNER |

---

## Variáveis de demo prontas

> Use exatamente estas credenciais — foram populadas pelo seed.

| Campo | Valor |
|---|---|
| **Email OWNER** | `joao.silva@email.com` |
| **Email TECHNICIAN** | `carlos.tech@predial360.com.br` |
| **Email ADMIN** | `admin@predial360.com.br` |
| **Senha (todos)** | `Demo@2025!` |
| **OS em andamento** | `OS-2025-00001` |
| **OS aguardando aprovação** | `OS-2025-00002` |
| **Propriedade** | Edifício Solar das Palmeiras, SP |

---

## Troubleshooting

### API não inicia
```bash
# Ver logs completos
railway logs --tail 100

# Verificar se migrations rodaram
railway run npx prisma migrate status
```

### App não conecta na API
```bash
# Verificar a variável de ambiente do EAS
eas env:list --environment preview

# Deve mostrar:
# EXPO_PUBLIC_API_URL = https://SEU-SERVICO.up.railway.app/api/v1
```

### Seed com erro de constraint
```bash
# Limpar e rodar seed novamente
railway run npx prisma migrate reset --force
railway run npx ts-node prisma/seed.ts
```

### Push notifications não chegam
Para o protótipo, push pode ser desabilitado sem impacto no fluxo principal.
As telas mostram notificações in-app normalmente.

---

## Custos estimados do protótipo

| Serviço | Custo mensal |
|---|---|
| Railway (API + PostgreSQL + Redis) | $0–5 (dentro do crédito gratuito) |
| Cloudflare R2 (storage) | $0 (até 10GB) |
| Firebase (push) | $0 (Spark) |
| Anthropic (IA) | ~$2–5 (uso em demo) |
| EAS Builds | $0 (até 30 builds/mês) |
| **Total** | **~$2–10/mês** |

---

*Gerado automaticamente para o protótipo Predial360 — Opção 3 (Preview publicado)*
