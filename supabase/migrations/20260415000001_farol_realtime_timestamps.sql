-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: farol_realtime_timestamps
-- Data: 15/04/2026
-- Descrição: Remove tabelas de farol antigas (alimentadas pelo n8n) e cria
--            tabela farol_timestamps para o sistema real-time direto do NetRis.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Dropar tabelas antigas do n8n ─────────────────────────────────────────
drop table if exists farol_usg            cascade;
drop table if exists farol_radiografia    cascade;
drop table if exists farol_tomografia     cascade;
drop table if exists farol_mamografia     cascade;
drop table if exists farol_densitometria  cascade;
drop table if exists farol_ressonancia    cascade;
drop table if exists farol_ecocardiograma cascade;
drop table if exists farol_neurocardio    cascade;
drop table if exists farol_events         cascade;

-- ── 2. Criar tabela de timestamps persistidos ─────────────────────────────────
-- Registra o primeiro momento em que cada atendimento foi detectado
-- com status relevante (CHEGOU/ENCAMINHADO/pipeline RM-TC).
-- Alimentada por:
--   a) Edge Function poll-farol-timestamps (via pg_cron a cada 30s)
--   b) Frontend useFarolRealtime (fallback quando edge fn ainda não rodou)

create table if not exists farol_timestamps (
  atendimento_id  text        primary key,
  tenant_id       uuid        references tenants(id) on delete cascade,
  nome_paciente   text,
  modalidade_id   integer,
  primeira_vez    timestamptz not null default now(),
  data_ref        date        not null default current_date
);

-- Índices para queries frequentes
create index if not exists farol_timestamps_data_ref_idx
  on farol_timestamps(data_ref);

create index if not exists farol_timestamps_modalidade_data_idx
  on farol_timestamps(modalidade_id, data_ref);

create index if not exists farol_timestamps_tenant_idx
  on farol_timestamps(tenant_id, data_ref);

-- ── 3. Row Level Security ─────────────────────────────────────────────────────
alter table farol_timestamps enable row level security;

-- Usuários autenticados do mesmo tenant podem ler e escrever
create policy "farol_timestamps_tenant_rw" on farol_timestamps
  for all
  using (
    tenant_id = (
      select tenant_id from profiles where id = auth.uid()
    )
  )
  with check (
    tenant_id = (
      select tenant_id from profiles where id = auth.uid()
    )
  );

-- Service role (Edge Function) pode inserir sem restrição de RLS
-- (service role bypassa RLS por padrão no Supabase)

-- ── 4. Limpeza automática de registros antigos (> 3 dias) ────────────────────
-- Evita acúmulo indefinido de dados históricos nesta tabela de controle.
-- Dados históricos de atendimentos ficam em historico_atendimentos.
create or replace function cleanup_farol_timestamps()
returns void
language sql
security definer
as $$
  delete from farol_timestamps
  where data_ref < current_date - interval '3 days';
$$;

-- ── 5. Agendar cron (execute manualmente no SQL Editor após habilitar extensões) ─
-- Pré-requisitos:
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
-- Agendar poll a cada 30 segundos:
--   select cron.schedule(
--     'poll-farol-timestamps',
--     '30 seconds',
--     $$
--     select net.http_post(
--       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
--                  || '/functions/v1/poll-farol-timestamps',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
--         'Content-Type', 'application/json'
--       ),
--       body    := '{}'::jsonb
--     )
--     $$
--   );
--
-- Agendar limpeza diária às 03:00:
--   select cron.schedule(
--     'cleanup-farol-timestamps',
--     '0 3 * * *',
--     $$ select cleanup_farol_timestamps() $$
--   );
