-- ─────────────────────────────────────────────────────────────────────────────
-- DIAGNÓSTICO — por que o envio do Farol WhatsApp às 07:00 não veio hoje
--
-- Este arquivo NÃO altera nada. É só um conjunto de SELECTs para você rodar
-- no SQL Editor do Supabase e entender o estado atual do cron.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) pg_cron e pg_net estão instalados?
-- select * from pg_extension where extname in ('pg_cron','pg_net');

-- 2) O job está agendado?
-- select jobid, jobname, schedule, active, command
-- from cron.job
-- where jobname = 'snapshot-farol-whatsapp-7am';

-- 3) O job rodou hoje? Qual foi o resultado?
-- select jobid, runid, start_time, end_time, status, return_message
-- from cron.job_run_details
-- where jobid in (select jobid from cron.job where jobname = 'snapshot-farol-whatsapp-7am')
-- order by start_time desc
-- limit 20;
--   -> se "status" for "failed", o return_message dirá o motivo
--   -> se não houver linha nenhuma, o cron nunca rodou (job desativado/não aplicado)

-- 4) Os secrets estão no vault?
-- select name from vault.decrypted_secrets where name in ('supabase_url','service_role_key');
--   -> precisa retornar as 2 linhas

-- 5) A edge function está deployada?
--   -> No dashboard: Edge Functions → snapshot-farol-whatsapp deve estar "ACTIVE"
--   -> Teste manual:
-- select net.http_post(
--   url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
--          || '/functions/v1/snapshot-farol-whatsapp',
--   headers := jsonb_build_object(
--     'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
--     'Content-Type', 'application/json'
--   ),
--   body := '{}'::jsonb
-- );
--   -> Depois veja o resultado em net._http_response (ou net.http_response dependendo da versão):
-- select id, status_code, content_type, content::text, created
-- from net._http_response
-- order by created desc
-- limit 5;

-- 6) Causas comuns que fazem o cron "sumir":
--   a) Migration nunca foi aplicada em produção
--      → aplique 20260420000005_snapshot_farol_whatsapp_cron.sql
--   b) Instância Supabase reiniciou e pg_cron perdeu jobs
--      → re-rode o cron.schedule(...) manualmente
--   c) Secrets foram removidos do vault
--      → recrie: select vault.create_secret('...', 'supabase_url');
--   d) Edge function foi despublicada / erro de build
--      → re-deploy via CLI: supabase functions deploy snapshot-farol-whatsapp
--   e) Rate limit de HTTP externo (uazapi)
--      → veja return_message em cron.job_run_details

-- ─── Re-scheduling manual (fire-and-forget) se o cron sumiu ──────────────────
-- Se o passo (2) mostrar que o job NÃO existe, execute:
/*
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
*/
