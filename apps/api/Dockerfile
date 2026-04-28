# ─────────────────────────────────────────────────────────────────────────────
# Predial360 API — Dockerfile multi-stage
# Build context: raiz do monorepo (para acessar packages/shared)
#
# Uso local:
#   docker build -f apps/api/Dockerfile -t predial360-api .
#   docker run -p 3000:3000 --env-file apps/api/.env predial360-api
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: dependências ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /repo

# Instala ferramentas nativas necessárias (bcrypt, canvas)
RUN apk add --no-cache libc6-compat python3 make g++

# Copia manifests de todo o monorepo para cache de camadas
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Instala dependências com lock file para builds reproduzíveis
RUN npm ci --workspace=apps/api --workspace=packages/shared --include-workspace-root --legacy-peer-deps

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
# Em npm workspaces, dependências ficam hoistadas em node_modules raiz — não há node_modules por workspace

# Copia código-fonte completo
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY package.json ./

# Gera o cliente Prisma
RUN cd apps/api && npx prisma generate

# Compila shared primeiro (necessário para type-checking da API)
RUN cd packages/shared && npm run build
# Compila a API (usa packages/shared/dist para type-checking)
RUN cd apps/api && npm run build

# ── Stage 3: imagem de produção ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Usuário sem privilégios para segurança
RUN addgroup --system --gid 1001 nestjs \
 && adduser  --system --uid 1001 nestjs

# Copia artefatos do build
COPY --from=builder --chown=nestjs:nestjs /repo/apps/api/dist        ./dist
COPY --from=builder --chown=nestjs:nestjs /repo/apps/api/prisma      ./prisma
COPY --from=builder --chown=nestjs:nestjs /repo/node_modules          ./node_modules
COPY --from=builder --chown=nestjs:nestjs /repo/apps/api/package.json ./package.json

# Garante que o cliente Prisma gerado esteja disponível
COPY --from=builder --chown=nestjs:nestjs /repo/node_modules/.prisma ./node_modules/.prisma

# Copia packages/shared para resolver o symlink do workspace npm
# (node_modules/@predial360/shared aponta para ../../packages/shared)
COPY --from=builder --chown=nestjs:nestjs /repo/packages/shared/dist     ./packages/shared/dist
COPY --from=builder --chown=nestjs:nestjs /repo/packages/shared/package.json ./packages/shared/package.json

USER nestjs

EXPOSE 3000

# Healthcheck para Railway/Docker
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Roda migrations e inicia o servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
