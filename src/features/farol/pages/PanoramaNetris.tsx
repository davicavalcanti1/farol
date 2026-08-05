import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { hojeBRT } from "@/lib/dataBRT";
import { ptBR } from "date-fns/locale";
import { RefreshCw, Users, CheckCircle2, Clock, AlertTriangle, Activity, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import { buscarAtendimentos } from "@/services/netris/atendimentos";
import { downloadCsv } from "@/services/netris/campanhas";
import type { Atendimento } from "@/services/netris/types";

// ── Status groups ─────────────────────────────────────────────────────────────
const S_AGUARDANDO  = [10, 11, 13, 61, 63, 64]; // chegou + em espera
const S_REALIZADO   = [18, 27];
const S_FATURADO    = [28, 47, 49, 50, 54];
const S_FALTA       = [2, 26];
const S_CANCELADO   = [5];

function categorizar(s: number) {
  if (S_REALIZADO.includes(s))  return "realizado";
  if (S_FATURADO.includes(s))   return "faturado";
  if (S_FALTA.includes(s))      return "falta";
  if (S_CANCELADO.includes(s))  return "cancelado";
  if (S_AGUARDANDO.includes(s)) return "aguardando";
  return "agendado";
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function msToHora(ms: unknown): string | null {
  if (typeof ms !== "number" || ms < 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getPeriodoRange(p: string, ci: string, cf: string) {
  const now = new Date();
  if (p === "hoje")   return { ini: format(now, "yyyy-MM-dd"), fim: format(now, "yyyy-MM-dd") };
  if (p === "semana") return { ini: format(startOfWeek(now, { locale: ptBR }), "yyyy-MM-dd"), fim: format(endOfWeek(now, { locale: ptBR }), "yyyy-MM-dd") };
  if (p === "mes")    return { ini: format(startOfMonth(now), "yyyy-MM-dd"), fim: format(endOfMonth(now), "yyyy-MM-dd") };
  return { ini: ci, fim: cf };
}

const CORES_MODAL: Record<string, string> = {
  "RAIO X": "#3b82f6", "ULTRASSONOGRAFIA": "#10b981", "TOMOGRAFIA COMPUTADORIZADA": "#f59e0b",
  "RESSONANCIA MAGNETICA": "#8b5cf6", "MAMOGRAFIA": "#ec4899", "DENSITOMETRIA": "#06b6d4",
  "ECOCARDIOGRAMA": "#f97316", "ELETROCARDIOGRAMA": "#84cc16", "HOLTER": "#6366f1",
  "RESSONANCIA MAGNETICA COM CONTRASTE": "#a855f7",
};
const COR_DEFAULT = "#6b7280";

// ── Componente ────────────────────────────────────────────────────────────────

export default function PanoramaNetris() {
  const [periodo,   setPeriodo]   = useState("hoje");
  const [custIni,   setCustIni]   = useState(hojeBRT());
  const [custFim,   setCustFim]   = useState(hojeBRT());
  const [loading,   setLoading]   = useState(false);
  const [lastSync,  setLastSync]  = useState<Date | null>(null);
  const [dados,     setDados]     = useState<Atendimento[]>([]);
  const [buscado,   setBuscado]   = useState(false);

  const buscar = useCallback(async () => {
    setLoading(true);
    try {
      const { ini, fim } = getPeriodoRange(periodo, custIni, custFim);
      const res = await buscarAtendimentos({ dataInicial: ini, dataFinal: fim });
      setDados(res);
      setLastSync(new Date());
      setBuscado(true);
    } finally {
      setLoading(false);
    }
  }, [periodo, custIni, custFim]);

  // Auto-busca ao abrir e ao mudar período
  useEffect(() => { buscar(); }, [buscar]);

  // ── Derivações ──────────────────────────────────────────────────────────────

  // Pacientes únicos
  const pacientesUnicos = new Set(
    dados.map(a => a.cpf?.replace(/\D/g, "") || a.nomePaciente.toUpperCase().trim())
  ).size;

  // Por categoria
  const porCategoria = dados.reduce((acc, a) => {
    const c = categorizar(a.situacaoId);
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const realizados  = (porCategoria.realizado  || 0) + (porCategoria.faturado || 0);
  const aguardando  = porCategoria.aguardando  || 0;
  const faltas      = (porCategoria.falta      || 0) + (porCategoria.cancelado || 0);
  const agendados   = porCategoria.agendado    || 0;

  // Por modalidade
  const porModalidade = Object.values(
    dados.reduce((acc, a) => {
      const k = a.modalidade || "Outros";
      if (!acc[k]) acc[k] = { modalidade: k, total: 0, realizados: 0, aguardando: 0, faltas: 0 };
      acc[k].total++;
      const c = categorizar(a.situacaoId);
      if (c === "realizado" || c === "faturado") acc[k].realizados++;
      else if (c === "aguardando")               acc[k].aguardando++;
      else if (c === "falta" || c === "cancelado") acc[k].faltas++;
      return acc;
    }, {} as Record<string, { modalidade: string; total: number; realizados: number; aguardando: number; faltas: number }>)
  ).sort((a, b) => b.total - a.total);

  // Por médico (top 15)
  const porMedico = Object.values(
    dados.reduce((acc, a) => {
      const k = a.medico || "Sem médico";
      if (!acc[k]) acc[k] = { medico: k, total: 0, realizados: 0, faltas: 0, aguardando: 0 };
      acc[k].total++;
      const c = categorizar(a.situacaoId);
      if (c === "realizado" || c === "faturado") acc[k].realizados++;
      else if (c === "aguardando")               acc[k].aguardando++;
      else if (c === "falta" || c === "cancelado") acc[k].faltas++;
      return acc;
    }, {} as Record<string, { medico: string; total: number; realizados: number; faltas: number; aguardando: number }>)
  ).sort((a, b) => b.total - a.total).slice(0, 15);

  // Mapa de calor por hora (30min buckets)
  const heatmap: Record<string, number> = {};
  for (let h = 6; h <= 22; h++) {
    heatmap[`${String(h).padStart(2, "0")}:00`] = 0;
    heatmap[`${String(h).padStart(2, "0")}:30`] = 0;
  }
  const tzOffsetMs = new Date().getTimezoneOffset() * 60_000;
  dados.forEach(a => {
    const ms = a.raw?.horaInicial;
    if (typeof ms !== "number") return;
    const local = ((ms - tzOffsetMs) % 86_400_000 + 86_400_000) % 86_400_000;
    const h = Math.floor(local / 3_600_000);
    const m = Math.floor((local % 3_600_000) / 60_000);
    if (h < 6 || h > 22) return;
    const bucket = `${String(h).padStart(2, "0")}:${m < 30 ? "00" : "30"}`;
    if (bucket in heatmap) heatmap[bucket]++;
  });
  const heatmapData = Object.entries(heatmap)
    .map(([hora, total]) => ({ hora, total }))
    .filter((_, i) => i % 2 === 0 || true); // all buckets
  const maxHeat = Math.max(...Object.values(heatmap), 1);

  // ── Exportar CSV ─────────────────────────────────────────────────────────────
  const exportarCSV = () => {
    const header = ["Paciente", "CPF", "Exame", "Modalidade", "Médico", "Horário", "Situação", "Convênio"];
    const linhas = dados.map(a => [
      a.nomePaciente, a.cpf ?? "", a.exame, a.modalidade ?? "",
      a.medico ?? "", a.horario ?? "", a.situacao ?? String(a.situacaoId), a.convenio ?? "",
    ]);
    downloadCsv([header, ...linhas], `panorama_${periodo}_${hojeBRT()}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      <div className="space-y-6 pb-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Panorama de Atendimentos</h1>
            <p className="text-sm text-muted-foreground">
              {lastSync ? `Atualizado às ${format(lastSync, "HH:mm:ss")}` : "Carregando..."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Seletor de período */}
            {["hoje", "semana", "mes", "custom"].map(p => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  periodo === p ? "bg-blue-700 text-white border-blue-700" : "bg-card text-muted-foreground border-border hover:border-blue-300"
                }`}
              >
                {{ hoje: "Hoje", semana: "Semana", mes: "Mês", custom: "Período" }[p]}
              </button>
            ))}
            {periodo === "custom" && (
              <div className="flex items-center gap-1">
                <input type="date" value={custIni} onChange={e => setCustIni(e.target.value)} className="border rounded-lg px-2 py-1 text-xs" />
                <span className="text-xs text-muted-foreground">até</span>
                <input type="date" value={custFim} onChange={e => setCustFim(e.target.value)} className="border rounded-lg px-2 py-1 text-xs" />
              </div>
            )}
            <Button onClick={buscar} disabled={loading} size="sm" variant="outline" className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Carregando..." : "Atualizar"}
            </Button>
            {buscado && dados.length > 0 && (
              <Button onClick={exportarCSV} size="sm" variant="outline" className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            )}
          </div>
        </div>

        {!buscado && !loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            Carregando dados...
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Buscando {periodo === "hoje" ? "atendimentos de hoje" : "atendimentos do período"}...
          </div>
        )}

        {buscado && !loading && (
          <>
            {/* Cards de resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Card icon={<Users className="h-5 w-5 text-blue-600" />} label="Total" value={dados.length} color="blue" />
              <Card icon={<Activity className="h-5 w-5 text-purple-600" />} label="Pacientes únicos" value={pacientesUnicos} color="purple" />
              <Card icon={<CheckCircle2 className="h-5 w-5 text-green-600" />} label="Realizados" value={realizados} color="green" />
              <Card icon={<Clock className="h-5 w-5 text-amber-600" />} label="Aguardando" value={aguardando} color="amber" />
              <Card icon={<AlertTriangle className="h-5 w-5 text-red-600" />} label="Faltas/Cancelados" value={faltas} color="red" />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">

              {/* Por Modalidade */}
              <div className="bg-card rounded-xl border border-border shadow-card p-5">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Por Modalidade</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={porModalidade} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="modalidade" tick={{ fontSize: 10 }} width={130}
                      tickFormatter={v => v.length > 16 ? v.slice(0, 16) + "…" : v} />
                    <Tooltip
                      formatter={(v, name) => [v, { realizados: "Realizados", aguardando: "Aguardando", faltas: "Faltas" }[name as string] ?? name]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="realizados" name="Realizados" stackId="a" fill="#10b981" />
                    <Bar dataKey="aguardando" name="Aguardando" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="faltas"     name="Faltas"     stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Por Médico */}
              <div className="bg-card rounded-xl border border-border shadow-card p-5">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Por Médico (top {porMedico.length})</h2>
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {porMedico.map((m, i) => {
                    const pct = Math.round((m.realizados / (m.total || 1)) * 100);
                    return (
                      <div key={m.medico} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-5 shrink-0 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-xs font-semibold text-foreground truncate">{m.medico}</span>
                            <div className="flex items-center gap-2 shrink-0 text-[10px]">
                              <span className="text-green-600 font-bold">{m.realizados}✓</span>
                              {m.aguardando > 0 && <span className="text-amber-600 font-bold">{m.aguardando}⏳</span>}
                              {m.faltas > 0    && <span className="text-red-500 font-bold">{m.faltas}✗</span>}
                              <span className="text-muted-foreground">{m.total} total</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Mapa de Calor por Horário */}
            <div className="bg-card rounded-xl border border-border shadow-card p-5">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">
                Distribuição por Horário
                <span className="ml-2 font-normal text-muted-foreground normal-case text-xs">(agendamentos por faixa de 30 min)</span>
              </h2>
              <div className="flex flex-wrap gap-1">
                {heatmapData.map(({ hora, total }) => {
                  const intensity = total / maxHeat;
                  const bg = intensity === 0
                    ? "bg-muted/50 text-muted-foreground/40"
                    : intensity < 0.25 ? "bg-blue-100 text-blue-600"
                    : intensity < 0.5  ? "bg-blue-300 text-blue-800"
                    : intensity < 0.75 ? "bg-blue-500 text-white"
                    : "bg-blue-700 text-white font-bold";
                  return (
                    <div
                      key={hora}
                      title={`${hora} — ${total} agendamentos`}
                      className={`rounded-lg px-2 py-2 text-[10px] font-mono text-center min-w-[52px] ${bg} transition-all cursor-default select-none`}
                    >
                      <div>{hora}</div>
                      {total > 0 && <div className="font-bold mt-0.5">{total}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                <span>Menos</span>
                {["bg-muted/50", "bg-blue-100", "bg-blue-300", "bg-blue-500", "bg-blue-700"].map(c => (
                  <span key={c} className={`h-3 w-6 rounded ${c} border border-border`} />
                ))}
                <span>Mais</span>
              </div>
            </div>

            {/* Tabela detalhada por modalidade */}
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="px-5 py-3 bg-muted/40 border-b border-border">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Detalhe por Modalidade</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="px-4 py-2 text-left font-semibold">Modalidade</th>
                      <th className="px-4 py-2 text-right font-semibold">Total</th>
                      <th className="px-4 py-2 text-right font-semibold text-green-600">Realizados</th>
                      <th className="px-4 py-2 text-right font-semibold text-amber-600">Aguardando</th>
                      <th className="px-4 py-2 text-right font-semibold text-red-500">Faltas</th>
                      <th className="px-4 py-2 text-right font-semibold text-muted-foreground">Taxa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porModalidade.map(m => {
                      const taxa = Math.round((m.realizados / (m.total || 1)) * 100);
                      const cor = CORES_MODAL[m.modalidade] ?? COR_DEFAULT;
                      return (
                        <tr key={m.modalidade} className="border-b border-gray-50 hover:bg-muted/30/50">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: cor }} />
                              <span className="font-medium text-foreground text-xs">{m.modalidade}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-foreground">{m.total}</td>
                          <td className="px-4 py-2.5 text-right text-green-600 font-semibold">{m.realizados}</td>
                          <td className="px-4 py-2.5 text-right text-amber-600 font-semibold">{m.aguardando || "—"}</td>
                          <td className="px-4 py-2.5 text-right text-red-500 font-semibold">{m.faltas || "—"}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="h-1.5 w-16 bg-muted/50 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: `${taxa}%` }} />
                              </div>
                              <span className="text-[10px] font-semibold text-muted-foreground w-8 text-right">{taxa}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t border-border">
                    <tr className="text-xs font-bold text-muted-foreground">
                      <td className="px-4 py-2">TOTAL</td>
                      <td className="px-4 py-2 text-right">{dados.length}</td>
                      <td className="px-4 py-2 text-right text-green-600">{realizados}</td>
                      <td className="px-4 py-2 text-right text-amber-600">{aguardando || "—"}</td>
                      <td className="px-4 py-2 text-right text-red-500">{faltas || "—"}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {Math.round((realizados / (dados.length || 1)) * 100)}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}

// ── Card helper ───────────────────────────────────────────────────────────────
function Card({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number; color: string;
}) {
  const bg: Record<string, string> = {
    blue: "bg-blue-50 border-blue-100", purple: "bg-purple-50 border-purple-100",
    green: "bg-green-50 border-green-100", amber: "bg-amber-50 border-amber-100",
    red: "bg-red-50 border-red-100",
  };
  return (
    <div className={`rounded-xl border p-4 ${bg[color] ?? "bg-muted/30 border-border"}`}>
      <div className="flex items-center justify-between mb-2">
        {icon}
        <span className="text-2xl font-extrabold text-foreground">{value.toLocaleString("pt-BR")}</span>
      </div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}
