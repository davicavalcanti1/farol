import { useEffect, useState, useMemo } from "react";
import { hojeBRT } from "@/lib/dataBRT";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { differenceInMinutes } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { CheckCircle2, DoorOpen, ArrowRight, Clock, ChevronDown, Users, AlertTriangle, LayoutDashboard, FileBarChart2, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalidadeThroughput, calcularETA, formatETA } from "@/features/farol/services/previsaoAtendimento";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

type FarolStatus = "green" | "yellow" | "red";

interface FarolModule {
  id: string;
  label: string;
  href: string;
  modalidadeIds: number[];
  description: string;
}

const FAROIS: FarolModule[] = [
  { id: "ultrassom",     label: "Ultrassonografia",           href: "/farol/ultrassom",      modalidadeIds: [2],              description: "Fila em tempo real" },
  { id: "radioterapia",  label: "Radiografia",                href: "/farol/radiografia",    modalidadeIds: [1],              description: "Fila em tempo real" },
  { id: "tomografia",    label: "Tomografia",                 href: "/farol/tomografia",     modalidadeIds: [4],              description: "Fila em tempo real" },
  { id: "mamografia",    label: "Mamografia",                 href: "/farol/mamografia",     modalidadeIds: [6],              description: "Fila em tempo real" },
  { id: "densitometria", label: "Densitometria",              href: "/farol/densitometria",  modalidadeIds: [7],              description: "Fila em tempo real" },
  { id: "ressonancia",   label: "Ressonância Magnética",      href: "/farol/ressonancia",    modalidadeIds: [5, 16],          description: "Com e sem contraste" },
  { id: "ecocardiograma",label: "Ecocardiograma",             href: "/farol/ecocardiograma", modalidadeIds: [10],             description: "Fila em tempo real" },
  { id: "neurocardio",   label: "Neurocardio & Espirometria", href: "/farol/neurocardio",    modalidadeIds: [14, 15, 18, 19, 20, 21], description: "ECG, EEG, Holter, Mapa" },
];

const STATUS_FAROL = [13, 61, 62, 63, 64];

interface FarolStatusInfo {
  status: FarolStatus;
  total: number;
  maxEsperaMin: number;
  atrasados: number;
}

interface PatientPreview {
  nome_paciente: string;
  primeira_vez: string;
  sala: string | null;
}

interface CardData {
  status: FarolStatusInfo;
  patients: PatientPreview[];
  salas: string[];
}

function useFarolCardData(modalidadeIds: number[]): CardData {
  const [data, setData] = useState<CardData>({
    status: { status: "green", total: 0, maxEsperaMin: 0, atrasados: 0 },
    patients: [],
    salas: [],
  });
  const key = modalidadeIds.join(",");

  useEffect(() => {
    const compute = async () => {
      const now = new Date();
      const hoje = hojeBRT(now);
      const { data: rows } = await (supabase as any)
        .from("farol_timestamps")
        .select("nome_paciente, primeira_vez, hora_inicial_ms, sala")
        .in("modalidade_id", modalidadeIds)
        .eq("data_ref", hoje)
        .in("situacao_id", STATUS_FAROL)
        .is("dispensed_at", null)
        .order("primeira_vez", { ascending: true });

      const list = (rows ?? []) as Array<{
        nome_paciente: string;
        primeira_vez: string;
        hora_inicial_ms: number | null;
        sala: string | null;
      }>;

      // hora_inicial_ms é ms desde meia-noite UTC — calcula referência também em UTC
      const startOfDayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const horaAgoraMs   = now.getTime() - startOfDayUTC;
      let maxEsperaMin = 0, atrasados = 0;
      for (const r of list) {
        const espera = differenceInMinutes(now, new Date(r.primeira_vez));
        if (espera > maxEsperaMin) maxEsperaMin = espera;
        if (r.hora_inicial_ms != null && r.hora_inicial_ms > 0 && r.hora_inicial_ms < horaAgoraMs) atrasados++;
      }
      let status: FarolStatus = "green";
      if (maxEsperaMin >= 60 || atrasados >= 3) status = "red";
      else if (maxEsperaMin >= 30 || atrasados >= 1) status = "yellow";

      const salas = [...new Set(list.map(r => r.sala).filter((s): s is string => !!s))].sort();
      const patients: PatientPreview[] = list.slice(0, 4).map(r => ({
        nome_paciente: r.nome_paciente,
        primeira_vez:  r.primeira_vez,
        sala:          r.sala,
      }));

      setData({ status: { status, total: list.length, maxEsperaMin, atrasados }, patients, salas });
    };

    compute();
    const interval = setInterval(compute, 30_000);
    return () => clearInterval(interval);
  }, [key]);

  return data;
}

const STATUS_CONFIG: Record<FarolStatus, {
  accentGradient: string;
  dotBg: string;
  dotPulse: string;
  pulseDuration: string;
  badge: string;
  label: string;
  headerBg: string;
}> = {
  green: {
    accentGradient: "from-emerald-400 to-emerald-500",
    dotBg:          "bg-emerald-500",
    dotPulse:       "bg-emerald-400/35",
    pulseDuration:  "3s",
    badge:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
    label:          "Normal",
    headerBg:       "",
  },
  yellow: {
    accentGradient: "from-amber-400 to-amber-500",
    dotBg:          "bg-amber-500",
    dotPulse:       "bg-amber-400/35",
    pulseDuration:  "1.6s",
    badge:          "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
    label:          "Atenção",
    headerBg:       "",
  },
  red: {
    accentGradient: "from-rose-500 to-red-600",
    dotBg:          "bg-red-500",
    dotPulse:       "bg-red-400/35",
    pulseDuration:  "0.9s",
    badge:          "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400",
    label:          "Crítico",
    headerBg:       "",
  },
};

function fmtTempo(min: number) {
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h${min % 60 > 0 ? `${min % 60}m` : ""}`;
}

function patientDot(min: number) {
  if (min >= 60) return "bg-red-500";
  if (min >= 30) return "bg-amber-500";
  return "bg-emerald-500";
}

function FarolCard({ farol }: { farol: FarolModule }) {
  const navigate = useNavigate();
  const { status, patients, salas } = useFarolCardData(farol.modalidadeIds);
  const cfg = STATUS_CONFIG[status.status];
  const [hovered, setHovered] = useState(false);
  const [selectedSalas, setSelectedSalas] = useState<Set<string>>(new Set());
  const { data: throughput } = useModalidadeThroughput(farol.label, hovered);
  const duracaoMediaMin = throughput?.duracaoMediaMinutos ?? null;
  const now = useMemo(() => new Date(), [patients]);

  const toggleSala = (s: string) =>
    setSelectedSalas(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const navigateWithSalas = (extra: Set<string> = selectedSalas) => {
    if (extra.size === 0) { navigate(farol.href); return; }
    navigate(`${farol.href}?salas=${[...extra].map(encodeURIComponent).join(",")}`);
  };

  return (
    <div
      className="group flex flex-col rounded-xl border border-border bg-card shadow-card hover:shadow-card-hover transition-all duration-200 overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Accent bar */}
      <div className={cn("h-1 bg-gradient-to-r", cfg.accentGradient)} />

      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-tight truncate">{farol.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{farol.description}</p>
          </div>
          {/* Pulsing status dot */}
          <div className="relative h-7 w-7 flex items-center justify-center shrink-0">
            <span
              className={cn("absolute h-7 w-7 rounded-full animate-ping", cfg.dotPulse)}
              style={{ animationDuration: cfg.pulseDuration }}
            />
            <span className={cn("relative h-3 w-3 rounded-full shadow-sm", cfg.dotBg)} />
          </div>
        </div>

        {/* Stats chips */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", cfg.badge)}>
            {cfg.label}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span className="font-semibold text-foreground">{status.total}</span>
            {status.total === 1 ? " paciente" : " pacientes"}
          </span>
          {duracaoMediaMin && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {duracaoMediaMin}m médio
            </span>
          )}
          {status.atrasados > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {status.atrasados} atrasado{status.atrasados > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Patient list */}
      <div className="flex-1 border-t border-border/60 mx-4" />
      <div className="px-2 py-1.5">
        {patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-1.5 text-muted-foreground/50">
            <CheckCircle2 className="h-6 w-6" />
            <span className="text-xs font-medium">Fila vazia</span>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {patients.map((p, i) => {
              const mins = Math.max(0, differenceInMinutes(now, new Date(p.primeira_vez)));
              const eta  = duracaoMediaMin ? calcularETA(now, i, duracaoMediaMin) : null;
              const etaStr = eta ? formatETA(eta, now) : null;
              return (
                <li key={i} className="flex items-center gap-2.5 px-2 py-2 text-xs">
                  <span className="text-[10px] font-bold text-muted-foreground/40 w-3 text-right shrink-0">{i + 1}</span>
                  <span className={cn("h-2 w-2 rounded-full shrink-0", patientDot(mins))} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{p.nome_paciente.trim()}</p>
                    {etaStr && <p className="text-[10px] text-primary/70 font-mono">~ {etaStr}</p>}
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-muted-foreground tabular-nums shrink-0">
                    {fmtTempo(mins)}
                  </span>
                </li>
              );
            })}
            {status.total > 4 && (
              <li className="py-1.5 text-center">
                <span className="text-[10px] text-muted-foreground">+{status.total - 4} aguardando</span>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/60 px-3 py-2 flex items-center gap-1 bg-muted/30">
        {salas.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 px-2">
                <DoorOpen className="h-3 w-3" />
                {selectedSalas.size === 0 ? `${salas.length} sala${salas.length > 1 ? "s" : ""}` : `${selectedSalas.size} de ${salas.length}`}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <div className="px-3 py-2 border-b flex items-center justify-between">
                <span className="text-xs font-semibold">Filtrar salas</span>
                <button className="text-[11px] text-primary hover:underline" onClick={() => setSelectedSalas(new Set())}>
                  Limpar
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {salas.map(s => (
                  <label key={s} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted cursor-pointer">
                    <Checkbox checked={selectedSalas.has(s)} onCheckedChange={() => toggleSala(s)} className="h-3.5 w-3.5" />
                    <span className="flex-1 truncate">{s}</span>
                  </label>
                ))}
              </div>
              {selectedSalas.size > 0 && (
                <div className="px-3 py-2 border-t bg-muted/50">
                  <Button size="sm" className="w-full h-7 text-[11px]" onClick={() => navigateWithSalas()}>
                    Abrir filtrado ({selectedSalas.size})
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        ) : (
          <span className="text-[11px] text-muted-foreground px-2">Sem salas ativas</span>
        )}
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] gap-1 text-primary hover:text-primary hover:bg-primary/10"
            onClick={() => navigate(farol.href)}
          >
            Abrir <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function FarolHub() {
  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="Recepção"
          title="Farol"
          subtitle="Monitoramento em tempo real dos pacientes aguardando exame, por modalidade"
          actions={
            <>
              <Link
                to="/farol/anamnese"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ClipboardList className="h-4 w-4" />
                Anamnese
              </Link>
              <Link
                to="/farol/dashboard"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" />
                Painel
              </Link>
              <Link
                to="/farol/relatorios"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <FileBarChart2 className="h-4 w-4" />
                Relatórios
              </Link>
            </>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {FAROIS.map(farol => <FarolCard key={farol.id} farol={farol} />)}
        </div>
      </div>
    </MainLayout>
  );
}
