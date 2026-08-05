-- ── Snapshots minuto a minuto da fila do Farol ────────────────────────────
-- Tabela que acumula quantos pacientes estavam aguardando em cada minuto.
-- Alimentada pelo pg_cron job abaixo.
-- TODO: ativar amanhã após validar farol_historico funcionando.

create table if not exists public.farol_snapshot_minutos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  registrado_em timestamptz not null default now(),
  data_ref     date not null default current_date,
  total        integer not null default 0,
  por_modalidade jsonb not null default '{}'   -- { "1": 5, "2": 3, ... }
);

alter table public.farol_snapshot_minutos enable row level security;

create policy "farol_snapshot_tenant"
  on public.farol_snapshot_minutos for all
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));

create index if not exists farol_snapshot_tenant_data
  on public.farol_snapshot_minutos (tenant_id, data_ref, registrado_em);

-- ── pg_cron: roda todo minuto e grava o estado atual da fila ───────────────
-- ATIVAR AMANHÃ: descomente o bloco abaixo no SQL Editor do Supabase.
--
-- select cron.schedule(
--   'farol-snapshot-por-minuto',
--   '* * * * *',
--   $$
--     insert into public.farol_snapshot_minutos (tenant_id, total, por_modalidade)
--     select
--       tenant_id,
--       count(*)::integer as total,
--       jsonb_object_agg(modalidade_id::text, cnt) as por_modalidade
--     from (
--       select tenant_id, modalidade_id, count(*) as cnt
--       from public.farol_timestamps
--       where situacao_id in (10, 11, 13, 45, 61, 62, 63, 64)
--       group by tenant_id, modalidade_id
--     ) sub
--     group by tenant_id;
--   $$
-- );
