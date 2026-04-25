-- Predial360 — Inicialização PostgreSQL
-- Cria banco de teste separado

CREATE DATABASE predial360_test;
GRANT ALL PRIVILEGES ON DATABASE predial360_test TO predial360;

-- Extensões úteis
\c predial360_dev;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- busca por similaridade (nome, endereço)
CREATE EXTENSION IF NOT EXISTS "unaccent"; -- busca sem acento

\c predial360_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
