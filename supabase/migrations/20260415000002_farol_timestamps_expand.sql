-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: farol_timestamps_expand
-- Data: 15/04/2026
-- Descrição: Expande farol_timestamps com todos os campos necessários para
--            renderizar o Farol sem precisar consultar o NetRis no frontend.
--            A Edge Function passa a ser a única fonte que chama o NetRis.
-- ─────────────────────────────────────────────────────────────────────────────

alter table farol_timestamps
  add column if not exists cpf             text,
  add column if not exists exame           text,
  add column if not exists medico          text,
  add column if not exists sala            text,
  add column if not exists hora_inicial_ms bigint,
  add column if not exists situacao_id     integer,
  add column if not exists situacao_nome   text,
  add column if not exists atualizado_em   timestamptz default now();

-- Índice adicional para filtro rápido por situacao_id
create index if not exists farol_timestamps_situacao_idx
  on farol_timestamps(situacao_id, data_ref);

-- Trigger para atualizar atualizado_em automaticamente em UPDATEs
create or replace function farol_timestamps_set_updated()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists farol_timestamps_updated_trigger on farol_timestamps;

create trigger farol_timestamps_updated_trigger
  before update on farol_timestamps
  for each row
  execute function farol_timestamps_set_updated();

-- Habilitar Realtime nesta tabela para o frontend receber atualizações ao vivo
alter publication supabase_realtime add table farol_timestamps;
