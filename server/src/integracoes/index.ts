/* ARQUIVO GERADO — não edite na cópia.
   Fonte: imago-platform/packages/integracoes/src/index.ts
   Atualize com `node packages/integracoes/sync.mjs`. */

// Ponto único de entrada. O app importa daqui:
//
//   import { criarResolvedor, storeSingleton, criarRouterIntegracao }
//     from "./integracoes/index.js";
//
// Ver o README do pacote para o exemplo de fiação completo, e campos.ts para o
// que cada propriedade de campo significa.

export {
  MASK,
  semBarraFinal,
  envsDoCampo,
  subConfig,
  mapaDeConfig,
  camposPublicos,
  provedoresPublicos,
  mascarar,
  mesclar,
  type TipoCampo,
  type CampoIntegracao,
  type ProviderDef,
  type RegistroProvedores,
  type Origem,
} from "./campos.js";

export {
  storeSingleton,
  storeTenant,
  storeMemoria,
  type ClienteTabelas,
  type LinhaConfig,
  type EntradaGravacao,
  type Store,
  type NomesColunas,
} from "./store.js";

export {
  criarResolvedor,
  type Resolvedor,
  type OpcoesResolvedor,
  type ValoresEfetivos,
  type EstadoIntegracao,
} from "./resolvedor.js";

export {
  criarRouterIntegracao,
  type OpcoesRouter,
  type RoteadorLike,
  type Manipulador,
} from "./router.js";
