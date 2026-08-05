// ─────────────────────────────────────────────────────────────────────────────
// Baixa do Farol — registro em historico_atendimentos
//
// Lógica única usada por FarolPage e FarolGroupedPage (antes duplicada nas
// duas — correção de bug numa esquecia a outra). Incrementa o agregado diário
// (tenant × data × exame × médico) e CHECA { error } de cada mutation:
// Supabase não lança exceção, e RLS falhando silenciosamente já causou
// "Baixa registrada" sem nada gravado.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { hojeBRT } from "@/lib/dataBRT";

export type StatusBaixa = "realizado" | "cancelado" | "faltou";

export async function registrarBaixaHistorico(params: {
  tenantId: string | null | undefined;
  exame: string;
  medico: string | null | undefined;
  statusFinal: StatusBaixa;
}): Promise<void> {
  const hoje = hojeBRT();
  const medico = params.medico?.trim() || "(Sem médico)";

  const { data: existing, error: selError } = await (supabase as any)
    .from("historico_atendimentos")
    .select("id, total, realizados, cancelados, faltaram")
    .eq("tenant_id", params.tenantId)
    .eq("data_atendimento", hoje)
    .eq("exame", params.exame)
    .eq("medico", medico)
    .maybeSingle();
  if (selError) throw selError;

  if (existing) {
    const { error } = await (supabase as any).from("historico_atendimentos").update({
      total:      existing.total + 1,
      realizados: existing.realizados + (params.statusFinal === "realizado" ? 1 : 0),
      cancelados: existing.cancelados + (params.statusFinal === "cancelado" ? 1 : 0),
      faltaram:   existing.faltaram   + (params.statusFinal === "faltou"    ? 1 : 0),
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any).from("historico_atendimentos").insert({
      tenant_id: params.tenantId || null,
      data_atendimento: hoje,
      exame: params.exame,
      medico,
      total:      1,
      realizados: params.statusFinal === "realizado" ? 1 : 0,
      cancelados: params.statusFinal === "cancelado" ? 1 : 0,
      faltaram:   params.statusFinal === "faltou"    ? 1 : 0,
    });
    if (error) throw error;
  }
}
