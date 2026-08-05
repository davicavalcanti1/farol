-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: farol_ocupacao_rpc
-- Data: 20/04/2026
-- Descrição: RPC functions para agregar farol_snapshot_minutos em séries
--            horárias para o Relatório Farol (ocupação hora a hora).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Ocupação geral por (dia, hora) ───────────────────────────────────────
create or replace function public.rpc_farol_ocupacao_horaria(
  p_tenant_id uuid,
  p_data_ini  date,
  p_data_fim  date
)
returns table (
  data_ref        date,
  hora            integer,          -- 0-23
  media_aguardando numeric,
  pico_aguardando  integer,
  amostras         integer
)
language sql
security definer
set search_path = public
as $$
  select
    data_ref,
    extract(hour from registrado_em at time zone 'America/Recife')::integer as hora,
    avg(total)::numeric(10,2) as media_aguardando,
    max(total)::integer        as pico_aguardando,
    count(*)::integer          as amostras
  from public.farol_snapshot_minutos
  where tenant_id = p_tenant_id
    and data_ref between p_data_ini and p_data_fim
  group by 1, 2
  order by 1, 2;
$$;

-- ─── 2. Ocupação por modalidade × hora ───────────────────────────────────────
create or replace function public.rpc_farol_ocupacao_modalidade(
  p_tenant_id uuid,
  p_data_ini  date,
  p_data_fim  date
)
returns table (
  data_ref        date,
  hora            integer,
  modalidade_id   integer,
  media_aguardando numeric,
  pico_aguardando  integer
)
language sql
security definer
set search_path = public
as $$
  select
    s.data_ref,
    extract(hour from s.registrado_em at time zone 'America/Recife')::integer as hora,
    (kv.key)::integer                                          as modalidade_id,
    avg((kv.value)::integer)::numeric(10,2)                    as media_aguardando,
    max((kv.value)::integer)::integer                          as pico_aguardando
  from public.farol_snapshot_minutos s,
       jsonb_each_text(s.por_modalidade) kv
  where s.tenant_id = p_tenant_id
    and s.data_ref between p_data_ini and p_data_fim
    and (kv.value)::integer > 0
  group by 1, 2, 3
  order by 1, 2, 3;
$$;

-- ─── 3. Totais do período (cards de topo) ────────────────────────────────────
create or replace function public.rpc_farol_ocupacao_resumo(
  p_tenant_id uuid,
  p_data_ini  date,
  p_data_fim  date
)
returns table (
  total_amostras   integer,
  media_geral      numeric,
  pico_absoluto    integer,
  hora_pico        integer,
  dia_pico         date
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      data_ref,
      extract(hour from registrado_em at time zone 'America/Recife')::integer as hora,
      total
    from public.farol_snapshot_minutos
    where tenant_id = p_tenant_id
      and data_ref between p_data_ini and p_data_fim
  ),
  pico as (
    select data_ref as dia_pico, hora as hora_pico, total as pico_absoluto
    from base
    order by total desc, data_ref desc, hora desc
    limit 1
  )
  select
    (select count(*)::integer        from base),
    (select avg(total)::numeric(10,2) from base),
    (select pico_absoluto             from pico),
    (select hora_pico                 from pico),
    (select dia_pico                  from pico);
$$;

-- ─── 4. Grants ───────────────────────────────────────────────────────────────
grant execute on function public.rpc_farol_ocupacao_horaria(uuid, date, date)     to authenticated;
grant execute on function public.rpc_farol_ocupacao_modalidade(uuid, date, date)  to authenticated;
grant execute on function public.rpc_farol_ocupacao_resumo(uuid, date, date)      to authenticated;

-- ─── 5. Ativar pg_cron da captura (execute UMA VEZ no SQL Editor) ────────────
-- Pré-requisito:
--   create extension if not exists pg_cron;
--
-- Agenda snapshot minuto a minuto:
--   select cron.schedule(
--     'farol-snapshot-por-minuto',
--     '* * * * *',
--     $$
--       insert into public.farol_snapshot_minutos (tenant_id, total, por_modalidade)
--       select
--         tenant_id,
--         count(*)::integer as total,
--         jsonb_object_agg(modalidade_id::text, cnt) as por_modalidade
--       from (
--         select tenant_id, modalidade_id, count(*) as cnt
--         from public.farol_timestamps
--         where situacao_id in (10, 11, 13, 45, 61, 62, 63, 64)
--         group by tenant_id, modalidade_id
--       ) sub
--       group by tenant_id;
--     $$
--   );
