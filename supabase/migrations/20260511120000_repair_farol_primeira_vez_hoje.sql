-- =============================================================================
-- Reparo retroativo: pacientes de hoje com primeira_vez = 00:00 BRT
-- =============================================================================
-- Contexto: até o commit 758ab37 (11/mai 08:54), o poll-farol-timestamps criava
-- registros logo após a virada do dia (00:00 BRT) para pacientes confirmados do
-- novo dia. Resultado: pacientes aparecendo como "aguardando exame desde 00:00"
-- e tempo de espera falso de 8h+.
--
-- O fix do código previne o problema daqui pra frente (guard clinicaAberta às
-- 05h BRT), mas os registros já criados hoje seguem com primeira_vez bugada.
-- Esta migration zera essa primeira_vez para now() — não é perfeito (perde-se
-- o tempo real de espera), mas é honesto e elimina o "8h fake".
--
-- Critério: registros de hoje em status aguardando+ (10,11,13,61,62,63,64),
-- ainda ativos (dispensed_at IS NULL), com primeira_vez mais de 5h atrás
-- (ninguém aguarda mais que isso em condições normais → certamente bugado).
-- =============================================================================

UPDATE public.farol_timestamps
SET primeira_vez = now()
WHERE data_ref >= current_date - 1
  AND situacao_id IN (10, 11, 13, 61, 62, 63, 64)
  AND dispensed_at IS NULL
  AND primeira_vez < now() - interval '5 hours';
