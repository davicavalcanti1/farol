-- =============================================================================
-- Farol Timestamps — Atomic dar baixa
-- =============================================================================
-- Adiciona colunas para rastrear quando um paciente foi "dispensado" (baixa)
-- da fila ao vivo. Quando dispensed_at está preenchido, o registro deve ser
-- excluído da query de fila ativa em useFarolRealtime — Realtime propaga para
-- todas as TVs/usuários instantaneamente, sem esperar o próximo sync (30s).
--
-- IMPORTANTE — para a edge function `poll-farol-timestamps`:
-- Ao fazer upsert de farol_timestamps vindos do NetRis, NUNCA sobrescrever
-- as colunas dispensed_*. Use:
--   .upsert(rows, { onConflict: 'atendimento_id', ignoreDuplicates: false })
-- e só atualize colunas de leitura (situacao_id, hora_inicial_ms, etc.).
-- Se essa garantia não existir hoje na edge function, a baixa pode ser
-- "desfeita" no próximo sync. Validar antes de subir migração.
-- =============================================================================

ALTER TABLE public.farol_timestamps
  ADD COLUMN IF NOT EXISTS dispensed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispensed_by uuid,
  ADD COLUMN IF NOT EXISTS dispensed_outcome text
    CHECK (dispensed_outcome IN ('realizado','cancelado','faltou'));

-- Índice parcial: só rows ATIVAS (dispensed_at IS NULL) precisam estar no índice
-- de queries da fila. Reduz tamanho do índice e acelera lookup ao vivo.
CREATE INDEX IF NOT EXISTS idx_farol_timestamps_active
  ON public.farol_timestamps (data_ref, modalidade_id, situacao_id)
  WHERE dispensed_at IS NULL;

COMMENT ON COLUMN public.farol_timestamps.dispensed_at
  IS 'Timestamp do "dar baixa". Quando preenchido, registro é excluído da fila ao vivo. NULL = ativo.';
COMMENT ON COLUMN public.farol_timestamps.dispensed_by
  IS 'Usuário (auth.users.id) que deu a baixa.';
COMMENT ON COLUMN public.farol_timestamps.dispensed_outcome
  IS 'Resultado da baixa: realizado | cancelado | faltou.';
