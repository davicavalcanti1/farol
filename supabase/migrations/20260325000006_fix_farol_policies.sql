-- Apply same open policies as farol_usg to all other farol tables
-- farol_usg uses: SELECT to public USING (true) + auth/anon insert/update

-- ── farol_ressonancia ────────────────────────────────────────────────────
ALTER TABLE public.farol_ressonancia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "farol_ressonancia_tenant" ON public.farol_ressonancia;
CREATE POLICY "farol_ressonancia_select"      ON public.farol_ressonancia FOR SELECT TO public      USING (true);
CREATE POLICY "farol_ressonancia_insert_auth" ON public.farol_ressonancia FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "farol_ressonancia_update_auth" ON public.farol_ressonancia FOR UPDATE TO authenticated USING (true);
CREATE POLICY "farol_ressonancia_insert_anon" ON public.farol_ressonancia FOR INSERT TO anon         WITH CHECK (true);
CREATE POLICY "farol_ressonancia_update_anon" ON public.farol_ressonancia FOR UPDATE TO anon         USING (true);

-- ── farol_ecocardiograma ─────────────────────────────────────────────────
ALTER TABLE public.farol_ecocardiograma ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "farol_ecocardiograma_tenant" ON public.farol_ecocardiograma;
CREATE POLICY "farol_ecocardiograma_select"      ON public.farol_ecocardiograma FOR SELECT TO public      USING (true);
CREATE POLICY "farol_ecocardiograma_insert_auth" ON public.farol_ecocardiograma FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "farol_ecocardiograma_update_auth" ON public.farol_ecocardiograma FOR UPDATE TO authenticated USING (true);
CREATE POLICY "farol_ecocardiograma_insert_anon" ON public.farol_ecocardiograma FOR INSERT TO anon         WITH CHECK (true);
CREATE POLICY "farol_ecocardiograma_update_anon" ON public.farol_ecocardiograma FOR UPDATE TO anon         USING (true);

-- ── farol_neurocardio ────────────────────────────────────────────────────
ALTER TABLE public.farol_neurocardio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "farol_neurocardio_tenant" ON public.farol_neurocardio;
CREATE POLICY "farol_neurocardio_select"      ON public.farol_neurocardio FOR SELECT TO public      USING (true);
CREATE POLICY "farol_neurocardio_insert_auth" ON public.farol_neurocardio FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "farol_neurocardio_update_auth" ON public.farol_neurocardio FOR UPDATE TO authenticated USING (true);
CREATE POLICY "farol_neurocardio_insert_anon" ON public.farol_neurocardio FOR INSERT TO anon         WITH CHECK (true);
CREATE POLICY "farol_neurocardio_update_anon" ON public.farol_neurocardio FOR UPDATE TO anon         USING (true);

-- ── Ensure existing modality tables also have RLS + open policies ────────
-- (radioterapia, tomografia, mamografia, densitometria)
-- These may currently be unrestricted in the dashboard — enforce same as usg

ALTER TABLE public.farol_radioterapia  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farol_tomografia    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farol_mamografia    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farol_densitometria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farol_radioterapia_select"      ON public.farol_radioterapia;
DROP POLICY IF EXISTS "farol_radioterapia_insert_auth" ON public.farol_radioterapia;
DROP POLICY IF EXISTS "farol_radioterapia_update_auth" ON public.farol_radioterapia;
DROP POLICY IF EXISTS "farol_radioterapia_insert_anon" ON public.farol_radioterapia;
DROP POLICY IF EXISTS "farol_radioterapia_update_anon" ON public.farol_radioterapia;
CREATE POLICY "farol_radioterapia_select"      ON public.farol_radioterapia FOR SELECT TO public      USING (true);
CREATE POLICY "farol_radioterapia_insert_auth" ON public.farol_radioterapia FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "farol_radioterapia_update_auth" ON public.farol_radioterapia FOR UPDATE TO authenticated USING (true);
CREATE POLICY "farol_radioterapia_insert_anon" ON public.farol_radioterapia FOR INSERT TO anon         WITH CHECK (true);
CREATE POLICY "farol_radioterapia_update_anon" ON public.farol_radioterapia FOR UPDATE TO anon         USING (true);

DROP POLICY IF EXISTS "farol_tomografia_select"      ON public.farol_tomografia;
DROP POLICY IF EXISTS "farol_tomografia_insert_auth" ON public.farol_tomografia;
DROP POLICY IF EXISTS "farol_tomografia_update_auth" ON public.farol_tomografia;
DROP POLICY IF EXISTS "farol_tomografia_insert_anon" ON public.farol_tomografia;
DROP POLICY IF EXISTS "farol_tomografia_update_anon" ON public.farol_tomografia;
CREATE POLICY "farol_tomografia_select"      ON public.farol_tomografia FOR SELECT TO public      USING (true);
CREATE POLICY "farol_tomografia_insert_auth" ON public.farol_tomografia FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "farol_tomografia_update_auth" ON public.farol_tomografia FOR UPDATE TO authenticated USING (true);
CREATE POLICY "farol_tomografia_insert_anon" ON public.farol_tomografia FOR INSERT TO anon         WITH CHECK (true);
CREATE POLICY "farol_tomografia_update_anon" ON public.farol_tomografia FOR UPDATE TO anon         USING (true);

DROP POLICY IF EXISTS "farol_mamografia_select"      ON public.farol_mamografia;
DROP POLICY IF EXISTS "farol_mamografia_insert_auth" ON public.farol_mamografia;
DROP POLICY IF EXISTS "farol_mamografia_update_auth" ON public.farol_mamografia;
DROP POLICY IF EXISTS "farol_mamografia_insert_anon" ON public.farol_mamografia;
DROP POLICY IF EXISTS "farol_mamografia_update_anon" ON public.farol_mamografia;
CREATE POLICY "farol_mamografia_select"      ON public.farol_mamografia FOR SELECT TO public      USING (true);
CREATE POLICY "farol_mamografia_insert_auth" ON public.farol_mamografia FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "farol_mamografia_update_auth" ON public.farol_mamografia FOR UPDATE TO authenticated USING (true);
CREATE POLICY "farol_mamografia_insert_anon" ON public.farol_mamografia FOR INSERT TO anon         WITH CHECK (true);
CREATE POLICY "farol_mamografia_update_anon" ON public.farol_mamografia FOR UPDATE TO anon         USING (true);

DROP POLICY IF EXISTS "farol_densitometria_select"      ON public.farol_densitometria;
DROP POLICY IF EXISTS "farol_densitometria_insert_auth" ON public.farol_densitometria;
DROP POLICY IF EXISTS "farol_densitometria_update_auth" ON public.farol_densitometria;
DROP POLICY IF EXISTS "farol_densitometria_insert_anon" ON public.farol_densitometria;
DROP POLICY IF EXISTS "farol_densitometria_update_anon" ON public.farol_densitometria;
CREATE POLICY "farol_densitometria_select"      ON public.farol_densitometria FOR SELECT TO public      USING (true);
CREATE POLICY "farol_densitometria_insert_auth" ON public.farol_densitometria FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "farol_densitometria_update_auth" ON public.farol_densitometria FOR UPDATE TO authenticated USING (true);
CREATE POLICY "farol_densitometria_insert_anon" ON public.farol_densitometria FOR INSERT TO anon         WITH CHECK (true);
CREATE POLICY "farol_densitometria_update_anon" ON public.farol_densitometria FOR UPDATE TO anon         USING (true);
