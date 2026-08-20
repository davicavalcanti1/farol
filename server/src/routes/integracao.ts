// ─────────────────────────────────────────────────────────────────────────────
// /api/integracao — a rota que faz o token do NetRis deixar de exigir redeploy
//
// O corpo desta rota não é escrito aqui: `criarRouterIntegracao` do
// @imago/integracoes monta GET /campos, GET /, PUT / , POST /importar-env e
// POST /testar a partir do registro de campos. Este arquivo é só a fiação — e é
// de propósito que ele seja curto: o que estava copiado em quatro dialetos
// (check-in, ocorrências, ExameQR, receituários) agora vem de um lugar com 39
// testes atrás.
//
// ── O TENANT VEM DA SESSÃO, NUNCA DA REQUISIÇÃO ──────────────────────────────
// O resolvedor é escolhido pelo `tenantId` do perfil autenticado. Aceitar
// `?tenantId=` do cliente permitiria a um admin de um tenant ler e sobrescrever
// a credencial de outro — e como a rota roda com service_role, a RLS não
// seguraria. Por isso o router é montado por requisição, sobre o resolvedor
// daquele tenant.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from "express";
import { criarRouterIntegracao } from "../integracoes/index.js";
import { resolvedorNetris } from "../lib/integracaoNetris.js";
import {
  exigirPapel,
  exigirTenant,
  PAPEIS_CONFIGURACAO,
  requireAuthFromAny,
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuthFromAny, exigirTenant, exigirPapel(...PAPEIS_CONFIGURACAO));

/**
 * Um router do pacote por tenant, montado na hora e servindo esta requisição.
 *
 * Parece desperdício e não é: `criarRouterIntegracao` só registra handlers num
 * `Router()` — o que custa é a consulta ao banco, e essa está atrás do cache de
 * 60s do resolvedor, que é compartilhado por tenant. A alternativa seria um
 * cache de routers, que é estado a mais para o mesmo efeito.
 */
router.use((req: Request, res: Response, next: NextFunction) => {
  const tenantId = req.usuario!.tenantId!;

  const doTenant = criarRouterIntegracao({
    roteador: Router(),
    resolvedor: resolvedorNetris(tenantId),
    // Quem salvou fica na linha. É a única trilha de quem trocou a credencial,
    // e é a primeira pergunta quando o NetRis começa a devolver 401.
    usuarioDaRequisicao: (r: Request) => r.usuario?.id ?? null,
    testar: async (efetivos) => {
      // Um GET barato e autenticado: se o token estiver errado, o gateway
      // devolve 401 e a mensagem diz isso — que é o que a pessoa precisa saber
      // depois de colar uma credencial nova.
      const base = efetivos.valores.base_url ?? "";
      const params = new URLSearchParams({
        filialId: efetivos.valores.filial_id ?? "",
        limit: "1",
        page: "1",
        dataInicial: hojeBR(),
        dataFinal: hojeBR(),
      });

      const controlador = new AbortController();
      const timer = setTimeout(() => controlador.abort(), 15_000);
      try {
        const r = await fetch(`${base}/netris/api/atendimentos?${params}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: efetivos.valores.token ?? "",
          },
          signal: controlador.signal,
        });
        if (r.status === 401 || r.status === 403) {
          return { ok: false, mensagem: `O NetRis recusou a credencial (HTTP ${r.status}).` };
        }
        if (!r.ok) {
          const corpo = await r.text().catch(() => "");
          return {
            ok: false,
            mensagem: `O NetRis respondeu HTTP ${r.status}. ${corpo.slice(0, 120)}`.trim(),
          };
        }
        return { ok: true, mensagem: "Conexão com o NetRis funcionando." };
      } catch (erro: unknown) {
        // Timeout e DNS chegam aqui, e são o caso mais comum de URL errada.
        const msg = erro instanceof Error ? erro.message : String(erro);
        return { ok: false, mensagem: `Não foi possível alcançar o gateway: ${msg}` };
      } finally {
        clearTimeout(timer);
      }
    },
  });

  return doTenant(req, res, next);
});

/** Data de hoje em BRT no formato dd/MM/yyyy, que é o que o NetRis aceita. */
function hojeBR(): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export default router;
