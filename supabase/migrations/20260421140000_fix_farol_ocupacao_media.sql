-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: cálculo da média de pacientes aguardando no Farol
-- Problema: o cron só insere snapshot quando há pacientes (total > 0).
-- Resultado: avg(total) ignora os minutos com 0 pacientes, inflando a média.
-- Solução: trocar por sum(total)/60 para tratar minutos faltantes como 0.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.rpc_farol_ocupacao_horaria(
  p_tenant_id uuid,
  p_data_ini  date,
  p_data_fim  date
)
returns table (
  data_ref        date,
  hora            integer,
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
    round(sum(total)::numeric / 60.0, 2) as media_aguardando,
    max(total)::integer                   as pico_aguardando,
    count(*)::integer                     as amostras
  from public.farol_snapshot_minutos
  where tenant_id = p_tenant_id
    and data_ref between p_data_ini and p_data_fim
  group by 1, 2
  order by 1, 2;
$$;

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
    (kv.key)::integer                                                         as modalidade_id,
    round(sum((kv.value)::integer)::numeric / 60.0, 2)                        as media_aguardando,
    max((kv.value)::integer)::integer                                         as pico_aguardando
  from public.farol_snapshot_minutos s,
       jsonb_each_text(s.por_modalidade) kv
  where s.tenant_id = p_tenant_id
    and s.data_ref between p_data_ini and p_data_fim
    and (kv.value)::integer > 0
  group by 1, 2, 3
  order by 1, 2, 3;
$$;

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
  por_hora as (
    select data_ref, hora, round(sum(total)::numeric / 60.0, 2) as media_hora, max(total) as pico_hora
    from base group by 1, 2
  ),
  pico as (
    select data_ref as dia_pico, hora as hora_pico, total as pico_absoluto
    from base
    order by total desc, data_ref desc, hora desc
    limit 1
  )
  select
    (select count(*)::integer       from base)                       as total_amostras,
    (select round(avg(media_hora), 2) from por_hora)                 as media_geral,
    (select pico_absoluto            from pico)                      as pico_absoluto,
    (select hora_pico                from pico)                      as hora_pico,
    (select dia_pico                 from pico)                      as dia_pico;
$$;

grant execute on function public.rpc_farol_ocupacao_horaria(uuid, date, date)     to authenticated;
grant execute on function public.rpc_farol_ocupacao_modalidade(uuid, date, date)  to authenticated;
grant execute on function public.rpc_farol_ocupacao_resumo(uuid, date, date)      to authenticated;
