// =============================================================================
// Tempos de exame por protocolo (porte da aba "TEMPO EXAMES" do farol Excel)
// =============================================================================
// Fórmula do total (coluna gerada no banco, igual à planilha):
//   total = base×(1+tolerância) + preparo + contraste + saída
//
// O matching com o exame vindo do NetRis é feito por `procedimento_norm`
// (sem acento, uppercase, espaços colapsados) — mesma tolerância a variação
// que o VLOOKUP da planilha tinha na prática.
// =============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/shared/contexts/AuthContext";
import seedRm from "../data/temposExamesRm.json";

export interface TempoExame {
  id: string;
  tenant_id: string;
  modalidade: string;
  procedimento: string;
  procedimento_norm: string;
  base_seg: number;
  tolerancia: number;
  preparo_seg: number;
  contraste_seg: number;
  saida_seg: number;
  total_seg: number;
  observacao: string | null;
  updated_at: string;
}

export interface TempoExameInput {
  procedimento: string;
  base_seg: number;
  tolerancia: number;
  preparo_seg: number;
  contraste_seg: number;
  saida_seg: number;
  observacao: string | null;
}

/** Remove acentos, colapsa espaços e sobe caixa — chave de matching. */
export function normalizarProcedimento(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Segundos → "mm:ss" (ou "h:mm:ss" acima de 1h). */
export function formatarSegundos(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

/** "mm:ss", "h:mm:ss" ou minutos puros ("12") → segundos. null se inválido. */
export function parseDuracao(txt: string): number | null {
  const t = txt.trim();
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t) * 60; // minutos puros
  const partes = t.split(":").map(Number);
  if (partes.some(n => Number.isNaN(n) || n < 0)) return null;
  if (partes.length === 2) return partes[0] * 60 + partes[1];
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2];
  return null;
}

const QUERY_KEY = "farol-tempos-exame";

export function useTemposExames(modalidade = "RM") {
  const { tenant } = useAuth();
  return useQuery({
    queryKey: [QUERY_KEY, tenant?.id, modalidade],
    enabled: !!tenant?.id,
    queryFn: async (): Promise<TempoExame[]> => {
      const { data, error } = await (supabase as any)
        .from("farol_tempos_exame")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("modalidade", modalidade)
        .order("procedimento");
      if (error) throw error;
      return (data ?? []) as TempoExame[];
    },
  });
}

export function useSalvarTempoExame(modalidade = "RM") {
  const { tenant } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: TempoExameInput }) => {
      const row = {
        tenant_id: tenant!.id,
        modalidade,
        procedimento: input.procedimento.trim(),
        procedimento_norm: normalizarProcedimento(input.procedimento),
        base_seg: input.base_seg,
        tolerancia: input.tolerancia,
        preparo_seg: input.preparo_seg,
        contraste_seg: input.contraste_seg,
        saida_seg: input.saida_seg,
        observacao: input.observacao?.trim() || null,
      };
      // Padrão do sistema: sempre await + throw — RLS falha silenciosa é bug conhecido
      const query = id
        ? (supabase as any).from("farol_tempos_exame").update(row).eq("id", id)
        : (supabase as any).from("farol_tempos_exame").insert(row);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useExcluirTempoExame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("farol_tempos_exame").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/**
 * Importa a tabela padrão (152 protocolos extraídos da planilha v1.6.3).
 * Ignora protocolos que o tenant já tem (não sobrescreve calibração local).
 */
export function useImportarTabelaPadrao(modalidade = "RM") {
  const { tenant } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ importados: number; pulados: number }> => {
      const { data: existentes, error: errSel } = await (supabase as any)
        .from("farol_tempos_exame")
        .select("procedimento_norm")
        .eq("tenant_id", tenant!.id)
        .eq("modalidade", modalidade);
      if (errSel) throw errSel;
      const jaTem = new Set((existentes ?? []).map((r: any) => r.procedimento_norm));

      const novos = (seedRm as Array<Record<string, any>>)
        .map(r => ({
          tenant_id: tenant!.id,
          modalidade,
          procedimento: r.procedimento,
          procedimento_norm: normalizarProcedimento(r.procedimento),
          base_seg: r.base_seg,
          tolerancia: r.tolerancia,
          preparo_seg: r.preparo_seg,
          contraste_seg: r.contraste_seg,
          saida_seg: r.saida_seg,
          observacao: r.observacao ?? null,
        }))
        .filter(r => !jaTem.has(r.procedimento_norm));

      if (novos.length > 0) {
        const { error } = await (supabase as any).from("farol_tempos_exame").insert(novos);
        if (error) throw error;
      }
      return { importados: novos.length, pulados: seedRm.length - novos.length };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
