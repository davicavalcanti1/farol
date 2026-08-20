/* ARQUIVO GERADO — não edite na cópia.
   Fonte: imago-platform/packages/integracoes/src/router.ts
   Atualize com `node packages/integracoes/sync.mjs`. */

// ─────────────────────────────────────────────────────────────────────────────
// Fábrica das rotas do painel de integração
//
//   GET  /campos        → registro público (a UI se desenha com isto)
//   GET  /              → o que está salvo, com os secretos mascarados
//   PUT  /              → salva, mesclando os secretos que voltaram mascarados
//   POST /importar-env  → traz para o painel o que hoje vive em env var
//   POST /testar        → ping real com as credenciais EFETIVAS
//
// O QUE NÃO ESTÁ AQUI, de propósito: as rotas /webhooks e /modalidades do
// check-in. A primeira mexe em tenant_settings, tabela compartilhada por outros
// módulos da Imago e que exige allowlist de colunas; a segunda depende do dump
// de atendimentos do dia. Nenhuma das duas é "configuração de integração" — são
// features daquele produto, e generalizá-las aqui só criaria abstração que um
// consumidor usa e quatro carregam.
//
// ── O router NÃO importa express ──────────────────────────────────────────────
// O app passa o `Router()` dele. Isto não é preciosismo: o pacote é distribuído
// por cópia para repositórios que fixam versões diferentes (express 4 hoje,
// zod 3 no farol e zod 4 nos outros três), e um import direto transformaria
// divergência de major em erro de compilação na cópia. Pela mesma razão a
// validação do corpo é escrita à mão, em vez de usar zod.
//
// ── Segurança ────────────────────────────────────────────────────────────────
// Nenhuma destas rotas pode ficar aberta: passe `guarda` com o middleware de
// admin/developer do app. O token é a credencial mais sensível do produto e
// nunca sai daqui em claro — o que volta ao navegador é MASK.
// ─────────────────────────────────────────────────────────────────────────────

import {
  MASK,
  mapaDeConfig,
  mascarar,
  mesclar,
  camposPublicos,
  subConfig,
} from "./campos.js";
import type { Resolvedor, ValoresEfetivos } from "./resolvedor.js";

export type Manipulador = (req: any, res: any, next?: any) => unknown;

/** O `Router()` do express satisfaz isto estruturalmente. */
export type RoteadorLike = {
  use(...args: any[]): unknown;
  get(caminho: string, ...manipuladores: any[]): unknown;
  put(caminho: string, ...manipuladores: any[]): unknown;
  post(caminho: string, ...manipuladores: any[]): unknown;
};

export type OpcoesRouter<R extends RoteadorLike> = {
  /** `Router()` do app — devolvido no fim, já com as rotas montadas. */
  roteador: R;
  resolvedor: Resolvedor;
  /** Middleware(s) de autorização. Sem eles, as rotas ficam abertas. */
  guarda?: Manipulador | Manipulador[];
  /** Quem está salvando, para a coluna de auditoria. */
  usuarioDaRequisicao?: (req: any) => string | null | undefined;
  /**
   * Ping read-only no serviço externo, com as credenciais que estão VALENDO
   * (não as do formulário) — é a pergunta que interessa a quem está debugando.
   * Sem esta função, POST /testar responde que não há teste configurado.
   */
  testar?: (efetivos: ValoresEfetivos) => Promise<{ ok: boolean; mensagem: string }>;
  /** Desliga POST /importar-env (útil quando o app nunca teve env var). */
  permitirImportarEnv?: boolean;
  prefixoLog?: string;
};

type CorpoPut = { config: Record<string, string>; ativo: boolean };

/** Validação à mão — ver o cabeçalho sobre não depender de zod. */
function lerCorpoPut(corpo: unknown): { ok: true; dados: CorpoPut } | { ok: false; erro: string } {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return { ok: false, erro: "o corpo deve ser um objeto JSON" };
  }
  const c = corpo as Record<string, unknown>;

  if ("ativo" in c && typeof c.ativo !== "boolean") {
    return { ok: false, erro: '"ativo" deve ser booleano' };
  }

  const config: Record<string, string> = {};
  if ("config" in c && c.config !== undefined && c.config !== null) {
    if (typeof c.config !== "object" || Array.isArray(c.config)) {
      return { ok: false, erro: '"config" deve ser um objeto de campos' };
    }
    for (const [chave, valor] of Object.entries(c.config as Record<string, unknown>)) {
      if (typeof valor !== "string") {
        return { ok: false, erro: `o campo "${chave}" deve ser texto` };
      }
      config[chave] = valor;
    }
  }

  return { ok: true, dados: { config, ativo: Boolean(c.ativo) } };
}

export function criarRouterIntegracao<R extends RoteadorLike>(opcoes: OpcoesRouter<R>): R {
  const { roteador, resolvedor } = opcoes;
  const { registro, provedor, store } = resolvedor;
  const prefixo = opcoes.prefixoLog ?? "[integracao]";
  const permitirImportar = opcoes.permitirImportarEnv ?? true;
  const chavesConhecidas = Object.keys(registro);

  if (opcoes.guarda) {
    const guardas = Array.isArray(opcoes.guarda) ? opcoes.guarda : [opcoes.guarda];
    for (const guarda of guardas) roteador.use(guarda);
  }

  const erroDe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  /** Log pelo globalThis pela mesma razão do resolvedor: zero dependência de
      @types/node numa fonte que é copiada para cinco servidores. */
  const logErro = (onde: string, e: unknown): void => {
    const c = (globalThis as any).console;
    if (c && typeof c.error === "function") c.error(`${prefixo} ${onde}:`, erroDe(e));
  };

  /** Corpo que o painel recebe depois de qualquer leitura ou gravação. */
  async function retrato() {
    const estado = await resolvedor.estado();
    return {
      provedor,
      ativo: estado.ativo,
      config: mascarar(registro, provedor, estado.salvo),
      origem: estado.origem,
      utilizavel: estado.utilizavel,
      atualizadoEm: estado.atualizadoEm,
      /**
       * Quais campos TÊM valor no ambiente agora — booleano, nunca o valor.
       *
       * Existe por causa de um problema real, registrado no board do check-in:
       * as `NETRIS_*` foram removidas do EasyPanel depois que o painel passou a
       * ser a fonte, e desde então **desligar o switch derruba o módulo** em vez
       * de voltar ao ambiente. O painel dizia "só continua de pé se elas ainda
       * existirem", sem saber se existiam.
       *
       * `origem` não responde isso: ela diz quem GANHOU, não se existe reserva.
       * Campo com origem "painel" pode ou não ter variável de ambiente atrás, e
       * a diferença é justamente entre desligar em segurança e derrubar a
       * recepção. Só o servidor sabe, então é o servidor que conta.
       */
      ambienteDisponivel: Object.fromEntries(
        Object.keys(resolvedor.valoresDoAmbiente()).map(chave => [chave, true]),
      ) as Record<string, boolean>,
    };
  }

  // ── GET /campos ────────────────────────────────────────────────────────────
  roteador.get("/campos", (_req: any, res: any) => {
    res.json({ provedor, mask: MASK, ...camposPublicos(registro, provedor) });
  });

  // ── GET / ──────────────────────────────────────────────────────────────────
  roteador.get("/", async (_req: any, res: any) => {
    try {
      res.json(await retrato());
    } catch (erro: unknown) {
      logErro("GET /", erro);
      res.status(500).json({ error: "Erro ao carregar a configuração", detail: erroDe(erro) });
    }
  });

  // ── PUT / ──────────────────────────────────────────────────────────────────
  roteador.put("/", async (req: any, res: any) => {
    const lido = lerCorpoPut(req.body);
    if (!lido.ok) {
      return res.status(400).json({ error: "Parâmetros inválidos", detail: lido.erro });
    }

    try {
      // Lê o que está salvo para preservar duas coisas: os secretos que
      // voltaram como MASK, e as sub-configs dos OUTROS provedores. Foi por
      // sobrescrever o mapa inteiro que, no ExameQR, salvar o método de
      // agendamento apagava a credencial da assinatura eletrônica.
      const linha = await store.ler();
      const mapa = mapaDeConfig(linha?.config);
      const salvo = subConfig(linha?.config, provedor, chavesConhecidas);

      mapa[provedor] = mesclar(registro, provedor, salvo, lido.dados.config);

      await store.gravar({
        config: mapa,
        ativo: lido.dados.ativo,
        porUsuario: opcoes.usuarioDaRequisicao?.(req) ?? null,
      });

      // Efeito imediato, sem esperar o TTL do cache.
      resolvedor.invalidar();
      res.json({ ok: true, ...(await retrato()) });
    } catch (erro: unknown) {
      logErro("PUT /", erro);
      res.status(500).json({ error: "Erro ao salvar a configuração", detail: erroDe(erro) });
    }
  });

  // ── POST /importar-env ─────────────────────────────────────────────────────
  // Copia para o painel as credenciais que hoje vivem em variável de ambiente e
  // liga a integração. Depois disto o painel é a fonte, e as env vars podem sair
  // do EasyPanel.
  //
  // Roda no servidor justamente para que o token não precise passar pelo
  // navegador só para mudar de lugar. Não sobrescreve campo que já tem valor no
  // painel: importar duas vezes não desfaz um ajuste manual.
  roteador.post("/importar-env", async (req: any, res: any) => {
    if (!permitirImportar) {
      return res.status(404).json({ error: "Importação do ambiente desabilitada neste módulo." });
    }

    try {
      const doAmbiente = resolvedor.valoresDoAmbiente();
      const linha = await store.ler();
      const mapa = mapaDeConfig(linha?.config);
      const salvo = subConfig(linha?.config, provedor, chavesConhecidas);

      const novo: Record<string, string> = { ...salvo };
      const importados: string[] = [];
      for (const [chave, valor] of Object.entries(doAmbiente)) {
        if (!valor) continue;
        if ((salvo[chave] ?? "").trim()) continue;
        novo[chave] = valor;
        importados.push(chave);
      }

      if (importados.length === 0) {
        return res.json({
          ok: true,
          importados: [],
          mensagem: "Não havia nada novo no ambiente para importar.",
          ...(await retrato()),
        });
      }

      mapa[provedor] = novo;
      await store.gravar({
        config: mapa,
        ativo: true,
        porUsuario: opcoes.usuarioDaRequisicao?.(req) ?? null,
      });

      resolvedor.invalidar();
      res.json({
        ok: true,
        importados,
        mensagem: `${importados.length} campo(s) trazido(s) do ambiente. O painel agora é a fonte.`,
        ...(await retrato()),
      });
    } catch (erro: unknown) {
      logErro("POST /importar-env", erro);
      res.status(500).json({ error: "Erro ao importar do ambiente", detail: erroDe(erro) });
    }
  });

  // ── POST /testar ───────────────────────────────────────────────────────────
  // Testa o que está VALENDO, não o que está no formulário. A pergunta de quem
  // clica é "a integração funciona agora?", e o formulário pode estar com
  // rascunho não salvo.
  roteador.post("/testar", async (_req: any, res: any) => {
    if (!opcoes.testar) {
      return res.json({ ok: false, mensagem: "Este módulo não tem teste de conexão configurado." });
    }

    try {
      const efetivos = await resolvedor.efetivos();

      if (!efetivos.utilizavel) {
        const faltando = registro[provedor]!.fields
          .filter(f => f.essencial && !efetivos.valores[f.key])
          .map(f => f.label);
        return res.json({
          ok: false,
          mensagem: `Falta configurar (nem no painel, nem no ambiente): ${faltando.join(", ")}.`,
        });
      }

      res.json(await opcoes.testar(efetivos));
    } catch (erro: unknown) {
      // Falha de rede não é erro do servidor: o painel quer "não consegui
      // alcançar", com o motivo, e não um 500 genérico.
      res.json({ ok: false, mensagem: `Falha ao testar: ${erroDe(erro)}` });
    }
  });

  return roteador;
}
