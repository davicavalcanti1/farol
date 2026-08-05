-- ─────────────────────────────────────────────────────────────────────────────
-- Flag de anestesia por atendimento na fila do Farol.
--
-- No farol Excel a anestesia era uma lista manual de pacientes que somava
-- +12/+24min ao ciclo. Aqui vira um toggle na linha do paciente: quando true,
-- o motor de ETA soma o tempo do protocolo *ANESTESIA (ou *ANESTESIA CRÍTICA)
-- da tabela farol_tempos_exame ao ciclo do paciente.
--
-- A edge function poll-farol-timestamps não escreve esta coluna, então o
-- upsert dela preserva o valor marcado pela recepção (mesmo contrato do
-- dispensed_at).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.farol_timestamps
  ADD COLUMN IF NOT EXISTS anestesia boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.farol_timestamps.anestesia IS
  'Paciente precisa de anestesia — soma o adicional *ANESTESIA da tabela '
  'farol_tempos_exame ao ciclo na previsão de horário do Farol RM.';
