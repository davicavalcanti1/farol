// =============================================================================
// Motor de ETA por protocolo — Farol Ressonância
// =============================================================================
// Porte da lógica do farol Excel (FAROL ATENDIMENTO RM v1.6.3):
//
//   entrada estimada = agora
//                    + tempo restante de quem está EM SALA        (cursor)
//                    + Σ ciclos de quem está na frente na fila    (cumulativo)
//
//   ciclo do paciente = Σ tempo total dos protocolos dos exames dele
//                     (+ adicional *ANESTESIA quando flagado)
//
// O tempo por protocolo vem de farol_tempos_exame (editável em /farol/tempos).
// Exame sem protocolo cadastrado cai no fallback (duração média da modalidade,
// mesmo modelo do previsaoAtendimento) e entra na lista de `misses`.
//
// Semáforo da fila (mesmos thresholds do VBA AtualizarSemaforoEStatus, sobre o
// TRABALHO TOTAL pendente = cursor + Σ ciclos):
//   < 45min  → vermelho (ociosidade — máquina vai parar, puxar encaixes)
//   ≤ 1h30   → verde
//   < 2h     → amarelo
//   ≥ 2h     → vermelho (sobrecarga — ativar contingência)
// =============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hojeBRT } from "@/lib/dataBRT";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/shared/contexts/AuthContext";
import type { FarolPaciente } from "../hooks/useFarolRealtime";
import { normalizarProcedimento, type TempoExame } from "./temposExameService";

const NOME_ANESTESIA = "*ANESTESIA";
const NOME_ANESTESIA_CRITICA = "*ANESTESIA CRÍTICA";
export const SITUACAO_EM_SALA = 45;

// ── Em sala agora ─────────────────────────────────────────────────────────────

export interface EmSalaRow {
  atendimento_id: string;
  exame: string | null;
  dispensed_at: string | null;
  dispensed_outcome: string | null;
  situacao_id: number;
  anestesia?: boolean;
}

/**
 * Atendimentos da modalidade que estão EM SALA neste momento — via baixa
 * "Em Sala" do próprio Farol (dispensed_outcome) ou situação 45 vinda do
 * NetRis (sala atualizou direto lá).
 */
export function useEmSalaRm(modalidadeIds: number[], enabled: boolean) {
  const { tenant } = useAuth();
  return useQuery({
    queryKey: ["farol-em-sala", tenant?.id, modalidadeIds.join(",")],
    enabled: enabled && !!tenant?.id,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<EmSalaRow[]> => {
      const hoje = hojeBRT();
      const { data, error } = await (supabase as any)
        .from("farol_timestamps")
        .select("atendimento_id, exame, dispensed_at, dispensed_outcome, situacao_id, anestesia")
        .eq("tenant_id", tenant!.id)
        .eq("data_ref", hoje)
        .in("modalidade_id", modalidadeIds)
        .or(`dispensed_outcome.eq.em_sala,situacao_id.eq.${SITUACAO_EM_SALA}`);
      if (error) throw error;
      // Dedup (um atendimento pode satisfazer as duas condições)
      const map = new Map<string, EmSalaRow>();
      for (const r of (data ?? []) as EmSalaRow[]) map.set(r.atendimento_id, r);
      // Quem já saiu da sala (baixa final depois do em_sala) não conta
      return [...map.values()].filter(
        r => r.dispensed_outcome === "em_sala" || r.dispensed_outcome === null,
      );
    },
  });
}

// ── Cálculo puro ──────────────────────────────────────────────────────────────

export interface EtaPaciente {
  /** Duração prevista dos exames do paciente (com anestesia), em segundos */
  cicloSeg: number;
  /** Horário estimado de entrada em sala */
  entradaEstimada: Date;
  /** Algum exame do paciente caiu no fallback (sem protocolo cadastrado) */
  usouFallback: boolean;
}

export type SemaforoEstado = "ocioso" | "verde" | "amarelo" | "sobrecarga";

export interface ResultadoEtaRm {
  porChave: Map<string, EtaPaciente>;
  /** Trabalho restante de quem está em sala agora (segundos) */
  cursorSeg: number;
  /** Cursor + Σ ciclos da fila — a base do semáforo */
  trabalhoTotalSeg: number;
  semaforo: SemaforoEstado;
  /** Nomes de exames sem protocolo cadastrado (para alimentar /farol/tempos) */
  misses: string[];
  pacientesEmSala: number;
}

export function classificarSemaforo(trabalhoTotalSeg: number): SemaforoEstado {
  if (trabalhoTotalSeg < 2700) return "ocioso";      // < 45min
  if (trabalhoTotalSeg <= 5400) return "verde";      // 45min–1h30
  if (trabalhoTotalSeg < 7200) return "amarelo";     // 1h30–2h
  return "sobrecarga";                               // ≥ 2h
}

// ── Semáforo clássico do Excel (aba FAROL ATRASO) ────────────────────────────
// Limiares do VBA AjustarSemaforo (shapes GREENB/YELLOWB/REDB):
//   ≤ 1h verde · ≤ 1h40 amarelo · acima vermelho — sobre o trabalho total.
export type SemaforoExcel = "verde" | "amarelo" | "vermelho";

export function classificarSemaforoExcel(trabalhoTotalSeg: number): SemaforoExcel {
  if (trabalhoTotalSeg <= 3600) return "verde";
  if (trabalhoTotalSeg <= 6000) return "amarelo";
  return "vermelho";
}

export const SEMAFORO_EXCEL_INFO: Record<SemaforoExcel, { rotulo: string; acao: string }> = {
  verde:    { rotulo: "No ritmo",  acao: "Até 1h de trabalho pendente — fluxo saudável." },
  amarelo:  { rotulo: "Atenção",   acao: "Entre 1h e 1h40 de trabalho pendente — priorizar a fila." },
  vermelho: { rotulo: "Atrasado",  acao: "Mais de 1h40 de trabalho pendente — reforçar a etapa e avisar a recepção." },
};

export const SEMAFORO_INFO: Record<SemaforoEstado, { rotulo: string; acao: string }> = {
  ocioso:     { rotulo: "Fila curta",  acao: "Menos de 45min de exames na fila — a máquina vai ociar. Puxar encaixes e confirmar próximos agendamentos." },
  verde:      { rotulo: "Ritmo bom",   acao: "Entre 45min e 1h30 de fila — ritmo saudável de trabalho." },
  amarelo:    { rotulo: "Atenção",     acao: "Entre 1h30 e 2h de fila — monitorar e evitar encaixes novos." },
  sobrecarga: { rotulo: "Sobrecarga",  acao: "Mais de 2h de fila — avisar pacientes do atraso e acionar contingência." },
};

function construirLookup(tempos: TempoExame[]) {
  const porNorm = new Map<string, number>();
  for (const t of tempos) porNorm.set(t.procedimento_norm, t.total_seg);
  return {
    totalSeg: (nomeExame: string): number | null =>
      porNorm.get(normalizarProcedimento(nomeExame)) ?? null,
    anestesiaSeg: porNorm.get(normalizarProcedimento(NOME_ANESTESIA)) ?? 18 * 60,
    anestesiaCriticaSeg: porNorm.get(normalizarProcedimento(NOME_ANESTESIA_CRITICA)) ?? 24 * 60,
  };
}

/**
 * Calcula ciclo + entrada estimada de cada paciente na ordem da fila.
 * `pacientes` deve ser a fila COMPLETA na ordem real (sem filtros de sala),
 * senão a posição — e portanto o ETA — sai errada.
 */
export function calcularEtasRm(params: {
  pacientes: FarolPaciente[];
  tempos: TempoExame[];
  emSala: EmSalaRow[];
  fallbackMin: number;
  agora: Date;
}): ResultadoEtaRm {
  const { pacientes, tempos, emSala, fallbackMin, agora } = params;
  const lookup = construirLookup(tempos);
  const fallbackSeg = fallbackMin * 60;
  const misses = new Set<string>();

  // ── Cursor: trabalho restante de quem está em sala ─────────────────────────
  // Com dispensed_at conhecido: restante = ciclo − decorrido (nunca negativo).
  // Situação 45 vinda do NetRis sem baixa nossa não tem hora de entrada —
  // assume metade do ciclo restante (valor esperado sob incerteza uniforme).
  let cursorSeg = 0;
  for (const r of emSala) {
    let ciclo = r.exame ? lookup.totalSeg(r.exame) : null;
    if (ciclo === null) {
      if (r.exame) misses.add(r.exame);
      ciclo = fallbackSeg;
    }
    if (r.anestesia) ciclo += lookup.anestesiaSeg;
    if (r.dispensed_at) {
      const decorrido = (agora.getTime() - new Date(r.dispensed_at).getTime()) / 1000;
      cursorSeg += Math.min(Math.max(ciclo - decorrido, 0), ciclo);
    } else {
      cursorSeg += ciclo / 2;
    }
  }

  // ── Fila: soma cumulativa na ordem ──────────────────────────────────────────
  const porChave = new Map<string, EtaPaciente>();
  let acumuladoSeg = cursorSeg;
  for (const p of pacientes) {
    let cicloSeg = 0;
    let usouFallback = false;
    for (const e of p.exames) {
      const t = lookup.totalSeg(e.nome);
      if (t === null) {
        if (e.nome) misses.add(e.nome);
        cicloSeg += fallbackSeg;
        usouFallback = true;
      } else {
        cicloSeg += t;
      }
    }
    if (p.anestesia) cicloSeg += lookup.anestesiaSeg;

    porChave.set(p.chave, {
      cicloSeg,
      entradaEstimada: new Date(agora.getTime() + acumuladoSeg * 1000),
      usouFallback,
    });
    acumuladoSeg += cicloSeg;
  }

  return {
    porChave,
    cursorSeg,
    trabalhoTotalSeg: acumuladoSeg,
    semaforo: classificarSemaforo(acumuladoSeg),
    misses: [...misses].sort(),
    pacientesEmSala: emSala.length,
  };
}

// ── Toggle de anestesia ───────────────────────────────────────────────────────

export function useToggleAnestesia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ atendimentoIds, valor }: { atendimentoIds: string[]; valor: boolean }) => {
      const { error } = await (supabase as any)
        .from("farol_timestamps")
        .update({ anestesia: valor })
        .in("atendimento_id", atendimentoIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farol-timestamps"] });
      qc.invalidateQueries({ queryKey: ["farol-em-sala"] });
    },
  });
}
