-- Agenda envio diário do snapshot do Farol via WhatsApp às 07:00 BRT
-- Pré-requisitos:
--   - Edge Function `snapshot-farol-whatsapp` deployada
--   - Secrets no Vault: 'supabase_url' e 'service_role_key' (já existentes para outros crons)
--   - pg_cron + pg_net habilitados

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamento anterior se existir (idempotência da migration)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'snapshot-farol-whatsapp-7am') then
    perform cron.unschedule('snapshot-farol-whatsapp-7am');
  end if;
end $$;

-- Agenda para 10:00 UTC = 07:00 BRT (Recife não tem horário de verão)
select cron.schedule(
  'snapshot-farol-whatsapp-7am',
  '0 10 * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
             || '/functions/v1/snapshot-farol-whatsapp',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);
