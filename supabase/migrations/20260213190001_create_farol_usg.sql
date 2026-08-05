-- Create table for Farol USG (Waiting Room Beacon)
create table if not exists public.farol_usg (
    id uuid not null default gen_random_uuid(),
    created_at timestamp with time zone not null default now(),
    nome_paciente text not null,
    exame text not null,
    data_chegada timestamp with time zone not null default now(),
    status text not null default 'aguardando', -- 'aguardando', 'em_atendimento', 'finalizado'
    id_atendimento integer unique,
    tempo_espera integer default 0,
    constraint farol_usg_pkey primary key (id)
);

-- RLS Policies
alter table public.farol_usg enable row level security;

create policy "Allow public read access"
on public.farol_usg
for select
to public
using (true);

create policy "Allow authenticated insert"
on public.farol_usg
for insert
to authenticated
with check (true);

create policy "Allow authenticated update"
on public.farol_usg
for update
to authenticated
using (true);

create policy "Allow anon insert"
on public.farol_usg
for insert
to anon
with check (true);

create policy "Allow anon update"
on public.farol_usg
for update
to anon
using (true);
