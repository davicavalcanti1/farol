-- Track farol patient events for metrics
CREATE TABLE public.farol_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  modality TEXT NOT NULL,
  patient_name TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('entrada','saida')),
  entry_id TEXT, -- links entrada to saida
  wait_minutes INTEGER, -- filled on saida
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.farol_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant" ON public.farol_events FOR ALL USING (tenant_id = get_user_tenant_id(auth.uid()));
