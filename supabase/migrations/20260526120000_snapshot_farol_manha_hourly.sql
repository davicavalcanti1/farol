-- Reagenda o snapshot do Farol via WhatsApp:
-- de 1 envio diário (07h BRT) para 5 envios entre 07h e 11h BRT.
-- Recife não tem horário de verão, então 07-11 BRT = 10-14 UTC.
-- Substitui o job '0 10 * * *' criado em 20260420000005.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove os jobs anteriores se existirem (idempotência)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'snapshot-farol-whatsapp-7am') then
    perform cron.unschedule('snapshot-farol-whatsapp-7am');
  end if;
  if exists (select 1 from cron.job where jobname = 'snapshot-farol-whatsapp-manha') then
    perform cron.unschedule('snapshot-farol-whatsapp-manha');
  end if;
end $$;

-- Roda no minuto 0 das horas 10, 11, 12, 13, 14 UTC = 07, 08, 09, 10, 11 BRT
select cron.schedule(
  'snapshot-farol-whatsapp-manha',
  '0 10-14 * * *',
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
