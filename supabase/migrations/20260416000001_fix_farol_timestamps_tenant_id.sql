-- Corrige registros de farol_timestamps que ficaram com tenant_id = null
-- porque o secret TENANT_SLUG não estava configurado na Edge Function.
-- Atribui o primeiro tenant ativo para todos os registros sem tenant.

UPDATE farol_timestamps
SET tenant_id = (
  SELECT id FROM tenants WHERE is_active = true LIMIT 1
)
WHERE tenant_id IS NULL;
