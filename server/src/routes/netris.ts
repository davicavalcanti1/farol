// Rotas NetRis do Farol — recorte das rotas do sistema de origem:
// /atendimentos (dump cacheado), /proxy/* e /pacs/* (proxies autenticados),
// /farol/baixa (sincroniza baixa → NetRis) e /invalidate (limpa cache).

import { Router } from "express";
import { z } from "zod";
import { getCache, setCache, redis } from "../lib/redis.js";
import { exigirTenant, requireAuthFromAny } from "../middleware/auth.js";
import { configNetris } from "../lib/integracaoNetris.js";
import {
  fetchAtendimentosPaginados,
  proxyNetrisRequest,
  proxyPacsRequest,
  patchSituacao,
} from "../lib/netris.js";

/* Todas as rotas daqui passaram a exigir tenant: a credencial do NetRis e por
   tenant desde 20/ago, e sem saber de quem e a requisicao nao ha token para
   usar. `exigirTenant` responde 400 com texto acionavel em vez de deixar o
   resolvedor cair silenciosamente no ambiente e servir a credencial de outro. */

const router = Router();

const NETRIS_CACHE_TTL = 180; // 3 minutos

// GET /api/netris/atendimentos?dataInicial=YYYY-MM-DD&dataFinal=YYYY-MM-DD&filialId=...
router.get("/atendimentos", requireAuthFromAny, exigirTenant, async (req, res) => {
  try {
    const parsed = z
      .object({
        dataInicial: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dataFinal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        filialId: z.string().optional(),
      })
      .safeParse(req.query);

    if (!parsed.success) return res.status(400).json({ error: "Parâmetros inválidos" });

    const tenantId = req.usuario!.tenantId!;
    const cfg = await configNetris(tenantId);

    const { dataInicial, dataFinal, filialId = cfg.filial } = parsed.data;
    /* O tenant entra na chave do cache. Sem ele, o primeiro que consultasse um
       dia aqueceria o cache para TODOS os tenants, e o segundo receberia os
       atendimentos da clinica do primeiro. */
    const cacheKey = `netris:atendimentos:${tenantId}:${dataInicial}:${dataFinal}:${filialId}`;

    const cached = await getCache<unknown[]>(cacheKey);
    if (cached) return res.json({ source: "cache", data: cached });

    const data = await fetchAtendimentosPaginados(cfg, dataInicial, dataFinal, filialId);
    await setCache(cacheKey, data, NETRIS_CACHE_TTL);
    res.json({ source: "db", data });
  } catch (err: any) {
    console.error("[netris] GET /atendimentos:", {
      message: err?.message,
      query: req.query,
      stack: err?.stack?.split("\n").slice(0, 4).join(" | "),
    });
    res.status(500).json({ error: "Erro ao buscar atendimentos NetRis", detail: err?.message ?? String(err) });
  }
});

// ── Proxy genérico autenticado ───────────────────────────────────────────────
// ALL /api/netris/proxy/<path do gateway> — repassa pro NetRis com o token
// server-side. Substitui as chamadas diretas do navegador que carregavam o
// VITE_NETRIS_TOKEN no bundle. Allowlist de prefixo/método na lib.
router.all("/proxy/*", requireAuthFromAny, exigirTenant, async (req, res) => {
  try {
    const path = (req.params as Record<string, string>)[0] ?? "";
    const query = req.originalUrl.split("?")[1] ?? "";
    const result = await proxyNetrisRequest({
      cfg: await configNetris(req.usuario!.tenantId!),
      method: req.method,
      path,
      query,
      body: ["POST", "PATCH", "PUT"].includes(req.method) ? req.body : undefined,
    });
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error("[netris] proxy error:", err?.message);
    res.status(502).json({ error: "Erro no proxy NetRis", detail: err?.message ?? String(err) });
  }
});

// GET /api/netris/pacs/<path> — proxy autenticado pro PACS (Netris-web).
// Usado pelo histórico de situações de atendimento.
router.get("/pacs/*", requireAuthFromAny, exigirTenant, async (req, res) => {
  try {
    const path = (req.params as Record<string, string>)[0] ?? "";
    const query = req.originalUrl.split("?")[1] ?? "";
    const cfg = await configNetris(req.usuario!.tenantId!);
    const result = await proxyPacsRequest({ cfg, path, query });
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error("[netris] pacs proxy error:", err?.message);
    res.status(502).json({ error: "Erro no proxy PACS", detail: err?.message ?? String(err) });
  }
});

// ── POST /api/netris/farol/baixa ─────────────────────────────────────────────
// Sincroniza a baixa do Farol (dispensed_outcome) para o NetRis.
// Chamado pelo darBaixaAtomica depois de marcar dispensed_at no Supabase.
//
// Mapeamento de outcome → idSituacao NetRis:
//   realizado → 18 (EXAME_REALIZADO)
//   cancelado → 5  (CANCELADO)
//   faltou    → 5  (CANCELADO — NetRis não tem "faltou")
//   em_sala   → 45 (EM_SALA)
const OUTCOME_TO_SITUACAO: Record<string, number> = {
  realizado: 18, // EXAME_REALIZADO
  cancelado:  5, // CANCELADO
  faltou:     5, // CANCELADO (aproximação mais próxima)
  em_sala:   45, // EM_SALA
};

router.post("/farol/baixa", requireAuthFromAny, exigirTenant, async (req, res) => {
  const parsed = z.object({
    atendimentoIds: z.array(z.string().regex(/^\d+$/).max(20)).min(1).max(20),
    outcome: z.enum(["realizado", "cancelado", "faltou", "em_sala"]),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Parâmetros inválidos", detail: parsed.error.flatten() });
  }

  const { atendimentoIds, outcome } = parsed.data;
  const situacaoId = OUTCOME_TO_SITUACAO[outcome];
  const tenantId = req.usuario!.tenantId!;
  const cfg = await configNetris(tenantId);

  const results = await Promise.allSettled(
    atendimentoIds.map(id => patchSituacao(cfg, id, situacaoId))
  );

  const erros = results
    .map((r, i) => r.status === "rejected" ? { id: atendimentoIds[i], erro: String(r.reason) } : null)
    .filter(Boolean);

  if (erros.length) {
    console.error("[netris] farol/baixa: erros parciais", erros);
  }

  // Invalida cache do dump do dia — próxima consulta vai buscar o estado novo
  try {
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    /* O tenant tambem entra AQUI, e nao e detalhe: a chave passou a comecar
       com o tenant, entao o padrao antigo (`...:${hoje}:${hoje}:*`) deixaria de
       casar com qualquer chave. A invalidacao pararia de funcionar em silencio,
       e o sintoma seria "dei baixa e o Farol nao atualizou" por 3 minutos. */
    const pattern = `netris:atendimentos:${tenantId}:${hoje}:${hoje}:*`;
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
  } catch { /* cache é best-effort */ }

  res.json({
    ok: true,
    situacao_id: situacaoId,
    atualizados: results.filter(r => r.status === "fulfilled").length,
    erros: erros.length,
  });
});

// POST /api/netris/invalidate — limpa todo cache NetRis (chamar após alterar situação)
router.post("/invalidate", requireAuthFromAny, exigirTenant, async (req, res) => {
  try {
    /* Limpa so o cache do proprio tenant. Antes o padrao era global, o que com
       um tenant so dava no mesmo; com dois, um usuario limparia o cache do
       outro e a clinica vizinha pagaria a conta em chamadas ao NetRis. */
    const prefixo = `netris:atendimentos:${req.usuario!.tenantId!}:*`;
    let cursor = "0", keys: string[] = [];
    do {
      const [next, batch] = await redis.scan(cursor, "MATCH", prefixo, "COUNT", 100);
      cursor = next; keys.push(...batch);
    } while (cursor !== "0");
    if (keys.length > 0) await redis.del(...keys);
    res.json({ invalidated: keys.length });
  } catch (err: any) {
    console.error("[netris] POST /invalidate:", err.message);
    res.status(500).json({ error: "Erro ao invalidar cache NetRis" });
  }
});

export default router;
