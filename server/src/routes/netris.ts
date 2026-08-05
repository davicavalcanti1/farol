// Rotas NetRis do Farol — recorte das rotas do sistema de origem:
// /atendimentos (dump cacheado), /proxy/* e /pacs/* (proxies autenticados),
// /farol/baixa (sincroniza baixa → NetRis) e /invalidate (limpa cache).

import { Router } from "express";
import { z } from "zod";
import { getCache, setCache, redis } from "../lib/redis.js";
import { requireAuthFromAny } from "../middleware/auth.js";
import {
  fetchAtendimentosPaginados,
  NETRIS_FILIAL,
  proxyNetrisRequest,
  proxyPacsRequest,
  patchSituacao,
} from "../lib/netris.js";

const router = Router();

const NETRIS_CACHE_TTL = 180; // 3 minutos

// GET /api/netris/atendimentos?dataInicial=YYYY-MM-DD&dataFinal=YYYY-MM-DD&filialId=...
router.get("/atendimentos", requireAuthFromAny, async (req, res) => {
  try {
    const parsed = z
      .object({
        dataInicial: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dataFinal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        filialId: z.string().optional(),
      })
      .safeParse(req.query);

    if (!parsed.success) return res.status(400).json({ error: "Parâmetros inválidos" });

    const { dataInicial, dataFinal, filialId = NETRIS_FILIAL } = parsed.data;
    const cacheKey = `netris:atendimentos:${dataInicial}:${dataFinal}:${filialId}`;

    const cached = await getCache<unknown[]>(cacheKey);
    if (cached) return res.json({ source: "cache", data: cached });

    const data = await fetchAtendimentosPaginados(dataInicial, dataFinal, filialId);
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
router.all("/proxy/*", requireAuthFromAny, async (req, res) => {
  try {
    const path = (req.params as Record<string, string>)[0] ?? "";
    const query = req.originalUrl.split("?")[1] ?? "";
    const result = await proxyNetrisRequest({
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
router.get("/pacs/*", requireAuthFromAny, async (req, res) => {
  try {
    const path = (req.params as Record<string, string>)[0] ?? "";
    const query = req.originalUrl.split("?")[1] ?? "";
    const result = await proxyPacsRequest({ path, query });
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

router.post("/farol/baixa", requireAuthFromAny, async (req, res) => {
  const parsed = z.object({
    atendimentoIds: z.array(z.string().regex(/^\d+$/).max(20)).min(1).max(20),
    outcome: z.enum(["realizado", "cancelado", "faltou", "em_sala"]),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Parâmetros inválidos", detail: parsed.error.flatten() });
  }

  const { atendimentoIds, outcome } = parsed.data;
  const situacaoId = OUTCOME_TO_SITUACAO[outcome];

  const results = await Promise.allSettled(
    atendimentoIds.map(id => patchSituacao(id, situacaoId))
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
    const pattern = `netris:atendimentos:${hoje}:${hoje}:*`;
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
router.post("/invalidate", requireAuthFromAny, async (req, res) => {
  try {
    let cursor = "0", keys: string[] = [];
    do {
      const [next, batch] = await redis.scan(cursor, "MATCH", "netris:atendimentos:*", "COUNT", 100);
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
