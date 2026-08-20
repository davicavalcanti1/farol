/* Superfície pública do @imago/painel.
 *
 * Os especificadores terminam em `.js` porque os produtos compilam com
 * NodeNext/bundler e o Node não reescreve `.js` → `.ts` sozinho. Mesma razão
 * do @imago/integracoes. */

export type {
  Area,
  ModulosHabilitados,
  Papel,
  SessaoPainel,
} from './tipos.js';

export { areaAtual, chavesDuplicadas, resolverNav, type ContextoNav } from './registro.js';
export { Shell, type ShellProps } from './Shell.js';
export { Aviso, Button, Card, Field, Input, Loading, Vazio } from './ui/index.js';
export { useCarregar } from './hooks.js';
export * from './areas/index.js';
