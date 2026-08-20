/* ARQUIVO GERADO — não edite na cópia.
   Fonte: imago-platform/packages/integracoes/src/store.ts
   Atualize com `node packages/integracoes/sync.mjs`. */

// ─────────────────────────────────────────────────────────────────────────────
// Persistência da configuração — a parte que difere entre os produtos
//
// Os servidores guardam credencial de integração de formas diferentes, e isso
// não é acidente que dê para unificar por decreto: os bancos já existem em
// produção. Os formatos vivos, verificados nos repositórios:
//
//   check-in     public.integracao_configs      singleton (id boolean CHECK)
//   ocorrências  public.oc_integracao_configs   singleton — tabela separada de
//                propósito: o banco é compartilhado, e escrever na do check-in
//                sobrescreveria a credencial dos totens da recepção
//   ExameQR      public.integracao_configs      uma linha por empresa, config
//                guardando o mapa de todos os provedores
//   receituários receituarios.integracoes       (tenant_id, provedor), e os
//                campos em COLUNAS (base_url/token/filial_id), não em jsonb
//
// Daí a forma deste módulo: o resto do pacote fala com um `Store`, e cada app
// escolhe a implementação. Nome de coluna é parâmetro porque também diverge
// (updated_at aqui, atualizado_em lá).
//
// `ler()` PODE lançar. Quem trata é o resolvedor, que degrada para o ambiente —
// migration não aplicada ou Postgres fora do ar não derruba o produto.
// `gravar()` DEVE lançar quando o banco não confirmar a gravação: RLS que
// bloqueia em silêncio devolve sucesso com zero linhas, e o painel diria
// "salvo" sem ter salvado. Já aconteceu aqui, com toggle de permissão.
// ─────────────────────────────────────────────────────────────────────────────

import { mapaDeConfig } from "./campos.js";

/**
 * O cliente do Supabase entra como parâmetro, e o tipo é estrutural de
 * propósito: o pacote é distribuído por CÓPIA para repositórios que fixam
 * versões diferentes de @supabase/supabase-js, então importar os tipos de lá
 * acoplaria o núcleo a uma versão. O `any` do encadeamento é o preço, e fica
 * confinado a este arquivo.
 */
export type ClienteTabelas = {
  from(tabela: string): any;
};

export type LinhaConfig = {
  /** Mapa por provedor: { netris: { token: "..." } }. */
  config: unknown;
  ativo: boolean;
  atualizadoEm: string | null;
};

export type EntradaGravacao = {
  /** Mapa COMPLETO por provedor — o chamador preserva os outros provedores. */
  config: Record<string, unknown>;
  ativo: boolean;
  porUsuario?: string | null;
};

export type Store = {
  /** Aparece em mensagem de log e de erro. */
  rotulo: string;
  ler(): Promise<LinhaConfig | null>;
  gravar(entrada: EntradaGravacao): Promise<void>;
};

export type NomesColunas = {
  config: string;
  ativo: string;
  atualizadoEm: string;
  atualizadoPor: string;
};

const COLUNAS_PADRAO: NomesColunas = {
  config: "config",
  ativo: "ativo",
  atualizadoEm: "updated_at",
  atualizadoPor: "updated_by",
};

function erroDe(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as any).message);
  return String(e);
}

function linhaPara(
  dados: Record<string, unknown> | null,
  colunas: NomesColunas,
): LinhaConfig | null {
  if (!dados) return null;
  const em = dados[colunas.atualizadoEm];
  return {
    config: dados[colunas.config],
    ativo: Boolean(dados[colunas.ativo]),
    atualizadoEm: typeof em === "string" ? em : null,
  };
}

// ── Singleton ────────────────────────────────────────────────────────────────
// Linha única travada no banco (id boolean primary key default true CHECK (id)):
// um INSERT extra colide na chave primária, em vez de criar configuração
// fantasma que ninguém sabe qual está valendo. Deploy único, sem chave por
// tenant — check-in e ocorrências.

export function storeSingleton(opcoes: {
  cliente: ClienteTabelas;
  tabela: string;
  colunas?: Partial<NomesColunas>;
  /** Coluna da PK booleana. */
  colunaId?: string;
}): Store {
  const colunas = { ...COLUNAS_PADRAO, ...opcoes.colunas };
  const colunaId = opcoes.colunaId ?? "id";
  const selecao = [colunas.config, colunas.ativo, colunas.atualizadoEm].join(", ");

  return {
    rotulo: opcoes.tabela,

    async ler() {
      const { data, error } = await opcoes.cliente
        .from(opcoes.tabela)
        .select(selecao)
        .maybeSingle();
      if (error) throw new Error(erroDe(error));
      return linhaPara(data ?? null, colunas);
    },

    async gravar(entrada) {
      const registro: Record<string, unknown> = {
        [colunaId]: true,
        [colunas.config]: entrada.config,
        [colunas.ativo]: entrada.ativo,
        [colunas.atualizadoEm]: new Date().toISOString(),
        [colunas.atualizadoPor]: entrada.porUsuario ?? null,
      };

      const { data, error } = await opcoes.cliente
        .from(opcoes.tabela)
        .upsert(registro, { onConflict: colunaId })
        .select(colunaId);

      if (error) throw new Error(erroDe(error));
      if (!data || data.length === 0) {
        throw new Error(`o banco não confirmou a gravação em ${opcoes.tabela}`);
      }
    },
  };
}

// ── Por tenant ───────────────────────────────────────────────────────────────

export function storeTenant(opcoes: {
  cliente: ClienteTabelas;
  tabela: string;
  tenantId: string;
  colunas?: Partial<NomesColunas>;
  colunaTenant?: string;
  /**
   * Quando a linha é por (tenant, provedor) — receituários, e o farol quando
   * nascer. Deixe em branco quando a linha é por tenant e `config` guarda o
   * mapa de todos os provedores (ExameQR).
   */
  porProvedor?: { provedor: string; coluna?: string };
  /**
   * Campos que ainda vivem em COLUNA em vez de dentro do jsonb, no formato
   * { chaveDoCampo: "nome_da_coluna" }. Só são lidos quando a sub-config do
   * provedor está vazia, e nunca são escritos.
   *
   * É o que permite converter receituários sem migration destrutiva: a coluna
   * antiga continua servindo o valor até alguém salvar pelo painel, e o
   * base_url legado segue no banco caso seja preciso voltar atrás.
   */
  legado?: Record<string, string>;
}): Store {
  const colunas = { ...COLUNAS_PADRAO, ...opcoes.colunas };
  const colunaTenant = opcoes.colunaTenant ?? "tenant_id";
  const colunaProvedor = opcoes.porProvedor?.coluna ?? "provedor";
  const provedor = opcoes.porProvedor?.provedor;
  const chavesLegado = Object.entries(opcoes.legado ?? {});

  const selecao = [
    colunas.config,
    colunas.ativo,
    colunas.atualizadoEm,
    ...chavesLegado.map(([, coluna]) => coluna),
  ].join(", ");

  const onConflict = provedor ? `${colunaTenant},${colunaProvedor}` : colunaTenant;

  const filtrar = (consulta: any) => {
    const comTenant = consulta.eq(colunaTenant, opcoes.tenantId);
    return provedor ? comTenant.eq(colunaProvedor, provedor) : comTenant;
  };

  return {
    rotulo: `${opcoes.tabela}[${opcoes.tenantId}${provedor ? `/${provedor}` : ""}]`,

    async ler() {
      const { data, error } = await filtrar(
        opcoes.cliente.from(opcoes.tabela).select(selecao),
      ).maybeSingle();
      if (error) throw new Error(erroDe(error));
      if (!data) return null;

      const linha = linhaPara(data, colunas) as LinhaConfig;

      // Linha por provedor: o `config` da linha É a sub-config. O resto do
      // pacote sempre fala em mapa, então o embrulho acontece aqui, num lugar só.
      if (provedor) {
        const sub = mapaDeConfig(linha.config) as Record<string, string>;

        if (Object.keys(sub).length === 0 && chavesLegado.length > 0) {
          for (const [chave, coluna] of chavesLegado) {
            const valor = (data as Record<string, unknown>)[coluna];
            if (typeof valor === "string" && valor.trim()) sub[chave] = valor;
          }
        }

        return { ...linha, config: { [provedor]: sub } };
      }

      return linha;
    },

    async gravar(entrada) {
      const registro: Record<string, unknown> = {
        [colunaTenant]: opcoes.tenantId,
        [colunas.ativo]: entrada.ativo,
        [colunas.atualizadoEm]: new Date().toISOString(),
        [colunas.atualizadoPor]: entrada.porUsuario ?? null,
      };

      if (provedor) {
        registro[colunaProvedor] = provedor;
        registro[colunas.config] = entrada.config[provedor] ?? {};
      } else {
        registro[colunas.config] = entrada.config;
      }

      const { data, error } = await opcoes.cliente
        .from(opcoes.tabela)
        .upsert(registro, { onConflict })
        .select(colunaTenant);

      if (error) throw new Error(erroDe(error));
      if (!data || data.length === 0) {
        throw new Error(`o banco não confirmou a gravação em ${opcoes.tabela}`);
      }
    },
  };
}

// ── Em memória ───────────────────────────────────────────────────────────────
// Para teste, e para exercitar o painel antes de a migration existir.

export function storeMemoria(inicial?: Partial<LinhaConfig>): Store {
  let linha: LinhaConfig | null = inicial
    ? {
        config: inicial.config ?? {},
        ativo: inicial.ativo ?? false,
        atualizadoEm: inicial.atualizadoEm ?? null,
      }
    : null;

  return {
    rotulo: "memória",
    async ler() {
      return linha;
    },
    async gravar(entrada) {
      linha = {
        config: entrada.config,
        ativo: entrada.ativo,
        atualizadoEm: new Date().toISOString(),
      };
    },
  };
}
