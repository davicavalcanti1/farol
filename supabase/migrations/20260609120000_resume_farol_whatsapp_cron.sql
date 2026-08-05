-- Reativa o cron snapshot-farol-whatsapp-7am
-- Pausado em 28/mai após correções no snapshot de contagem.
-- Bugs corrigidos: contagem inflada (sem filtro situacao/dispensed_at)
--   e nomes de modalidade ("Mod. N" substituídos por nomes reais).
do $$
begin
  -- Remove job antigo se existir resquício
  if exists (select 1 from cron.job where jobname = 'snapshot-farol-whatsapp-7am') then
    perform cron.unschedule('snapshot-farol-whatsapp-7am');
  end if;
  -- Reagenda
  perform cron.schedule(
    'snapshot-farol-whatsapp-7am',
    '0 10 * * 1-6',  -- 07:00 BRT (UTC-3) = 10:00 UTC, seg-sáb
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/snapshot-farol-whatsapp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
    $$
  );
  raise notice 'Job snapshot-farol-whatsapp-7am reativado.';
end $$;
