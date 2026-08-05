// ─────────────────────────────────────────────────────────────────────────────
// NetRis — Biblioteca de integração server-side (versão do Farol)
//
// Recorte da lib do sistema de origem com só o que o Farol usa:
//   1. CONFIG      — env vars e constantes
//   2. TRANSPORT   — fetch paginado, chunking, deduplicação
//   3. ATENDIMENTOS — fetch + cache
//   7. OPERAÇÕES CLÍNICAS — patchSituacao (baixa do Farol)
//   9. PROXY       — proxyNetrisRequest, proxyPacsRequest
//
// Regra: o frontend NUNCA chama o NetRis diretamente. Tudo passa pelo Express
// (token injetado server-side). As rotas em routes/netris.ts delegam pra cá.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. CONFIG ────────────────────────────────────────────────────────────────
// TOKEN e FILIAL_ID aceitam o prefixo VITE_ como fallback (mesmo valor, var diferente)
export const NETRIS_FILIAL =
  process.env.NETRIS_FILIAL_ID ?? process.env.VITE_NETRIS_FILIAL_ID ?? "";

const NETRIS_BASE = process.env.NETRIS_BASE_URL ?? "";
const NETRIS_TOKEN =
  process.env.NETRIS_TOKEN ?? process.env.VITE_NETRIS_TOKEN ?? "";

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

// Quantos dias por chunk quando o intervalo for grande.
// 7 dias é o ponto ótimo: raramente passa de 2 páginas por chunk,
// e 4 chunks em paralelo (28 dias) encaixam dentro do timeout do gateway.
const CHUNK_DAYS = 7;

// Quantos chunks rodam em paralelo (não sobrecarrega o NetRis).
const CHUNK_CONCURRENCY = 4;

// ── 2. TRANSPORT ─────────────────────────────────────────────────────────────
// Fetch paginado, chunking de intervalos longos e deduplicação.
// Estas funções são privadas — use fetchAtendimentosPaginados/Cacheado.

function isoToBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Divide um intervalo ISO em sub-intervalos de até maxDays dias.
function chunkDateRange(
  fromISO: string,
  toISO:   string,
  maxDays: number,
): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  let cur = new Date(fromISO + "T00:00:00Z");
  const end = new Date(toISO + "T00:00:00Z");
  while (cur <= end) {
    const chunkEnd = new Date(cur);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      start: cur.toISOString().slice(0, 10),
      end:   chunkEnd.toISOString().slice(0, 10),
    });
    cur = new Date(chunkEnd);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return chunks;
}

function unwrapList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const k of ["aaData", "content", "data", "items", "result"]) {
      if (Array.isArray(obj[k])) return obj[k] as unknown[];
    }
  }
  return [];
}

// ── 3. ATENDIMENTOS ──────────────────────────────────────────────────────────
// Cache wrapper pro fetch paginado de atendimentos. A mesma chave/TTL que
// a rota autenticada /api/netris/atendimentos usa em routes/netris.ts.
// TTL 3min é suficiente porque na clínica o dataset muda devagar.
const ATENDIMENTOS_CACHE_TTL = 180;
export async function fetchAtendimentosDoDiaCacheado(
  dataInicial: string,
  dataFinal: string,
  filialId: string,
  skipCache = false,
): Promise<Record<string, unknown>[]> {
  const { getCache, setCache } = await import("./redis.js");
  const cacheKey = `netris:atendimentos:${dataInicial}:${dataFinal}:${filialId}`;
  if (!skipCache) {
    const cached = await getCache<Record<string, unknown>[]>(cacheKey);
    if (cached) return cached;
  }
  const data = await fetchAtendimentosPaginados(dataInicial, dataFinal, filialId);
  await setCache(cacheKey, data as Record<string, unknown>[], ATENDIMENTOS_CACHE_TTL);
  return data as Record<string, unknown>[];
}

// Busca todas as páginas de UM chunk de datas (loop sequencial interno).
// Chamado tanto diretamente (intervalo curto) quanto em paralelo (intervalo longo).
async function fetchChunkPaginado(
  dataInicial: string,
  dataFinal:   string,
  filialId:    string,
): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      filialId,
      limit:        String(PAGE_SIZE),
      page:         String(page),
      dataInicial:  isoToBR(dataInicial),
      dataFinal:    isoToBR(dataFinal),
    });
    const url = `${NETRIS_BASE}/netris/api/atendimentos?${params}`;
    // Timeout de 20s por página — evita travar num chunk que nunca responde
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "Content-Type": "application/json", Authorization: NETRIS_TOKEN },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      console.error("[netris-lib] upstream error", {
        status:      res.status,
        page,
        dataInicial,
        dataFinal,
        filialId,
        bodySnippet: body.slice(0, 300),
      });
      throw new Error(`NetRis ${res.status}: ${body.slice(0, 200)}`);
    }
    const raw: unknown = await res.json();
    const pageData = unwrapList(raw);
    all.push(...pageData);
    if (pageData.length < PAGE_SIZE) break;
  }
  return all;
}

// Busca atendimentos de um intervalo, quebrando em chunks semanais paralelos
// quando o intervalo for grande — evita 504 por timeout do gateway.
//
// Estratégia:
//   1. Divide o intervalo em janelas de CHUNK_DAYS dias.
//   2. Processa CHUNK_CONCURRENCY janelas em paralelo.
//   3. Deduplica pelo idAtendimentoProcedimento (sem risco de duplicata entre
//      janelas contíguas, mas faz a proteção por segurança).
//   4. Intervalo curto (≤ CHUNK_DAYS) vai direto sem overhead de deduplicação.
export async function fetchAtendimentosPaginados(
  dataInicial: string,
  dataFinal:   string,
  filialId:    string,
): Promise<unknown[]> {
  if (!NETRIS_BASE || !NETRIS_TOKEN) {
    throw new Error("NetRis não configurado no servidor (NETRIS_BASE_URL / NETRIS_TOKEN ausentes)");
  }

  const chunks = chunkDateRange(dataInicial, dataFinal, CHUNK_DAYS);

  // Intervalo curto — caminho simples sem overhead
  if (chunks.length === 1) {
    return fetchChunkPaginado(dataInicial, dataFinal, filialId);
  }

  console.info("[netris-lib] fetchAtendimentosPaginados: intervalo longo, usando chunks paralelos", {
    dataInicial,
    dataFinal,
    chunks: chunks.length,
    concurrency: CHUNK_CONCURRENCY,
  });

  const all: unknown[] = [];
  const seen = new Set<string>();

  // Processa lotes de CHUNK_CONCURRENCY chunks em paralelo
  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const lote = chunks.slice(i, i + CHUNK_CONCURRENCY);
    const resultados = await Promise.all(
      lote.map(c => fetchChunkPaginado(c.start, c.end, filialId)),
    );
    for (const items of resultados) {
      for (const item of items) {
        const id = String(
          (item as Record<string, unknown>).idAtendimentoProcedimento ??
          (item as Record<string, unknown>).id ??
          "",
        );
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        all.push(item);
      }
    }
  }

  console.info("[netris-lib] fetchAtendimentosPaginados: concluído", {
    dataInicial,
    dataFinal,
    totalItems: all.length,
  });

  return all;
}

// ── 7. OPERAÇÕES CLÍNICAS ────────────────────────────────────────────────────
/** PATCH /netris/api/atendimentos/{id}/alterar-situacao */
export async function patchSituacao(
  atendimentoId: string,
  idSituacao: number
): Promise<{ status: number; ok: boolean; body: unknown }> {
  if (!NETRIS_BASE || !NETRIS_TOKEN) {
    throw new Error("NetRis não configurado no servidor");
  }
  const url = `${NETRIS_BASE}/netris/api/atendimentos/${encodeURIComponent(atendimentoId)}/alterar-situacao`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: NETRIS_TOKEN },
    body: JSON.stringify({ idSituacao: idSituacao }),
  });
  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
  if (!res.ok) {
    console.error("[netris-lib] patchSituacao erro", { status: res.status, atendimentoId, bodySnippet: typeof parsed === "string" ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200) });
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

// ── 9. PROXY ─────────────────────────────────────────────────────────────────
// Repassa uma chamada do frontend pro api-gateway com o token SERVER-SIDE.
// Existe pra tirar o VITE_NETRIS_TOKEN do bundle: o cliente chama
// /api/netris/proxy/<path> autenticado e o servidor injeta o Authorization.
//
// Allowlist de prefixo: só /netris/api/* e /netpacs/api/* passam — nada de
// alcançar outros serviços do gateway por aqui.
const PROXY_ALLOWED_PREFIXES = ["netris/api/", "netpacs/api/"];
const PROXY_ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "PUT"]);

export type NetrisProxyResult = {
  status: number;
  ok: boolean;
  body: string;
  contentType: string;
};

export async function proxyNetrisRequest(params: {
  method: string;
  path: string;            // path depois de /proxy/, SEM barra inicial
  query?: string;          // query string crua (sem "?")
  body?: unknown;
}): Promise<NetrisProxyResult> {
  if (!NETRIS_BASE || !NETRIS_TOKEN) {
    throw new Error("NetRis não configurado no servidor (NETRIS_BASE_URL / NETRIS_TOKEN ausentes)");
  }
  const method = params.method.toUpperCase();
  if (!PROXY_ALLOWED_METHODS.has(method)) {
    return { status: 405, ok: false, body: JSON.stringify({ error: "Método não permitido" }), contentType: "application/json" };
  }
  const clean = params.path.replace(/^\/+/, "");
  if (clean.includes("..") || !PROXY_ALLOWED_PREFIXES.some(p => clean.startsWith(p))) {
    return { status: 403, ok: false, body: JSON.stringify({ error: "Caminho não permitido" }), contentType: "application/json" };
  }

  const url = `${NETRIS_BASE}/${clean}${params.query ? `?${params.query}` : ""}`;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Authorization: NETRIS_TOKEN },
  };
  if (method !== "GET" && params.body !== undefined) {
    init.body = JSON.stringify(params.body);
  }
  const res = await fetch(url, init);
  const text = await res.text().catch(() => "");
  return {
    status: res.status,
    ok: res.ok,
    body: text,
    contentType: res.headers.get("content-type") ?? "application/json",
  };
}

// ── Proxy pro PACS (Netris-web) ──────────────────────────────────────────────
// Mesmo papel do proxy acima, mas pro host do PACS (histórico de situações).
const NETRIS_PACS_BASE =
  process.env.NETRIS_PACS_BASE_URL ?? "https://pacs.imagoradiologia.com.br/Netris-web";

export async function proxyPacsRequest(params: {
  path: string;
  query?: string;
}): Promise<NetrisProxyResult> {
  if (!NETRIS_TOKEN) {
    throw new Error("NetRis não configurado no servidor (NETRIS_TOKEN ausente)");
  }
  const clean = params.path.replace(/^\/+/, "");
  if (clean.includes("..")) {
    return { status: 403, ok: false, body: JSON.stringify({ error: "Caminho não permitido" }), contentType: "application/json" };
  }
  const url = `${NETRIS_PACS_BASE}/${clean}${params.query ? `?${params.query}` : ""}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", Authorization: NETRIS_TOKEN },
  });
  const text = await res.text().catch(() => "");
  return {
    status: res.status,
    ok: res.ok,
    body: text,
    contentType: res.headers.get("content-type") ?? "application/json",
  };
}
