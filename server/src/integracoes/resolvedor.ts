/* ARQUIVO GERADO — não edite na cópia.
   Fonte: imago-platform/packages/integracoes/src/resolvedor.ts
   Atualize com `node packages/integracoes/sync.mjs`. */

// ─────────────────────────────────────────────────────────────────────────────
// Resolvedor — de onde sai o valor que está valendo agora
//
// O problema que isto existe para resolver, e que hoje ainda vive no farol:
// `lib/netris.ts` lê process.env em `const` no topo do módulo, então trocar o
// token exige redeploy. Com o resolvedor, a credencial vem do banco com cache
// curto, e o ambiente continua valendo como rede de segurança.
//
// PRECEDÊNCIA POR CAMPO, não por bloco:
//   1. painel — a linha existe, `ativo = true` e o campo não está vazio
//   2. env    — primeira variável de ambiente da lista do campo com valor
//   3. padrao — default embutido no código, quando o campo tem um
//   4. ausente
//
// Por campo, e não por bloco, porque é o que faz "preencher só o token no
// painel e deixar a URL em branco" funcionar: a URL continua vindo do ambiente.
// A procedência de cada campo volta para a UI como selo, para que ninguém
// precise adivinhar de onde saiu o valor em uso.
//
// `ativo = false` é o interruptor de emergência: o servidor ignora o que está
// salvo e volta ao ambiente inteiro, sem redeploy. Credencial errada salva às
// 18h de uma sexta se desfaz com um clique.
// ─────────────────────────────────────────────────────────────────────────────

import {
  envsDoCampo,
  subConfig,
  type CampoIntegracao,
  type Origem,
  type RegistroProvedores,
} from "./campos.js";
import type { LinhaConfig, Store } from "./store.js";

export type ValoresEfetivos = {
  /** Valor efetivo por chave de campo, já normalizado. */
  valores: Record<string, string>;
  origem: Record<string, Origem>;
  /** O painel está no comando (linha existe e o switch está ligado)? */
  ativo: boolean;
  /** Todos os campos marcados `essencial` têm valor? */
  utilizavel: boolean;
};

export type EstadoIntegracao = {
  ativo: boolean;
  /** O que está salvo no banco, EM CLARO — mascare antes de devolver ao browser. */
  salvo: Record<string, string>;
  atualizadoEm: string | null;
  origem: Record<string, Origem>;
  utilizavel: boolean;
};

export type Resolvedor = {
  registro: RegistroProvedores;
  provedor: string;
  store: Store;
  /** Valores efetivos, com cache curto em memória. */
  efetivos(): Promise<ValoresEfetivos>;
  /** Atalho para um campo só. */
  campo(chave: string): Promise<string>;
  /** Chame depois de gravar — o efeito de salvar passa a ser imediato. */
  invalidar(): void;
  estado(): Promise<EstadoIntegracao>;
  /**
   * Valores crus das variáveis de ambiente, para a rota de importação copiá-los
   * para o painel. Fica no servidor: o token nunca volta ao navegador em claro.
   * Nunca inclui `padrao` — ver o comentário do campo em campos.ts.
   */
  valoresDoAmbiente(): Record<string, string>;
};

export type OpcoesResolvedor = {
  registro: RegistroProvedores;
  provedor: string;
  store: Store;
  /**
   * De onde ler as variáveis. O acesso indireto ao process existe para o pacote
   * não depender de @types/node: ele é copiado para cinco servidores e
   * type-checkado aqui, no monorepo, onde `process` pode não estar declarado.
   */
  ambiente?: Record<string, string | undefined>;
  /**
   * Validade do cache. 60s é o equilíbrio dos módulos em produção: curto o
   * bastante para uma correção de credencial valer quase na hora, longo o
   * bastante para o totem não bater no Postgres a cada requisição. Com o PUT
   * invalidando o cache, na prática salvar tem efeito imediato.
   */
  ttlMs?: number;
  aviso?: (mensagem: string) => void;
};

const ambientePadrao = (): Record<string, string | undefined> => {
  const proc = (globalThis as any).process;
  return proc && proc.env ? proc.env : {};
};

const avisoPadrao = (mensagem: string): void => {
  const console_ = (globalThis as any).console;
  if (console_ && typeof console_.warn === "function") console_.warn(mensagem);
};

export function criarResolvedor(opcoes: OpcoesResolvedor): Resolvedor {
  const { registro, provedor, store } = opcoes;
  const ambiente = opcoes.ambiente ?? ambientePadrao();
  const ttlMs = opcoes.ttlMs ?? 60_000;
  const aviso = opcoes.aviso ?? avisoPadrao;

  const def = registro[provedor];
  if (!def) {
    throw new Error(
      `[integracoes] provedor "${provedor}" não está no registro (${Object.keys(registro).join(", ") || "vazio"})`,
    );
  }
  const campos: CampoIntegracao[] = def.fields;
  const chavesConhecidas = Object.keys(registro);

  let cache: { em: number; linha: LinhaConfig | null } | null = null;

  const doAmbiente = (campo: CampoIntegracao): string => {
    for (const nome of envsDoCampo(campo)) {
      const valor = ambiente[nome];
      if (valor && valor.trim()) return valor.trim();
    }
    return "";
  };

  async function carregarLinha(): Promise<LinhaConfig | null> {
    if (cache && Date.now() - cache.em < ttlMs) return cache.linha;

    try {
      const linha = await store.ler();
      cache = { em: Date.now(), linha };
      return linha;
    } catch (erro: unknown) {
      // Migration não aplicada, RLS, Postgres fora do ar: NÃO derruba o
      // produto — segue no ambiente. O null vai para o cache de propósito,
      // para não martelar o banco a cada requisição enquanto durar o problema.
      const msg = erro instanceof Error ? erro.message : String(erro);
      aviso(`[integracoes] falha ao ler ${store.rotulo}, usando o ambiente: ${msg}`);
      cache = { em: Date.now(), linha: null };
      return null;
    }
  }

  /** Sub-config salva no painel — {} quando a linha não existe ou está inativa. */
  async function doPainel(linha: LinhaConfig | null): Promise<Record<string, string>> {
    if (!linha || !linha.ativo) return {};
    return subConfig(linha.config, provedor, chavesConhecidas);
  }

  function escolher(
    campo: CampoIntegracao,
    salvo: Record<string, string>,
  ): { valor: string; origem: Origem } {
    const doP = (salvo[campo.key] ?? "").trim();
    if (doP) return { valor: doP, origem: "painel" };

    const doE = doAmbiente(campo);
    if (doE) return { valor: doE, origem: "env" };

    if (campo.padrao) return { valor: campo.padrao, origem: "padrao" };

    return { valor: "", origem: "ausente" };
  }

  async function calcular(): Promise<ValoresEfetivos & { linha: LinhaConfig | null; salvo: Record<string, string> }> {
    const linha = await carregarLinha();
    const salvo = await doPainel(linha);

    const valores: Record<string, string> = {};
    const origem: Record<string, Origem> = {};

    for (const campo of campos) {
      const escolhido = escolher(campo, salvo);
      valores[campo.key] = campo.normalizar
        ? campo.normalizar(escolhido.valor)
        : escolhido.valor;
      origem[campo.key] = escolhido.origem;
    }

    const utilizavel = campos
      .filter(c => c.essencial)
      .every(c => Boolean(valores[c.key]));

    return {
      valores,
      origem,
      ativo: Boolean(linha?.ativo),
      utilizavel,
      linha,
      salvo,
    };
  }

  return {
    registro,
    provedor,
    store,

    async efetivos() {
      const { valores, origem, ativo, utilizavel } = await calcular();
      return { valores, origem, ativo, utilizavel };
    },

    async campo(chave: string) {
      const { valores } = await calcular();
      return valores[chave] ?? "";
    },

    invalidar() {
      cache = null;
    },

    async estado() {
      const { origem, ativo, utilizavel, linha, salvo } = await calcular();
      return {
        ativo,
        // Quando o switch está desligado, `salvo` sai {} do resolvedor — mas o
        // painel precisa mostrar o que está guardado, senão desligar parece
        // ter apagado tudo. Por isso a leitura crua da linha aqui.
        salvo: linha ? subConfig(linha.config, provedor, chavesConhecidas) : salvo,
        atualizadoEm: linha?.atualizadoEm ?? null,
        origem,
        utilizavel,
      };
    },

    valoresDoAmbiente() {
      const out: Record<string, string> = {};
      for (const campo of campos) {
        const valor = doAmbiente(campo);
        if (valor) out[campo.key] = valor;
      }
      return out;
    },
  };
}
