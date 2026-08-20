/* ═══════════════════════════════════════════════════════════════════════════
   O contrato do painel
   ---------------------------------------------------------------------------
   Este arquivo não importa React de propósito. `Area` é genérica no tipo do
   que `render` devolve, então a lógica de navegação (registro.ts) compila e é
   testada sem tocar em React, JSX ou DOM — do mesmo jeito que o núcleo de
   integrações roda seus 39 testes sem express nem supabase-js.

   Quem precisa de React é só o Shell, que usa `Area<ReactNode>`.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Os quatro papéis da fundação multi-tenant (`0001_fundacao_multitenant.sql`).
 *
 * `owner` é global e atravessa tenants; os outros três valem dentro de um. Um
 * produto com papéis próprios (o ExameQR tem `empresa_admin`,
 * `parceiro_coordenador`…) passa os dele: `Papel` é o default, não a prisão. */
export type Papel = 'owner' | 'admin' | 'operador' | 'leitor';

/**
 * Uma área é uma tela autocontida do painel.
 *
 * `R` é o que o `render` devolve — `ReactNode` na prática. Deixar genérico é o
 * que permite testar `resolverNav` sem React no caminho.
 */
export interface Area<R = unknown, P extends string = Papel> {
  /** Identificador estável, usado na navegação e na URL. */
  chave: string;
  titulo: string;
  /**
   * Papéis que veem a área. Ausente = todos veem.
   *
   * É conveniência de UI, **não** segurança: quem protege de verdade são as
   * policies de RLS e o gate de papel do backend. Esconder item de menu não
   * impede ninguém de chamar a API.
   */
  papeis?: P[];
  /**
   * Módulo que esta área exige, quando ela pertence a um.
   *
   * É o gancho de "liberar módulo por cliente": a área só aparece se o módulo
   * estiver na lista de habilitados do tenant. Ausente = área da plataforma,
   * não depende de contratação (Visão Geral, Perfil, Auditoria).
   */
  modulo?: string;
  render: () => R;
}

/** Quem está usando o painel. O produto monta isto do jeito dele — Supabase,
 *  JWT, mock em teste — e o painel não pergunta de onde veio. */
export interface SessaoPainel<P extends string = Papel> {
  nome: string;
  papel: P;
  email?: string | null;
  tenantId?: string | null;
}

/**
 * Módulos habilitados para o tenant da sessão.
 *
 * A distinção entre `undefined` e `[]` é deliberada e importa:
 *
 * - `undefined` — o produto não usa gate de módulo (a maioria hoje). Áreas com
 *   `modulo` aparecem normalmente.
 * - `[]` — o produto usa o gate e **nada** está habilitado. Áreas com `modulo`
 *   desaparecem.
 *
 * Sem essa diferença, um produto que ainda não sabe listar módulos ou perderia
 * todas as áreas (tratando ausência como vazio) ou furaria o kill-switch
 * (tratando vazio como ausência). Os dois já seriam bug em produção.
 */
export type ModulosHabilitados = readonly string[] | undefined;
