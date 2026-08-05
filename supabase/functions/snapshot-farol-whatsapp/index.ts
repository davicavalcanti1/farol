// Edge Function: snapshot-farol-whatsapp
// Envia o status atual do Farol (pacientes aguardando) via WhatsApp (uazapi).
// Chamada pelo pg_cron de hora em hora das 07h às 11h BRT
// (cron rodando 10-14 UTC em America/Recife, sem horário de verão).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Configuração vem TODA de Supabase secrets — repo é público, nada de
// instância/número/token hardcoded. Sem UAZAPI_URL ou números, a function
// loga e sai sem enviar (não é erro: instalação sem WhatsApp configurado).
const UAZAPI_URL   = Deno.env.get("UAZAPI_URL")   ?? "";
const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN") ?? "";
const TENANT_SLUG  = Deno.env.get("TENANT_SLUG")  ?? "imago";

const NUMEROS = (Deno.env.get("FAROL_WHATSAPP_NUMEROS") ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);

// Espelha o catálogo /netris/api/modalidades (filial 1) — atualizado em 26/mai/2026.
// Quando o NetRis adicionar uma modalidade nova, basta acrescentar aqui;
// se faltar mapeamento, o snapshot cai em "Mod. N" como fallback.
const MODALIDADE_LABELS: Record<number, string> = {
  1:  "Raio-X",
  2:  "Ultrassom",
  3:  "Anestesia",
  4:  "Tomografia",
  5:  "Ressonância",
  6:  "Mamografia",
  7:  "Densitometria",
  8:  "Biópsia US",
  9:  "Biópsia TC",
  10: "Ecocardiograma",
  14: "EEG",
  15: "ECG",
  16: "RM c/ contraste",
  17: "MAPA",
  18: "Espirometria",
  19: "Holter",
  20: "Retorno MAPA",
  21: "Retorno Holter",
  22: "Polissonografia",
  23: "Teste Ergométrico",
  24: "Histerossalpingografia",
  25: "USG Endometriose",
  26: "Raio-X Online",
};

// Heurística de localidade — espelha src/features/farol/utils/localidade.ts.
// NetRis não devolve campo de localidade explícito; o nome da sala é o único
// identificador. O default "Principal" segura sem quebrar se aparecer sala
// nova fora dos 4 endereços operacionais.
const LOCALIDADES = ["Principal", "Anexo", "San Pietro", "Queimadas"] as const;
type Localidade = (typeof LOCALIDADES)[number];

function salaToLocalidade(sala: string | null | undefined): Localidade {
  if (!sala) return "Principal";
  const s = sala.toUpperCase();
  if (s.includes("SAN PIETRO")) return "San Pietro";
  if (s.includes("QUEIMADAS"))  return "Queimadas";
  if (s.includes("ANEXO"))      return "Anexo";
  return "Principal";
}

function formatEspera(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}min`;
  return `${h}h${String(m).padStart(2, "0")}min`;
}

// Envio para uazapi com retry em falhas transitórias.
// Retry só em erros de rede e HTTP 408/429/5xx — 4xx (auth/payload) não adianta
// repetir. Backoff exponencial: 300ms → 900ms → 2700ms (~4s total no pior caso).
async function sendWithRetry(numero: string, text: string): Promise<{ ok: boolean; erro?: string; tentativas: number }> {
  if (!UAZAPI_TOKEN || !UAZAPI_URL) {
    return { ok: false, erro: "UAZAPI_TOKEN/UAZAPI_URL não configurados (secrets ausentes)", tentativas: 0 };
  }
  const MAX = 3;
  let ultimoErro = "";

  for (let tentativa = 1; tentativa <= MAX; tentativa++) {
    try {
      const resp = await fetch(UAZAPI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": UAZAPI_TOKEN },
        body: JSON.stringify({ number: numero, text }),
      });
      if (resp.ok) return { ok: true, tentativas: tentativa };

      const body = await resp.text();
      ultimoErro = `HTTP ${resp.status}: ${body.slice(0, 200)}`;

      const retriavel = resp.status === 408 || resp.status === 429 || resp.status >= 500;
      if (!retriavel) return { ok: false, erro: ultimoErro, tentativas: tentativa };
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
      // erros de rede sempre são retriáveis
    }

    if (tentativa < MAX) {
      const delay = 300 * Math.pow(3, tentativa - 1); // 300, 900, 2700
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return { ok: false, erro: ultimoErro, tentativas: MAX };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Tenant ─────────────────────────────────────────────────────────────
    const { data: tenant } = await supabase
      .from("tenants").select("id").eq("slug", TENANT_SLUG).eq("is_active", true).maybeSingle();

    if (!tenant) return json({ error: "Tenant não encontrado" }, 404);

    // ── Data e hora atual em BRT ───────────────────────────────────────────
    const utcNow = new Date();
    const brt    = new Date(utcNow.getTime() - 3 * 60 * 60 * 1000);
    const dataRef = `${brt.getUTCFullYear()}-${String(brt.getUTCMonth()+1).padStart(2,"0")}-${String(brt.getUTCDate()).padStart(2,"0")}`;
    const dataBR  = `${String(brt.getUTCDate()).padStart(2,"0")}/${String(brt.getUTCMonth()+1).padStart(2,"0")}/${brt.getUTCFullYear()}`;
    const horaBR  = `${String(brt.getUTCHours()).padStart(2,"0")}:${String(brt.getUTCMinutes()).padStart(2,"0")}`;

    // ── Pacientes no farol hoje ────────────────────────────────────────────
    // Filtros idênticos ao FarolHub (src/features/farol/pages/FarolHub.tsx):
    //   - situacao_id ∈ STATUS_FAROL (13/61/62/63/64) — pipeline de exame
    //   - dispensed_at IS NULL — exclui quem já recebeu baixa
    const STATUS_FAROL = [13, 61, 62, 63, 64];
    const { data: rows, error } = await supabase
      .from("farol_timestamps")
      .select("modalidade_id, primeira_vez, nome_paciente, sala")
      .eq("tenant_id", tenant.id)
      .eq("data_ref", dataRef)
      .in("situacao_id", STATUS_FAROL)
      .is("dispensed_at", null);

    if (error) throw error;
    const lista = rows ?? [];

    // ── Agregações ─────────────────────────────────────────────────────────
    const agora = Date.now();
    const porMod    = new Map<number, { count: number; mais30: number }>();
    const porLocal  = new Map<Localidade, number>();
    type EsperaItem = { nome: string; modId: number; esperaMs: number };
    const esperas: EsperaItem[] = [];
    let mais30Total = 0;

    for (const r of lista) {
      const modId    = (r.modalidade_id as number | null) ?? 0;
      const esperaMs = agora - new Date(r.primeira_vez as string).getTime();

      const grp = porMod.get(modId) ?? { count: 0, mais30: 0 };
      grp.count++;
      if (esperaMs > 30 * 60_000) { grp.mais30++; mais30Total++; }
      porMod.set(modId, grp);

      const loc = salaToLocalidade(r.sala as string | null | undefined);
      porLocal.set(loc, (porLocal.get(loc) ?? 0) + 1);

      esperas.push({
        nome:    String(r.nome_paciente ?? "").trim() || "Sem nome",
        modId,
        esperaMs,
      });
    }
    const total = lista.length;

    // Top 3 pacientes aguardando há mais tempo
    const top3 = [...esperas]
      .sort((a, b) => b.esperaMs - a.esperaMs)
      .slice(0, 3);

    // ── Monta mensagem ─────────────────────────────────────────────────────
    let msg = `🏥 *Farol Imago — ${dataBR} ${horaBR}*\n\n`;
    msg += `📊 *${total}* paciente${total !== 1 ? "s" : ""} aguardando exame\n`;

    if (porMod.size > 0) {
      msg += `\n🩺 *Por modalidade:*\n`;
      const sorted = [...porMod.entries()].sort((a, b) => b[1].count - a[1].count);
      for (const [modId, grp] of sorted) {
        const label = MODALIDADE_LABELS[modId] ?? `Mod. ${modId}`;
        const sufixo = grp.mais30 > 0 ? ` _(${grp.mais30} >30min)_` : "";
        msg += `  • ${label}: *${grp.count}*${sufixo}\n`;
      }
    }

    if (porLocal.size > 0) {
      msg += `\n📍 *Por localidade:*\n`;
      // Ordem fixa (mais previsível na leitura), filtrando zeros
      for (const loc of LOCALIDADES) {
        const n = porLocal.get(loc) ?? 0;
        if (n > 0) msg += `  • ${loc}: *${n}*\n`;
      }
    }

    if (top3.length > 0) {
      msg += `\n⏰ *Esperando há mais tempo:*\n`;
      for (const item of top3) {
        const mod = MODALIDADE_LABELS[item.modId] ?? `Mod. ${item.modId}`;
        msg += `  • ${item.nome} _(${mod})_ — ${formatEspera(item.esperaMs)}\n`;
      }
    }

    if (mais30Total > 0) {
      msg += `\n⏱️ Total aguardando há mais de 30min: *${mais30Total}*\n`;
    }

    const rodape = Deno.env.get("FAROL_WHATSAPP_RODAPE")
      ?? `Bom dia, segue a fila de pacientes às ${horaBR} (esse é um teste apenas, desconsidere erros)`;
    msg += `\n_${rodape}_`;

    // ── Envia para cada número (com retry em falhas transitórias) ──────────
    const resultados: Array<{ numero: string; ok: boolean; erro?: string; tentativas: number }> = [];

    for (const numero of NUMEROS) {
      const r = await sendWithRetry(numero, msg);
      resultados.push({ numero, ...r });
    }

    const sucesso = resultados.filter(r => r.ok).length;
    console.log(`[snapshot-farol-whatsapp] ${horaBR} — enviado para ${sucesso}/${NUMEROS.length} números`);

    return json({
      ok: true,
      data_ref: dataRef,
      hora: horaBR,
      total_pacientes: total,
      mais_30min: mais30Total,
      modalidades: porMod.size,
      localidades: Object.fromEntries(porLocal),
      top3,
      mensagem: msg,
      envios: resultados,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[snapshot-farol-whatsapp] error:", message);
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
