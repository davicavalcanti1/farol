import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/shared/contexts/AuthContext";
import { MODALIDADE } from "@/services/netris/client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Gauge, Flame, Clock, AlertTriangle, X } from "lucide-react";
import { farolOcupacaoService } from "../services/farolOcupacaoService";

// ── Constantes ─────────────────────────────────────────────────────────────
const MODALIDADE_NOMES: Record<number, string> = {
  [MODALIDADE.RAIO_X]:               "Raio-X",
  [MODALIDADE.USG]:                  "USG",
  [MODALIDADE.ANESTESIA]:            "Anestesia",
  [MODALIDADE.TOMOGRAFIA]:           "Tomografia",
  [MODALIDADE.RESSONANCIA]:          "Ressonância",
  [MODALIDADE.MAMOGRAFIA]:           "Mamografia",
  [MODALIDADE.DENSITOMETRIA]:        "Densitometria",
  [MODALIDADE.BIOPSIA_US]:           "Biópsia US",
  [MODALIDADE.ECOCARDIOGRAMA]:       "Ecocardiograma",
  [MODALIDADE.ELETROENCEFALOGRAMA]:  "EEG",
  [MODALIDADE.ELETROCARDIOGRAMA]:    "ECG",
  [MODALIDADE.RESSONANCIA_CONTRASTE]:"RM c/ contraste",
  [MODALIDADE.ESPIROMETRIA]:         "Espirometria",
  [MODALIDADE.HOLTER]:               "Holter",
  [MODALIDADE.RETORNO_MAPA]:         "Retorno MAPA",
  [MODALIDADE.RETORNO_HOLTER]:       "Retorno Holter",
};

const HORAS = Array.from({ length: 24 }, (_, i) => i); // 0h às 23h
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Cor da célula do heatmap — gradiente (suporta dark mode)
function cellColor(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "bg-muted/30 text-muted-foreground";
  const ratio = value / max;
  if (ratio < 0.2) return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200";
  if (ratio < 0.4) return "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200";
  if (ratio < 0.6) return "bg-amber-200 text-amber-900 dark:bg-amber-800/60 dark:text-amber-100";
  if (ratio < 0.8) return "bg-orange-400 text-orange-950 dark:bg-orange-700 dark:text-orange-50";
  return "bg-red-500 text-white dark:bg-red-600";
}

function barColor(ratio: number): string {
  if (ratio < 0.4) return "#22c55e";
  if (ratio < 0.7) return "#f59e0b";
  return "#ef4444";
}

// Paleta para o gráfico "Média por exame" — uma cor por modalidade
const EXAME_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7",
  "#14b8a6", "#f43f5e", "#eab308", "#6366f1", "#ec4899",
  "#84cc16", "#06b6d4", "#f97316", "#8b5cf6", "#10b981",
  "#dc2626",
];

type PeriodoGlobal = "ontem" | "hoje" | "semana" | "mes" | "total" | "dia_semana";

export default function FarolOcupacao() {
  const { tenant } = useAuth();
  const [periodo, setPeriodo] = useState<PeriodoGlobal>("semana");
  const [diaSemana, setDiaSemana] = useState<number>(new Date().getDay()); // 0=Dom
  const [metrica, setMetrica] = useState<"media" | "pico">("media");
  const [selectedHora, setSelectedHora] = useState<number | null>(null);

  // Range de datas a buscar. Para total/dia_semana, busca 90 dias. Para os outros,
  // o range exato. Dia_semana filtra client-side pelo weekday.
  const { ini, fim } = useMemo(() => {
    const now  = new Date();
    const fmtd = (d: Date) => format(d, "yyyy-MM-dd");
    if (periodo === "ontem")   { const y = subDays(now, 1); return { ini: fmtd(y), fim: fmtd(y) }; }
    if (periodo === "hoje")     return { ini: fmtd(now), fim: fmtd(now) };
    if (periodo === "semana")   return { ini: fmtd(startOfWeek(now, { locale: ptBR })), fim: fmtd(endOfWeek(now, { locale: ptBR })) };
    if (periodo === "mes")      return { ini: fmtd(startOfMonth(now)), fim: fmtd(endOfMonth(now)) };
    return { ini: fmtd(subDays(now, 89)), fim: fmtd(now) };
  }, [periodo]);

  const { data: horariaRaw = [], isLoading: lH } = useQuery({
    queryKey: ["farol_ocupacao_horaria", tenant?.id, ini, fim],
    queryFn: () => farolOcupacaoService.horaria(tenant!.id, ini, fim),
    enabled: !!tenant?.id,
    refetchInterval: 60_000,
  });

  const { data: porModalidadeRaw = [], isLoading: lM } = useQuery({
    queryKey: ["farol_ocupacao_modalidade", tenant?.id, ini, fim],
    queryFn: () => farolOcupacaoService.porModalidade(tenant!.id, ini, fim),
    enabled: !!tenant?.id,
    refetchInterval: 60_000,
  });

  const { data: resumoRaw } = useQuery({
    queryKey: ["farol_ocupacao_resumo", tenant?.id, ini, fim],
    queryFn: () => farolOcupacaoService.resumo(tenant!.id, ini, fim),
    enabled: !!tenant?.id,
    refetchInterval: 60_000,
  });

  // Filtro client-side pelo dia da semana quando periodo === "dia_semana"
  const horaria = useMemo(() =>
    periodo === "dia_semana"
      ? horariaRaw.filter(r => new Date(r.data_ref + "T12:00:00").getDay() === diaSemana)
      : horariaRaw,
    [horariaRaw, periodo, diaSemana]
  );
  const porModalidade = useMemo(() =>
    periodo === "dia_semana"
      ? porModalidadeRaw.filter(r => new Date(r.data_ref + "T12:00:00").getDay() === diaSemana)
      : porModalidadeRaw,
    [porModalidadeRaw, periodo, diaSemana]
  );
  // Para o resumo, recalcula client-side quando filtra por dia_semana
  const resumo = useMemo(() => {
    if (periodo !== "dia_semana") return resumoRaw;
    if (horaria.length === 0) return { total_amostras: 0, media_geral: 0, pico_absoluto: 0, hora_pico: null, dia_pico: null } as any;
    let pico = 0, horaPico: number | null = null, diaPico: string | null = null;
    let somaMedia = 0, n = 0;
    for (const r of horaria) {
      if (r.pico_aguardando > pico) { pico = r.pico_aguardando; horaPico = r.hora; diaPico = r.data_ref; }
      somaMedia += Number(r.media_aguardando);
      n++;
    }
    return { total_amostras: n, media_geral: n ? Number((somaMedia / n).toFixed(2)) : 0, pico_absoluto: pico, hora_pico: horaPico, dia_pico: diaPico } as any;
  }, [resumoRaw, periodo, horaria]);

  // Para "hoje": só mostra horas até a hora atual (não faz sentido mostrar 18h às 14h)
  const horasVisiveis = useMemo(() =>
    periodo === "hoje" ? HORAS.filter(h => h <= new Date().getHours()) : HORAS,
    [periodo]
  );

  // ── Matriz modalidade × hora (usa filtro próprio periodo) ─────────────
  const matrizMod = useMemo(() => {
    // Filtra os dados conforme o periodo selecionado
    const dados = periodo === "dia_semana"
      ? porModalidade.filter(r => {
          const d = new Date(r.data_ref + "T12:00:00");
          return d.getDay() === diaSemana;
        })
      : porModalidade;

    const map = new Map<number, Map<number, { soma: number; n: number; max: number }>>();
    for (const row of dados) {
      const m = map.get(row.modalidade_id) ?? new Map();
      const cur = m.get(row.hora) ?? { soma: 0, n: 0, max: 0 };
      cur.soma += Number(row.media_aguardando);
      cur.n   += 1;
      cur.max  = Math.max(cur.max, row.pico_aguardando);
      m.set(row.hora, cur);
      map.set(row.modalidade_id, m);
    }
    const modalidadesAtivas = Array.from(map.keys()).sort((a, b) => a - b);
    let maxValue = 0;
    const matriz = modalidadesAtivas.map(modId => {
      const m = map.get(modId)!;
      return {
        modalidadeId: modId,
        nome: MODALIDADE_NOMES[modId] ?? `Modalidade ${modId}`,
        horas: horasVisiveis.map(h => {
          const c = m.get(h);
          if (!c) return { hora: h, valor: 0 };
          const v = metrica === "media" ? (c.soma / c.n) : c.max;
          if (v > maxValue) maxValue = v;
          return { hora: h, valor: v };
        }),
      };
    });
    return { matriz, maxValue };
  }, [porModalidade, metrica, periodo, diaSemana, horasVisiveis]);

  // ── Matriz dia × hora ──────────────────────────────────────────────────
  const matrizDiaHora = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    for (const row of horaria) {
      const m = map.get(row.data_ref) ?? new Map();
      const v = metrica === "media" ? Number(row.media_aguardando) : row.pico_aguardando;
      m.set(row.hora, v);
      map.set(row.data_ref, m);
    }
    const dias = Array.from(map.keys()).sort();
    let maxValue = 0;
    const matriz = dias.map(dia => ({
      dia,
      horas: horasVisiveis.map(h => {
        const v = map.get(dia)?.get(h) ?? 0;
        if (v > maxValue) maxValue = v;
        return { hora: h, valor: v };
      }),
    }));
    return { matriz, maxValue };
  }, [horaria, metrica, horasVisiveis]);

  // ── Curva: ocupação máxima da clínica por hora ─────────────────────────
  const curvaMaximo = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of horaria) {
      const cur = map.get(row.hora) ?? 0;
      if (row.pico_aguardando > cur) map.set(row.hora, row.pico_aguardando);
    }
    return horasVisiveis.map(h => ({
      hora:       `${h.toString().padStart(2, "0")}h`,
      picoMaximo: map.get(h) ?? 0,
    }));
  }, [horaria, horasVisiveis]);

  // ── Curva: média por exame — uma linha por modalidade ──────────────────
  const curvaPorExame = useMemo(() => {
    // Agrupa média por (modalidade, hora) somando e dividindo
    const acc = new Map<number, Map<number, { soma: number; n: number }>>();
    for (const row of porModalidade) {
      const m = acc.get(row.modalidade_id) ?? new Map<number, { soma: number; n: number }>();
      const c = m.get(row.hora) ?? { soma: 0, n: 0 };
      c.soma += Number(row.media_aguardando);
      c.n    += 1;
      m.set(row.hora, c);
      acc.set(row.modalidade_id, m);
    }
    const modalidadesAtivas = Array.from(acc.keys()).sort((a, b) => a - b);
    const dados = horasVisiveis.map(h => {
      const row: Record<string, string | number> = { hora: `${h.toString().padStart(2, "0")}h` };
      for (const modId of modalidadesAtivas) {
        const c = acc.get(modId)!.get(h);
        row[`m_${modId}`] = c ? Number((c.soma / c.n).toFixed(1)) : 0;
      }
      return row;
    });
    return { dados, modalidadesAtivas };
  }, [porModalidade, horasVisiveis]);

  // ── Pico absoluto por hora + breakdown por modalidade ──────────────────
  const picoPorHora = useMemo(() => {
    // Maior pico observado em cada hora durante todo o período
    const picos = new Map<number, { max: number; dia: string }>();
    for (const row of horaria) {
      const cur = picos.get(row.hora);
      if (!cur || row.pico_aguardando > cur.max) {
        picos.set(row.hora, { max: row.pico_aguardando, dia: row.data_ref });
      }
    }
    // Pico por modalidade em cada hora
    const modPicos = new Map<number, Map<number, number>>();
    for (const row of porModalidade) {
      const mh = modPicos.get(row.hora) ?? new Map<number, number>();
      const cur = mh.get(row.modalidade_id) ?? 0;
      mh.set(row.modalidade_id, Math.max(cur, row.pico_aguardando));
      modPicos.set(row.hora, mh);
    }
    const horas = horasVisiveis.map(h => {
      const p = picos.get(h);
      const modMap = modPicos.get(h) ?? new Map<number, number>();
      return {
        hora: h,
        pico: p?.max ?? 0,
        dia: p?.dia ?? "",
        modalidades: Array.from(modMap.entries())
          .map(([modId, max]) => ({
            modId,
            nome: MODALIDADE_NOMES[modId] ?? `Modalidade ${modId}`,
            max,
          }))
          .filter(m => m.max > 0)
          .sort((a, b) => b.max - a.max),
      };
    });
    const absMax = Math.max(...horas.map(h => h.pico), 1);
    return { horas, absMax };
  }, [horaria, porModalidade, horasVisiveis]);

  const isLoading = lH || lM;
  const temDados = horaria.length > 0;

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Relatório Farol</h1>
              <p className="text-sm text-muted-foreground">
                Ocupação 24h por modalidade — identifique picos e gargalos
              </p>
            </div>
          </div>

          {/* Filtros globais — afetam todos os gráficos e heatmaps */}
          <div className="flex flex-col gap-2 items-end">
            <div className="flex gap-0.5 rounded-xl border border-border bg-card p-1">
              {([
                { v: "ontem",      l: "Ontem" },
                { v: "hoje",       l: "Hoje" },
                { v: "semana",     l: "Semana" },
                { v: "mes",        l: "Mês" },
                { v: "total",      l: "Total" },
                { v: "dia_semana", l: "Por dia" },
              ] as { v: PeriodoGlobal; l: string }[]).map(opt => (
                <button key={opt.v} onClick={() => setPeriodo(opt.v)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    periodo === opt.v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                  }`}>
                  {opt.l}
                </button>
              ))}
            </div>
            {periodo === "dia_semana" && (
              <select
                value={diaSemana}
                onChange={e => setDiaSemana(Number(e.target.value))}
                className="h-9 rounded-lg border border-input px-3 text-sm bg-card text-foreground"
              >
                <option value={0}>Domingo</option>
                <option value={1}>Segunda</option>
                <option value={2}>Terça</option>
                <option value={3}>Quarta</option>
                <option value={4}>Quinta</option>
                <option value={5}>Sexta</option>
                <option value={6}>Sábado</option>
              </select>
            )}
            <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
              {(["media", "pico"] as const).map(m => (
                <button key={m} onClick={() => setMetrica(m)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                    metrica === m ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
                  }`}>
                  {m === "media" ? "Média" : "Pico"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Aviso caso cron não esteja ativo ── */}
        {!isLoading && !temDados && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
            <CardContent className="pt-6 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1">Captura de ocupação ainda não ativada</p>
                <p className="text-sm text-amber-800 dark:text-amber-300 mb-3">
                  A tabela <code className="bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">farol_snapshot_minutos</code> existe mas
                  o job de captura minuto a minuto não foi agendado.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Cards resumo ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ResumoCard icon={Gauge} label="Média de aguardando" value={resumo?.media_geral?.toFixed(1) ?? "0"} sub="pacientes simultâneos" color="blue" />
          <ResumoCard icon={Flame} label="Pico absoluto" value={String(resumo?.pico_absoluto ?? 0)} sub="no período" color="red" />
          <ResumoCard icon={Clock} label="Hora de pico" value={resumo?.hora_pico != null ? `${resumo.hora_pico}h` : "—"} sub={resumo?.dia_pico ? format(new Date(resumo.dia_pico + "T12:00:00"), "dd/MM (EEE)", { locale: ptBR }) : ""} color="amber" />
          <ResumoCard icon={Gauge} label="Amostras coletadas" value={String(resumo?.total_amostras ?? 0)} sub="minutos analisados" color="gray" />
        </div>

        {/* ── Pico por hora (clicável com drill-down) ── */}
        {temDados && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-foreground">Pico por hora</CardTitle>
              <p className="text-xs text-muted-foreground">
                Quantidade máxima de pacientes aguardando registrada em cada hora do dia — clique em uma hora para ver os detalhes
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-12 md:grid-cols-24 gap-1 w-full">
                {picoPorHora.horas.map(({ hora, pico }) => {
                  const ratio = pico / picoPorHora.absMax;
                  const selected = selectedHora === hora;
                  const isEmpty = pico === 0;
                  return (
                    <button
                      key={hora}
                      disabled={isEmpty}
                      onClick={() => setSelectedHora(selected ? null : hora)}
                      className={`flex flex-col items-center gap-0.5 rounded-md border px-0.5 py-1.5 transition-all ${
                        selected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : isEmpty
                          ? "border-transparent bg-muted/20 cursor-default"
                          : "border-transparent bg-muted/40 hover:border-primary/40 hover:bg-primary/5"
                      }`}
                    >
                      <span className="text-[9px] text-muted-foreground font-mono leading-none">
                        {hora.toString().padStart(2, "0")}h
                      </span>
                      <div className="w-full bg-muted rounded-sm overflow-hidden flex items-end" style={{ height: 26 }}>
                        <div
                          className="w-full transition-all"
                          style={{
                            height: `${isEmpty ? 0 : Math.max(ratio * 100, 10)}%`,
                            background: barColor(ratio),
                          }}
                        />
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums leading-none ${isEmpty ? "text-muted-foreground/40" : "text-foreground"}`}>
                        {pico}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Drill-down panel */}
              {selectedHora !== null && (() => {
                const detail = picoPorHora.horas.find(h => h.hora === selectedHora);
                if (!detail) return null;
                return (
                  <div className="mt-5 p-4 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        <div>
                          <div className="font-semibold text-foreground">
                            {selectedHora.toString().padStart(2, "0")}h — Pico: {detail.pico} pacientes
                          </div>
                          {detail.dia && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Registrado em {format(new Date(detail.dia + "T12:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedHora(null)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground"
                        aria-label="Fechar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {detail.modalidades.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground font-medium mb-2">Pico por modalidade nesta hora:</p>
                        {detail.modalidades.map(mod => (
                          <div key={mod.modId} className="flex items-center gap-2">
                            <span className="text-xs text-foreground w-32 truncate shrink-0">{mod.nome}</span>
                            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${(mod.max / detail.pico) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-foreground tabular-nums w-8 text-right">{mod.max}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem detalhamento por modalidade nesta hora.</p>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* ── Média por exame ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Média por exame</CardTitle>
            <p className="text-xs text-muted-foreground">Média de pacientes aguardando em cada modalidade por hora do dia</p>
          </CardHeader>
          <CardContent>
            {curvaPorExame.modalidadesAtivas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={curvaPorExame.dados} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hora" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {curvaPorExame.modalidadesAtivas.map((modId, idx) => (
                    <Line
                      key={modId}
                      type="monotone"
                      dataKey={`m_${modId}`}
                      name={MODALIDADE_NOMES[modId] ?? `Modalidade ${modId}`}
                      stroke={EXAME_COLORS[idx % EXAME_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Ocupação máxima da clínica por hora ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Ocupação máxima da clínica por hora</CardTitle>
            <p className="text-xs text-muted-foreground">Maior número de pacientes aguardando simultaneamente em cada hora do dia</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={curvaMaximo} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hora" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    color: "hsl(var(--foreground))",
                  }}
                />
                <Line type="monotone" dataKey="picoMaximo" name="Pico máximo" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Heatmap modalidade × hora ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Ocupação por modalidade × hora</CardTitle>
            <p className="text-xs text-muted-foreground">
              {metrica === "media" ? "Média" : "Pico"} de pacientes aguardando em cada modalidade por hora do dia
            </p>
          </CardHeader>
          <CardContent>
            {matrizMod.matriz.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-xs border-separate border-spacing-0.5">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-card text-left p-2 font-semibold text-muted-foreground">Modalidade</th>
                      {horasVisiveis.map(h => (
                        <th key={h} className="p-2 font-mono text-muted-foreground text-center min-w-[36px]">
                          {h.toString().padStart(2, "0")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrizMod.matriz.map(linha => (
                      <tr key={linha.modalidadeId}>
                        <td className="sticky left-0 bg-card font-medium text-foreground p-2 whitespace-nowrap">
                          {linha.nome}
                        </td>
                        {linha.horas.map(c => (
                          <td key={c.hora}
                              className={`text-center p-2 rounded font-semibold tabular-nums ${cellColor(c.valor, matrizMod.maxValue)}`}
                              title={`${linha.nome} às ${c.hora}h — ${c.valor.toFixed(1)} pac.`}>
                            {c.valor > 0 ? c.valor.toFixed(c.valor < 10 ? 1 : 0) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <td className="sticky left-0 bg-card font-bold text-foreground p-2 whitespace-nowrap uppercase tracking-wide text-xs">
                        Total
                      </td>
                      {horasVisiveis.map(h => {
                        const total = matrizMod.matriz.reduce((sum, linha) => {
                          const c = linha.horas.find(cell => cell.hora === h);
                          return sum + (c?.valor ?? 0);
                        }, 0);
                        return (
                          <td key={h}
                              className="text-center p-2 rounded font-bold tabular-nums bg-muted/50 text-foreground">
                            {total > 0 ? total.toFixed(total < 10 ? 1 : 0) : ""}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
                <LegendaCor />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Heatmap dia × hora (calendário) ── */}
        {matrizDiaHora.matriz.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-foreground">Ocupação por dia × hora</CardTitle>
              <p className="text-xs text-muted-foreground">
                {metrica === "media" ? "Média" : "Pico"} de pacientes aguardando em cada dia do período
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-xs border-separate border-spacing-0.5">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-card text-left p-2 font-semibold text-muted-foreground">Data</th>
                      {horasVisiveis.map(h => (
                        <th key={h} className="p-2 font-mono text-muted-foreground text-center min-w-[36px]">
                          {h.toString().padStart(2, "0")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrizDiaHora.matriz.map(linha => {
                      const d = new Date(linha.dia + "T12:00:00");
                      return (
                        <tr key={linha.dia}>
                          <td className="sticky left-0 bg-card font-medium text-foreground p-2 whitespace-nowrap">
                            <span className="text-muted-foreground mr-1">{DIAS_SEMANA[d.getDay()]}</span>
                            {format(d, "dd/MM", { locale: ptBR })}
                          </td>
                          {linha.horas.map(c => (
                            <td key={c.hora}
                                className={`text-center p-2 rounded font-semibold tabular-nums ${cellColor(c.valor, matrizDiaHora.maxValue)}`}
                                title={`${format(d, "dd/MM (EEE)", { locale: ptBR })} às ${c.hora}h — ${c.valor.toFixed(1)} pac.`}>
                              {c.valor > 0 ? c.valor.toFixed(c.valor < 10 ? 1 : 0) : ""}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}

// ─── sub-componentes ────────────────────────────────────────────────────────
type IconType = React.ComponentType<{ className?: string }>;

function ResumoCard({ icon: Icon, label, value, sub, color }:
  { icon: IconType; label: string; value: string; sub: string; color: "blue" | "red" | "amber" | "gray" }) {
  const ic = {
    blue: "text-primary",
    red: "text-red-500 dark:text-red-400",
    amber: "text-amber-500 dark:text-amber-400",
    gray: "text-muted-foreground",
  }[color];
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`h-4 w-4 ${ic}`} />
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        <p className="text-3xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function LegendaCor() {
  return (
    <div className="flex items-center gap-2 mt-3 text-[11px] text-muted-foreground">
      <span>menos ocupado</span>
      <div className="flex gap-0.5">
        <span className="w-5 h-4 rounded-sm bg-muted/30 border border-border" />
        <span className="w-5 h-4 rounded-sm bg-emerald-100 dark:bg-emerald-900/40" />
        <span className="w-5 h-4 rounded-sm bg-yellow-100 dark:bg-yellow-900/40" />
        <span className="w-5 h-4 rounded-sm bg-amber-200 dark:bg-amber-800/60" />
        <span className="w-5 h-4 rounded-sm bg-orange-400 dark:bg-orange-700" />
        <span className="w-5 h-4 rounded-sm bg-red-500 dark:bg-red-600" />
      </div>
      <span>mais ocupado</span>
    </div>
  );
}
