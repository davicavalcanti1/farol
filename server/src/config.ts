import { z } from "zod";

/**
 * Validação do ambiente na subida do processo.
 *
 * O problema que isto resolve: env ausente hoje não dá erro na subida — ela vira
 * `undefined`, o processo sobe normalmente, e a falha aparece na primeira
 * requisição que dependia dela. Às vezes semanas depois, em produção, como um 500
 * sem explicação.
 *
 * ── Por que só o Supabase é fatal ─────────────────────────────────────────────
 * Sem `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` este serviço não faz nada: não
 * há o que servir. Já as variáveis do NetRis derrubam **uma parte** do módulo, e
 * transformar isso em recusa de subida seria trocar "uma feature degradada" por
 * "o módulo inteiro fora do ar" — pior para quem usa.
 *
 * Elas viram aviso alto no log, listando o que deixa de funcionar. Se um dia
 * ficarem realmente indispensáveis, mova para o esquema obrigatório de propósito,
 * não por descuido.
 */

const obrigatorias = z.object({
  SUPABASE_URL: z.string().url({
    message: "precisa ser a URL do projeto Supabase (https://xxx.supabase.co)",
  }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, {
    message: "ausente ou truncada",
  }),
});

const comDefault = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

/** Ausência degrada uma parte do módulo, não derruba o serviço. */
const OPCIONAIS_QUE_IMPORTAM: Array<{ nome: string; semEla: string }> = [
  { nome: "NETRIS_BASE_URL", semEla: "nenhuma chamada ao NetRis funciona" },
  { nome: "NETRIS_TOKEN", semEla: "o NetRis recusa toda requisição (401)" },
  { nome: "NETRIS_FILIAL_ID", semEla: "as buscas saem sem filtro de filial" },
  { nome: "NETRIS_PACS_BASE_URL", semEla: "as chamadas ao Netpacs falham" },
  { nome: "REDIS_URL", semEla: "cache desligado — mais chamadas ao NetRis" },
];

const parsed = obrigatorias.merge(comDefault).safeParse(process.env);

if (!parsed.success) {
  const problemas = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");

  console.error(
    `\n✕ [farol-api] ambiente inválido — o processo não vai subir:\n\n${problemas}\n\n` +
      `Confira o .env (ou as variáveis do EasyPanel). Referência: .env.example\n`,
  );
  process.exit(1);
}

export const config = parsed.data;
export const emProducao = config.NODE_ENV === "production";

// ── Avisos ───────────────────────────────────────────────────────────────────
const faltando = OPCIONAIS_QUE_IMPORTAM.filter((v) => !process.env[v.nome]);

if (faltando.length > 0) {
  console.warn(
    `\n⚠ [farol-api] ${faltando.length} variável(is) ausente(s). O serviço sobe, mas:\n` +
      faltando.map((v) => `  - sem ${v.nome}: ${v.semEla}`).join("\n") +
      `\n`,
  );
}

/**
 * VITE_NETRIS_TOKEN não deve existir mais.
 *
 * Ela era lida pelo frontend, o que colocava o token do NetRis no bundle —
 * legível por qualquer um no devtools. Isso foi corrigido com o proxy autenticado
 * em /api/netris/proxy, e `lib/netris.ts` só a mantém como fallback histórico.
 *
 * O aviso existe porque a armadilha continua armada: quem setar essa variável
 * achando que ajuda recoloca o token no bundle, e nada mais no sistema reclama.
 */
if (process.env.VITE_NETRIS_TOKEN) {
  console.warn(
    `\n⚠ [farol-api] VITE_NETRIS_TOKEN está definida — REMOVA.\n` +
      `  Toda variável VITE_* é inlinada no bundle do frontend pelo Vite, então\n` +
      `  este token fica legível por qualquer visitante no devtools. Use\n` +
      `  NETRIS_TOKEN (sem prefixo): o proxy em /api/netris/proxy injeta o token\n` +
      `  server-side e o browser nunca o vê.\n`,
  );
}
