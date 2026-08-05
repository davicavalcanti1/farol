-- ─────────────────────────────────────────────────────────────────────────────
-- FIX CRÍTICO: o cron do farol_snapshot_minutos estava gravando
-- `count(*)` da subquery agrupada por modalidade — ou seja, o número
-- de MODALIDADES com pacientes, não o TOTAL de pacientes.
--
-- Impacto: se havia 90 pacientes distribuídos em 12 modalidades,
-- o snapshot registrava total=12 em vez de 90.
--
-- Correção: trocar `count(*)` por `sum(cnt)` no SELECT externo.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove o cron antigo se existir
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('farol-snapshot-por-minuto')
    where exists (select 1 from cron.job where jobname = 'farol-snapshot-por-minuto');
  end if;
exception when others then
  -- ignora se pg_cron não existe ou não tem o job
  null;
end $$;

-- Re-agenda com a query corrigida
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'farol-snapshot-por-minuto',
      '* * * * *',
      $CRON$
        insert into public.farol_snapshot_minutos (tenant_id, total, por_modalidade)
        select
          tenant_id,
          sum(cnt)::integer as total,
          jsonb_object_agg(modalidade_id::text, cnt) as por_modalidade
        from (
          select tenant_id, modalidade_id, count(*)::integer as cnt
          from public.farol_timestamps
          where situacao_id in (10, 11, 13, 45, 61, 62, 63, 64)
          group by tenant_id, modalidade_id
        ) sub
        group by tenant_id;
      $CRON$
    );
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Opcional: recalcular snapshots antigos se você quiser corrigir o histórico.
-- Só execute este bloco SE quiser reprocessar o passado.
-- Não é feito automaticamente porque pode ser destrutivo.
--
-- Para reprocessar os snapshots do dia atual:
--   DELETE FROM public.farol_snapshot_minutos WHERE data_ref = current_date;
-- Depois aguarde o cron rodar por 24h para reconstruir.
-- ─────────────────────────────────────────────────────────────────────────────
