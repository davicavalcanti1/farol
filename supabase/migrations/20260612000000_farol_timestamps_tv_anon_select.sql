-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: farol_timestamps_tv_anon_select
-- Data: 12/06/2026
-- Descrição: Adiciona policy SELECT para anon em farol_timestamps.
--            A TV Farol (/farol/tv) roda em loop 24/7 sem sessão de usuário
--            autenticado. Sem esta policy, o Supabase anon key não consegue
--            ler a tabela e a TV fica vazia.
-- ─────────────────────────────────────────────────────────────────────────────

-- Leitura pública: qualquer visitante (anon) pode SELECT em farol_timestamps.
-- Escrita continua restrita à policy tenant_rw existente (authenticated only).
drop policy if exists "farol_timestamps_tv_select_anon" on farol_timestamps;

-- Política mínima: anon lê APENAS o dia de hoje em BRT.
-- O dado de hoje já é visível na TV física da sala de espera.
-- Dados históricos continuam protegidos pela policy tenant_rw.
create policy "farol_timestamps_tv_select_anon"
  on farol_timestamps
  for select
  to anon
  using (
    data_ref = (current_timestamp at time zone 'America/Sao_Paulo')::date
  );
