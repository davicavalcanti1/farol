-- Add data_nascimento and local to all farol tables

DO $$ BEGIN
  -- farol_usg
  ALTER TABLE public.farol_usg ADD COLUMN IF NOT EXISTS data_nascimento DATE;
  ALTER TABLE public.farol_usg ADD COLUMN IF NOT EXISTS local TEXT;
  -- farol_tomografia
  ALTER TABLE public.farol_tomografia ADD COLUMN IF NOT EXISTS data_nascimento DATE;
  ALTER TABLE public.farol_tomografia ADD COLUMN IF NOT EXISTS local TEXT;
  -- farol_mamografia
  ALTER TABLE public.farol_mamografia ADD COLUMN IF NOT EXISTS data_nascimento DATE;
  ALTER TABLE public.farol_mamografia ADD COLUMN IF NOT EXISTS local TEXT;
  -- farol_densitometria
  ALTER TABLE public.farol_densitometria ADD COLUMN IF NOT EXISTS data_nascimento DATE;
  ALTER TABLE public.farol_densitometria ADD COLUMN IF NOT EXISTS local TEXT;
  -- farol_radioterapia
  ALTER TABLE public.farol_radioterapia ADD COLUMN IF NOT EXISTS data_nascimento DATE;
  ALTER TABLE public.farol_radioterapia ADD COLUMN IF NOT EXISTS local TEXT;
  -- farol_ressonancia
  ALTER TABLE public.farol_ressonancia ADD COLUMN IF NOT EXISTS data_nascimento DATE;
  ALTER TABLE public.farol_ressonancia ADD COLUMN IF NOT EXISTS local TEXT;
  -- farol_ecocardiograma
  ALTER TABLE public.farol_ecocardiograma ADD COLUMN IF NOT EXISTS data_nascimento DATE;
  ALTER TABLE public.farol_ecocardiograma ADD COLUMN IF NOT EXISTS local TEXT;
  -- farol_neurocardio
  ALTER TABLE public.farol_neurocardio ADD COLUMN IF NOT EXISTS data_nascimento DATE;
  ALTER TABLE public.farol_neurocardio ADD COLUMN IF NOT EXISTS local TEXT;
END $$;
