// Edge Function: poll-farol-timestamps
// Roda a cada 30 segundos via pg_cron.
// Consulta o NetRis e mantém farol_timestamps sincronizado — é a única fonte
// que chama o NetRis para o Farol. O frontend só lê do Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Inclui agendados (2 = A_CONFIRMAR, 3 = CONFIRMADO) pra que a Fila do
// Assistente de Sala consiga mostrar os pacientes que "ainda vão chegar".
// Mantém CHEGOU + pipeline Farol (10/11/13/61/62/63/64).
const SITUACOES_RELEVANTES = [2, 3, 10, 11, 13, 61, 62, 63, 64];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Preflight CORS — browser envia OPTIONS antes da requisição real
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const supabaseUrl   = Deno.env.get("SUPABASE_URL")!;
  const serviceKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const netrisBase    = Deno.env.get("NETRIS_BASE_URL")!;
  const netrisToken   = Deno.env.get("NETRIS_TOKEN")!;
  const netrisFilial  = Deno.env.get("NETRIS_FILIAL_ID") ?? "1";
  const tenantSlug    = Deno.env.get("TENANT_SLUG") ?? "imago";

  const supabase = createClient(supabaseUrl, serviceKey);

  // Busca o tenant pelo slug (env var) ou, se não encontrar, pega o primeiro ativo.
  // Evita tenant_id = null nos registros, que bloqueia a RLS no frontend.
  let tenantId: string | null = null;
  if (tenantSlug) {
    const { data: bySlug } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("is_active", true)
      .maybeSingle();
    tenantId = bySlug?.id ?? null;
  }
  if (!tenantId) {
    const { data: first } = await supabase
      .from("tenants")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    tenantId = first?.id ?? null;
  }

  // Data de hoje em BRT (UTC-3) — a clínica opera em fuso de Brasília
  // Deno roda em UTC, precisamos converter para não pegar "amanhã" à noite.
  const utcNow  = new Date();
  const brt     = new Date(utcNow.getTime() - 3 * 60 * 60 * 1000);
  const dd      = String(brt.getUTCDate()).padStart(2, "0");
  const mm      = String(brt.getUTCMonth() + 1).padStart(2, "0");
  const yyyy    = brt.getUTCFullYear();
  const hojeISO = `${yyyy}-${mm}-${dd}`;
  const hojeBR  = `${dd}/${mm}/${yyyy}`;

  // Busca paginada de todos os atendimentos de hoje.
  // Em 23/mai/2026 detectamos um modo de falha: se a primeira página retornar
  // erro HTTP, o loop antigo só dava `break` e seguia com `todos = []`. A etapa
  // de limpeza abaixo interpretava isso como "ninguém mais na fila" e DELETAVA
  // todas as linhas de hoje em farol_timestamps. O próximo poll bem-sucedido
  // recadastrava todo mundo com `primeira_vez = agoraIso` no mesmo segundo,
  // fazendo o Farol mostrar o mesmo "tempo de espera" pra todos os pacientes.
  // Agora abortamos o run inteiro se o NetRis falhou ou não respondeu nada.
  const todos: Record<string, unknown>[] = [];
  let netrisFetchFailed = false;
  for (let page = 1; page <= 50; page++) {
    const url = `${netrisBase}/netris/api/atendimentos?filialId=${netrisFilial}&limit=100&page=${page}&dataInicial=${hojeBR}&dataFinal=${hojeBR}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: netrisToken } });
    } catch (_e) {
      // Erro de rede / fetch joga: trata como falha de fetch para abortar.
      netrisFetchFailed = page === 1; // só aborta se nem a página 1 voltou
      break;
    }
    if (!res.ok) {
      netrisFetchFailed = page === 1;
      break;
    }
    const data = await res.json();
    const rows: Record<string, unknown>[] = Array.isArray(data) ? data : [];
    todos.push(...rows);
    if (rows.length < 100) break;
  }

  if (netrisFetchFailed) {
    return new Response(
      JSON.stringify({
        ok:      false,
        skipped: "netris_fetch_failed_page_1",
        message: "NetRis indisponível na primeira página — abortado pra não esvaziar farol_timestamps.",
      }),
      { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // Filtra situações relevantes para o Farol
  const relevantes = todos.filter(r =>
    SITUACOES_RELEVANTES.includes(r.idSituacao as number)
  );

  const idsAtivosSet = new Set(relevantes.map(r => String(r.idAtendimentoProcedimento)));

  // ── 1. Remover do banco:
  //    (a) rows de dias anteriores (órfãos de virada de dia)
  //    (b) rows de hoje cujos atendimentos saíram da fila no NetRis ─────────────
  let removidos = 0;

  // (a) Limpeza de dias anteriores
  {
    const { error, count } = await supabase
      .from("farol_timestamps")
      .delete({ count: "exact" })
      .lt("data_ref", hojeISO);
    if (!error) removidos += count ?? 0;
  }

  // (b) Limpeza de hoje: remover quem não está mais na fila ativa
  const { data: idsHoje } = await supabase
    .from("farol_timestamps")
    .select("atendimento_id")
    .eq("data_ref", hojeISO);

  // Sanity check: se tem gente registrada hoje mas o NetRis devolveu lista
  // completamente vazia (todos.length === 0), aborta antes de deletar. A
  // clínica não esvazia inteira de um run pro outro; é sinal de resposta
  // truncada/bug do NetRis. Sem essa proteção, o run seguinte recadastra
  // todo mundo com primeira_vez idêntica (regressão de 23/mai/2026).
  if ((idsHoje?.length ?? 0) > 0 && todos.length === 0) {
    return new Response(
      JSON.stringify({
        ok:           false,
        skipped:      "netris_returned_empty_but_db_has_today_rows",
        idsHojeCount: idsHoje?.length ?? 0,
        message:      "NetRis devolveu 0 atendimentos mas o banco tem linhas de hoje — abortado pra evitar wipe.",
      }),
      { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const idsParaRemover = (idsHoje ?? [])
    .map((r: any) => r.atendimento_id)
    .filter((id: string) => !idsAtivosSet.has(id));

  if (idsParaRemover.length > 0) {
    const { error, count } = await supabase
      .from("farol_timestamps")
      .delete({ count: "exact" })
      .in("atendimento_id", idsParaRemover);
    if (!error) removidos += count ?? idsParaRemover.length;
  }

  // ── 2. Buscar TODOS os campos dos registros que já existem ──────────────────
  // Usado pra (a) preservar primeira_vez, (b) detectar transição agendado→ativo,
  // (c) detectar quais linhas REALMENTE mudaram pra evitar UPSERT no-op — cada
  // upsert dispara WAL → Realtime → mensagem × subscribers conectados, mesmo
  // quando o conteúdo é idêntico. Em 22/mai/2026 o consumo de Realtime estourou
  // 78% do limite mensal porque a edge function reescreve ~100 linhas a cada
  // 30s, multiplicado por ~7 subscribers = ~26M msgs/mês teórico.
  const idsAtivos = Array.from(idsAtivosSet);
  type ExistenteRow = {
    primeira_vez:       string;
    situacao_id:        number;
    nome_paciente:      string | null;
    cpf:                string | null;
    modalidade_id:      number | null;
    exame:              string | null;
    medico:             string | null;
    sala:               string | null;
    hora_inicial_ms:    number | null;
    situacao_nome:      string | null;
    data_ref:           string | null;
    telefone:           string | null;
    data_nascimento:    string | null;
    convenio:           string | null;
    valor_procedimento: number | null;
  };
  let existentesMap = new Map<string, ExistenteRow>();

  if (idsAtivos.length > 0) {
    const { data: existentes } = await supabase
      .from("farol_timestamps")
      .select("atendimento_id, primeira_vez, situacao_id, nome_paciente, cpf, modalidade_id, exame, medico, sala, hora_inicial_ms, situacao_nome, data_ref, telefone, data_nascimento, convenio, valor_procedimento")
      .in("atendimento_id", idsAtivos);

    for (const e of existentes ?? []) {
      existentesMap.set(e.atendimento_id as string, {
        primeira_vez:       e.primeira_vez       as string,
        situacao_id:        e.situacao_id        as number,
        nome_paciente:      (e.nome_paciente      as string | null) ?? null,
        cpf:                (e.cpf                as string | null) ?? null,
        modalidade_id:      (e.modalidade_id      as number | null) ?? null,
        exame:              (e.exame              as string | null) ?? null,
        medico:             (e.medico             as string | null) ?? null,
        sala:               (e.sala               as string | null) ?? null,
        hora_inicial_ms:    (e.hora_inicial_ms    as number | null) ?? null,
        situacao_nome:      (e.situacao_nome      as string | null) ?? null,
        data_ref:           (e.data_ref           as string | null) ?? null,
        telefone:           (e.telefone           as string | null) ?? null,
        data_nascimento:    (e.data_nascimento    as string | null) ?? null,
        convenio:           (e.convenio           as string | null) ?? null,
        valor_procedimento: (e.valor_procedimento as number | null) ?? null,
      });
    }
  }

  // ── 3. Upsert: preserva primeira_vez de existentes, atualiza outros campos ──
  const agoraIso = new Date().toISOString();

  // Entre 00:00 e 05:00 BRT a clínica está fechada, mas o cron já virou a data.
  // Nesse janela, não criamos registros NOVOS (primeira_vez nova) para evitar que
  // pacientes de amanhã entrem no farol com timestamp de meia-noite.
  // Registros que já existem no banco são preservados normalmente.
  const brtHora = brt.getUTCHours(); // brt já é UTC-3
  const clinicaAberta = brtHora >= 5;

  // Estados que representam paciente efetivamente presente na fila (chegou/em exame).
  // Estados 2/3 (agendado/confirmado) não contam como "entrou na fila".
  const SITUACOES_ATIVAS = new Set([10, 11, 13, 61, 62, 63, 64]);

  const registrosBrutos = relevantes.map(r => {
    const id = String(r.idAtendimentoProcedimento);
    const existente = existentesMap.get(id);
    const jaExiste  = !!existente;
    if (!clinicaAberta && !jaExiste) return null;

    const situacaoAtual = Number(r.idSituacao ?? 0);

    // primeira_vez só é carimbada quando o paciente entra na pipeline ativa (10+).
    // Se o registro existia em estado 2/3 e agora o paciente chegou (10+), reseta
    // para o momento atual — eliminando o timestamp falso da madrugada.
    let primeiraVez: string;
    if (existente && SITUACOES_ATIVAS.has(existente.situacao_id)) {
      // Já estava na pipeline ativa — preserva o horário de chegada original.
      primeiraVez = existente.primeira_vez;
    } else if (SITUACOES_ATIVAS.has(situacaoAtual)) {
      // Primeira vez na pipeline ativa (novo ou transitando de 2/3) — carimba agora.
      primeiraVez = agoraIso;
    } else {
      // Ainda agendado (2/3) — guarda timestamp mas não é exibido como "tempo na fila".
      primeiraVez = existente?.primeira_vez ?? agoraIso;
    }

    // dataNascimento vem em ms epoch; converte pra YYYY-MM-DD (DATE no Postgres)
    const nascMs = typeof r.dataNascimento === "number" ? r.dataNascimento : null;
    const dataNascimento = nascMs ? new Date(nascMs).toISOString().slice(0, 10) : null;
    return {
      atendimento_id:     id,
      tenant_id:          tenantId,
      nome_paciente:      String(r.nomePaciente ?? ""),
      cpf:                String(r.cpf ?? "") || null,
      modalidade_id:      Number(r.idModalidade ?? 0),
      exame:              String(r.nomeProcedimento ?? "") || null,
      medico:             String(r.nomeMedicoExecutor ?? "") || null,
      sala:               String(r.nomeSala ?? "") || null,
      hora_inicial_ms:    typeof r.horaInicial === "number" && r.horaInicial > 0 ? r.horaInicial : null,
      situacao_id:        situacaoAtual,
      situacao_nome:      String(r.nomeSituacaoSistema ?? r.nomeSituacao ?? "") || null,
      primeira_vez:       primeiraVez,
      data_ref:           hojeISO,
      telefone:           String(r.telefoneCelularPaciente ?? r.telefonePaciente ?? "") || null,
      data_nascimento:    dataNascimento,
      convenio:           String(r.nomeConvenio ?? "") || null,
      valor_procedimento: typeof r.valorProcedimento === "number" ? r.valorProcedimento : null,
    };
  });
  const registros = registrosBrutos.filter((r): r is NonNullable<typeof r> => r !== null);

  // ── Diff: separar inserts (novos) de updates reais (algum campo mudou) ──────
  // Postgres reescreve a linha em todo UPSERT (mesmo que conteúdo seja idêntico)
  // → WAL → Realtime entrega pra cada subscriber. Filtrar aqui corta ~95% das
  // mensagens em poll comum (só 1-5% das linhas mudam por iteração de 30-120s).
  const COLS_COMPARADAS = [
    "tenant_id", "nome_paciente", "cpf", "modalidade_id", "exame",
    "medico", "sala", "hora_inicial_ms", "situacao_id", "situacao_nome",
    "primeira_vez", "data_ref", "telefone", "data_nascimento", "convenio",
    "valor_procedimento",
  ] as const;

  const paraUpsert = registros.filter(r => {
    const existente = existentesMap.get(r.atendimento_id);
    if (!existente) return true;  // INSERT — não existe, precisa entrar
    // UPDATE — só se algum campo comparável é diferente
    return COLS_COMPARADAS.some(col => {
      const novo  = (r as any)[col];
      const atual = (existente as any)[col];
      return novo !== atual;
    });
  });

  let upsertados = 0;
  let skippedNoChange = registros.length - paraUpsert.length;
  if (paraUpsert.length > 0) {
    const { error, count } = await supabase
      .from("farol_timestamps")
      .upsert(paraUpsert, { onConflict: "atendimento_id", count: "exact" });
    if (!error) upsertados = count ?? paraUpsert.length;
  }

  // ── 4. farol_historico — acumula tudo, nunca apaga ───────────────────────
  // Upsert preservando primeira_vez já registrada; atualiza situação e ultima_vez.
  if (registros.length > 0) {
    const historico = registros.map(r => ({
      atendimento_id:      r.atendimento_id,
      tenant_id:           r.tenant_id,
      data_ref:            r.data_ref,
      nome_paciente:       r.nome_paciente,
      cpf:                 r.cpf,
      modalidade_id:       r.modalidade_id,
      exame:               r.exame,
      medico:              r.medico,
      sala:                r.sala,
      hora_inicial_ms:     r.hora_inicial_ms,
      situacao_id_final:   r.situacao_id,
      situacao_nome_final: r.situacao_nome,
      primeira_vez:        r.primeira_vez,
      ultima_vez:          agoraIso,
    }));
    await supabase
      .from("farol_historico")
      .upsert(historico, {
        onConflict:      "atendimento_id,data_ref",
        ignoreDuplicates: false,
      });
  }

  // ── 5. Registra pacientes que saíram da fila no histórico (situação final) ─
  // Quando um paciente sai de farol_timestamps (exame concluído, etc.),
  // buscamos seu registro no NetRis para saber a situação final.
  if (idsParaRemover.length > 0) {
    const saidosNetris = todos.filter(r =>
      idsParaRemover.includes(String(r.idAtendimentoProcedimento))
    );
    if (saidosNetris.length > 0) {
      const historicoPatch = saidosNetris.map(r => ({
        atendimento_id:      String(r.idAtendimentoProcedimento),
        tenant_id:           tenantId,
        data_ref:            hojeISO,
        nome_paciente:       String(r.nomePaciente ?? ""),
        cpf:                 String(r.cpf ?? "") || null,
        modalidade_id:       Number(r.idModalidade ?? 0),
        exame:               String(r.nomeProcedimento ?? "") || null,
        medico:              String(r.nomeMedicoExecutor ?? "") || null,
        sala:                String(r.nomeSala ?? "") || null,
        hora_inicial_ms:     typeof r.horaInicial === "number" && r.horaInicial > 0 ? r.horaInicial : null,
        situacao_id_final:   Number(r.idSituacao ?? 0),
        situacao_nome_final: String(r.nomeSituacaoSistema ?? r.nomeSituacao ?? "") || null,
        primeira_vez:        null, // preservado pelo UPSERT se já existir
        ultima_vez:          agoraIso,
      }));
      await supabase
        .from("farol_historico")
        .upsert(historicoPatch, {
          onConflict:       "atendimento_id,data_ref",
          ignoreDuplicates: false,
        });
    }
  }

  return new Response(
    JSON.stringify({
      ok:                  true,
      total_netris:        todos.length,
      relevantes:          relevantes.length,
      upsertados,
      skipped_no_change:   skippedNoChange,
      removidos,
      timestamp:           agoraIso,
    }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});
