-- Create farol tables for remaining modalities (same structure as farol_usg)

CREATE TABLE IF NOT EXISTS public.farol_radioterapia (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    nome_paciente text NOT NULL,
    exame text NOT NULL,
    data_chegada timestamp with time zone NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'aguardando',
    id_atendimento integer UNIQUE,
    tempo_espera integer DEFAULT 0,
    medico text,
    sala text,
    horario_agendamento timestamp with time zone,
    CONSTRAINT farol_radioterapia_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.farol_tomografia (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    nome_paciente text NOT NULL,
    exame text NOT NULL,
    data_chegada timestamp with time zone NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'aguardando',
    id_atendimento integer UNIQUE,
    tempo_espera integer DEFAULT 0,
    medico text,
    sala text,
    horario_agendamento timestamp with time zone,
    CONSTRAINT farol_tomografia_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.farol_mamografia (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    nome_paciente text NOT NULL,
    exame text NOT NULL,
    data_chegada timestamp with time zone NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'aguardando',
    id_atendimento integer UNIQUE,
    tempo_espera integer DEFAULT 0,
    medico text,
    sala text,
    horario_agendamento timestamp with time zone,
    CONSTRAINT farol_mamografia_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.farol_densitometria (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    nome_paciente text NOT NULL,
    exame text NOT NULL,
    data_chegada timestamp with time zone NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'aguardando',
    id_atendimento integer UNIQUE,
    tempo_espera integer DEFAULT 0,
    medico text,
    sala text,
    horario_agendamento timestamp with time zone,
    CONSTRAINT farol_densitometria_pkey PRIMARY KEY (id)
);

-- RLS for all new farol tables
ALTER TABLE public.farol_radioterapia  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farol_tomografia    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farol_mamografia    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farol_densitometria ENABLE ROW LEVEL SECURITY;

-- farol_radioterapia policies
CREATE POLICY "farol_radioterapia_select" ON public.farol_radioterapia FOR SELECT TO public USING (true);
CREATE POLICY "farol_radioterapia_insert_auth" ON public.farol_radioterapia FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "farol_radioterapia_update_auth" ON public.farol_radioterapia FOR UPDATE TO authenticated USING (true);
CREATE POLICY "farol_radioterapia_insert_anon" ON public.farol_radioterapia FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "farol_radioterapia_update_anon" ON public.farol_radioterapia FOR UPDATE TO anon USING (true);

-- farol_tomografia policies
CREATE POLICY "farol_tomografia_select" ON public.farol_tomografia FOR SELECT TO public USING (true);
CREATE POLICY "farol_tomografia_insert_auth" ON public.farol_tomografia FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "farol_tomografia_update_auth" ON public.farol_tomografia FOR UPDATE TO authenticated USING (true);
CREATE POLICY "farol_tomografia_insert_anon" ON public.farol_tomografia FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "farol_tomografia_update_anon" ON public.farol_tomografia FOR UPDATE TO anon USING (true);

-- farol_mamografia policies
CREATE POLICY "farol_mamografia_select" ON public.farol_mamografia FOR SELECT TO public USING (true);
CREATE POLICY "farol_mamografia_insert_auth" ON public.farol_mamografia FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "farol_mamografia_update_auth" ON public.farol_mamografia FOR UPDATE TO authenticated USING (true);
CREATE POLICY "farol_mamografia_insert_anon" ON public.farol_mamografia FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "farol_mamografia_update_anon" ON public.farol_mamografia FOR UPDATE TO anon USING (true);

-- farol_densitometria policies
CREATE POLICY "farol_densitometria_select" ON public.farol_densitometria FOR SELECT TO public USING (true);
CREATE POLICY "farol_densitometria_insert_auth" ON public.farol_densitometria FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "farol_densitometria_update_auth" ON public.farol_densitometria FOR UPDATE TO authenticated USING (true);
CREATE POLICY "farol_densitometria_insert_anon" ON public.farol_densitometria FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "farol_densitometria_update_anon" ON public.farol_densitometria FOR UPDATE TO anon USING (true);
