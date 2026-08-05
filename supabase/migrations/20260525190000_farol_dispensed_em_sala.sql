-- Adiciona 'em_sala' como outcome válido no farol_timestamps.dispensed_outcome.
-- Caso de uso: paciente já foi pra sala de exame mas o NetRis ainda não atualizou
-- a situação (ainda como ENCAMINHADO/etc). A recepção marca "Em Sala" manualmente
-- pra removê-lo do Farol sem registrar baixa final (não vai pra historico_atendimentos).
--
-- 25/mai/2026 — pedido do user durante operação: José Renaldo estava em sala mas
-- continuava aparecendo no Farol porque o NetRis estava lento pra atualizar.

ALTER TABLE public.farol_timestamps
  DROP CONSTRAINT IF EXISTS farol_timestamps_dispensed_outcome_check;

ALTER TABLE public.farol_timestamps
  ADD CONSTRAINT farol_timestamps_dispensed_outcome_check
  CHECK (dispensed_outcome IN ('realizado','cancelado','faltou','em_sala'));

COMMENT ON COLUMN public.farol_timestamps.dispensed_outcome IS
  'Como o paciente saiu do Farol: realizado | cancelado | faltou | em_sala. ' ||
  'em_sala = baixa transitória (paciente foi pra sala antes do NetRis atualizar). ' ||
  'Os 3 primeiros são contabilizados em historico_atendimentos; em_sala não.';
