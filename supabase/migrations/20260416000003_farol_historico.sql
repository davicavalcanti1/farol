-- Histórico acumulativo do Farol — nunca apaga, um registro por paciente×dia
create table if not exists public.farol_historico (
  id                  uuid primary key default gen_random_uuid(),
  atendimento_id      text    not null,
  tenant_id           uuid    not null references public.tenants(id) on delete cascade,
  data_ref            date    not null,
  nome_paciente       text,
  cpf                 text,
  modalidade_id       integer,
  exame               text,
  medico              text,
  sala                text,
  hora_inicial_ms     bigint,           -- ms desde meia-noite (horário agendado)
  situacao_id_final   integer,          -- última situação conhecida do dia
  situacao_nome_final text,
  primeira_vez        timestamptz,      -- quando entrou no farol pela 1ª vez
  ultima_vez          timestamptz,      -- última vez que o poll viu o paciente
  unique (atendimento_id, data_ref)
);

alter table public.farol_historico enable row level security;

create policy "farol_historico_tenant"
  on public.farol_historico for all
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));

-- Índices para queries do dashboard
create index if not exists farol_historico_tenant_data on public.farol_historico (tenant_id, data_ref);
create index if not exists farol_historico_data        on public.farol_historico (data_ref);
create index if not exists farol_historico_modalidade  on public.farol_historico (modalidade_id, data_ref);
