ALTER TABLE public.farol_radioterapia RENAME TO farol_radiografia;

-- Recreate view with new table name
CREATE OR REPLACE VIEW public.farol_all_active AS
  SELECT nome_paciente, 'USG'             AS modality FROM public.farol_usg            WHERE true
  UNION ALL
  SELECT nome_paciente, 'Tomografia'      FROM public.farol_tomografia                  WHERE true
  UNION ALL
  SELECT nome_paciente, 'Mamografia'      FROM public.farol_mamografia                  WHERE true
  UNION ALL
  SELECT nome_paciente, 'Densitometria'   FROM public.farol_densitometria               WHERE true
  UNION ALL
  SELECT nome_paciente, 'Radiografia'     FROM public.farol_radiografia                 WHERE true
  UNION ALL
  SELECT nome_paciente, 'Ressonância'     FROM public.farol_ressonancia                 WHERE true
  UNION ALL
  SELECT nome_paciente, 'Ecocardiograma'  FROM public.farol_ecocardiograma              WHERE true
  UNION ALL
  SELECT nome_paciente, exame             FROM public.farol_neurocardio                 WHERE true;

GRANT SELECT ON public.farol_all_active TO authenticated, anon;
