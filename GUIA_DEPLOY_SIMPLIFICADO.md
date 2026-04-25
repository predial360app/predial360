# Guia Completo — Como Colocar o Predial360 no Ar
### Para quem não é programador · Passo a passo com linguagem simples

> **Tempo estimado:** 1h30 na primeira vez · **Custo:** R$ 0 a R$ 30/mês
> 
> Você vai precisar de: computador (Windows ou Mac), internet estável e um celular Android para testar.

---

## Antes de começar — O que você vai criar

Pense assim: o app tem **duas partes**:

```
┌─────────────────────────────────────────────────────┐
│  PARTE 1 — O "servidor" (Railway)                   │
│  É o cérebro do app. Fica na nuvem.                 │
│  Guarda os dados, faz os cálculos, manda as         │
│  informações para o celular.                        │
└─────────────────────────────────────────────────────┘
                        ↕ conversa pela internet
┌─────────────────────────────────────────────────────┐
│  PARTE 2 — O app no celular (Expo / EAS)            │
│  É o que o investidor vai instalar e ver.           │
│  Android: arquivo APK (como instalar um app manual) │
│  iPhone: Expo Go (app gratuito da loja)             │
└─────────────────────────────────────────────────────┘
```

---

## ETAPA 0 — Instalar as ferramentas no seu computador

> Faça isso uma única vez. Depois nunca mais precisará.

### 0.1 Instalar o Node.js

1. Acesse: **https://nodejs.org**
2. Clique no botão verde **"LTS"** (versão recomendada)
3. Baixe e instale como qualquer programa (Next → Next → Finish)
4. **Verifique:** abra o **Prompt de Comando** (Windows: aperte `Win + R`, digite `cmd`, Enter)
5. Digite `node --version` e pressione Enter
6. Deve aparecer algo como `v20.11.0` ✅

### 0.2 Instalar as ferramentas do projeto

No mesmo **Prompt de Comando**, copie e cole cada linha abaixo (uma por vez), pressionando Enter após cada uma:

```
npm install -g @railway/cli
```
```
npm install -g eas-cli
```

> **O que está acontecendo?** Você está instalando dois "controles remotos":
> - `railway` = controle do servidor na nuvem
> - `eas` = controle para gerar o app no celular

---

## ETAPA 1 — Criar as contas nos serviços

### 1.1 Railway (onde fica o servidor) — GRÁTIS
1. Acesse **https://railway.app**
2. Clique em **"Login"** → **"Login with GitHub"**
3. Se não tiver conta no GitHub: clique em **"Sign up"** no GitHub → crie com seu e-mail
4. Autorize o Railway a acessar seu GitHub
5. ✅ Pronto — você está no painel do Railway

### 1.2 Expo (para gerar o app) — GRÁTIS
1. Acesse **https://expo.dev**
2. Clique em **"Sign Up"**
3. Preencha e-mail e senha
4. Confirme o e-mail (vai chegar uma mensagem)
5. ✅ Pronto

### 1.3 Cloudflare (para guardar fotos e vídeos) — GRÁTIS até 10GB
1. Acesse **https://cloudflare.com**
2. Clique em **"Sign Up"** → preencha e-mail e senha
3. Após entrar, no menu à esquerda clique em **"R2 Object Storage"**
4. Clique em **"Create bucket"** (criar pasta)
5. Nome da pasta: `predial360` → clique em **"Create bucket"**
6. Vá em **"Manage R2 API Tokens"** → **"Create API Token"**
7. Marque **"Edit"** → clique em **"Create API Token"**
8. **IMPORTANTE:** copie e guarde em um bloco de notas:
   - `Access Key ID` (parece: `abc123def456...`)
   - `Secret Access Key` (parece: `xyz789...`)
   - O **Endpoint URL** (parece: `https://SEU-ID.r2.cloudflarestorage.com`)

### 1.4 Anthropic (para a Inteligência Artificial) — ~R$ 25 de crédito inicial
1. Acesse **https://console.anthropic.com**
2. Crie uma conta e adicione um cartão (o crédito inicial dura meses em uso de demonstração)
3. Vá em **"API Keys"** → **"Create Key"**
4. Copie e guarde a chave (parece: `sk-ant-api03-...`)

### 1.5 Asaas Sandbox (para simular pagamentos Pix) — GRÁTIS
1. Acesse **https://sandbox.asaas.com**
2. Clique em **"Criar conta"** → preencha os dados
3. Após entrar: **Minha Conta** → **Integrações** → **Chave de API**
4. Copie e guarde a chave (parece: `$aact_SANDBOX_...`)

### 1.6 Firebase (para notificações) — GRÁTIS
1. Acesse **https://console.firebase.google.com**
2. Clique em **"Criar projeto"** → nome: `predial360` → Next → Next → Criar
3. Após criar: clique em **"Android"** (ícone do robozinho)
4. **Nome do pacote Android:** `com.predial360.app.preview`
5. Clique em **"Registrar app"**
6. Baixe o arquivo `google-services.json` → salve dentro da pasta `apps/mobile/` do projeto
7. Volte ao painel → **Configurações do projeto** (engrenagem) → **Contas de serviço**
8. Clique em **"Gerar nova chave privada"** → baixe o arquivo JSON
9. Abra esse arquivo JSON com o Bloco de Notas e guarde os valores de:
   - `project_id`
   - `client_email`
   - `private_key` (texto longo começando com `-----BEGIN PRIVATE KEY-----`)

---

## ETAPA 2 — Colocar o servidor no ar (Railway)

### 2.1 Conectar o projeto ao Railway

> Abra o **Prompt de Comando** e navegue até a pasta do projeto:
> 
> **Windows:** clique com o botão direito na pasta do projeto → "Abrir no Terminal" (ou "Abrir janela de comando aqui")

Cole cada linha no terminal (uma por vez):

```
railway login
```
> Uma janela do navegador vai abrir. Clique em **"Authorize"**. Volte ao terminal.

```
railway link
```
> Vai perguntar qual projeto usar. Se não aparecer nenhum, pressione Enter para criar um novo.

### 2.2 Adicionar banco de dados

No site do Railway (https://railway.app):
1. Clique no seu projeto
2. Clique em **"+ New"** → **"Database"** → **"Add PostgreSQL"**
3. Clique em **"+ New"** novamente → **"Database"** → **"Add Redis"**
4. ✅ O Railway vai criar automaticamente os bancos de dados

### 2.3 Configurar as "senhas" do sistema

> Agora você vai inserir todas as informações que anotou anteriormente.
> 
> No terminal, cole cada bloco abaixo — **substituindo os textos em MAIÚSCULAS pelos seus dados reais**.

**Configurações básicas:**
```
railway variables set NODE_ENV=production
```

**Chaves de segurança** (essas você não precisa anotar — são geradas automaticamente):
```
railway variables set JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
```
```
railway variables set JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
```
```
railway variables set JWT_ACCESS_EXPIRES=15m
```
```
railway variables set JWT_REFRESH_EXPIRES=7d
```

**Cloudflare R2** (substitua pelos dados que você copiou no passo 1.3):
```
railway variables set AWS_REGION=auto
```
```
railway variables set AWS_S3_BUCKET=predial360
```
```
railway variables set AWS_ACCESS_KEY_ID=COLE_SEU_ACCESS_KEY_ID_AQUI
```
```
railway variables set AWS_SECRET_ACCESS_KEY=COLE_SEU_SECRET_KEY_AQUI
```
```
railway variables set AWS_ENDPOINT_URL=COLE_SEU_ENDPOINT_URL_AQUI
```

**Firebase** (substitua pelos dados do arquivo JSON que você baixou no passo 1.6):
```
railway variables set FIREBASE_PROJECT_ID=COLE_SEU_PROJECT_ID_AQUI
```
```
railway variables set FIREBASE_CLIENT_EMAIL=COLE_SEU_CLIENT_EMAIL_AQUI
```
```
railway variables set FIREBASE_PRIVATE_KEY="COLE_SUA_PRIVATE_KEY_AQUI"
```

**Anthropic (IA):**
```
railway variables set ANTHROPIC_API_KEY=COLE_SUA_CHAVE_ANTHROPIC_AQUI
```

**Asaas (Pix):**
```
railway variables set ASAAS_API_KEY=COLE_SUA_CHAVE_ASAAS_AQUI
```
```
railway variables set ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3
```
```
railway variables set ASAAS_WEBHOOK_TOKEN=predial360-demo-token
```

### 2.4 Configurar o Dockerfile no painel Railway

1. No site do Railway, clique no serviço da API (não no PostgreSQL nem no Redis)
2. Clique na aba **"Settings"**
3. Encontre o campo **"Dockerfile Path"**
4. Digite: `apps/api/Dockerfile`
5. Clique em **"Save"**

### 2.5 Fazer o deploy (colocar no ar)

No terminal:
```
railway up
```

> ⏳ Aguarde. Vai aparecer uma barra de progresso. Pode demorar 3 a 8 minutos.
> 
> Quando aparecer **"Application is running on: http://0.0.0.0:3000"** — está pronto! ✅

Para ver os logs (se algo der errado):
```
railway logs
```

### 2.6 Configurar o banco de dados e criar os dados de demonstração

```
railway run npx prisma migrate deploy
```
> Aguarde terminar (uns 30 segundos)

```
railway run npx ts-node prisma/seed.ts
```
> Aguarde terminar. Ao final vai aparecer uma tabela com as credenciais de demo. ✅

### 2.7 Pegar a URL do seu servidor

1. No painel do Railway, clique no serviço da API
2. Clique na aba **"Settings"** → procure por **"Public URL"** ou **"Domain"**
3. Copie essa URL — ela parece: `https://predial360-xxxxxx.up.railway.app`
4. **Guarde essa URL** — você vai precisar no próximo passo

**Teste rápido:** abra o navegador e acesse:
```
https://SUA-URL.up.railway.app/api/v1/health
```
Deve aparecer: `{"status":"ok"}` ✅

---

## ETAPA 3 — Preparar o App mobile

### 3.1 Fazer login no Expo

No terminal:
```
eas login
```
> Digite seu e-mail e senha do Expo que você criou no passo 1.2

### 3.2 Criar o projeto no Expo

No terminal, entre na pasta do app:

**Windows:**
```
cd "apps\mobile"
```

**Mac:**
```
cd apps/mobile
```

Agora crie o projeto:
```
eas init
```
> Vai perguntar o nome do projeto. Digite: `predial360` e pressione Enter.
> 
> Vai aparecer um **Project ID** (parece: `abc-123-def-456`). **Copie e guarde esse código.**

### 3.3 Atualizar o código com o seu Project ID

1. Abra a pasta do projeto no **Explorador de Arquivos**
2. Abra o arquivo `apps/mobile/app.config.ts` com o **Bloco de Notas**
3. Encontre o trecho: `TROQUE_PELO_EAS_PROJECT_ID`
4. Substitua pelos dois lugares onde aparece com o seu Project ID copiado no passo anterior
5. Salve o arquivo (`Ctrl + S`)

### 3.4 Configurar a URL do servidor no app

No terminal (ainda na pasta `apps/mobile`), substitua `SUA-URL` pela URL que você copiou no passo 2.7:

```
eas env:create --scope project --name EXPO_PUBLIC_API_URL --value "https://SUA-URL.up.railway.app/api/v1" --environment preview
```

---

## ETAPA 4 — Gerar e distribuir o App

### Para Android (APK — o mais simples)

No terminal (ainda na pasta `apps/mobile`):
```
eas build --platform android --profile preview
```

> ⏳ Vai aparecer um link para acompanhar o build. O processo leva **10 a 15 minutos** nos servidores da Expo.
> 
> Você receberá um **e-mail** quando o APK estiver pronto.

**Quando terminar:**
1. Acesse o link do e-mail (ou acesse https://expo.dev e vá em seus builds)
2. Você verá:
   - Um **botão de download do APK**
   - Um **QR Code**
3. Qualquer pessoa com Android pode escanear o QR Code e instalar o app diretamente!

### Para iPhone (Expo Go — sem precisar de build)

O investidor com iPhone deve:
1. Abrir a **App Store** e instalar o app **"Expo Go"** (é gratuito)
2. Abrir o Expo Go
3. Fazer login (ou criar conta rapidinho)
4. Você pode compartilhar o projeto pelo painel do expo.dev

**Alternativa mais simples para iPhone:**
No terminal, na pasta raiz do projeto:
```
npx expo start --tunnel
```
> Vai aparecer um QR Code no terminal.
> O investidor abre o **Expo Go** no iPhone, clica em **"Scan QR Code"** e escaneia.
> 
> ⚠️ Seu computador precisa estar ligado e com internet para isso funcionar.

---

## ETAPA 5 — Compartilhar com investidores e sócios

### Opção A — Link do APK (Android) ✅ Recomendado

Após o build do EAS estar pronto:
1. Acesse https://expo.dev → entre na sua conta → clique em **"Projects"** → **"predial360"**
2. Clique em **"Builds"**
3. Clique no build mais recente
4. Copie o **link de download**
5. Envie por WhatsApp, e-mail ou qualquer mensagem

**Mensagem sugerida para enviar:**
```
Olá! Segue o link para instalar o protótipo do Predial360 no seu Android:
[COLE O LINK AQUI]

Para instalar:
1. Abra o link no celular
2. Baixe o arquivo APK
3. Se aparecer aviso de "fonte desconhecida", clique em "Instalar mesmo assim"
4. Abra o app e use as credenciais abaixo:

E-mail: joao.silva@email.com
Senha: Demo@2025!
```

### Opção B — QR Code (Android e iPhone)

1. No painel do EAS, o QR Code aparece na página do build
2. Tire um print ou salve a imagem
3. Envie para os investidores
4. Android: instala diretamente
5. iPhone: precisa ter o Expo Go instalado primeiro

---

## Credenciais de demonstração

> Use estas credenciais para mostrar o app — foram criadas automaticamente no passo 2.6.

| Perfil | E-mail | Senha |
|---|---|---|
| **Proprietário** | joao.silva@email.com | Demo@2025! |
| **Técnico** | carlos.tech@predial360.com.br | Demo@2025! |
| **Administrador** | admin@predial360.com.br | Demo@2025! |

### Roteiro sugerido para a apresentação (15 minutos)

| Tempo | O que mostrar | Perfil |
|---|---|---|
| 0–2 min | Entre como proprietário → mostre o painel com as ordens de serviço | Proprietário |
| 2–5 min | Abra a OS em andamento → veja o técnico no mapa (ou rastreamento ao vivo) | Proprietário |
| 5–8 min | Saia e entre como técnico → veja as ordens atribuídas | Técnico |
| 8–11 min | Abra a OS → preencha o checklist → assine o laudo | Técnico |
| 11–14 min | Volte como proprietário → aprove o laudo → gere o pagamento Pix | Proprietário |
| 14–15 min | Mostre o laudo técnico com score ABNT e análise de IA | Proprietário |

---

## Problemas comuns e soluções

### "O app não conecta no servidor"
- Verifique se a URL no passo 3.4 está correta (sem espaços, sem barra no final)
- Teste abrindo `https://SUA-URL.up.railway.app/api/v1/health` no navegador
- Se retornar erro, veja os logs: `railway logs`

### "O build do Android falhou"
- Verifique se você está na pasta `apps/mobile` no terminal
- Tente novamente: `eas build --platform android --profile preview`
- Se o erro persistir, copie a mensagem de erro e me envie

### "O Railway parou de funcionar depois de alguns dias"
- O plano gratuito tem $5 de crédito mensal — suficiente para demos
- Se acabar o crédito, adicione um cartão no Railway (cobram apenas o que usar, ~$1-2/mês para demo)

### "O iPhone não consegue instalar"
- Para iPhone, use o **Expo Go** (gratuito na App Store) — não precisa instalar APK
- Ou use a opção `npx expo start --tunnel` com o computador ligado

### "Esqueci a URL do servidor"
No terminal:
```
railway status
```

### "Preciso reiniciar tudo do zero"
```
railway run npx prisma migrate reset --force
railway run npx ts-node prisma/seed.ts
```

---

## Custos mensais estimados

| O que é | Para que serve | Custo |
|---|---|---|
| Railway | Servidor + banco de dados | R$ 0–25/mês |
| Cloudflare R2 | Fotos e vídeos | R$ 0 (até 10GB) |
| Anthropic | Inteligência artificial | R$ 10–25/mês (uso em demo) |
| Expo EAS | Gerar o app | R$ 0 (até 30 builds/mês) |
| Firebase | Notificações | R$ 0 |
| Asaas Sandbox | Simulação de Pix | R$ 0 |
| **Total** | | **R$ 10–50/mês** |

---

## Resumo rápido — Lista de verificação

```
□ Node.js instalado (node --version mostra v20+)
□ railway e eas instalados (npm install -g ...)
□ Conta Railway criada e projeto conectado
□ Conta Expo/EAS criada
□ Conta Cloudflare R2 criada e credenciais anotadas
□ Conta Anthropic criada e chave anotada
□ Conta Asaas Sandbox criada e chave anotada
□ Projeto Firebase criado e google-services.json baixado

□ railway login feito
□ PostgreSQL e Redis adicionados no Railway
□ Todas as variáveis configuradas (railway variables set ...)
□ Dockerfile configurado no painel Railway
□ railway up executado com sucesso
□ Migrations e seed executados
□ /api/v1/health retorna {"status":"ok"}

□ eas login feito
□ eas init executado e Project ID copiado
□ app.config.ts atualizado com o Project ID
□ EXPO_PUBLIC_API_URL configurada com a URL do Railway

□ eas build executado e APK gerado
□ Login com joao.silva@email.com funcionando
□ App pronto para demonstração!
```

---

*Guia criado para o protótipo Predial360 — se tiver dúvidas em qualquer passo, me envie a mensagem de erro exata e te ajudo a resolver.*
