// ─────────────────────────────────────────────────────────────────────────────
// A integração do NetRis, configurável em runtime
//
// Este arquivo é a parte ESPECÍFICA do Farol; o núcleo compartilhado está em
// `server/src/integracoes/` e vem por cópia do
// `imago-platform/packages/integracoes` (não edite lá dentro). O registro de
// campos, que é dado puro, mora em `integracaoRegistro.ts`.
//
// Ele existe para responder uma pergunta que antes era respondida no topo de
// `lib/netris.ts` com `process.env`: quais credenciais valem AGORA, para ESTE
// tenant.
//
// ── POR QUE UM RESOLVEDOR POR TENANT ────────────────────────────────────────
// Cada tenant tem a sua linha em `farol_integracoes`, então cada um precisa do
// seu resolvedor — inclusive do seu cache de 60s, senão o valor de um tenant
// serviria o outro. O mapa abaixo guarda um por tenant, criado na primeira
// requisição.
//
// Hoje há um tenant só na prática. O mapa não é preparação especulativa: é o que
// impede que "hoje há um só" vire um bug de vazamento entre clientes no dia em
// que houver dois.
// ─────────────────────────────────────────────────────────────────────────────

import { criarResolvedor, storeTenant, type Resolvedor } from "../integracoes/index.js";
import { PROVEDOR_NETRIS, REGISTRO_INTEGRACOES } from "./integracaoRegistro.js";
import { supabaseAdmin } from "./supabase.js";

export { PROVEDOR_NETRIS, REGISTRO_INTEGRACOES };

const porTenant = new Map<string, Resolvedor>();

export function resolvedorNetris(tenantId: string): Resolvedor {
  const existente = porTenant.get(tenantId);
  if (existente) return existente;

  const novo = criarResolvedor({
    registro: REGISTRO_INTEGRACOES,
    provedor: PROVEDOR_NETRIS,
    store: storeTenant({
      cliente: supabaseAdmin,
      tabela: "farol_integracoes",
      tenantId,
      porProvedor: { provedor: PROVEDOR_NETRIS },
    }),
    ambiente: process.env as Record<string, string | undefined>,
  });

  porTenant.set(tenantId, novo);
  return novo;
}

/** O que `lib/netris.ts` precisa saber para fazer uma chamada. */
export interface ConfigNetris {
  base: string;
  token: string;
  filial: string;
  pacsBase: string;
  /** Todos os campos essenciais presentes. Falso = nem tente chamar. */
  utilizavel: boolean;
}

/**
 * As credenciais efetivas do tenant, com o ambiente como rede de segurança.
 *
 * Pode ser chamada a cada requisição sem medo: o resolvedor tem cache de 60s e
 * degrada para o ambiente se o banco não responder — migration não aplicada ou
 * Postgres fora do ar não derrubam o Farol, só fazem ele se comportar como
 * antes desta mudança.
 */
export async function configNetris(tenantId: string): Promise<ConfigNetris> {
  const efetivos = await resolvedorNetris(tenantId).efetivos();
  return {
    base: efetivos.valores.base_url ?? "",
    token: efetivos.valores.token ?? "",
    filial: efetivos.valores.filial_id ?? "",
    pacsBase: efetivos.valores.pacs_base_url ?? "",
    utilizavel: efetivos.utilizavel,
  };
}
