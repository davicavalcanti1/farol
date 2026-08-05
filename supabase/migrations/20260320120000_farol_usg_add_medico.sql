-- Add medico column to farol_usg table
ALTER TABLE public.farol_usg
ADD COLUMN IF NOT EXISTS medico text;
