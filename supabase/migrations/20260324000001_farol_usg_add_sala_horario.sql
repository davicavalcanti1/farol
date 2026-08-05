-- Add sala and horario_agendamento columns to farol_usg
ALTER TABLE public.farol_usg
  ADD COLUMN IF NOT EXISTS sala text,
  ADD COLUMN IF NOT EXISTS horario_agendamento timestamp with time zone;
