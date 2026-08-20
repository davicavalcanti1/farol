/* ═══════════════════════════════════════════════════════════════════════════
   Registro de áreas — a navegação como dado, não como código
   ---------------------------------------------------------------------------
   No ExameQR a navegação é um objeto `NAV[papel]` escrito à mão mais um
   `renderArea` com switch e os componentes cravados por import. Funciona num
   produto e não sai de lá: adicionar tela obriga a editar a casca, e a casca
   não pode ser compartilhada porque conhece as telas.

   Aqui a casca não sabe que as áreas existem. O produto passa a lista, e estas
   funções decidem o que aparece. É a diferença entre um painel e um pacote de
   painel.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Area, ModulosHabilitados, Papel } from './tipos.js';

export interface ContextoNav<P extends string = Papel> {
  papel: P;
  modulosHabilitados?: ModulosHabilitados;
  /** Papel global, que atravessa qualquer filtro de papel. Default: `owner`.
   *  Um produto sem papel global passa `null`. */
  papelGlobal?: P | null;
}

/**
 * As áreas visíveis, na ordem em que foram declaradas.
 *
 * A ordem é a da sidebar — igual ao `NAV` do ExameQR, onde a ordem do array é a
 * ordem na tela. Ordenar aqui por título ou por papel seria roubar do produto
 * uma decisão que é dele.
 *
 * Duas regras, e a assimetria entre elas é o ponto:
 *
 * 1. **Papel** — o papel global passa por cima. É o `pode()` do template, onde
 *    `owner` vê tudo.
 * 2. **Módulo** — ninguém passa por cima, nem o papel global. Módulo desligado
 *    é desligado; o owner precisa *ver que está desligado*, não usá-lo por
 *    dentro. Se o global furasse o gate, o kill-switch mentiria justamente para
 *    quem o acionou, e a área de administração continuaria acessível porque ela
 *    não declara `modulo` — que é como se religa.
 */
export function resolverNav<R, P extends string = Papel>(
  areas: readonly Area<R, P>[],
  ctx: ContextoNav<P>,
): Area<R, P>[] {
  const global = ctx.papelGlobal === undefined ? ('owner' as P) : ctx.papelGlobal;
  const ehGlobal = global !== null && ctx.papel === global;

  return areas.filter((area) => {
    if (area.modulo !== undefined) {
      // undefined = produto sem gate de módulo; [] = gate ligado e nada habilitado.
      if (ctx.modulosHabilitados !== undefined && !ctx.modulosHabilitados.includes(area.modulo)) {
        return false;
      }
    }

    if (!area.papeis || area.papeis.length === 0) return true;
    if (ehGlobal) return true;
    return area.papeis.includes(ctx.papel);
  });
}

/**
 * A área que o painel deve mostrar, dada a escolha atual.
 *
 * Existe porque a escolha e a lista mudam em tempos diferentes: o papel chega
 * de uma consulta assíncrona, então a lista de visíveis muda **depois** do
 * primeiro render. Guardar só a chave e resolver aqui evita o estado obsoleto —
 * uma área que o usuário perdeu o direito de ver não fica presa na tela, e uma
 * chave que ainda não existe cai na primeira área em vez de deixar o painel em
 * branco.
 *
 * Devolve `null` quando não há nada visível, e essa é a resposta certa: o
 * chamador precisa mostrar "seu papel não tem áreas" em vez de estourar num
 * índice vazio.
 */
export function areaAtual<R, P extends string = Papel>(
  visiveis: readonly Area<R, P>[],
  chave: string | null | undefined,
): Area<R, P> | null {
  if (visiveis.length === 0) return null;
  return visiveis.find((a) => a.chave === chave) ?? visiveis[0]!;
}

/**
 * Acusa chave repetida na lista de áreas.
 *
 * Duas áreas com a mesma chave fazem a segunda ficar inalcançável: `areaAtual`
 * devolve sempre a primeira que casa, e o item de menu de baixo passa a abrir a
 * tela de cima. É o tipo de bug que se procura na tela errada por meia hora.
 *
 * Não lança: o produto decide se isso é erro de build ou aviso de console.
 */
export function chavesDuplicadas<R, P extends string>(
  areas: readonly Area<R, P>[],
): string[] {
  const vistas = new Set<string>();
  const repetidas = new Set<string>();
  for (const { chave } of areas) {
    if (vistas.has(chave)) repetidas.add(chave);
    vistas.add(chave);
  }
  return [...repetidas];
}
