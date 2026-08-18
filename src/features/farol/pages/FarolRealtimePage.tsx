import { useMemo, useState } from "react";
import { hojeBRT } from "@/lib/dataBRT";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, differenceInMinutes } from "date-fns";
import { ArrowLeft, RefreshCw, DoorOpen, X, Clock, Stethoscope, Check, ChevronDown, Syringe, ArrowUp, ArrowDown, Star, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/shared/contexts/AuthContext";
import { toast } from "sonner";
import {
  useFarolRealtime,
  type FarolPaciente,
} from "@/features/farol/hooks/useFarolRealtime";
import { useModalidadeThroughput, calcularETA, formatETA } from "@/features/farol/services/previsaoAtendimento";
import {
  useEmSalaRm, useToggleAnestesia, calcularEtasRm, SEMAFORO_INFO,
  type SemaforoEstado,
} from "@/features/farol/services/etaRm";
import { useTemposExames, formatarSegundos } from "@/features/farol/services/temposExameService";
import {
  useOrdemFila, useSalvarFila, aplicarOrdemSalva, moverChave,
} from "@/features/farol/services/ordemFila";
import { sugerirOrdem, ordemCompletaSugerida, JANELA_PADRAO_SEG } from "@/features/farol/services/ordemSugerida";
import {
  classificarStatusAgendado, STATUS_AGENDADO_INFO,
  classificarPrevisaoVsAgendado, PREVISAO_INFO,
} from "@/features/farol/services/statusAgendado";
import { SITUACAO } from "@/services/netris/client";
import { LOCALIDADES, salaToLocalidade, type Localidade } from "@/features/farol/utils/localidade";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { railDe, chipDe, modalidadeDe, familiaPorNomeExame, LABEL_FAMILIA, type FamiliaModalidade } from "@/features/farol/lib/modalidades";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLed(minutosAtraso: number): "green" | "yellow" | "red" {
  if (minutosAtraso < 30) return "green";
  if (minutosAtraso < 60) return "yellow";
  return "red";
}

const LED = {
  green:  { dot: "bg-green-500 shadow-[0_0_8px_2px_rgba(34,197,94,0.6)]",  row: "bg-card",       badge: "bg-green-100 text-green-700 border-green-200",   name: "text-foreground" },
  yellow: { dot: "bg-yellow-400 shadow-[0_0_8px_2px_rgba(234,179,8,0.6)]", row: "bg-yellow-50",  badge: "bg-yellow-100 text-yellow-700 border-yellow-200", name: "text-yellow-800" },
  red:    { dot: "bg-red-500 shadow-[0_0_10px_3px_rgba(239,68,68,0.7)] animate-soft-pulse", row: "bg-red-50", badge: "bg-red-100 text-red-700 border-red-200", name: "text-red-700 font-bold" },
};

function formatAtraso(min: number) {
  if (min <= 0) return "No horário";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `+${h}h ${m}m` : `+${m}m`;
}

function calcAtraso(horario: string | null, agora: Date): number {
  if (!horario) return 0;
  const [h, m] = horario.split(":").map(Number);
  const ref = new Date(agora);
  ref.setHours(h, m, 0, 0);
  return Math.max(0, differenceInMinutes(agora, ref));
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ModalidadeInfo {
  id: number;
  label: string;
  icon?: string; // emoji opcional (ex: "🫀")
}

interface Props {
  modalidadeId: number | number[];
  title: string;
  situacaoIds?: number[];
  /** Se informado, separa os pacientes em sub-farois por modalidade */
  modalidadesInfo?: ModalidadeInfo[];
  /**
   * Liga a previsão por protocolo (tabela farol_tempos_exame + ETA cumulativa
   * + semáforo de fila do farol Excel). Hoje só a Ressonância usa.
   */
  previsaoPorProtocolo?: boolean;
  /**
   * Família que esta tela aceita. Exame cujo NOME é de outra família não
   * entra na fila, mesmo que o NetRis o tenha marcado com a modalidade
   * desta. Sem a prop, nada é filtrado (comportamento de antes).
   */
  familiaEsperada?: FamiliaModalidade;
}

const SEMAFORO_CHIP: Record<SemaforoEstado, string> = {
  ocioso:     "bg-red-100 text-red-700 border-red-300",
  verde:      "bg-green-100 text-green-700 border-green-300",
  amarelo:    "bg-yellow-100 text-yellow-800 border-yellow-300",
  sobrecarga: "bg-red-100 text-red-700 border-red-300 animate-soft-pulse",
};

// ── Componente ────────────────────────────────────────────────────────────────

export function FarolRealtimePage({
  modalidadeId,
  title,
  situacaoIds = [SITUACAO.ENCAMINHADO_EXAME],
  modalidadesInfo,
  previsaoPorProtocolo = false,
  familiaEsperada,
}: Props) {
  const navigate  = useNavigate();
  const { tenant, profile } = useAuth();
  const agora     = new Date();

  const { pacientes, loading, syncing, lastSync, syncNow, dispensar, darBaixaAtomica } =
    useFarolRealtime(modalidadeId, situacaoIds);
  const { data: throughput } = useModalidadeThroughput(title);
  const duracaoEstimadaMin = throughput?.duracaoMediaMinutos ?? 20;

  // ── Previsão por protocolo (Farol RM) ──────────────────────────────────────
  const modIdsArray = useMemo(
    () => (Array.isArray(modalidadeId) ? modalidadeId : [modalidadeId]),
    [Array.isArray(modalidadeId) ? modalidadeId.join(",") : modalidadeId],
  );
  const { data: temposRm } = useTemposExames("RM", previsaoPorProtocolo);
  const { data: emSala } = useEmSalaRm(modIdsArray, previsaoPorProtocolo);
  const toggleAnestesia = useToggleAnestesia();
  const { data: ordemSalva } = useOrdemFila(modIdsArray, previsaoPorProtocolo);
  const salvarFila = useSalvarFila(modIdsArray);

  const [searchParams] = useSearchParams();
  // Permite pre-filtro vindo do Hub via ?salas=sala1,sala2 (encoded)
  const [selectedSalas, setSelectedSalas] = useState<Set<string>>(() => {
    const raw = searchParams.get("salas");
    if (!raw) return new Set();
    return new Set(raw.split(",").map(s => decodeURIComponent(s)).filter(Boolean));
  });
  const [selectedLocalidades, setSelectedLocalidades] = useState<Set<Localidade>>(() => {
    const raw = searchParams.get("localidades");
    if (!raw) return new Set();
    const validas = new Set<Localidade>(LOCALIDADES);
    return new Set(raw.split(",").map(s => decodeURIComponent(s)).filter((s): s is Localidade => validas.has(s as Localidade)));
  });
  const [selected,     setSelected]     = useState<FarolPaciente | null>(null);
  const [baixaStep,    setBaixaStep]     = useState<"realizado" | "cancelado" | "faltou" | "em_sala" | null>(null);
  const [baixaLoading, setBaixaLoading] = useState(false);
  const [tick, setTick] = useState(0);

  // Relógio a cada minuto para atualizar atrasos
  useState(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  });

  // ETA por protocolo: calculada sobre a fila COMPLETA (sem filtros de sala/
  // localidade) — filtrar a visão não muda a posição real de ninguém.
  // Recalcula a cada tick (1min), sync ou mudança na tabela de tempos.
  // ── Exame de outra família não entra ──────────────────────────────────────
  // O Farol RM é só de Ressonância, mas o `idModalidade` do NetRis colocou
  // procedimentos de TC aqui dentro. Como o ETA é cumulativo, cada intruso
  // ainda somava um ciclo inventado (não há protocolo de TC na tabela da RM,
  // então caía no fallback de 20min) e empurrava a previsão de todo mundo
  // abaixo. Filtrar pelo nome corta o problema na entrada.
  const { pacientesDaFamilia, exameForasteiros } = useMemo(() => {
    if (!familiaEsperada) return { pacientesDaFamilia: pacientes, exameForasteiros: [] as string[] };
    const forasteiros: string[] = [];
    const mantidos: FarolPaciente[] = [];
    for (const p of pacientes) {
      const meus = p.exames.filter(e => {
        const f = familiaPorNomeExame(e.nome);
        // `null` = nome não identifica família nenhuma. Fica: fazer paciente
        // sumir da fila é falha pior que mostrar um exame a mais.
        if (f === null || f === familiaEsperada) return true;
        forasteiros.push(e.nome);
        return false;
      });
      if (meus.length === p.exames.length) mantidos.push(p);
      else if (meus.length > 0) mantidos.push({ ...p, exames: meus });
    }
    return { pacientesDaFamilia: mantidos, exameForasteiros: forasteiros };
  }, [pacientes, familiaEsperada]);

  // Ordem efetiva da fila. O que o operador salvou vence o horário agendado —
  // e precisa ser aplicado ANTES do cálculo de ETA, porque o motor soma os
  // ciclos "de quem está na frente": ordem errada, previsão errada pra todos
  // que vêm abaixo.
  const fila = useMemo(
    () => aplicarOrdemSalva(pacientesDaFamilia, ordemSalva),
    [pacientesDaFamilia, ordemSalva],
  );

  const etaRm = useMemo(() => {
    if (!previsaoPorProtocolo || !temposRm || temposRm.length === 0) return null;
    return calcularEtasRm({
      pacientes: fila,
      tempos: temposRm,
      emSala: emSala ?? [],
      fallbackMin: duracaoEstimadaMin,
      agora: new Date(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previsaoPorProtocolo, temposRm, emSala, fila, duracaoEstimadaMin, tick]);

  const salas = [...new Set(
    pacientesDaFamilia.flatMap(p => p.exames.map(e => e.sala).filter(Boolean))
  )].sort() as string[];

  // Localidades efetivamente presentes nos pacientes atuais — só mostra checkbox
  // pra localidades que existem na fila, evita "Anexo (0)" quando não tem ninguém.
  const localidadesPresentes = [...new Set(
    pacientesDaFamilia.flatMap(p => p.exames.map(e => salaToLocalidade(e.sala)))
  )].sort() as Localidade[];

  // Filtros se combinam com AND: paciente precisa passar nos dois.
  // Empty Set em qualquer um = sem filtro daquela dimensão.
  const visiveis = fila.filter(p => {
    if (selectedSalas.size > 0 && !p.exames.some(e => e.sala && selectedSalas.has(e.sala))) {
      return false;
    }
    if (selectedLocalidades.size > 0 && !p.exames.some(e => selectedLocalidades.has(salaToLocalidade(e.sala)))) {
      return false;
    }
    return true;
  });

  const toggleSala = (s: string) => {
    setSelectedSalas(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };
  const selecionarTodas = () => setSelectedSalas(new Set(salas));
  const limparSalas     = () => setSelectedSalas(new Set());

  const toggleLocalidade = (l: Localidade) => {
    setSelectedLocalidades(prev => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });
  };
  const limparLocalidades = () => setSelectedLocalidades(new Set());

  const now = new Date();

  // ── Ordem da fila (porte dos botões de mover linha do farol Excel) ─────────
  // Com filtro de sala/localidade ligado, mover esconde o efeito: o vizinho da
  // troca pode estar fora da visão. Desabilitar e dizer o porquê é melhor que
  // um clique que parece não fazer nada.
  const filtroAtivo = selectedSalas.size > 0 || selectedLocalidades.size > 0;
  const prioridadeDe = (chave: string) => ordemSalva?.get(chave)?.prioritario ?? false;

  const persistirOrdem = async (chaves: string[], prioridades?: Map<string, boolean>) => {
    try {
      await salvarFila.mutateAsync(
        chaves.map(c => ({ chave: c, prioritario: prioridades?.get(c) ?? prioridadeDe(c) })),
      );
    } catch (e: any) {
      toast.error("Não foi possível salvar a ordem da fila", { description: e?.message });
    }
  };

  const mover = (chave: string, direcao: -1 | 1) =>
    persistirOrdem(moverChave(fila.map(p => p.chave), chave, direcao));

  const alternarPrioritario = (chave: string) => {
    const mapa = new Map(fila.map(p => [p.chave, prioridadeDe(p.chave)]));
    mapa.set(chave, !prioridadeDe(chave));
    return persistirOrdem(fila.map(p => p.chave), mapa);
  };

  const aplicarSugestao = async () => {
    const sugestao = sugerirOrdem(
      fila.map(p => ({
        chave: p.chave,
        horarioAgendado: p.horarioAgendamento,
        // Sem ciclo por protocolo (exame não cadastrado em /farol/tempos) cai na
        // média da modalidade — mesmo fallback que o motor de ETA usa.
        duracaoSeg: etaRm?.porChave.get(p.chave)?.cicloSeg ?? duracaoEstimadaMin * 60,
        prioritario: prioridadeDe(p.chave),
      })),
      new Date(),
    );
    await persistirOrdem(ordemCompletaSugerida(sugestao));
    toast.success(
      `Ordem sugerida aplicada: ${sugestao.dentroDaJanela.length} paciente(s) em ${formatarSegundos(sugestao.totalSeg)}`,
      {
        description: sugestao.foraDaJanela.length > 0
          ? `${sugestao.foraDaJanela.length} ficaram fora da primeira hora e foram pro fim da fila.`
          : undefined,
      },
    );
  };

  // Controles por linha. Função e não componente de propósito: um componente
  // declarado aqui dentro remontaria a cada render da página.
  const controlesOrdem = (chave: string, compacto = false) => {
    if (!previsaoPorProtocolo) return null;
    const i = fila.findIndex(x => x.chave === chave);
    const prio = prioridadeDe(chave);
    const box = "flex items-center justify-center rounded border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-25 disabled:hover:bg-card";
    const dim = compacto ? "h-4 w-4" : "h-5 w-5";
    const ico = compacto ? "h-2.5 w-2.5" : "h-3 w-3";
    const travado = filtroAtivo || salvarFila.isPending;
    const motivo = filtroAtivo ? "Limpe os filtros de sala/localidade para reordenar a fila" : "";
    return (
      <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className={cn(box, dim)}
          disabled={travado || i <= 0}
          title={motivo || "Subir na fila"}
          onClick={() => mover(chave, -1)}
        >
          <ArrowUp className={ico} />
        </button>
        <button
          type="button"
          className={cn(box, dim)}
          disabled={travado || i < 0 || i >= fila.length - 1}
          title={motivo || "Descer na fila"}
          onClick={() => mover(chave, 1)}
        >
          <ArrowDown className={ico} />
        </button>
        <button
          type="button"
          className={cn(box, dim, prio && "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100")}
          disabled={salvarFila.isPending}
          title={prio ? "Prioritário — clique para desmarcar" : "Marcar como prioritário (entra antes na ordem sugerida)"}
          onClick={() => alternarPrioritario(chave)}
        >
          <Star className={cn(ico, prio && "fill-current")} />
        </button>
      </div>
    );
  };

  const chipStatusAgendado = (p: FarolPaciente, compacto = false) => {
    if (!previsaoPorProtocolo) return null;
    const s = classificarStatusAgendado(p.horarioAgendamento, now);
    if (!s) return null;
    const info = STATUS_AGENDADO_INFO[s];
    return (
      <span
        className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", info.chip)}
        title={`Agendado × agora: ${info.rotulo}`}
      >
        {compacto ? info.curto : info.rotulo}
      </span>
    );
  };

  // ── Dar baixa ───────────────────────────────────────────────────────────────

  const handleBaixa = async (status: "realizado" | "cancelado" | "faltou" | "em_sala") => {
    if (!selected) return;
    setBaixaLoading(true);
    try {
      const hoje   = hojeBRT();
      const medico = selected.medicoAgrupado || "(Sem médico)";

      // "Em Sala" não é desfecho final: só esconde do Farol enquanto o NetRis
      // não atualiza o status pra EM_SALA (45). Não vai pra historico_atendimentos.
      const contaNoHistorico = status !== "em_sala";

      if (contaNoHistorico) for (const exame of selected.exames) {
        const { data: existing } = await (supabase as any)
          .from("historico_atendimentos")
          .select("id, total, realizados, cancelados, faltaram")
          .eq("tenant_id", tenant?.id)
          .eq("data_atendimento", hoje)
          .eq("exame", exame.nome)
          .eq("medico", medico)
          .maybeSingle();

        if (existing) {
          await (supabase as any).from("historico_atendimentos").update({
            total:      existing.total + 1,
            realizados: existing.realizados + (status === "realizado" ? 1 : 0),
            cancelados: existing.cancelados + (status === "cancelado" ? 1 : 0),
            faltaram:   existing.faltaram   + (status === "faltou"    ? 1 : 0),
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
        } else {
          await (supabase as any).from("historico_atendimentos").insert({
            tenant_id:        tenant?.id || null,
            data_atendimento: hoje,
            exame:            exame.nome,
            medico,
            total:      1,
            realizados: status === "realizado" ? 1 : 0,
            cancelados: status === "cancelado" ? 1 : 0,
            faltaram:   status === "faltou"    ? 1 : 0,
          });
        }
      }

      // Baixa atômica: marca todos os atendimentos do paciente como dispensados
      // em farol_timestamps. Realtime propaga para TVs/outras telas instantâneo.
      const atendimentoIds = selected.exames.map(e => e.id).filter(Boolean);
      if (atendimentoIds.length && profile?.id) {
        try {
          await darBaixaAtomica(atendimentoIds, status, profile.id);
        } catch (e) {
          // fallback ao dispensar local se a baixa atômica falhar (RLS, conexão)
          console.warn("[FarolRealtimePage] baixa atômica falhou, usando dispensar local:", e);
          dispensar(selected.chave);
        }
      } else {
        dispensar(selected.chave);
      }

      setSelected(null);
      setBaixaStep(null);
      const labels = { realizado: "Realizado", cancelado: "Cancelado", faltou: "Faltou", em_sala: "Em Sala" } as const;
      toast.success(status === "em_sala" ? "Paciente marcado como Em Sala" : `Baixa registrada: ${labels[status]}`);
    } catch {
      toast.error("Erro ao registrar baixa");
    } finally {
      setBaixaLoading(false);
    }
  };

  // ── Render row ───────────────────────────────────────────────────────────────

  const renderRow = (p: FarolPaciente, index: number) => {
    const atraso = calcAtraso(p.horarioAgendamento, now);
    const led    = getLed(atraso);
    const c      = LED[led];
    const tempoNaFila = differenceInMinutes(now, p.vistoPrimeiraVezEm);
    const tempoFila   = tempoNaFila < 1 ? "< 1m" : tempoNaFila < 60
      ? `${tempoNaFila}m`
      : `${Math.floor(tempoNaFila/60)}h ${tempoNaFila%60}m`;
    const posicao = index - 1; // index é 1-based; ETA precisa 0-based
    const infoRm = etaRm?.porChave.get(p.chave) ?? null;
    const eta = infoRm?.entradaEstimada ?? calcularETA(now, posicao, duracaoEstimadaMin);
    const etaLabel = formatETA(eta, now);
    const etaTitle = infoRm
      ? infoRm.usouFallback
        ? "Por protocolo — inclui exame SEM protocolo cadastrado (usou média da modalidade)"
        : "Por protocolo: agora + restante de quem está em sala + ciclos de quem está na frente"
      : `Estimativa baseada em ${throughput?.diasComDados ?? 0} dias de histórico (${duracaoEstimadaMin}min/exame)`;
    // Previsão × agendado (porte de AnalisarHorarios): a cor responde "a fila
    // vai conseguir atender perto da hora marcada?", pergunta diferente da que
    // o chip de status responde ("o paciente chegou antes ou depois da hora?").
    const previsaoCor = previsaoPorProtocolo
      ? classificarPrevisaoVsAgendado(eta, p.horarioAgendamento)
      : null;
    const etaChip = previsaoCor
      ? PREVISAO_INFO[previsaoCor].chip
      : "bg-sky-50 text-sky-700 border-sky-200";
    // Ciclo que veio do fallback (exame sem protocolo em /farol/tempos) não
    // pode parecer medido. No Excel a célula equivalente ficava AMARELA e a
    // macro exigia escolha manual; aqui o número é exibido com "≈" e em âmbar,
    // porque ele entra na soma cumulativa e desloca a previsão de quem vem
    // depois.
    const cicloChutado = !!infoRm?.usouFallback;
    const cicloChip = cicloChutado
      ? "bg-amber-100 text-amber-900 border-amber-400"
      : "bg-violet-50 text-violet-700 border-violet-200";
    const cicloLabel = infoRm ? `${cicloChutado ? "≈" : ""}${formatarSegundos(infoRm.cicloSeg)}` : "";
    const cicloTitle = cicloChutado
      ? `Chute: exame sem protocolo cadastrado em /farol/tempos — usando a média da modalidade (${duracaoEstimadaMin}min por exame). Este tempo entra na soma e empurra a previsão de todos abaixo na fila.`
      : "Soma dos protocolos dos exames do paciente (+ adicional de anestesia, quando marcada)";
    const etaTitleFull = previsaoCor
      ? `${etaTitle} · ${PREVISAO_INFO[previsaoCor].titulo}`
      : etaTitle;

    return (
      <div
        key={p.chave}
        onClick={() => { setSelected(p); setBaixaStep(null); }}
        className={`cursor-pointer border-b border-border/50 last:border-0 transition-colors hover:brightness-95 ${c.row}`}
      >
        {/* MOBILE */}
        <div className="md:hidden p-3">
          <div className="flex items-start gap-2.5">
            <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
              <span className="font-mono text-xs font-bold text-muted-foreground">{index}</span>
              <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
              {controlesOrdem(p.chave, true)}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-sm leading-tight truncate ${c.name}`}>
                {p.anestesia && <Syringe className="inline h-3 w-3 mr-1 text-purple-600" aria-label="Anestesia" />}
                {p.nomePaciente}
              </p>
              <div className="flex flex-col gap-0.5 mt-0.5">
                {p.exames.map(e => (
                  <p key={e.id} className="text-xs text-muted-foreground truncate">🔬 {e.nome}</p>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {p.horarioAgendamento && (
                  <span className="text-[11px] text-muted-foreground font-mono">{p.horarioAgendamento}</span>
                )}
                {chipStatusAgendado(p, true)}
                {p.salaAgrupada && (
                  <span className="text-[11px] bg-blue-50 border border-blue-100 text-blue-600 rounded px-1.5 py-0.5">{p.salaAgrupada}</span>
                )}
                {p.medicoAgrupado && (
                  <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">{p.medicoAgrupado}</span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[9px] text-muted-foreground">atraso</span>
                <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded border ${c.badge}`}>{formatAtraso(atraso)}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[9px] text-muted-foreground">na fila</span>
                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded border bg-muted text-muted-foreground border-border">{tempoFila}</span>
              </div>
              {infoRm && (
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[9px] text-muted-foreground">ciclo</span>
                  <span className={cn("font-mono font-bold text-xs px-2 py-0.5 rounded border", cicloChip)} title={cicloTitle}>{cicloLabel}</span>
                </div>
              )}
              <div className="flex flex-col items-end gap-0.5" title={etaTitleFull}>
                <span className="text-[9px] text-muted-foreground">previsão</span>
                <span className={cn("font-mono font-bold text-xs px-2 py-0.5 rounded border", etaChip)}>{etaLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* DESKTOP */}
        <div className="hidden md:grid grid-cols-12 gap-2 items-center px-4 py-2.5">
          <div className="col-span-1 flex flex-col items-center gap-1">
            <span className="font-mono text-sm font-bold text-muted-foreground">{index}</span>
            <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
            {controlesOrdem(p.chave)}
          </div>
          <div className="col-span-3">
            <p className={`text-sm font-semibold truncate ${c.name}`}>
              {p.anestesia && <Syringe className="inline h-3.5 w-3.5 mr-1 text-purple-600" aria-label="Anestesia" />}
              {p.nomePaciente}
            </p>
            {p.exames.length > 1 && (
              <span className="text-[10px] bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 border border-purple-200 font-semibold">
                {p.exames.length} exames
              </span>
            )}
          </div>
          <div className="col-span-3">
            {p.exames.map(e => (
              <p key={e.id} className="text-xs text-muted-foreground truncate">🔬 {e.nome}</p>
            ))}
          </div>
          <div className="col-span-1 text-sm text-muted-foreground font-mono">
            {p.horarioAgendamento ?? <span className="text-muted-foreground/30">—</span>}
            {chipStatusAgendado(p, true) && (
              <div className="mt-0.5">{chipStatusAgendado(p, true)}</div>
            )}
          </div>
          <div className="col-span-1">
            {p.salaAgrupada
              ? <span className="text-xs font-semibold bg-blue-50 border border-blue-100 text-blue-700 rounded px-1.5 py-0.5">{p.salaAgrupada}</span>
              : <span className="text-muted-foreground/30 text-sm">—</span>}
          </div>
          <div className="col-span-1 text-xs text-muted-foreground truncate">{p.medicoAgrupado || <span className="text-muted-foreground/30 italic">—</span>}</div>
          <div className="col-span-2 flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded border ${c.badge}`}>{formatAtraso(atraso)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">na fila</span>
              <span className="font-mono font-bold text-xs px-2 py-0.5 rounded border bg-muted text-muted-foreground border-border">{tempoFila}</span>
            </div>
            {infoRm && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">ciclo</span>
                <span className={cn("font-mono font-bold text-xs px-2 py-0.5 rounded border", cicloChip)} title={cicloTitle}>{cicloLabel}</span>
              </div>
            )}
            <div className="flex items-center gap-1" title={etaTitleFull}>
              <span className="text-[10px] text-muted-foreground">previsão</span>
              <span className={cn("font-mono font-bold text-xs px-2 py-0.5 rounded border", etaChip)}>{etaLabel}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="flex flex-col font-sans -m-6 md:-m-8">

        {/* Header */}
        <header className="bg-card border-b border-border shadow-sm px-3 py-2.5 md:px-5 md:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground h-8 px-2 shrink-0" onClick={() => navigate("/farol")}>
              <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Voltar</span>
            </Button>
            <div className="h-5 w-px bg-border shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground leading-tight truncate">Farol {title}</h1>
              <p className="text-[10px] text-muted-foreground hidden sm:block">Tempo real · NetRis</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {previsaoPorProtocolo && fila.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 px-2.5"
                onClick={aplicarSugestao}
                disabled={salvarFila.isPending || filtroAtivo}
                title={filtroAtivo
                  ? "Limpe os filtros de sala/localidade para reordenar a fila"
                  : `Reordena pelo critério do farol Excel: atrasados, depois prioritários, depois exames mais curtos — preenchendo ${formatarSegundos(JANELA_PADRAO_SEG)} de janela.`}
              >
                <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Sugerir ordem</span>
              </Button>
            )}
            {etaRm && (
              <div
                className={`flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-semibold ${SEMAFORO_CHIP[etaRm.semaforo]}`}
                title={`${SEMAFORO_INFO[etaRm.semaforo].acao}${etaRm.pacientesEmSala > 0 ? ` · ${etaRm.pacientesEmSala} em sala` : ""}${etaRm.misses.length > 0 ? ` · ${etaRm.misses.length} exame(s) sem protocolo cadastrado em /farol/tempos` : ""}`}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                <span className="hidden sm:inline">{SEMAFORO_INFO[etaRm.semaforo].rotulo}</span>
                <span className="font-mono">{formatarSegundos(etaRm.trabalhoTotalSeg)}</span>
              </div>
            )}
            {localidadesPresentes.length > 1 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 px-2.5 sm:px-3">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate max-w-[140px]">
                      {selectedLocalidades.size === 0
                        ? "Todas localidades"
                        : selectedLocalidades.size === 1
                          ? [...selectedLocalidades][0]
                          : `${selectedLocalidades.size} de ${localidadesPresentes.length}`}
                    </span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="end">
                  <div className="flex items-center justify-between px-3 py-2 border-b">
                    <span className="text-xs font-semibold text-foreground">Filtrar por localidade</span>
                    <button onClick={limparLocalidades} className="text-[11px] text-muted-foreground hover:underline">Limpar</button>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {localidadesPresentes.map(l => (
                      <label key={l} className="flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-muted cursor-pointer">
                        <Checkbox checked={selectedLocalidades.has(l)} onCheckedChange={() => toggleLocalidade(l)} className="h-3.5 w-3.5" />
                        <span className="flex-1 truncate">{l}</span>
                      </label>
                    ))}
                  </div>
                  <div className="px-3 py-2 border-t bg-muted/40 text-[11px] text-muted-foreground leading-snug">
                    Localidade é derivada do nome da sala (Anexo, San Pietro, Queimadas). Sem marcação = todas visíveis.
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {salas.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 px-2.5 sm:px-3">
                    <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate max-w-[140px]">
                      {selectedSalas.size === 0
                        ? "Todas as salas"
                        : selectedSalas.size === 1
                          ? [...selectedSalas][0]
                          : `${selectedSalas.size} de ${salas.length} salas`}
                    </span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <div className="flex items-center justify-between px-3 py-2 border-b">
                    <span className="text-xs font-semibold text-foreground">Filtrar por sala</span>
                    <div className="flex gap-1.5">
                      <button onClick={selecionarTodas} className="text-[11px] text-blue-600 hover:underline">Marcar todas</button>
                      <span className="text-muted-foreground/40">·</span>
                      <button onClick={limparSalas} className="text-[11px] text-muted-foreground hover:underline">Limpar</button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {salas.map(s => {
                      const checked = selectedSalas.has(s);
                      return (
                        <label key={s} className="flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-muted cursor-pointer">
                          <Checkbox checked={checked} onCheckedChange={() => toggleSala(s)} className="h-3.5 w-3.5" />
                          <span className="flex-1 truncate">{s}</span>
                        </label>
                      );
                    })}
                  </div>
                  {selectedSalas.size > 0 && (
                    <div className="px-3 py-2 border-t bg-muted/40 text-[11px] text-muted-foreground">
                      Mostrando {visiveis.length} de {pacientesDaFamilia.length} pacientes
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            )}

            <div className="hidden lg:flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />{"<"}30min</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400" />30–60min</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 animate-soft-pulse" />{">"}60min</span>
            </div>

            <div className="text-right hidden sm:block">
              <p className="text-base font-mono font-bold text-foreground leading-none">{format(new Date(), "HH:mm")}</p>
              <p className="text-[10px] text-muted-foreground">{format(new Date(), "dd/MM/yy")}</p>
            </div>

            <Button variant="outline" size="sm" className="h-8 w-8 p-0 md:w-auto md:px-3 md:gap-1.5" onClick={syncNow} disabled={syncing}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span className="hidden md:inline text-xs">{syncing ? "Sync..." : "Atualizar"}</span>
            </Button>
          </div>
        </header>

        {/* Tabela */}
        <main className="flex-1 p-2 md:p-4 overflow-y-auto space-y-4">
          {exameForasteiros.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-semibold">
                {exameForasteiros.length} exame{exameForasteiros.length !== 1 ? "s" : ""} de outra modalidade
                {" "}fora desta fila:
              </span>{" "}
              {[...new Set(exameForasteiros)].join(" · ")}
              <span className="block mt-0.5 text-amber-800/80">
                Estão cadastrados no NetRis com a modalidade da {LABEL_FAMILIA[familiaEsperada ?? "none"]} —
                corrigir o idModalidade lá é o conserto de raiz.
              </span>
            </div>
          )}
          {loading ? (
            <div className="bg-card rounded-xl border border-border shadow-card flex items-center justify-center py-16 text-muted-foreground gap-2">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>Carregando dados do NetRis...</span>
            </div>
          ) : modalidadesInfo && modalidadesInfo.length > 1 ? (
            // ── Modo separado por modalidade (só mostra modalidades COM pacientes) ──
            (() => {
              const porModalidade = modalidadesInfo
                .map(info => {
                  // Filtra pacientes cujo ALGUM exame é dessa modalidade,
                  // e deixa apenas os exames dessa modalidade visíveis na seção
                  const filtrados = visiveis
                    .map(p => {
                      const examesDessaMod = p.exames.filter(e => e.modalidadeId === info.id);
                      if (examesDessaMod.length === 0) return null;
                      return { ...p, exames: examesDessaMod };
                    })
                    .filter((x): x is FarolPaciente => x !== null);
                  return { info, pacientes: filtrados };
                })
                // Esconde modalidades sem pacientes — cada fila só aparece quando tem gente
                .filter(g => g.pacientes.length > 0);

              if (porModalidade.length === 0) {
                return (
                  <div className="bg-card rounded-xl border border-border shadow-card flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                    <span className="text-3xl">🟢</span>
                    <p className="text-base font-medium">Nenhum paciente aguardando</p>
                    <p className="text-sm">A fila está vazia.</p>
                  </div>
                );
              }

              return porModalidade.map(({ info, pacientes: lista }) => (
                /* Rail na cor da família do farol. Aqui ele não distingue os
                   sub-grupos entre si — RM e RM+ são a mesma família, logo a
                   mesma cor —, quem distingue é o chip de código. O que o rail
                   faz é manter a identidade: a fila do ultrassom é teal aqui,
                   na Busca e na TV. */
                <div key={info.id} className={cn(railDe(info.id), "bg-card rounded-xl border border-border shadow-card")}>
                  <div className="flex items-center justify-between pl-5 pr-4 py-2.5 bg-primary/5 border-b border-border">
                    <div className="flex items-center gap-2">
                      {info.icon && <span className="text-base">{info.icon}</span>}
                      <span className={chipDe(info.id)} title={modalidadeDe(info.id).label}>
                        {modalidadeDe(info.id).codigo}
                      </span>
                      <h2 className="text-sm font-bold text-foreground">{info.label}</h2>
                      <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                        {lista.length} paciente{lista.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  <div className="hidden md:grid grid-cols-12 gap-2 pl-5 pr-4 py-2 bg-muted/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-3">Paciente</div>
                    <div className="col-span-3">Exame(s)</div>
                    <div className="col-span-1">Horário</div>
                    <div className="col-span-1">Sala</div>
                    <div className="col-span-1">Médico</div>
                    <div className="col-span-2 text-right">Atraso · Fila</div>
                  </div>
                  {lista.map((p, i) => renderRow(p, i + 1))}
                </div>
              ));
            })()
          ) : (
            // ── Modo lista única (comportamento original) ──
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              {/* Era bg-gray-100/border-gray-200/text-gray-500 fixos — ignoravam
                  o tema e discordavam do cabeçalho do modo agrupado, que já
                  usava tokens. Agora os dois cabeçalhos são o mesmo. */}
              <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-3">Paciente</div>
                <div className="col-span-3">Exame(s)</div>
                <div className="col-span-1">Horário</div>
                <div className="col-span-1">Sala</div>
                <div className="col-span-1">Médico</div>
                <div className="col-span-2 text-right">Atraso · Fila</div>
              </div>

              {visiveis.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <span className="text-3xl">🟢</span>
                  <p className="text-base font-medium">Nenhum paciente aguardando</p>
                  <p className="text-sm">A fila está vazia.</p>
                </div>
              ) : (
                visiveis.map((p, i) => renderRow(p, i + 1))
              )}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="px-3 py-1.5 md:px-5 md:py-2 bg-card border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {lastSync ? `Atualizado: ${format(lastSync, "HH:mm:ss")} · auto 30s` : "Aguardando sync..."}
          </span>
          <span className="font-medium text-muted-foreground hidden sm:inline">
            {visiveis.length} paciente{visiveis.length !== 1 ? "s" : ""} · Farol {title}
          </span>
        </footer>

        {/* Popup detalhe */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => { setSelected(null); setBaixaStep(null); }}>
            <div
              className="relative bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-5 animate-in slide-in-from-bottom sm:zoom-in duration-200 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => { setSelected(null); setBaixaStep(null); }} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>

              {(() => {
                const atraso = calcAtraso(selected.horarioAgendamento, now);
                const led    = getLed(atraso);
                const c      = LED[led];
                return (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`h-4 w-4 rounded-full shrink-0 ${c.dot}`} />
                      <h2 className={`text-lg font-bold leading-tight ${c.name}`}>{selected.nomePaciente}</h2>
                    </div>

                    <div className="space-y-3 text-sm">
                      {/* Exames */}
                      <div className="bg-muted/40 rounded-xl p-3 space-y-1.5">
                        <p className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1">
                          <Stethoscope className="h-3 w-3" /> Exames
                        </p>
                        {selected.exames.map(e => (
                          <div key={e.id} className="flex items-start gap-2">
                            <span className="text-muted-foreground text-xs mt-0.5">🔬</span>
                            <div>
                              <p className="text-sm font-medium text-foreground">{e.nome}</p>
                              {e.horario && <p className="text-xs text-muted-foreground">{e.horario}</p>}
                            </div>
                          </div>
                        ))}
                      </div>

                      {selected.medicoAgrupado && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Médico</span>
                          <span className="font-medium text-foreground text-right max-w-[60%]">{selected.medicoAgrupado}</span>
                        </div>
                      )}
                      {selected.salaAgrupada && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Sala</span>
                          <span className="font-medium text-foreground">{selected.salaAgrupada}</span>
                        </div>
                      )}
                      {selected.horarioAgendamento && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Agendado</span>
                          <span className="font-mono font-bold text-foreground">{selected.horarioAgendamento}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-muted-foreground uppercase">Atraso</span>
                        <span className={`font-mono font-bold text-sm px-3 py-1 rounded-lg border ${c.badge}`}>{formatAtraso(atraso)}</span>
                      </div>

                      {/* Anestesia (só no farol com previsão por protocolo) */}
                      {previsaoPorProtocolo && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                            <Syringe className="h-3 w-3" /> Anestesia
                          </span>
                          <button
                            disabled={toggleAnestesia.isPending}
                            onClick={async () => {
                              const valor = !selected.anestesia;
                              const ids = selected.exames.map(e => e.id).filter(Boolean);
                              try {
                                await toggleAnestesia.mutateAsync({ atendimentoIds: ids, valor });
                                setSelected({ ...selected, anestesia: valor });
                                toast.success(valor
                                  ? "Anestesia marcada — adicional somado ao ciclo"
                                  : "Anestesia desmarcada");
                              } catch (e: any) {
                                toast.error("Não foi possível salvar", { description: e?.message });
                              }
                            }}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                              selected.anestesia
                                ? "bg-purple-100 text-purple-700 border-purple-300"
                                : "bg-muted text-muted-foreground border-border hover:bg-purple-50"
                            }`}
                          >
                            {selected.anestesia ? "Com anestesia" : "Sem anestesia"}
                          </button>
                        </div>
                      )}

                      {/* Baixa */}
                      <div className="pt-3 border-t border-border">
                        {baixaStep ? (
                          <div className="space-y-2">
                            <p className="text-sm text-center text-foreground">
                              Confirmar como <span className="font-bold">{{ realizado: "Realizado", cancelado: "Cancelado", faltou: "Faltou", em_sala: "Em Sala" }[baixaStep]}</span>?
                            </p>
                            {baixaStep === "em_sala" && (
                              <p className="text-[11px] text-center text-muted-foreground">
                                Remove do Farol sem contar como realizado. Use quando o paciente já foi pra sala mas o NetRis ainda não atualizou.
                              </p>
                            )}
                            <div className="flex gap-2">
                              <button onClick={() => setBaixaStep(null)} disabled={baixaLoading}
                                className="flex-1 text-sm py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50">
                                Voltar
                              </button>
                              <button onClick={() => handleBaixa(baixaStep)} disabled={baixaLoading}
                                className="flex-1 text-sm font-semibold py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                                {baixaLoading ? "Salvando..." : "Confirmar"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Dar Baixa</p>
                            <div className="flex gap-2">
                              <button onClick={() => setBaixaStep("realizado")} className="flex-1 text-xs font-semibold py-2 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100">Realizado</button>
                              <button onClick={() => setBaixaStep("cancelado")} className="flex-1 text-xs font-semibold py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">Cancelado</button>
                              <button onClick={() => setBaixaStep("faltou")}    className="flex-1 text-xs font-semibold py-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">Faltou</button>
                            </div>
                            <button onClick={() => setBaixaStep("em_sala")} className="w-full text-xs font-semibold py-2 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100">
                              Em Sala (esconder sem dar baixa)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
