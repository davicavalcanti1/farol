/* ARQUIVO GERADO — não edite na cópia.
   Fonte: imago-platform/packages/integracoes/src/campos.ts
   Atualize com `node packages/integracoes/sync.mjs`. */

// ─────────────────────────────────────────────────────────────────────────────
// Registro de campos de integração — a fonte única da verdade
//
// Cada produto declara aqui quais campos uma integração tem. Tudo o mais se
// deriva disto: a UI do painel se desenha a partir de `camposPublicos()`, o
// servidor decide o que mascarar pela flag `secret`, o resolvedor sabe qual
// variável de ambiente é o fallback pelo `env`, e o "utilizável" sai do
// `essencial`. Campo novo = uma linha no registro, sem tocar em componente.
//
// Por que os metadados moram no campo, e não espalhados:
//   • `env`      — antes cada app tinha um `const ENV = { ... }` à mão, que
//                  divergia do formulário em silêncio (campo no painel sem
//                  fallback, ou fallback sem campo).
//   • `essencial`— cada app escrevia `Boolean(base && token)` no meio da lib.
//   • `padrao`   — o check-in tinha default embutido no código pro PACS, e a
//                  rota de importação precisava lembrar de EXCLUIR esse campo
//                  pra não fazer o painel "possuir" um valor que ninguém
//                  escolheu. Aqui isso é uma propriedade, não uma exceção.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoCampo = "text" | "password";

export type CampoIntegracao = {
  key: string;
  label: string;
  type: TipoCampo;
  placeholder?: string;
  hint?: string;
  /** Nunca sai do servidor em claro — vira MASK na leitura. */
  secret?: boolean;
  /**
   * Variável(is) de ambiente equivalentes, na ordem de preferência. A primeira
   * com valor ganha. A lista existe por causa do prefixo VITE_, herança de
   * quando o navegador falava com o gateway direto: `["NETRIS_TOKEN",
   * "VITE_NETRIS_TOKEN"]` é o mesmo valor sob dois nomes.
   */
  env?: string | string[];
  /**
   * Default embutido no código, usado só se painel e ambiente estiverem vazios.
   * NÃO é importável pro painel (ver `valoresImportaveis`): se fosse, importar
   * do .env gravaria no banco um valor que ninguém digitou, e daí em diante
   * mudar o default do código não teria mais efeito.
   */
  padrao?: string;
  /** Sem este campo a integração não funciona — alimenta `utilizavel`. */
  essencial?: boolean;
  /** Saneamento aplicado ao valor efetivo (não ao que é gravado). */
  normalizar?: (valor: string) => string;
};

export type ProviderDef = {
  label: string;
  descricao: string;
  fields: CampoIntegracao[];
};

export type RegistroProvedores = Record<string, ProviderDef>;

export const MASK = "••••••••";

/** De onde saiu o valor que está valendo agora. O painel exibe como selo. */
export type Origem = "painel" | "env" | "padrao" | "ausente";

/** Tira a barra final de URL base — `${base}/netris/api` viraria `//netris`. */
export const semBarraFinal = (s: string): string => s.replace(/\/+$/, "");

/** Lista de nomes de env de um campo, normalizada. */
export function envsDoCampo(campo: CampoIntegracao): string[] {
  if (!campo.env) return [];
  return Array.isArray(campo.env) ? campo.env : [campo.env];
}

/**
 * Sub-config de um provedor dentro do mapa `config`, tolerando linha vazia,
 * corrompida ou no formato antigo (plano, de antes do mapa por provedor).
 *
 * A checagem de formato antigo precisa cobrir TODAS as chaves conhecidas, não
 * só as do provedor pedido. Foi por não fazer isso que, no ExameQR, um mapa
 * `{ zapsign: {...} }` era interpretado como "formato antigo" e devolvido como
 * se fosse a config do NetRis — a emissão saía autenticada com o token errado.
 */
export function subConfig(
  config: unknown,
  provedor: string,
  chavesConhecidas: readonly string[] = [],
): Record<string, string> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    const mapa = config as Record<string, unknown>;
    const sub = mapa[provedor];
    if (sub && typeof sub === "object" && !Array.isArray(sub)) {
      return sub as Record<string, string>;
    }
    if (chavesConhecidas.length > 0 && !chavesConhecidas.some(k => k in mapa)) {
      return mapa as Record<string, string>;
    }
  }
  return {};
}

/** Mapa `config` como objeto raso e seguro de mutar (nunca devolve o original). */
export function mapaDeConfig(config: unknown): Record<string, unknown> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return { ...(config as Record<string, unknown>) };
  }
  return {};
}

function definicao(registro: RegistroProvedores, provedor: string): ProviderDef {
  const def = registro[provedor];
  if (!def) {
    throw new Error(
      `[integracoes] provedor desconhecido: "${provedor}". Conhecidos: ${Object.keys(registro).join(", ") || "(nenhum)"}`,
    );
  }
  return def;
}

/** Registro seguro pro navegador: rótulos e metadados, jamais valores. */
export function camposPublicos(registro: RegistroProvedores, provedor: string) {
  const def = definicao(registro, provedor);
  return {
    label: def.label,
    descricao: def.descricao,
    fields: def.fields.map(f => ({
      key: f.key,
      label: f.label,
      type: f.type,
      placeholder: f.placeholder ?? "",
      hint: f.hint ?? "",
      // Nome da env, não o valor dela: o painel mostra "vem de NETRIS_TOKEN"
      // pra quem for configurar entender de onde sai o fallback.
      env: envsDoCampo(f)[0] ?? "",
      secret: Boolean(f.secret),
      essencial: Boolean(f.essencial),
      // Se existe default embutido no código. O painel precisa disto para
      // responder "desligar a integração vai derrubar?" — um campo essencial
      // com `padrao` sobrevive ao desligamento mesmo sem variável de ambiente.
      temPadrao: f.padrao !== undefined && f.padrao !== "",
    })),
  };
}

/** Idem, para todos os provedores do registro. */
export function provedoresPublicos(registro: RegistroProvedores) {
  return Object.fromEntries(
    Object.keys(registro).map(k => [k, camposPublicos(registro, k)]),
  );
}

/** Troca todo campo `secret` por MASK antes de devolver ao navegador. */
export function mascarar(
  registro: RegistroProvedores,
  provedor: string,
  config: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of definicao(registro, provedor).fields) {
    const v = config[f.key];
    out[f.key] = f.secret ? (v ? MASK : "") : (v ?? "");
  }
  return out;
}

/**
 * Mescla o que veio do formulário com o que já estava salvo. Campo secreto que
 * voltou como MASK (ou não veio) preserva o valor antigo — é o que impede
 * apagar o token só porque o usuário mexeu na filial e salvou.
 */
export function mesclar(
  registro: RegistroProvedores,
  provedor: string,
  salvo: Record<string, string> = {},
  recebido: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of definicao(registro, provedor).fields) {
    const novo = recebido[f.key];
    if (f.secret && (novo === MASK || novo === undefined)) {
      out[f.key] = salvo[f.key] ?? "";
    } else {
      out[f.key] = (novo ?? "").trim();
    }
  }
  return out;
}
