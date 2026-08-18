import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { differenceInMinutes, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Gauge, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { hojeBRT } from "@/lib/dataBRT";
import { cn } from "@/lib/utils";
import { MODALIDADE } from "@/services/netris/client";
import { railDe } from "@/features/farol/lib/modalidades";

// ─── Modalidades disponíveis na TV ──────────────────────────────────────────

const MODALIDADES_TV: { id: number; label: string }[] = [
  { id: MODALIDADE.RAIO_X,              label: "Raio-X" },
  { id: MODALIDADE.USG,                 label: "Ultrassonografia" },
  { id: MODALIDADE.ANESTESIA,           label: "Anestesia" },
  { id: MODALIDADE.TOMOGRAFIA,          label: "Tomografia" },
  { id: MODALIDADE.RESSONANCIA,         label: "Ressonância" },
  { id: MODALIDADE.MAMOGRAFIA,          label: "Mamografia" },
  { id: MODALIDADE.DENSITOMETRIA,       label: "Densitometria" },
  { id: MODALIDADE.BIOPSIA_US,          label: "Biópsia US" },
  { id: MODALIDADE.ECOCARDIOGRAMA,      label: "Ecocardiograma" },
  { id: MODALIDADE.ELETROENCEFALOGRAMA, label: "Eletroencefalograma" },
  { id: MODALIDADE.ELETROCARDIOGRAMA,   label: "Eletrocardiograma" },
  { id: MODALIDADE.RESSONANCIA_CONTRASTE, label: "RM Contraste" },
  { id: MODALIDADE.ESPIROMETRIA,        label: "Espirometria" },
  { id: MODALIDADE.HOLTER,              label: "Holter" },
];

// IDs de situação do pipeline de exame (encaminhado → preparado → em sala → executando)
const STATUS_FAROL = [13, 61, 62, 63, 64];

// ─── Types ───────────────────────────────────────────────────────────────────

interface FarolRow {
  atendimento_id:  string;
  nome_paciente:   string;
  cpf:             string | null;
  modalidade_id:   number;
  exame:           string | null;
  medico:          string | null;
  sala:            string | null;
  hora_inicial_ms: number | null;
  situacao_id:     number;
  situacao_nome:   string | null;
  primeira_vez:    string;
}

interface TVPaciente {
  chave:          string;
  nomePaciente:   string;
  modalidadeId:   number;
  horario:        string | null; // "HH:mm"
  medico:         string;
  sala:           string;
  primeiraVez:    Date;
}

type LedStatus = "green" | "yellow" | "red";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** ms desde meia-noite UTC (NetRis) → "HH:mm" em BRT (UTC−3) */
function msToHHMM(ms: number | null): string | null {
  if (ms === null || ms <= 0) return null;
  const BRT_OFFSET = 3 * 3_600_000;
  const brt = ms - BRT_OFFSET;
  if (brt < 0) return null;
  const h = Math.floor(brt / 3_600_000) % 24;
  const m = Math.floor((brt % 3_600_000) / 60_000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:mm" → Date de hoje BRT */
function horarioToDate(hhmm: string | null, now: Date): Date | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d;
}

function getLedStatus(overdueMinutes: number): LedStatus {
  if (overdueMinutes < 30) return "green";
  if (overdueMinutes < 60) return "yellow";
  return "red";
}

function formatOverdue(minutes: number): string {
  if (minutes <= 0) return "No horário";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `+${h}h ${m}m` : `+${m}m`;
}

function formatUntil(minutes: number): string {
  if (minutes <= 0) return "Agora";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `-${h}h ${m}m` : `-${m}m`;
}

function formatArrival(primeiraVez: Date, now: Date): string {
  const mins = differenceInMinutes(now, primeiraVez);
  if (mins < 1) return "Agora";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── LED / color maps ─────────────────────────────────────────────────────────

const ledColors = {
  green: {
    dot:   "bg-green-500 shadow-[0_0_8px_2px_rgba(34,197,94,0.7)]",
    badge: "bg-green-100 text-green-700 border-green-200",
    row:   "bg-white",
    name:  "text-gray-800",
  },
  yellow: {
    dot:   "bg-yellow-400 shadow-[0_0_8px_2px_rgba(234,179,8,0.7)]",
    badge: "bg-yellow-100 text-yellow-700 border-yellow-200",
    row:   "bg-yellow-50",
    name:  "text-yellow-800",
  },
  red: {
    dot:   "bg-red-500 shadow-[0_0_10px_3px_rgba(239,68,68,0.8)] animate-soft-pulse",
    badge: "bg-red-100 text-red-700 border-red-200",
    row:   "bg-red-50",
    name:  "text-red-700 font-bold",
  },
};
const pendingColors = {
  dot:   "bg-gray-300",
  badge: "bg-gray-100 text-gray-500 border-gray-200",
  row:   "bg-gray-50/50",
  name:  "text-gray-400",
};

const hubDot: Record<LedStatus, string> = {
  green:  "bg-green-500  shadow-[0_0_10px_3px_rgba(34,197,94,0.6)]",
  yellow: "bg-yellow-400 shadow-[0_0_10px_3px_rgba(234,179,8,0.6)]",
  red:    "bg-red-500    shadow-[0_0_12px_4px_rgba(239,68,68,0.7)] animate-soft-pulse",
};

const hubHeader: Record<LedStatus, string> = {
  green:  "bg-gray-50 border-gray-200",
  yellow: "bg-yellow-50 border-yellow-200",
  red:    "bg-red-50 border-red-200",
};

const pulseStyle: Record<LedStatus, React.CSSProperties> = {
  green:  { animationDuration: "2s" },
  yellow: { animationDuration: "1.2s" },
  red:    { animationDuration: "0.5s" },
};

// ─── Hub LED heuristic ────────────────────────────────────────────────────────

function hubStatus(pacientes: TVPaciente[], now: Date): LedStatus {
  let red = 0, yellow = 0;
  for (const p of pacientes) {
    const ref = horarioToDate(p.horario, now) ?? p.primeiraVez;
    if (ref > now) continue; // ainda não é hora
    const ov = Math.max(0, differenceInMinutes(now, ref));
    if (ov >= 60) red++;
    else if (ov >= 30) yellow++;
  }
  if (red >= 3) return "red";
  if (yellow >= 5) return "yellow";
  return "green";
}

// ─── TV data hook (sem dependência de auth) ───────────────────────────────────
//
// A tabela farol_timestamps exige autenticação pela RLS padrão.
// A migration 20260612000000_farol_timestamps_tv_anon adiciona uma policy
// SELECT para `anon`, permitindo que a TV em loop 24/7 leia sem login.

function useTVFarolData(modalidadeIds: number[]): {
  pacientesPorModalidade: Map<number, TVPaciente[]>;
  loading: boolean;
  lastSync: Date | null;
} {
  const [pacientesPorModalidade, setPorModalidade] = useState<Map<number, TVPaciente[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetch = useCallback(async () => {
    const hoje = hojeBRT();
    const { data } = await (supabase as any)
      .from("farol_timestamps")
      .select("atendimento_id, nome_paciente, cpf, modalidade_id, exame, medico, sala, hora_inicial_ms, situacao_id, situacao_nome, primeira_vez")
      .eq("data_ref", hoje)
      .in("modalidade_id", modalidadeIds)
      .in("situacao_id", STATUS_FAROL)
      .is("dispensed_at", null);

    const rows = (data ?? []) as FarolRow[];

    // Ordem que a recepção salvou (farol_fila_ordem). A TV precisa seguir a
    // MESMA ordem da tela do Farol: paciente que vê "você é o 3º" no painel e
    // é chamado em 1º não confia mais no painel. Sem linha salva, o sort por
    // horário logo abaixo continua valendo.
    //
    // A posição é lida sem filtrar por modalidade_key: a ordem é um fato do
    // paciente no dia, e a TV agrupa por modalidade solta enquanto a tela
    // agrupa por conjunto (RM = 5 e 16 juntas) — filtrar por chave de tela
    // aqui devolveria vazio justamente para a RM.
    const { data: ordemRows } = await (supabase as any)
      .from("farol_fila_ordem")
      .select("chave, posicao")
      .eq("data_ref", hoje);
    const posicaoSalva = new Map<string, number>(
      ((ordemRows ?? []) as { chave: string; posicao: number }[]).map(r => [r.chave, r.posicao]),
    );

    // Dedup por atendimento_id (mantém o mais recente)
    const porAtendimento = new Map<string, FarolRow>();
    for (const r of rows) {
      if (r.atendimento_id) porAtendimento.set(r.atendimento_id, r);
    }

    // Agrupar por paciente (CPF ou nome)
    const porPaciente = new Map<string, FarolRow[]>();
    for (const r of porAtendimento.values()) {
      const cpfLimpo = r.cpf?.replace(/\D/g, "");
      const chave = cpfLimpo || r.nome_paciente.toUpperCase().trim();
      if (!porPaciente.has(chave)) porPaciente.set(chave, []);
      porPaciente.get(chave)!.push(r);
    }

    // Construir TVPaciente e agrupar por modalidade
    const porMod = new Map<number, TVPaciente[]>();

    for (const [chave, grupo] of porPaciente) {
      const ordenados = [...grupo].sort((a, b) => (a.hora_inicial_ms ?? 0) - (b.hora_inicial_ms ?? 0));
      const primeiro = ordenados[0];
      const primeiraVez = ordenados.reduce<Date>((oldest, r) => {
        const t = new Date(r.primeira_vez);
        return t < oldest ? t : oldest;
      }, new Date(primeiro.primeira_vez));

      // Usa a modalidade do exame mais cedo do grupo
      const modId = primeiro.modalidade_id;
      const paciente: TVPaciente = {
        chave,
        nomePaciente:  primeiro.nome_paciente,
        modalidadeId:  modId,
        horario:       msToHHMM(primeiro.hora_inicial_ms),
        medico:        primeiro.medico ?? "",
        sala:          primeiro.sala ?? "",
        primeiraVez,
      };

      if (!porMod.has(modId)) porMod.set(modId, []);
      porMod.get(modId)!.push(paciente);
    }

    // Ordem salva primeiro; quem não tem posição cai no critério antigo
    // (horário asc, depois primeiraVez) e vai para depois de quem tem.
    for (const lista of porMod.values()) {
      lista.sort((a, b) => {
        const pa = posicaoSalva.get(a.chave);
        const pb = posicaoSalva.get(b.chave);
        if (pa !== undefined && pb !== undefined) return pa - pb;
        if (pa !== undefined) return -1;
        if (pb !== undefined) return 1;
        if (!a.horario && !b.horario) return a.primeiraVez.getTime() - b.primeiraVez.getTime();
        if (!a.horario) return 1;
        if (!b.horario) return -1;
        return a.horario.localeCompare(b.horario);
      });
    }

    setPorModalidade(porMod);
    setLastSync(new Date());
    setLoading(false);
  }, [modalidadeIds.join(",")]);

  // Polling inicial + Realtime
  useEffect(() => {
    fetch();

    // Realtime: invalida quando farol_timestamps muda
    const ch = supabase
      .channel(`tv_farol_${modalidadeIds.join("_")}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "farol_timestamps" },
        (payload: any) => {
          const modId = payload.new?.modalidade_id ?? payload.old?.modalidade_id;
          if (!modId || modalidadeIds.includes(modId)) {
            fetch();
          }
        }
      )
      .subscribe();

    channelRef.current = ch;

    // Polling de segurança a cada 30s
    const timer = setInterval(fetch, 30_000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(timer);
    };
  }, [fetch]);

  return { pacientesPorModalidade, loading, lastSync };
}

// ─── Coluna de uma modalidade ─────────────────────────────────────────────────

function FarolColumn({
  modalidadeId,
  label,
  pacientes,
  now,
}: {
  modalidadeId: number;
  label: string;
  pacientes: TVPaciente[];
  now: Date;
}) {
  const active = pacientes.filter(p => {
    const ref = horarioToDate(p.horario, now);
    return !ref || ref <= now;
  }).sort((a, b) => {
    const refA = horarioToDate(a.horario, now) ?? a.primeiraVez;
    const refB = horarioToDate(b.horario, now) ?? b.primeiraVez;
    return differenceInMinutes(now, refB) - differenceInMinutes(now, refA);
  });

  const pending = pacientes.filter(p => {
    const ref = horarioToDate(p.horario, now);
    return ref && ref > now;
  }).sort((a, b) => (a.horario ?? "").localeCompare(b.horario ?? ""));

  const status = hubStatus(pacientes, now);

  const renderRow = (p: TVPaciente, index: number, isPending: boolean) => {
    const ref = horarioToDate(p.horario, now);
    const diff = ref ? differenceInMinutes(now, ref) : differenceInMinutes(now, p.primeiraVez);
    const overdue = Math.max(0, diff);
    const minutesUntil = Math.abs(Math.min(0, diff));
    const led = getLedStatus(overdue);
    const colors = isPending ? pendingColors : ledColors[led];
    const timeLabel = isPending ? formatUntil(minutesUntil) : formatOverdue(overdue);

    return (
      <div key={p.chave} className={`border-b border-gray-100 last:border-0 transition-colors ${colors.row}`}>
        <div className="flex items-start gap-2.5 p-3">
          {/* Index + LED */}
          <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
            <span className="font-mono text-xs font-bold text-gray-400 leading-none">{index}</span>
            <span className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <p className={`font-bold text-sm leading-tight truncate ${colors.name}`}>{p.nomePaciente}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {p.horario && (
                <span className="text-[11px] text-gray-400 font-mono">{p.horario}</span>
              )}
              {p.sala && (
                <span className="text-[11px] bg-blue-50 border border-blue-100 text-blue-600 rounded px-1.5 py-0.5">{p.sala}</span>
              )}
              {p.medico && (
                <span className="text-[11px] text-gray-500 truncate max-w-[120px]">{p.medico}</span>
              )}
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] text-gray-400 font-medium">exame</span>
              <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded border ${colors.badge}`}>{timeLabel}</span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] text-gray-400 font-medium">chegou</span>
              <span className="font-mono font-bold text-xs px-2 py-0.5 rounded border bg-gray-100 text-gray-600 border-gray-200">
                {formatArrival(p.primeiraVez, now)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    /* Rail grosso: esta coluna é lida do outro lado da recepção, onde a cor
       chega antes do texto. É o mesmo device e a mesma cor da Busca e do Hub,
       só na espessura que a distância exige. */
    <div className={cn(railDe(modalidadeId), "rail-lg flex flex-col bg-white rounded-2xl border-2 border-gray-200 shadow-md min-h-0")}>
      {/* Column header */}
      <div className={cn("flex items-center justify-between pl-5 pr-4 py-3 border-b-2 shrink-0", hubHeader[status])}>
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center">
            <span
              className={cn("absolute h-5 w-5 rounded-full animate-ping opacity-60", hubDot[status])}
              style={pulseStyle[status]}
            />
            <span className={cn("relative h-5 w-5 rounded-full", hubDot[status])} />
          </div>
          <span className="font-bold text-gray-800 text-base">{label}</span>
        </div>
        <span className="text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-full px-2.5 py-0.5">
          {pacientes.length} paciente{pacientes.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table header */}
      {pacientes.length > 0 && (
        <div className="pl-5 pr-3 py-1.5 bg-gray-100 border-b border-gray-200 grid grid-cols-[auto_1fr_auto] gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          <span className="text-center">#</span>
          <span>Nome</span>
          <span className="text-right">Atraso · Chegou</span>
        </div>
      )}

      {/* Patient list */}
      <div className="flex-1 overflow-y-auto">
        {pacientes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-12 gap-2 text-gray-300">
            <CheckCircle2 className="h-10 w-10" />
            <p className="text-sm font-medium">Fila vazia</p>
          </div>
        )}

        {active.map((p, i) => renderRow(p, i + 1, false))}

        {pending.length > 0 && (
          <>
            <div className="px-4 py-1.5 bg-gray-50 border-y border-dashed border-gray-200">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                <span className="h-px flex-1 bg-gray-200" />
                Aguardando horário
                <span className="h-px flex-1 bg-gray-200" />
              </div>
            </div>
            {pending.map((p, i) => renderRow(p, active.length + i + 1, true))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Selector screen ──────────────────────────────────────────────────────────

function Selector({ onConfirm }: { onConfirm: (ids: number[]) => void }) {
  const [selected, setSelected] = useState<number[]>([]);

  const toggle = (id: number) =>
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
            <Gauge className="h-7 w-7 text-blue-600" />
          </div>
        </div>
        <h1 className="text-3xl font-black text-gray-800">TV Farol</h1>
        <p className="text-gray-500 text-sm">
          Selecione até 4 modalidades para visualizar simultaneamente,
          ou deixe em branco para mostrar todas com pacientes
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-3xl">
        {MODALIDADES_TV.map((mod, i) => {
          const isSelected = selected.includes(mod.id);
          const isDisabled = !isSelected && selected.length >= 4;
          return (
            <button
              key={mod.id}
              onClick={() => toggle(mod.id)}
              disabled={isDisabled}
              className={cn(
                "relative flex flex-col items-center gap-3 rounded-2xl border-2 p-5 text-sm font-semibold transition-all",
                isSelected
                  ? "border-blue-500 bg-blue-50 text-blue-700 shadow-md"
                  : isDisabled
                  ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                  : "border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:shadow-sm cursor-pointer"
              )}
            >
              {isSelected && (
                <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-blue-500" />
              )}
              <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
                isSelected ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
              )}>
                {i + 1}
              </div>
              {mod.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onConfirm([])}
          className="px-8 py-3 rounded-xl font-bold text-sm border-2 border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-all"
        >
          Mostrar todas
        </button>
        <button
          disabled={selected.length === 0}
          onClick={() => onConfirm(selected)}
          className={cn(
            "px-8 py-3 rounded-xl font-bold text-sm transition-all",
            selected.length > 0
              ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          )}
        >
          Iniciar TV · {selected.length}/4 selecionados
        </button>
      </div>
    </div>
  );
}

// ─── Main TV page ─────────────────────────────────────────────────────────────

export default function TVFarol() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [now, setNow] = useState(new Date());

  // Relógio — atualiza a cada 10s
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  // ?modalidades=2,4,5 → [2,4,5]  |  ausente ou vazio → [] (todas)
  const modalidadesParam = searchParams.get("modalidades") ?? "";
  const filteredIds: number[] = modalidadesParam
    .split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && MODALIDADES_TV.some(m => m.id === n));

  // IDs a buscar: se filtro vazio, busca todas as modalidades conhecidas
  const modIdsToFetch = filteredIds.length > 0
    ? filteredIds
    : MODALIDADES_TV.map(m => m.id);

  const { pacientesPorModalidade, loading, lastSync } = useTVFarolData(modIdsToFetch);

  // Selector: mostra quando não há param E não há dados ainda (aguardando escolha)
  const hasParam = searchParams.has("modalidades");
  if (!hasParam) {
    return (
      <Selector
        onConfirm={ids =>
          setSearchParams(ids.length > 0 ? { modalidades: ids.join(",") } : { modalidades: "all" })
        }
      />
    );
  }

  // Modalidades a exibir:
  //   - filtro explícito → essas em ordem
  //   - "all" → apenas as que têm ≥1 paciente, ordenadas por label
  const modIdsToShow: number[] =
    filteredIds.length > 0
      ? filteredIds
      : MODALIDADES_TV
          .filter(m => (pacientesPorModalidade.get(m.id)?.length ?? 0) > 0)
          .map(m => m.id);

  // Grade: 1-2 colunas fixas → grid-cols, 3+ → wrapping
  const colClass =
    modIdsToShow.length === 1
      ? "grid-cols-1 max-w-lg mx-auto"
      : modIdsToShow.length === 2
      ? "grid-cols-2"
      : modIdsToShow.length === 3
      ? "grid-cols-3"
      : "grid-cols-2 xl:grid-cols-4";

  const labelsByParam = filteredIds.length > 0
    ? filteredIds
        .map(id => MODALIDADES_TV.find(m => m.id === id)?.label)
        .filter(Boolean)
        .join(" · ")
    : "Todas as modalidades";

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
            <Gauge className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-800 leading-tight">Farol — Painel de Filas</h1>
            <p className="text-[11px] text-muted-foreground">{labelsByParam}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Legenda */}
          <div className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.7)]" />
              {"<"}30min
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 shadow-[0_0_5px_rgba(234,179,8,0.7)]" />
              30–60min
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-soft-pulse shadow-[0_0_5px_rgba(239,68,68,0.7)]" />
              {">"}60min
            </span>
          </div>

          <div className="text-right">
            <p className="text-xl font-mono font-bold text-gray-800 leading-none">{format(now, "HH:mm")}</p>
            <p className="text-[11px] text-muted-foreground">
              {lastSync
                ? `Sincronizado ${format(lastSync, "HH:mm:ss")}`
                : format(now, "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </div>

          <button
            onClick={() => setSearchParams({})}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Trocar
          </button>
        </div>
      </header>

      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex items-center justify-center text-gray-400 gap-3">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">Carregando dados do Farol…</span>
        </div>
      )}

      {/* Sem pacientes */}
      {!loading && modIdsToShow.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
          <CheckCircle2 className="h-12 w-12" />
          <p className="text-base font-medium">Nenhum paciente aguardando exame agora</p>
          <p className="text-sm text-gray-300">O painel atualiza automaticamente</p>
        </div>
      )}

      {/* Grade de modalidades */}
      {!loading && modIdsToShow.length > 0 && (
        <main className={cn("flex-1 grid gap-4 p-4 min-h-0", colClass)}>
          {modIdsToShow.map(modId => {
            const mod = MODALIDADES_TV.find(m => m.id === modId);
            if (!mod) return null;
            const pacientes = pacientesPorModalidade.get(modId) ?? [];
            return (
              <FarolColumn
                key={modId}
                modalidadeId={modId}
                label={mod.label}
                pacientes={pacientes}
                now={now}
              />
            );
          })}
        </main>
      )}
    </div>
  );
}
