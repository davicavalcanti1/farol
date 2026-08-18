// =============================================================================
// Ordem da fila decidida pelo operador — persistência
// =============================================================================
// Substitui os botões ↑↓ e a aba "ordem salva" do farol Excel. Grava em
// farol_fila_ordem, por (tenant, dia, tela).
//
// INVARIANTE: toda escrita persiste a fila INTEIRA com posições densas
// (0..n-1). Salvar só a linha movida deixaria a maioria dos pacientes sem
// posição, e quem tem posição sempre vem antes de quem não tem — mover um
// paciente jogaria todos os outros para o fim. É por isso que `salvarFila`
// recebe a lista completa e não um par (chave, posição).
// =============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hojeBRT } from "@/lib/dataBRT";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/shared/contexts/AuthContext";

const QUERY_KEY = "farol-fila-ordem";
const REFETCH_MS = 20_000;

export interface OrdemFilaRow {
  chave: string;
  posicao: number;
  prioritario: boolean;
}

/**
 * Chave da tela: IDs de modalidade ordenados e unidos por vírgula. Ordenados
 * porque [5,16] e [16,5] são a mesma tela — sem o sort, a mesma fila poderia
 * gravar em duas linhas diferentes dependendo de como a página foi montada.
 */
export function modalidadeKey(modalidadeIds: number[]): string {
  return [...modalidadeIds].sort((a, b) => a - b).join(",");
}

export function useOrdemFila(modalidadeIds: number[], enabled: boolean) {
  const { tenant } = useAuth();
  const key = modalidadeKey(modalidadeIds);
  return useQuery({
    queryKey: [QUERY_KEY, tenant?.id, key],
    enabled: enabled && !!tenant?.id,
    staleTime: REFETCH_MS,
    refetchInterval: REFETCH_MS,
    queryFn: async (): Promise<Map<string, OrdemFilaRow>> => {
      const { data, error } = await (supabase as any)
        .from("farol_fila_ordem")
        .select("chave, posicao, prioritario")
        .eq("tenant_id", tenant!.id)
        .eq("data_ref", hojeBRT())
        .eq("modalidade_key", key);
      if (error) throw error;
      return new Map((data ?? []).map((r: OrdemFilaRow) => [r.chave, r]));
    },
  });
}

export function useSalvarFila(modalidadeIds: number[]) {
  const { tenant, profile } = useAuth();
  const qc = useQueryClient();
  const key = modalidadeKey(modalidadeIds);
  return useMutation({
    mutationFn: async (fila: { chave: string; prioritario: boolean }[]) => {
      if (!tenant?.id) throw new Error("Sem tenant na sessão");
      const agora = new Date().toISOString();
      const rows = fila.map((item, i) => ({
        tenant_id: tenant.id,
        data_ref: hojeBRT(),
        modalidade_key: key,
        chave: item.chave,
        posicao: i,
        prioritario: item.prioritario,
        updated_at: agora,
        updated_by: profile?.id ?? null,
      }));
      // O upsert precisa declarar o onConflict com a PK composta inteira —
      // sem isso o PostgREST tenta INSERT puro e falha na segunda gravação do
      // dia com violação de chave primária.
      const { error } = await (supabase as any)
        .from("farol_fila_ordem")
        .upsert(rows, { onConflict: "tenant_id,data_ref,modalidade_key,chave" });
      // O erro do upsert precisa subir: RLS negando escrita devolve erro sem
      // lançar, e engolir aqui deixaria a tela mostrando uma ordem que o banco
      // nunca aceitou — o mesmo padrão que já mordeu os toggles de permissão.
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

// ── Aplicação da ordem ────────────────────────────────────────────────────────

/**
 * Reordena a fila conforme o que está salvo. Quem tem posição salva vem
 * primeiro, na ordem salva; quem não tem (chegou depois da última reordenação)
 * entra no fim preservando a ordem de entrada — que é a ordem por horário
 * agendado do useFarolRealtime.
 *
 * Sem nada salvo, devolve a lista intacta: a fila continua sendo a ordenação
 * por horário agendado, que é o comportamento de antes desta feature.
 */
export function aplicarOrdemSalva<T extends { chave: string }>(
  pacientes: T[],
  ordem: Map<string, OrdemFilaRow> | undefined,
): T[] {
  if (!ordem || ordem.size === 0) return pacientes;
  const comPosicao: { item: T; posicao: number }[] = [];
  const semPosicao: T[] = [];
  for (const p of pacientes) {
    const row = ordem.get(p.chave);
    if (row) comPosicao.push({ item: p, posicao: row.posicao });
    else semPosicao.push(p);
  }
  comPosicao.sort((a, b) => a.posicao - b.posicao);
  return [...comPosicao.map(x => x.item), ...semPosicao];
}

/** Move um item uma casa para cima/baixo, devolvendo a nova lista de chaves. */
export function moverChave(chaves: string[], chave: string, direcao: -1 | 1): string[] {
  const i = chaves.indexOf(chave);
  if (i < 0) return chaves;
  const j = i + direcao;
  if (j < 0 || j >= chaves.length) return chaves;
  const next = [...chaves];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
