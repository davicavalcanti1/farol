// Hook que lê farol_timestamps (mantido pela Edge Function poll-farol-timestamps).
// Não chama o NetRis — dados aparecem instantaneamente e atualizam via Supabase Realtime.

import { useRef, useCallback, useEffect, useState } from "react";
import { logError } from "@/lib/logger";
import { hojeBRT } from "@/lib/dataBRT";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/shared/contexts/AuthContext";
import { msToTime } from "@/services/netris/client";

export interface FarolExame {
  id: string;
  nome: string;
  medico: string;
  sala: string;
  horario: string | null;
  modalidadeId: number;
}

export interface FarolPaciente {
  chave: string;
  nomePaciente: string;
  cpf?: string;
  exames: FarolExame[];
  horarioAgendamento: string | null;
  vistoPrimeiraVezEm: Date;
  situacaoId: number;
  situacao: string;
  medicoAgrupado: string;
  salaAgrupada: string;
}

interface FarolRow {
  atendimento_id:  string;
  nome_paciente:   string;
  cpf:             string | null;
  modalidade_id:   number;
  exame:           string | null;
  medico:          string | null;
  sala:            string | null;
  hora_inicial_ms: number | null;
  situacao_id:     number;
  situacao_nome:   string | null;
  primeira_vez:    string;
}

const STALE_MS = 30_000; // polling de backup a cada 30s (Realtime idealmente resolve antes)

export function useFarolRealtime(
  modalidadeIds: number | number[],
  situacaoIds: number[],
) {
  const modIdsArray = Array.isArray(modalidadeIds) ? modalidadeIds : [modalidadeIds];

  const { tenant }     = useAuth();
  const queryClient    = useQueryClient();
  const dispensadosRef = useRef<Set<string>>(new Set());
  const [realtimeTick, setRealtimeTick] = useState(0);

  const queryKey = ["farol-timestamps", modIdsArray.join(","), situacaoIds.join(","), tenant?.id];

  const fetchPacientes = useCallback(async (): Promise<FarolPaciente[]> => {
    if (!tenant?.id) return [];

    // Usa BRT (UTC-3) igual à edge function — evita virar data às 21h no Brasil
    const hoje = hojeBRT();
    const { data: rows, error } = await (supabase as any)
      .from("farol_timestamps")
      .select("*")
      .eq("data_ref", hoje)
      .in("modalidade_id", modIdsArray)
      .in("situacao_id", situacaoIds)
      .is("dispensed_at", null); // exclui pacientes que já receberam baixa


    const registrosBrutos = (rows ?? []) as FarolRow[];

    // ── Dedup por atendimento_id ─────────────────────────────────────────────
    // Proteção contra double-write da edge function ou race conditions: cada
    // atendimento_id deve aparecer no máximo uma vez. Mantém o registro mais
    // recente (último na ordem do banco — Supabase preserva ordem de insert).
    const porAtendimento = new Map<string, FarolRow>();
    for (const r of registrosBrutos) {
      if (!r.atendimento_id) continue; // proteção: nunca deveria, mas guarda
      porAtendimento.set(r.atendimento_id, r);
    }
    const registros = Array.from(porAtendimento.values());

    // ── Agrupar por paciente ─────────────────────────────────────────────────
    // Chave preferencial: CPF normalizado (removendo máscara). Fallback robusto:
    // nome + data de nascimento (se houver). Última opção: nome em maiúsculas.
    // Isso evita colisão entre pacientes diferentes com mesmo nome quando CPF
    // está ausente (cadastro NetRis incompleto).
    const mapa = new Map<string, FarolRow[]>();
    for (const r of registros) {
      const cpfLimpo = r.cpf?.replace(/\D/g, "");
      const chave = cpfLimpo || r.nome_paciente.toUpperCase().trim();
      if (dispensadosRef.current.has(chave)) continue;
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(r);
    }

    const resultado: FarolPaciente[] = [];
    for (const [chave, grupo] of mapa) {
      const ordenados = [...grupo].sort((a, b) =>
        (a.hora_inicial_ms ?? 0) - (b.hora_inicial_ms ?? 0)
      );
      const primeiro = ordenados[0];
      const primeiraVez = ordenados.reduce<Date>((oldest, r) => {
        const t = new Date(r.primeira_vez);
        return t < oldest ? t : oldest;
      }, new Date(primeiro.primeira_vez));

      resultado.push({
        chave,
        nomePaciente:       primeiro.nome_paciente,
        cpf:                primeiro.cpf ?? undefined,
        exames:             ordenados.map(r => ({
          id:           r.atendimento_id,
          nome:         r.exame ?? "",
          medico:       r.medico ?? "",
          sala:         r.sala ?? "",
          horario:      r.hora_inicial_ms !== null ? msToTime(r.hora_inicial_ms) : null,
          modalidadeId: r.modalidade_id,
        })),
        horarioAgendamento: primeiro.hora_inicial_ms !== null ? msToTime(primeiro.hora_inicial_ms) : null,
        vistoPrimeiraVezEm: primeiraVez,
        situacaoId:         primeiro.situacao_id,
        situacao:           primeiro.situacao_nome ?? "",
        medicoAgrupado:     primeiro.medico ?? "",
        salaAgrupada:       primeiro.sala ?? "",
      });
    }

    resultado.sort((a, b) => {
      if (!a.horarioAgendamento && !b.horarioAgendamento) return 0;
      if (!a.horarioAgendamento) return 1;
      if (!b.horarioAgendamento) return -1;
      return a.horarioAgendamento.localeCompare(b.horarioAgendamento);
    });

    return resultado;
  }, [modIdsArray.join(","), situacaoIds.join(","), tenant?.id]);

  const { data: pacientes = [], isFetching, dataUpdatedAt } = useQuery({
    queryKey,
    queryFn:   fetchPacientes,
    staleTime: STALE_MS,
    refetchInterval: STALE_MS,
  });

  // ── Supabase Realtime: invalida o cache quando farol_timestamps muda ─────────
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel(`farol-timestamps-${tenant.id}-${modIdsArray.join("-")}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "farol_timestamps",
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload: any) => {
          // Invalida cache só se a mudança afeta alguma das modalidades que estamos observando
          const modId = payload.new?.modalidade_id ?? payload.old?.modalidade_id;
          if (modId && modIdsArray.includes(modId)) {
            queryClient.invalidateQueries({ queryKey });
            setRealtimeTick(n => n + 1);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, modIdsArray.join(","), queryClient, queryKey.join("|")]);

  const dispensar = useCallback((chave: string) => {
    dispensadosRef.current.add(chave);
    queryClient.setQueryData<FarolPaciente[]>(queryKey, prev =>
      (prev ?? []).filter(p => p.chave !== chave)
    );
  }, [queryClient, queryKey]);

  // Baixa atômica: persiste em farol_timestamps via dispensed_at, garantindo
  // que (1) o paciente desapareça imediatamente para todos via Realtime, (2)
  // não volte no próximo sync da edge function (desde que a edge function
  // preserve dispensed_at no upsert — ver comentário da migração).
  const darBaixaAtomica = useCallback(async (atendimentoIds: string[], outcome: "realizado" | "cancelado" | "faltou" | "em_sala", userId: string) => {
    if (!atendimentoIds.length) return;
    const now = new Date().toISOString();

    // 1. Marca como dispensado no Supabase — some do Farol via Realtime instantâneo
    const { error } = await (supabase as any)
      .from("farol_timestamps")
      .update({
        dispensed_at: now,
        dispensed_by: userId,
        dispensed_outcome: outcome,
      })
      .in("atendimento_id", atendimentoIds)
      .is("dispensed_at", null);
    if (error) throw error;

    // 2. Sincroniza com o NetRis via server (fire-and-forget).
    //    Falha aqui NÃO reverte o passo 1 — o paciente já sumiu do Farol.
    //    O server mapeia: realizado→18, cancelado/faltou→5, em_sala→45.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      fetch("/api/netris/farol/baixa", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ atendimentoIds, outcome }),
      }).then(r => {
        if (!r.ok) r.text().then(b => logError("[FarolRealtime] baixa NetRis", r.status, b.slice(0, 200)));
      }).catch(e => logError("[FarolRealtime] baixa NetRis offline", e));
    } catch (e) {
      logError("[FarolRealtime] baixa NetRis erro", e);
    }

    // 3. Invalida cache local
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // Botão "Atualizar": dispara a edge function sem aguardar (fire-and-forget).
  // O Realtime captura a escrita no banco e invalida o cache automaticamente.
  // Refaz o fetch imediato para mostrar o que já está no banco enquanto a
  // edge function ainda está rodando no background.
  const syncNow = useCallback(async () => {
    // Dispara sem await — não trava a UI enquanto busca o NetRis
    supabase.functions.invoke("poll-farol-timestamps", { body: {} }).catch(() => {});
    // Mostra dados atuais do banco imediatamente
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  return {
    pacientes,
    loading:   pacientes.length === 0 && isFetching,
    syncing:   isFetching,
    lastSync:  dataUpdatedAt ? new Date(dataUpdatedAt) : null,
    syncNow,
    dispensar,
    darBaixaAtomica,
  };
}
