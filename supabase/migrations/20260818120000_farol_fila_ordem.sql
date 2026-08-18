-- ─────────────────────────────────────────────────────────────────────────────
-- Farol RM — ordem da fila decidida pelo operador
--
-- Porte do que o farol Excel (FAROL ATENDIMENTO RM v1.6.3) fazia com os botões
-- ↑↓ (`MoverLinhaParaCima`/`MoverLinhaParaBaixo`) e com a aba `ordem salva`.
--
-- ── POR QUE ISSO PRECISA EXISTIR ─────────────────────────────────────────────
-- Até aqui a fila do web era ordenada por `horarioAgendamento` e ponto
-- (useFarolRealtime). No Excel a ordem é DECISÃO de quem opera: o técnico sobe
-- quem já está preparado, desce quem ainda não tomou contraste. Como o motor de
-- ETA soma os ciclos "de quem está na frente", ordem errada = previsão errada
-- para todo mundo abaixo. Sem esta tabela o knapsack também não tem sentido:
-- ele existe justamente para SUGERIR uma ordem que alguém então aplica.
--
-- ── DIFERENÇA DELIBERADA EM RELAÇÃO AO EXCEL ─────────────────────────────────
-- No Excel a ordem manual é efêmera: `AddTempoFarol` reconstrói a aba
-- FAROL ATEND a partir de DADOS.B e apaga o que a pessoa tinha ordenado. Aqui
-- ela é persistida por (tenant, dia, modalidade), então sobrevive ao refresh,
-- ao F5 e à troca de turno. Quem chega depois e não está na ordem salva entra
-- no fim, na ordem do horário agendado — mesmo comportamento do Excel para
-- linhas novas, sem o efeito colateral de perder o resto.
--
-- ── PRIORITÁRIO ──────────────────────────────────────────────────────────────
-- `prioritario` é a coluna K da planilha, lida pelo KnapsackAppointmentScheduler
-- para montar o nível de prioridade (atrasado > prioritário > resto). É marcação
-- manual: nenhuma rotina automática escreve nela.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.farol_fila_ordem (
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  data_ref       date NOT NULL,
  -- IDs de modalidade da tela, ordenados e unidos por vírgula ("5,16" para a
  -- RM, que junta RESSONANCIA e RESSONANCIA_CONTRASTE). A ordem da fila é por
  -- tela, não por modalidade solta: é a tela que o operador enxerga e reordena.
  modalidade_key text NOT NULL,
  -- Mesma chave de agrupamento do useFarolRealtime: CPF só com dígitos ou,
  -- na falta dele, o nome em maiúsculas. Um paciente com 3 exames é UMA linha
  -- na fila e portanto UMA posição.
  chave          text NOT NULL,
  posicao        integer NOT NULL CHECK (posicao >= 0),
  prioritario    boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  PRIMARY KEY (tenant_id, data_ref, modalidade_key, chave)
);

CREATE INDEX IF NOT EXISTS idx_farol_fila_ordem_tela
  ON public.farol_fila_ordem (tenant_id, data_ref, modalidade_key, posicao);

COMMENT ON TABLE public.farol_fila_ordem IS
  'Ordem e prioridade da fila do Farol decididas pelo operador — porte dos '
  'botões de mover linha e da aba "ordem salva" do farol Excel.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Mesma classe de escrita da baixa e do toggle de anestesia (farol_timestamps):
-- reordenar a fila é ato de operação, não de gestão, e quem opera o Farol é
-- qualquer usuário autenticado do tenant. Restringir a admin/supervisor
-- travaria justamente o técnico que precisa mover a linha.
ALTER TABLE public.farol_fila_ordem ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farol_fila_ordem_tenant_rw" ON public.farol_fila_ordem;
CREATE POLICY "farol_fila_ordem_tenant_rw" ON public.farol_fila_ordem
  FOR ALL TO authenticated
  USING      (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- A TV do Farol (/farol/tv) roda sem sessão e precisa ler a fila na ordem certa,
-- senão mostra uma ordem diferente da que a recepção está seguindo. Mesmo
-- recorte da policy anon já existente em farol_timestamps: só o dia de hoje.
DROP POLICY IF EXISTS "farol_fila_ordem_tv_select_anon" ON public.farol_fila_ordem;
CREATE POLICY "farol_fila_ordem_tv_select_anon" ON public.farol_fila_ordem
  FOR SELECT TO anon
  USING (data_ref = (current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date);
