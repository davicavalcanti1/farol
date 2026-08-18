// =============================================================================
// Status "AGENDADO X AGORA" — coluna F do farol Excel
// =============================================================================
// Porte literal da fórmula da célula F3 da aba FAROL ATEND
// (RM - FAROL ATENDIMENTO RM v1.6.3.xlsm), que compara o horário agendado do
// paciente (coluna A) com a hora atual (W$1), em minutos:
//
//   (agendado − agora) ≥ 60   → "Muito Adiantado"
//   (agendado − agora) > 0    → "Adiantado"
//   (agendado − agora) = 0    → "Pontual"
//   (agora − agendado) < 45   → "Dentro do Prazo"
//   (agora − agendado) < 90   → "Atrasado"
//   caso contrário            → "Extremamente Atrasado"
//
// Os rótulos são os da planilha, na letra: a recepção já fala nesses termos no
// grupo do WhatsApp, e renomear aqui obrigaria todo mundo a traduzir.
//
// Note que "Adiantado" descreve o PACIENTE, não a clínica: o horário dele ainda
// está no futuro, ou seja, ele chegou antes da hora. Não é elogio ao fluxo.
// =============================================================================

export type StatusAgendado =
  | "muito_adiantado"
  | "adiantado"
  | "pontual"
  | "dentro_do_prazo"
  | "atrasado"
  | "extremamente_atrasado";

export interface StatusAgendadoInfo {
  /** Rótulo exato da planilha */
  rotulo: string;
  /** Classes do chip (tema-aware, via tokens do design core) */
  chip: string;
  /** Forma curta para telas estreitas */
  curto: string;
}

export const STATUS_AGENDADO_INFO: Record<StatusAgendado, StatusAgendadoInfo> = {
  muito_adiantado: {
    rotulo: "Muito Adiantado",
    curto:  "M. adiant.",
    chip:   "bg-sky-50 text-sky-700 border-sky-200",
  },
  adiantado: {
    rotulo: "Adiantado",
    curto:  "Adiant.",
    chip:   "bg-sky-50 text-sky-600 border-sky-100",
  },
  pontual: {
    rotulo: "Pontual",
    curto:  "Pontual",
    chip:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  dentro_do_prazo: {
    rotulo: "Dentro do Prazo",
    curto:  "No prazo",
    chip:   "bg-green-50 text-green-700 border-green-200",
  },
  atrasado: {
    rotulo: "Atrasado",
    curto:  "Atrasado",
    chip:   "bg-yellow-50 text-yellow-800 border-yellow-300",
  },
  extremamente_atrasado: {
    rotulo: "Extremamente Atrasado",
    curto:  "Ext. atras.",
    chip:   "bg-red-50 text-red-700 border-red-300",
  },
};

/** "HH:MM" (ou "HH:MM:SS") → minutos desde a meia-noite. null se não parsear. */
export function horarioParaMinutos(horario: string | null | undefined): number | null {
  if (!horario) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(horario.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Classifica o paciente pelo horário agendado contra `agora`.
 * Devolve `null` quando não há horário agendado — a planilha também deixava a
 * célula vazia nesse caso (o IFERROR/ISNUMBER externo da fórmula F).
 */
export function classificarStatusAgendado(
  horarioAgendado: string | null | undefined,
  agora: Date,
): StatusAgendado | null {
  const agendadoMin = horarioParaMinutos(horarioAgendado);
  if (agendadoMin === null) return null;

  const agoraMin = agora.getHours() * 60 + agora.getMinutes();
  const diff = agendadoMin - agoraMin; // > 0 = horário ainda no futuro

  if (diff >= 60) return "muito_adiantado";
  if (diff > 0) return "adiantado";
  if (diff === 0) return "pontual";
  if (-diff < 45) return "dentro_do_prazo";
  if (-diff < 90) return "atrasado";
  return "extremamente_atrasado";
}

// =============================================================================
// Previsão × agendado — coloração de AnalisarHorarios
// =============================================================================
// A macro AnalisarHorarios (módulo AttFAROLECOPIAR.bas) pintava a coluna H
// (horário de entrada estimado) comparando-a com a coluna A (agendado):
//
//   H ≤ A          → verde escuro  (no horário ou adiantado)
//   H − A ≤ 1h30   → verde         (dentro do prazo)
//   H − A ≤ 2h     → amarelo       (alerta)
//   acima          → vermelho      (atrasado)
//
// É outra pergunta que o status da coluna F: aquele diz se o PACIENTE chegou
// antes ou depois da hora dele; este diz se a FILA vai conseguir atendê-lo perto
// do horário marcado. Um paciente pode estar "Muito Adiantado" e ainda assim ter
// previsão vermelha, se a fila na frente dele estourou.
// =============================================================================

export type PrevisaoVsAgendado = "adiantado" | "no_prazo" | "alerta" | "atrasado";

export const PREVISAO_INFO: Record<PrevisaoVsAgendado, { chip: string; titulo: string }> = {
  adiantado: {
    chip:   "bg-green-700 text-white border-green-800 font-bold",
    titulo: "Previsão no horário ou antes do agendado",
  },
  no_prazo: {
    chip:   "bg-green-100 text-green-800 border-green-300",
    titulo: "Previsão até 1h30 depois do agendado",
  },
  alerta: {
    chip:   "bg-yellow-100 text-yellow-900 border-yellow-400",
    titulo: "Previsão entre 1h30 e 2h depois do agendado",
  },
  atrasado: {
    chip:   "bg-red-600 text-white border-red-700 font-bold",
    titulo: "Previsão mais de 2h depois do agendado",
  },
};

/**
 * Compara a entrada estimada com o horário agendado. `null` sem horário
 * agendado — sem referência, não há o que classificar.
 */
export function classificarPrevisaoVsAgendado(
  entradaEstimada: Date,
  horarioAgendado: string | null | undefined,
): PrevisaoVsAgendado | null {
  const agendadoMin = horarioParaMinutos(horarioAgendado);
  if (agendadoMin === null) return null;

  const previstoMin = entradaEstimada.getHours() * 60 + entradaEstimada.getMinutes();
  const diff = previstoMin - agendadoMin;

  if (diff <= 0) return "adiantado";
  if (diff <= 90) return "no_prazo";
  if (diff <= 120) return "alerta";
  return "atrasado";
}
