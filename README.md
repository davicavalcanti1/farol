# Farol

Painel operacional em tempo real por modalidade de exame (ultrassom, tomografia,
ressonância, mamografia, densitometria, ecocardiograma, neurocárdio, radiografia),
extraído do sistema de gestão de origem como produto standalone.

## Módulos

- **Hub** (`/farol`) — visão geral com thresholds por turno
- **Faróis por modalidade** (`/farol/<modalidade>`) — fila em tempo real da sala
- **Dashboard** (`/farol/dashboard`) — indicadores consolidados
- **Ocupação** (`/farol/relatorios`) — relatórios de ocupação de salas
- **Panorama NetRis** (`/farol/panorama`) — visão geral dos atendimentos do dia
- **Pacientes Chegou** (`/farol/chegou`) — quem já fez check-in
- **Busca de Atendimentos** (`/farol/busca`) — busca por data/paciente
- **TV** (`/farol/tv`) — visão multi-coluna pública para TVs da clínica (sem login)

## Stack

React 18 + TypeScript + Vite + Tailwind + Supabase (auth, dados, realtime,
edge functions) + Express (proxy NetRis server-side, o token nunca vai pro bundle).

## Rodando em dev

```bash
npm install
npm --prefix server install
cp .env.example .env                  # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
cp server/.env.example server/.env    # SUPABASE_*, NETRIS_*
npm run server   # Express em :3001
npm run dev      # Vite em :5173 com proxy /api -> :3001
```

## Supabase

`supabase/migrations/` traz o histórico do módulo (tabelas `farol_*`,
`historico_atendimentos`, RPCs de ocupação e crons de snapshot).

**Pré-requisitos que as migrations assumem já existir no projeto de destino**
(mesma convenção do sistema de origem):

- Tabelas base `tenants`, `profiles`, `user_roles` e as functions
  `has_role` / `is_tenant_admin` / `get_user_tenant_id`
- `pg_cron` + segredos no Vault (`supabase_url`, `service_role_key`) — os crons
  de snapshot (`snapshot-farol-whatsapp`) leem `vault.decrypted_secrets`;
  sem eles o cron falha com "url null"

Edge functions: `poll-farol-timestamps` e `snapshot-farol-whatsapp`
(deploy via `supabase functions deploy <nome>`).

## Deploy (EasyPanel)

Container único (Dockerfile): build do Vite + Express servindo `dist/` e a API.

- Build args: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_NETRIS_FILIAL_ID`
- Runtime env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NETRIS_BASE_URL`,
  `NETRIS_TOKEN`, `NETRIS_FILIAL_ID`, `NETRIS_PACS_BASE_URL` (opcional),
  `REDIS_URL` (opcional — sem ele o cache do dump de atendimentos usa memória
  apenas em dev; em produção configure um Redis)
