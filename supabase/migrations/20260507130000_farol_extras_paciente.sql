-- Campos extras pra o modal de detalhes do paciente na fila do assistente.
-- Vêm direto do NetRis (já normalizados em src/services/netris/atendimentos.ts):
--   telefoneCelularPaciente -> telefone
--   dataNascimento (ms epoch) -> data_nascimento (date)
--   nomeConvenio -> convenio (modo de pagamento implícito)
--   valorProcedimento -> valor_procedimento
-- A edge function poll-farol-timestamps será atualizada pra preencher
-- esses campos no próximo deploy. Migrations aceitam null pra rows existentes.

ALTER TABLE public.farol_timestamps
  ADD COLUMN IF NOT EXISTS telefone           TEXT,
  ADD COLUMN IF NOT EXISTS data_nascimento    DATE,
  ADD COLUMN IF NOT EXISTS convenio           TEXT,
  ADD COLUMN IF NOT EXISTS valor_procedimento NUMERIC(10,2);

COMMENT ON COLUMN public.farol_timestamps.telefone           IS 'WhatsApp/celular do paciente — telefoneCelularPaciente do NetRis.';
COMMENT ON COLUMN public.farol_timestamps.data_nascimento    IS 'Data de nascimento — dataNascimento (epoch ms) do NetRis convertida.';
COMMENT ON COLUMN public.farol_timestamps.convenio           IS 'Convênio / modo de pagamento — nomeConvenio do NetRis.';
COMMENT ON COLUMN public.farol_timestamps.valor_procedimento IS 'Valor cheio do procedimento — valorProcedimento do NetRis.';
