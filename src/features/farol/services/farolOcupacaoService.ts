import { supabase } from "@/integrations/supabase/client";

export type OcupacaoHoraria = {
  data_ref: string;
  hora: number;
  media_aguardando: number;
  pico_aguardando: number;
  amostras: number;
};

export type OcupacaoModalidade = {
  data_ref: string;
  hora: number;
  modalidade_id: number;
  media_aguardando: number;
  pico_aguardando: number;
};

export type OcupacaoResumo = {
  total_amostras: number;
  media_geral: number;
  pico_absoluto: number;
  hora_pico: number;
  dia_pico: string;
};

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw error;
  return (data ?? []) as T[];
}

export const farolOcupacaoService = {
  async horaria(tenantId: string, dataIni: string, dataFim: string) {
    return rpc<OcupacaoHoraria>("rpc_farol_ocupacao_horaria", {
      p_tenant_id: tenantId,
      p_data_ini: dataIni,
      p_data_fim: dataFim,
    });
  },

  async porModalidade(tenantId: string, dataIni: string, dataFim: string) {
    return rpc<OcupacaoModalidade>("rpc_farol_ocupacao_modalidade", {
      p_tenant_id: tenantId,
      p_data_ini: dataIni,
      p_data_fim: dataFim,
    });
  },

  async resumo(tenantId: string, dataIni: string, dataFim: string) {
    const rows = await rpc<OcupacaoResumo>("rpc_farol_ocupacao_resumo", {
      p_tenant_id: tenantId,
      p_data_ini: dataIni,
      p_data_fim: dataFim,
    });
    return rows[0] ?? null;
  },
};
