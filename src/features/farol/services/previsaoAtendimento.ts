// =============================================================================
// Previsão de horário de atendimento
// =============================================================================
// Estima ETA (tempo estimado de chamada) para cada paciente na fila do Farol.
//
// Estratégia:
// 1. Lê os últimos 30 dias de `historico_atendimentos` para uma modalidade.
// 2. Calcula throughput médio: realizados / dias úteis.
// 3. Assume jornada típica de 10h operacionais.
// 4. Duração média por exame = 10h / (realizados_por_dia).
// 5. ETA(posicao) = agora + (posicao + 1) * duracao_media + fator_dia_da_semana.
//
// Próxima evolução (quando `farol_timestamps.dispensed_at` tiver histórico):
// usar AVG(dispensed_at - primeira_vez) por modalidade × hora-do-dia para
// previsão muito mais precisa que considera variação intra-dia.
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { hojeBRT } from "@/lib/dataBRT";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/shared/contexts/AuthContext";

const DEFAULT_DURACAO_MINUTOS = 20;
const HORAS_OPERACIONAIS_DIA = 10;
const DIAS_LOOKBACK = 30;

// A tabela historico_atendimentos guarda o nome do exame, que historicamente
// é escrito de formas diferentes (seed demo usa "USG", "Ressonância"; o Farol
// passa "Ultrassonografia", "Ressonância Magnética"). Esse map aceita ambos.
const EXAME_VARIANTES: Record<string, string[]> = {
  "Ultrassonografia":      ["Ultrassonografia", "USG", "Ultrassom"],
  "Ressonância Magnética": ["Ressonância Magnética", "Ressonância", "RM"],
  "Tomografia":            ["Tomografia", "TC"],
  "Radiografia":           ["Radiografia", "Raio-X", "RX"],
  "Mamografia":            ["Mamografia", "MM"],
  "Densitometria":         ["Densitometria", "DO"],
  "Ecocardiograma":        ["Ecocardiograma", "ECO"],
};
function variantesPara(label: string): string[] {
  return EXAME_VARIANTES[label] ?? [label];
}

// Multiplicadores empíricos por dia da semana (segunda mais cheia, sábado mais lento)
// Calibrar com dados reais ao longo do tempo. Default = 1.0 (sem ajuste).
const FATOR_DIA_SEMANA: Record<number, number> = {
  0: 0.8, // dom
  1: 1.15, // seg
  2: 1.05, // ter
  3: 1.0, // qua
  4: 1.0, // qui
  5: 1.1, // sex
  6: 0.9, // sáb
};

export interface ThroughputModalidade {
  modalityName: string;
  realizadosUltimos30Dias: number;
  duracaoMediaMinutos: number;
  diasComDados: number;
  amostraSuficiente: boolean; // true se temos ≥ 7 dias com pelo menos 1 realizado
}

/** Hook React Query para throughput médio de uma modalidade. */
export function useModalidadeThroughput(modalityName: string | undefined, enabled = true) {
  const { tenant } = useAuth();
  return useQuery({
    queryKey: ["modalidade-throughput", tenant?.id, modalityName],
    enabled: enabled && !!tenant?.id && !!modalityName,
    staleTime: 60 * 60 * 1000, // 1 hora — não precisa atualizar a cada minuto
    queryFn: async (): Promise<ThroughputModalidade> => {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - DIAS_LOOKBACK);
      const sinceISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(sinceDate);

      const { data, error } = await (supabase as any)
        .from("historico_atendimentos")
        .select("data_atendimento, realizados")
        .eq("tenant_id", tenant!.id)
        .in("exame", variantesPara(modalityName!))
        .gte("data_atendimento", sinceISO);

      if (error) throw error;
      const rows = (data ?? []) as Array<{ data_atendimento: string; realizados: number }>;

      const totalRealizados = rows.reduce((s, r) => s + (r.realizados ?? 0), 0);
      const diasUnicos = new Set(rows.filter(r => (r.realizados ?? 0) > 0).map(r => r.data_atendimento)).size;
      const amostraSuficiente = diasUnicos >= 7;

      // Throughput médio: total realizados / dias com dado real
      const realizadosPorDia = diasUnicos > 0 ? totalRealizados / diasUnicos : 0;
      const exames_por_hora = realizadosPorDia / HORAS_OPERACIONAIS_DIA;
      const duracaoMediaMinutos = exames_por_hora > 0
        ? Math.max(5, Math.round(60 / exames_por_hora)) // mínimo 5min para sanidade
        : DEFAULT_DURACAO_MINUTOS;

      return {
        modalityName: modalityName!,
        realizadosUltimos30Dias: totalRealizados,
        duracaoMediaMinutos,
        diasComDados: diasUnicos,
        amostraSuficiente,
      };
    },
  });
}

/** Calcula ETA estimada para um paciente em uma posição da fila. */
export function calcularETA(
  agora: Date,
  posicaoNaFila: number, // 0-based: 0 = próximo
  duracaoMediaMinutos: number
): Date {
  const fator = FATOR_DIA_SEMANA[agora.getDay()] ?? 1.0;
  const minutosAteEle = (posicaoNaFila + 1) * duracaoMediaMinutos * fator;
  return new Date(agora.getTime() + minutosAteEle * 60_000);
}

/** Formata ETA pra UI. Retorna "agora" se ≤ 1min, senão "HH:MM" + delta em min se < 1h. */
export function formatETA(eta: Date, agora: Date): string {
  const diffMin = Math.round((eta.getTime() - agora.getTime()) / 60_000);
  if (diffMin <= 1) return "agora";
  if (diffMin < 60) {
    return `${eta.getHours().toString().padStart(2, "0")}:${eta.getMinutes().toString().padStart(2, "0")} (~${diffMin}m)`;
  }
  return `${eta.getHours().toString().padStart(2, "0")}:${eta.getMinutes().toString().padStart(2, "0")}`;
}
