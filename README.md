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

## Configuração das integrações (`/farol/configuracoes`)

Desde 20/ago as credenciais do NetRis **não precisam mais de redeploy**. A tela
`/farol/configuracoes` (papel `admin` ou `developer`) grava em
`public.farol_integracoes` por tenant, e o valor passa a valer em segundos.

A precedência é **por campo**: `painel > ambiente > default do código`. Ou seja,
as variáveis `NETRIS_*` continuam válidas como rede de segurança, e enquanto
ninguém salvar nada no painel **nada muda** — não há janela de indisponibilidade
ao aplicar a migration.

Três coisas que valem saber:

- **Desligar o switch** "Integração ativa" volta tudo ao ambiente sem apagar o
  que está salvo. É o interruptor para credencial errada salva às 18h de uma
  sexta.
- **"Importar do ambiente"** copia as `NETRIS_*` para o painel e liga a
  integração. Depois disso o painel é a fonte e as env vars podem sair do
  EasyPanel. Rodar duas vezes não desfaz ajuste manual: campo que já tem valor
  no painel é preservado.
- **Se a migration não estiver aplicada**, o resolvedor degrada para o ambiente
  e o Farol se comporta exatamente como antes. A tela é que dá erro, não a
  operação.

O núcleo vem por cópia do `imago-platform/packages/integracoes`
(`server/src/integracoes/` — **não edite lá dentro**, use
`node packages/integracoes/sync.mjs`). O registro de campos, que é o que a tela
desenha, está em `server/src/lib/integracaoRegistro.ts`: campo novo é uma linha
lá, sem migration.

A tela em si vem do `@imago/painel` (`src/painel/`). Está sendo usada a **área**,
não a casca: o Farol tem navegação própria, e trocá-la não ganharia nada hoje.

```bash
npm --prefix server test   # 7 casos sobre precedência, kill switch e degradação
```

## Deploy (EasyPanel)

Container único (Dockerfile): build do Vite + Express servindo `dist/` e a API.

- Build args: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_NETRIS_FILIAL_ID`
- Runtime env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (obrigatórias) e
  `NETRIS_BASE_URL`, `NETRIS_TOKEN`, `NETRIS_FILIAL_ID`, `NETRIS_PACS_BASE_URL`
  — estas quatro agora são **fallback**: o painel `/farol/configuracoes` vence
  por campo. Mantenha-as até a configuração estar salva pelo painel,
  `REDIS_URL` (opcional — sem ele o cache do dump de atendimentos usa memória
  apenas em dev; em produção configure um Redis)
