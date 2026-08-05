-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: farol_relatorios_permissions
-- Data: 20/04/2026
-- Descrição: Permissões para os novos itens de sidebar:
--   - farol_relatorios     → /farol/relatorios (heatmap de ocupação)
--   - relatorios_medicos   → /farol/relatorios-medicos (breakdown por médico)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO role_permissions (role_name, module, sub_module, can_view, can_create, can_edit, can_delete) VALUES
  ('admin',      'farol_relatorios',    '', true, false, false, false),
  ('supervisor', 'farol_relatorios',    '', true, false, false, false),
  ('admin',      'relatorios_medicos',  '', true, false, false, false),
  ('supervisor', 'relatorios_medicos',  '', true, false, false, false),
  ('admin',      'dashboard',           '', true, false, false, false),
  ('supervisor', 'dashboard',           '', true, false, false, false)
ON CONFLICT DO NOTHING;
