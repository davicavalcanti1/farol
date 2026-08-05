-- ─────────────────────────────────────────────────────────────────────────────
-- Farol RM — tabela de tempos por protocolo de exame
--
-- Porte da aba "TEMPO EXAMES" do farol Excel (FAROL ATENDIMENTO RM v1.6.3):
-- modelo decomposto de duração por protocolo. total_seg é coluna gerada com a
-- mesma fórmula da planilha: base×(1+tolerância) + preparo + contraste + saída.
--
-- Os adicionais de anestesia entram como linhas especiais (*ANESTESIA e
-- *ANESTESIA CRÍTICA), igual a planilha fazia — o motor de ETA soma o total
-- delas quando o paciente estiver flagado.
--
-- Histórico: farol_tempos_exame_hist substitui a aba "TEMPOS BACKUP" — todo
-- UPDATE/DELETE grava o estado anterior via trigger.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.farol_tempos_exame (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  modalidade        text NOT NULL DEFAULT 'RM',
  procedimento      text NOT NULL,
  -- nome normalizado (sem acento, uppercase, espaços colapsados) — o matching
  -- com o nome vindo do NetRis acontece por esta coluna
  procedimento_norm text NOT NULL,
  base_seg          integer NOT NULL CHECK (base_seg >= 0),
  tolerancia        numeric(4,2) NOT NULL DEFAULT 0 CHECK (tolerancia >= 0),
  preparo_seg       integer NOT NULL DEFAULT 0 CHECK (preparo_seg >= 0),
  contraste_seg     integer NOT NULL DEFAULT 0 CHECK (contraste_seg >= 0),
  saida_seg         integer NOT NULL DEFAULT 0 CHECK (saida_seg >= 0),
  total_seg         integer GENERATED ALWAYS AS (
                      round(base_seg * (1 + tolerancia))::integer
                      + preparo_seg + contraste_seg + saida_seg
                    ) STORED,
  observacao        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  UNIQUE (tenant_id, modalidade, procedimento_norm)
);

CREATE INDEX IF NOT EXISTS idx_farol_tempos_exame_lookup
  ON public.farol_tempos_exame (tenant_id, modalidade, procedimento_norm);

CREATE TABLE IF NOT EXISTS public.farol_tempos_exame_hist (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tempo_id   uuid NOT NULL,
  tenant_id  uuid NOT NULL,
  acao       text NOT NULL CHECK (acao IN ('update', 'delete')),
  -- snapshot completo da linha ANTES da mudança
  dados      jsonb NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farol_tempos_hist_tempo
  ON public.farol_tempos_exame_hist (tempo_id, changed_at DESC);

-- Trigger de auditoria (SECURITY DEFINER: a hist não tem policy de INSERT
-- para usuários — só o trigger escreve nela)
CREATE OR REPLACE FUNCTION public.farol_tempos_exame_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.farol_tempos_exame_hist (tempo_id, tenant_id, acao, dados, changed_by)
  VALUES (
    OLD.id,
    OLD.tenant_id,
    lower(TG_OP),
    to_jsonb(OLD),
    auth.uid()
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_farol_tempos_exame_audit ON public.farol_tempos_exame;
CREATE TRIGGER trg_farol_tempos_exame_audit
  BEFORE UPDATE OR DELETE ON public.farol_tempos_exame
  FOR EACH ROW EXECUTE FUNCTION public.farol_tempos_exame_audit();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.farol_tempos_exame ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farol_tempos_exame_hist ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado do tenant (o Farol inteiro consome)
DROP POLICY IF EXISTS "farol_tempos_select_tenant" ON public.farol_tempos_exame;
CREATE POLICY "farol_tempos_select_tenant" ON public.farol_tempos_exame
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Escrita: admin do tenant, supervisor ou developer
DROP POLICY IF EXISTS "farol_tempos_insert_gestores" ON public.farol_tempos_exame;
CREATE POLICY "farol_tempos_insert_gestores" ON public.farol_tempos_exame
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.is_tenant_admin(auth.uid())
      OR public.has_role(auth.uid(), 'supervisor')
      OR public.has_role(auth.uid(), 'developer')
    )
  );

DROP POLICY IF EXISTS "farol_tempos_update_gestores" ON public.farol_tempos_exame;
CREATE POLICY "farol_tempos_update_gestores" ON public.farol_tempos_exame
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.is_tenant_admin(auth.uid())
      OR public.has_role(auth.uid(), 'supervisor')
      OR public.has_role(auth.uid(), 'developer')
    )
  );

DROP POLICY IF EXISTS "farol_tempos_delete_gestores" ON public.farol_tempos_exame;
CREATE POLICY "farol_tempos_delete_gestores" ON public.farol_tempos_exame
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.is_tenant_admin(auth.uid())
      OR public.has_role(auth.uid(), 'supervisor')
      OR public.has_role(auth.uid(), 'developer')
    )
  );

-- Histórico: leitura pelos mesmos gestores; escrita só via trigger
DROP POLICY IF EXISTS "farol_tempos_hist_select_gestores" ON public.farol_tempos_exame_hist;
CREATE POLICY "farol_tempos_hist_select_gestores" ON public.farol_tempos_exame_hist
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.is_tenant_admin(auth.uid())
      OR public.has_role(auth.uid(), 'supervisor')
      OR public.has_role(auth.uid(), 'developer')
    )
  );
