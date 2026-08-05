-- Desativa o agendamento diário do snapshot Farol via WhatsApp
-- A edge function `snapshot-farol-whatsapp` permanece deployada e intacta;
-- apenas o job do pg_cron é removido para parar os disparos automáticos.
-- Para reativar, aplicar novamente a migration 20260420000005_snapshot_farol_whatsapp_cron.sql

do $$
begin
  if exists (select 1 from cron.job where jobname = 'snapshot-farol-whatsapp-7am') then
    perform cron.unschedule('snapshot-farol-whatsapp-7am');
    raise notice 'Job snapshot-farol-whatsapp-7am removido com sucesso.';
  else
    raise notice 'Job snapshot-farol-whatsapp-7am não encontrado — nada a fazer.';
  end if;
end $$;
