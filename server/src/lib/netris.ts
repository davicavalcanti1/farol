// ─────────────────────────────────────────────────────────────────────────────
// NetRis — Biblioteca de integração server-side (versão do Farol)
//
// Recorte da lib do sistema de origem com só o que o Farol usa:
import type { ConfigNetris } from "./integracaoNetris.js";

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
// As credenciais NAO moram mais aqui.
//
// Ate 20/ago este bloco era:
//
//     const NETRIS_TOKEN = process.env.NETRIS_TOKEN ?? "";
//
// Uma const no topo do modulo e avaliada UMA vez, no carregamento. Trocar a
// variavel no EasyPanel nao tinha efeito nenhum ate o processo reiniciar - e
// quem troca um token esta com pressa, porque o antigo venceu e o NetRis esta
// devolvendo 401 para a recepcao inteira.
//
// Agora cada funcao recebe cfg, resolvido POR TENANT em lib/integracaoNetris.ts,
// com a precedencia painel > ambiente > default e cache de 60s. As variaveis
// NETRIS_* continuam valendo como rede de seguranca, entao nada muda enquanto
// ninguem salvar no painel.
//
// NETRIS_FILIAL saiu daqui junto: a filial e campo de configuracao como os
// outros, e as rotas leem cfg.filial.

/* A mensagem num lugar so: ela agora precisa apontar as DUAS fontes, senao
   manda a pessoa mexer em variavel de ambiente quando o problema esta no
   painel. */
const ERRO_NAO_CONFIGURADO =
  "NetRis não configurado: preencha URL base e Token em /farol/configurações " +
  "(ou nas variáveis NETRIS_BASE_URL / NETRIS_TOKEN).";

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
  cfg: ConfigNetris,
  tenantId: string,
  dataInicial: string,
  dataFinal: string,
  filialId: string,
  skipCache = false,
): Promise<Record<string, unknown>[]> {
  const { getCache, setCache } = await import("./redis.js");
  // O tenant entra na chave porque a credencial passou a ser por tenant: sem
  // ele, o primeiro que consulta um dia aquece o cache para TODOS, e o segundo
  // tenant recebe os atendimentos da clinica do primeiro. Hoje ha um tenant so,
  // e por isso isto seria invisivel; no dia do segundo seria vazamento.
  const cacheKey = `netris:atendimentos:${tenantId}:${dataInicial}:${dataFinal}:${filialId}`;
  if (!skipCache) {
    const cached = await getCache<Record<string, unknown>[]>(cacheKey);
    if (cached) return cached;
  }
  const data = await fetchAtendimentosPaginados(cfg, dataInicial, dataFinal, filialId);
  await setCache(cacheKey, data as Record<string, unknown>[], ATENDIMENTOS_CACHE_TTL);
  return data as Record<string, unknown>[];
}

// Busca todas as páginas de UM chunk de datas (loop sequencial interno).
// Chamado tanto diretamente (intervalo curto) quanto em paralelo (intervalo longo).
async function fetchChunkPaginado(
  cfg:         ConfigNetris,
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
    const url = `${cfg.base}/netris/api/atendimentos?${params}`;
    // Timeout de 20s por página — evita travar num chunk que nunca responde
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "Content-Type": "application/json", Authorization: cfg.token },
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
  cfg:         ConfigNetris,
  dataInicial: string,
  dataFinal:   string,
  filialId:    string,
): Promise<unknown[]> {
  if (!cfg.utilizavel) {
    throw new Error(ERRO_NAO_CONFIGURADO);
  }

  const chunks = chunkDateRange(dataInicial, dataFinal, CHUNK_DAYS);

  // Intervalo curto — caminho simples sem overhead
  if (chunks.length === 1) {
    return fetchChunkPaginado(cfg, dataInicial, dataFinal, filialId);
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
      lote.map(c => fetchChunkPaginado(cfg, c.start, c.end, filialId)),
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
  cfg: ConfigNetris,
  atendimentoId: string,
  idSituacao: number
): Promise<{ status: number; ok: boolean; body: unknown }> {
  if (!cfg.utilizavel) {
    throw new Error(ERRO_NAO_CONFIGURADO);
  }
  const url = `${cfg.base}/netris/api/atendimentos/${encodeURIComponent(atendimentoId)}/alterar-situacao`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: cfg.token },
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
  cfg: ConfigNetris;
  method: string;
  path: string;            // path depois de /proxy/, SEM barra inicial
  query?: string;          // query string crua (sem "?")
  body?: unknown;
}): Promise<NetrisProxyResult> {
  if (!params.cfg.utilizavel) {
    throw new Error(ERRO_NAO_CONFIGURADO);
  }
  const method = params.method.toUpperCase();
  if (!PROXY_ALLOWED_METHODS.has(method)) {
    return { status: 405, ok: false, body: JSON.stringify({ error: "Método não permitido" }), contentType: "application/json" };
  }
  const clean = params.path.replace(/^\/+/, "");
  if (clean.includes("..") || !PROXY_ALLOWED_PREFIXES.some(p => clean.startsWith(p))) {
    return { status: 403, ok: false, body: JSON.stringify({ error: "Caminho não permitido" }), contentType: "application/json" };
  }

  const url = `${params.cfg.base}/${clean}${params.query ? `?${params.query}` : ""}`;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Authorization: params.cfg.token },
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
// O endereco do PACS tambem virou campo de configuracao; o default historico
// mora no registro de campos como "padrao", que nao e importavel para o painel
// de proposito - se fosse, mudar o default no codigo deixaria de ter efeito.
export async function proxyPacsRequest(params: {
  cfg: ConfigNetris;
  path: string;
  query?: string;
}): Promise<NetrisProxyResult> {
  if (!params.cfg.token) {
    // O PACS nao usa base_url do gateway, so o token: cobrar utilizavel aqui
    // bloquearia o historico de situacoes por falta de um campo que ele nem usa.
    throw new Error("NetRis sem token: preencha em /farol/configurações ou em NETRIS_TOKEN.");
  }
  const clean = params.path.replace(/^\/+/, "");
  if (clean.includes("..")) {
    return { status: 403, ok: false, body: JSON.stringify({ error: "Caminho não permitido" }), contentType: "application/json" };
  }
  const url = `${params.cfg.pacsBase}/${clean}${params.query ? `?${params.query}` : ""}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", Authorization: params.cfg.token },
  });
  const text = await res.text().catch(() => "");
  return {
    status: res.status,
    ok: res.ok,
    body: text,
    contentType: res.headers.get("content-type") ?? "application/json",
  };
}
