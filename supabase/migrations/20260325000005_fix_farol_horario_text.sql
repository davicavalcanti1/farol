-- Fix horario_agendamento to TEXT on new farol tables
-- (matches existing farol_usg / farol_radioterapia / etc. schema)
ALTER TABLE farol_ressonancia    ALTER COLUMN horario_agendamento TYPE TEXT USING horario_agendamento::TEXT;
ALTER TABLE farol_ecocardiograma ALTER COLUMN horario_agendamento TYPE TEXT USING horario_agendamento::TEXT;
ALTER TABLE farol_neurocardio    ALTER COLUMN horario_agendamento TYPE TEXT USING horario_agendamento::TEXT;

-- Also fix data_chegada to TEXT for the same reason
ALTER TABLE farol_ressonancia    ALTER COLUMN data_chegada TYPE TEXT USING data_chegada::TEXT;
ALTER TABLE farol_ecocardiograma ALTER COLUMN data_chegada TYPE TEXT USING data_chegada::TEXT;
ALTER TABLE farol_neurocardio    ALTER COLUMN data_chegada TYPE TEXT USING data_chegada::TEXT;
