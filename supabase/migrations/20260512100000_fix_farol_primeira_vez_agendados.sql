-- =============================================================================
-- Corrige registros de hoje com primeira_vez antes das 05h BRT
-- =============================================================================
-- Contexto: a migration 20260511120000 corrigiu apenas registros com
-- situacao_id IN (10,11,13,61-64). Pacientes que estavam em estado 2/3
-- (confirmado/agendado) na madrugada ficaram com primeira_vez = 00:XX BRT.
-- Quando esses pacientes chegam (transitam para estado 10), o upsert preservava
-- o timestamp falso da madrugada, causando "8h de espera" inexistente.
--
-- Esta migration reseta primeira_vez de TODOS os registros ativos de hoje cuja
-- primeira_vez está antes das 05h BRT (= 08h UTC), independente de situacao_id.
-- A edge function atualizada (v2) não terá mais esse problema pois só carimba
-- primeira_vez quando o paciente transita para estado ativo (10+).
-- =============================================================================

UPDATE public.farol_timestamps
SET primeira_vez = now()
WHERE data_ref >= current_date - 1
  AND dispensed_at IS NULL
  AND primeira_vez < (current_date::timestamptz + interval '8 hours'); -- antes das 05h BRT (08h UTC)
