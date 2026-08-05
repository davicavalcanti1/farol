import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Cell, PieChart, Pie,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MODALIDADE, msToTime, hojeISO } from "@/services/netris/client";
import { useAuth } from "@/shared/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  Users, Clock, RefreshCw, Radio, CalendarDays,
  Timer, BarChart3, ChevronUp, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const S_AGUARDANDO = [10, 11, 13, 45, 61, 62, 63, 64];
const S_REALIZADO  = [18, 19, 27, 28];
const S_CANCELADO  = [5, 26];
const S_FALTA      = [1, 2, 3];

function classifica(s: number) {
  if (S_REALIZADO.includes(s))  return "realizado";
  if (S_AGUARDANDO.includes(s)) return "aguardando";
  if (S_FALTA.includes(s))      return "falta";
  if (S_CANCELADO.includes(s))  return "cancelado";
  return "outro";
}

const MODAL_LABEL: Record<number, string> = {
  [MODALIDADE.RAIO_X]:               "Raio-X",
  [MODALIDADE.USG]:                  "Ultrassom",
  [MODALIDADE.TOMOGRAFIA]:           "Tomografia",
  [MODALIDADE.RESSONANCIA]:          "Ressonância",
  [MODALIDADE.RESSONANCIA_CONTRASTE]:"RM c/ Contraste",
  [MODALIDADE.MAMOGRAFIA]:           "Mamografia",
  [MODALIDADE.DENSITOMETRIA]:        "Densitometria",
  [MODALIDADE.ECOCARDIOGRAMA]:       "Ecocardiograma",
  [MODALIDADE.BIOPSIA_US]:           "Biópsia US",
  [MODALIDADE.ELETROCARDIOGRAMA]:    "ECG",
  [MODALIDADE.ELETROENCEFALOGRAMA]:  "EEG",
  [MODALIDADE.ESPIROMETRIA]:         "Espirometria",
  [MODALIDADE.HOLTER]:               "Holter",
};

const MODAL_COR: Record<number, string> = {
  [MODALIDADE.RAIO_X]:               "#6366f1",
  [MODALIDADE.USG]:                  "#0ea5e9",
  [MODALIDADE.TOMOGRAFIA]:           "#f59e0b",
  [MODALIDADE.RESSONANCIA]:          "#8b5cf6",
  [MODALIDADE.RESSONANCIA_CONTRASTE]:"#a855f7",
  [MODALIDADE.MAMOGRAFIA]:           "#ec4899",
  [MODALIDADE.DENSITOMETRIA]:        "#f97316",
  [MODALIDADE.ECOCARDIOGRAMA]:       "#14b8a6",
  [MODALIDADE.BIOPSIA_US]:           "#84cc16",
  [MODALIDADE.ELETROCARDIOGRAMA]:    "#ef4444",
  [MODALIDADE.ESPIROMETRIA]:         "#06b6d4",
  [MODALIDADE.HOLTER]:               "#10b981",
};

function msParaMinutosLocal(ms: number): number {
  const offsetMs = new Date().getTimezoneOffset() * 60_000;
  const local = ((ms - offsetMs) % 86_400_000 + 86_400_000) % 86_400_000;
  return Math.floor(local / 60_000);
}

function minutosParaHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function tempoNaFila(ms: number | null): { minutos: number; label: string; cor: string } {
  if (!ms) return { minutos: 0, label: "—", cor: "text-muted-foreground" };
  const agendadoMin = msParaMinutosLocal(ms);
  const agoraMin    = new Date().getHours() * 60 + new Date().getMinutes();
  const diff        = agoraMin - agendadoMin;
  if (diff <= 0) return { minutos: 0, label: "no horário", cor: "text-green-600" };
  const label = diff < 60 ? `${diff}min` : `${Math.floor(diff/60)}h${diff%60 ? ` ${diff%60}min` : ""}`;
  const cor   = diff > 60 ? "text-red-600" : diff > 30 ? "text-amber-600" : "text-green-600";
  return { minutos: diff, label, cor };
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function FarolDashboard() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? "";
  const qc = useQueryClient();

  // Countdown para próximo refresh (60s)
  const [countdown, setCountdown] = useState(60);
  const [abaAtiva, setAbaAtiva]   = useState<"ao_vivo" | "historico">("ao_vivo");
  const [dataHist, setDataHist]   = useState(hojeISO());
  const [showLista, setShowLista] = useState(true);
  const [sortCol, setSortCol]     = useState<"espera" | "horario" | "modalidade">("espera");

  // ── Auto-refresh a cada 60s ───────────────────────────────────────────────
  useEffect(() => {
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          qc.invalidateQueries({ queryKey: ["farol_live"] });
          return 60;
        }
        return prev - 1;
      });
    }, 1_000);
    return () => clearInterval(interval);
  }, []);

  // ── Realtime Supabase: atualiza instantaneamente quando o poll grava ──────
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel("farol_dashboard_live")
      .on("postgres_changes", {
        event:  "*",
        schema: "public",
        table:  "farol_timestamps",
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ["farol_live"] });
        setCountdown(60);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  // ── Query live (farol_timestamps) ─────────────────────────────────────────
  const { data: liveRows = [], isFetching: loadingLive } = useQuery<any[]>({
    queryKey: ["farol_live", tenantId],
    enabled:  !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("farol_timestamps" as any)
        .select("*")
        .eq("tenant_id", tenantId);
      return data ?? [];
    },
  });

  // ── Query histórico (farol_historico) ─────────────────────────────────────
  const { data: histRows = [], isFetching: loadingHist, refetch: refetchHist } = useQuery<any[]>({
    queryKey: ["farol_historico_dash", tenantId, dataHist],
    enabled:  !!tenantId && abaAtiva === "historico",
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("farol_historico" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("data_ref", dataHist);
      return data ?? [];
    },
  });

  // ── Métricas ao vivo ──────────────────────────────────────────────────────
  const aguardando = useMemo(
    () => liveRows.filter(r => S_AGUARDANDO.includes(r.situacao_id)),
    [liveRows]
  );

  const porModalidadeLive = useMemo(() => {
    const mapa: Record<string, { label: string; cor: string; count: number }> = {};
    for (const r of aguardando) {
      const id = r.modalidade_id ?? 0;
      const k  = String(id);
      if (!mapa[k]) mapa[k] = { label: MODAL_LABEL[id] ?? "Outros", cor: MODAL_COR[id] ?? "#94a3b8", count: 0 };
      mapa[k].count++;
    }
    return Object.values(mapa).sort((a, b) => b.count - a.count);
  }, [aguardando]);

  const pacientesOrdenados = useMemo(() => {
    return [...aguardando].sort((a, b) => {
      if (sortCol === "espera") {
        const eA = a.hora_inicial_ms ? msParaMinutosLocal(a.hora_inicial_ms) : 0;
        const eB = b.hora_inicial_ms ? msParaMinutosLocal(b.hora_inicial_ms) : 0;
        return eA - eB; // quem espera mais há mais tempo aparece primeiro
      }
      if (sortCol === "horario") {
        return (a.hora_inicial_ms ?? 0) - (b.hora_inicial_ms ?? 0);
      }
      return (MODAL_LABEL[a.modalidade_id] ?? "").localeCompare(MODAL_LABEL[b.modalidade_id] ?? "");
    });
  }, [aguardando, sortCol]);

  // ── Métricas do histórico ─────────────────────────────────────────────────
  const histMetricas = useMemo(() => {
    const total      = histRows.length;
    const realizados = histRows.filter(r => S_REALIZADO.includes(r.situacao_id_final)).length;
    const aguard     = histRows.filter(r => S_AGUARDANDO.includes(r.situacao_id_final)).length;
    const faltas     = histRows.filter(r => S_FALTA.includes(r.situacao_id_final)).length;
    const cancelados = histRows.filter(r => S_CANCELADO.includes(r.situacao_id_final)).length;

    const porMod: Record<string, { label: string; cor: string; total: number; realizados: number; aguardando: number }> = {};
    for (const r of histRows) {
      const id = r.modalidade_id ?? 0;
      const k  = String(id);
      if (!porMod[k]) porMod[k] = { label: MODAL_LABEL[id] ?? "Outros", cor: MODAL_COR[id] ?? "#94a3b8", total: 0, realizados: 0, aguardando: 0 };
      porMod[k].total++;
      if (S_REALIZADO.includes(r.situacao_id_final))  porMod[k].realizados++;
      if (S_AGUARDANDO.includes(r.situacao_id_final)) porMod[k].aguardando++;
    }

    const porMedico: Record<string, { medico: string; total: number; realizados: number }> = {};
    for (const r of histRows) {
      const key = r.medico?.trim() || "Sem médico";
      if (!porMedico[key]) porMedico[key] = { medico: key, total: 0, realizados: 0 };
      porMedico[key].total++;
      if (S_REALIZADO.includes(r.situacao_id_final)) porMedico[key].realizados++;
    }

    return {
      total, realizados, aguard, faltas, cancelados,
      porMod:    Object.values(porMod).sort((a, b) => b.total - a.total),
      porMedico: Object.values(porMedico).sort((a, b) => b.realizados - a.realizados).slice(0, 12),
    };
  }, [histRows]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 p-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            Dashboard do Farol
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {[
            { id: "ao_vivo",   label: "Ao Vivo",   icon: Radio },
            { id: "historico", label: "Histórico",  icon: CalendarDays },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setAbaAtiva(t.id as any)}
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                abaAtiva === t.id ? "bg-card shadow-card text-blue-700" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════ AO VIVO ══════════════════ */}
      {abaAtiva === "ao_vivo" && (
        <div className="space-y-4">

          {/* Contador principal */}
          <div className="rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm font-medium uppercase tracking-wide mb-1">
                Aguardando exame agora
              </p>
              <p className="text-7xl font-black leading-none">{aguardando.length}</p>
              <p className="text-blue-200 text-sm mt-2">
                de {liveRows.length} pacientes no farol hoje
              </p>
            </div>
            <div className="text-right space-y-2">
              <div className="flex items-center gap-1.5 justify-end">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-blue-200 text-xs">Ao vivo</span>
              </div>
              <div className="text-blue-300 text-xs">
                Atualiza em <span className="font-bold text-white text-sm">{countdown}s</span>
              </div>
              <button
                onClick={() => { qc.invalidateQueries({ queryKey: ["farol_live"] }); setCountdown(60); }}
                disabled={loadingLive}
                className="flex items-center gap-1 text-xs text-blue-200 hover:text-white transition-colors"
              >
                <RefreshCw className={cn("h-3 w-3", loadingLive && "animate-spin")} />
                Forçar
              </button>
            </div>
          </div>

          {/* Por modalidade */}
          {porModalidadeLive.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {porModalidadeLive.map(m => (
                <div key={m.label} className="rounded-xl border bg-card p-3 flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: m.cor }} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{m.label}</p>
                    <p className="text-xl font-bold text-foreground">{m.count}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Lista de pacientes aguardando */}
          <div className="bg-card rounded-lg border overflow-hidden">
            <button
              onClick={() => setShowLista(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 border-b bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="h-4 w-4" />
                Pacientes aguardando
                <span className="text-xs font-normal text-muted-foreground ml-1">({aguardando.length})</span>
              </div>
              {showLista
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {showLista && (
              <div className="overflow-auto max-h-[480px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b">
                    <tr className="text-muted-foreground uppercase tracking-wide text-[10px]">
                      <th className="px-3 py-2 text-left font-medium">Paciente</th>
                      <th
                        className="px-3 py-2 text-left font-medium cursor-pointer hover:text-foreground"
                        onClick={() => setSortCol("modalidade")}
                      >
                        Modalidade {sortCol === "modalidade" && "↑"}
                      </th>
                      <th
                        className="px-3 py-2 text-left font-medium cursor-pointer hover:text-foreground"
                        onClick={() => setSortCol("horario")}
                      >
                        Agendado {sortCol === "horario" && "↑"}
                      </th>
                      <th
                        className="px-3 py-2 text-left font-medium cursor-pointer hover:text-foreground"
                        onClick={() => setSortCol("espera")}
                      >
                        Espera {sortCol === "espera" && "↑"}
                      </th>
                      <th className="px-3 py-2 text-left font-medium">Situação</th>
                      <th className="px-3 py-2 text-left font-medium">Médico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pacientesOrdenados.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          Nenhum paciente aguardando no momento
                        </td>
                      </tr>
                    )}
                    {pacientesOrdenados.map((r: any) => {
                      const espera     = tempoNaFila(r.hora_inicial_ms);
                      const horarioFmt = r.hora_inicial_ms
                        ? minutosParaHHMM(msParaMinutosLocal(r.hora_inicial_ms))
                        : "—";
                      const modId = r.modalidade_id ?? 0;
                      return (
                        <tr key={r.atendimento_id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{r.nome_paciente}</td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ background: MODAL_COR[modId] ?? "#94a3b8" }} />
                              {MODAL_LABEL[modId] ?? r.exame ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{horarioFmt}</td>
                          <td className={cn("px-3 py-2 font-semibold", espera.cor)}>
                            <span className="flex items-center gap-1">
                              <Timer className="h-3 w-3" />
                              {espera.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{r.situacao_nome ?? `Sit. ${r.situacao_id}`}</td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">{r.medico ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════ HISTÓRICO ══════════════════ */}
      {abaAtiva === "historico" && (
        <div className="space-y-4">

          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={dataHist} onChange={e => setDataHist(e.target.value)} className="w-40 h-9 text-sm" />
            <Button size="sm" variant="outline" onClick={() => refetchHist()} disabled={loadingHist} className="gap-2">
              <RefreshCw className={cn("h-3.5 w-3.5", loadingHist && "animate-spin")} />
              Buscar
            </Button>
            <span className="text-xs text-muted-foreground">{histRows.length} registros no farol</span>
          </div>

          {/* KPIs histórico */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Total no Farol",  v: histMetricas.total,      cor: "bg-muted/30 border-border"   },
              { label: "Realizados",      v: histMetricas.realizados, cor: "bg-green-50 border-green-200"   },
              { label: "Aguardando",      v: histMetricas.aguard,     cor: "bg-amber-50 border-amber-200"   },
              { label: "Faltas",          v: histMetricas.faltas,     cor: "bg-orange-50 border-orange-200" },
              { label: "Cancelados",      v: histMetricas.cancelados, cor: "bg-red-50 border-red-200"       },
            ].map(k => (
              <div key={k.label} className={cn("rounded-xl border p-3", k.cor)}>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-bold">{k.v}</p>
              </div>
            ))}
          </div>

          {/* Por modalidade */}
          {histMetricas.porMod.length > 0 && (
            <div className="bg-card rounded-lg border p-4 space-y-3">
              <h2 className="text-sm font-semibold">Por Modalidade</h2>
              <ResponsiveContainer width="100%" height={Math.max(160, histMetricas.porMod.length * 36)}>
                <BarChart data={histMetricas.porMod} layout="vertical" margin={{ top: 0, right: 10, left: 96, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={94} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="realizados" name="Realizados" stackId="a" fill="#22c55e" />
                  <Bar dataKey="aguardando" name="Aguardando" stackId="a" fill="#f59e0b" radius={[0,3,3,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Médicos */}
          {histMetricas.porMedico.length > 0 && (
            <div className="bg-card rounded-lg border p-4 space-y-3">
              <h2 className="text-sm font-semibold">Médicos</h2>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/20">
                    <tr className="text-muted-foreground uppercase text-[10px] tracking-wide">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Médico</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Realizados</th>
                      <th className="px-3 py-2 text-right">Taxa</th>
                      <th className="px-3 py-2 min-w-[80px]" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {histMetricas.porMedico.map((m, i) => {
                      const taxa = m.total > 0 ? Math.round(m.realizados / m.total * 100) : 0;
                      const cor  = taxa >= 80 ? "#22c55e" : taxa >= 50 ? "#f59e0b" : "#ef4444";
                      return (
                        <tr key={m.medico} className="hover:bg-muted/20">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{m.medico}</td>
                          <td className="px-3 py-2 text-right">{m.total}</td>
                          <td className="px-3 py-2 text-right font-semibold" style={{ color: cor }}>{m.realizados}</td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: cor + "22", color: cor }}>
                              {taxa}%
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="h-1.5 bg-muted rounded-full">
                              <div className="h-full rounded-full" style={{ width: `${taxa}%`, background: cor }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {histRows.length === 0 && !loadingHist && (
            <p className="text-sm text-muted-foreground text-center py-12">
              Sem dados para esse dia. O histórico acumula a partir do momento em que o poll começar a rodar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
