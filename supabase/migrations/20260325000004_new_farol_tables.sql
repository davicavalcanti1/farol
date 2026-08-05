-- ============================================================
-- New farol tables: ressonância, ecocardiograma, neurocardio
-- Same structure as existing farol tables
-- ============================================================

CREATE TABLE IF NOT EXISTS farol_ressonancia (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  nome_paciente        TEXT        NOT NULL,
  exame                TEXT        NOT NULL DEFAULT 'Ressonância Magnética',
  data_chegada         TIMESTAMPTZ NOT NULL DEFAULT now(),
  horario_agendamento  TIMESTAMPTZ,
  sala                 TEXT,
  medico               TEXT,
  status               TEXT        NOT NULL DEFAULT 'aguardando',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS farol_ecocardiograma (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  nome_paciente        TEXT        NOT NULL,
  exame                TEXT        NOT NULL DEFAULT 'Ecocardiograma',
  data_chegada         TIMESTAMPTZ NOT NULL DEFAULT now(),
  horario_agendamento  TIMESTAMPTZ,
  sala                 TEXT,
  medico               TEXT,
  status               TEXT        NOT NULL DEFAULT 'aguardando',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- neurocardio: has multiple modalities grouped by the 'exame' field
-- Valid exame values: ESPIROMETRIA, ELETROENCEFALOGRAMA, ELETROCARDIOGRAMA,
--                     MAPA, HOLTER, TESTE ERGOMÉTRICO, POLISSONOGRAFIA
CREATE TABLE IF NOT EXISTS farol_neurocardio (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  nome_paciente        TEXT        NOT NULL,
  exame                TEXT        NOT NULL,   -- stores the modalidade (ESPIROMETRIA, etc.)
  data_chegada         TIMESTAMPTZ NOT NULL DEFAULT now(),
  horario_agendamento  TIMESTAMPTZ,
  sala                 TEXT,
  medico               TEXT,
  status               TEXT        NOT NULL DEFAULT 'aguardando',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE farol_ressonancia   ENABLE ROW LEVEL SECURITY;
ALTER TABLE farol_ecocardiograma ENABLE ROW LEVEL SECURITY;
ALTER TABLE farol_neurocardio   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farol_ressonancia_tenant" ON farol_ressonancia
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "farol_ecocardiograma_tenant" ON farol_ecocardiograma
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "farol_neurocardio_tenant" ON farol_neurocardio
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
