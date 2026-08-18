// =============================================================================
// Farol de encaminhados para exame — Ressonância
// =============================================================================
// Mostra a fila de Ressonância até o exame: encaminhados, e também quem já
// passou pela anamnese e pelo preparo e está esperando a sala. Mesmo conjunto
// de pacientes do Farol RM (/farol/ressonancia) — o que muda é a apresentação.
//
// ── CUIDADO COM O NOME DA SITUAÇÃO 64 ───────────────────────────────────────
// No NetRis ela se chama "RM E TC ENCAMINHADO PARA EXAME". O "RM E TC" é parte
// do NOME DA SITUAÇÃO — não quer dizer que esta tela mostre Tomografia. Ela
// mostra só Ressonância. Confundir as duas coisas já custou uma ida e volta em
// 18/ago, com a TC entrando e saindo da fila no mesmo dia.
//
// Quem decide o que aparece é MODALIDADES_RM abaixo: 5 e 16, nada de 4.
//
// ── POR QUE A 13 TAMBÉM ESTÁ NA LISTA ───────────────────────────────────────
// Em 18/ago a situação 64 estava com ZERO atendimentos: todo mundo encaminhado
// estava na 13 ("ENCAMINHADO"), genérica, usada por todas as modalidades.
// Filtrar só pela 64 deixaria a tela vazia; tirar a 64 quebraria o dia em que a
// clínica voltar a marcá-la. Não dá para saber se ela caiu em desuso —
// farol_timestamps guarda apenas o dia corrente, não há histórico.
//
// O semáforo é o farol clássico do Excel (aba FAROL ATRASO): três bolas
// empilhadas, uma acesa por vez, medindo o TRABALHO TOTAL pendente
// (restante de quem está em sala + soma dos ciclos da fila) com os limiares
// originais: verde ≤ 1h · amarelo ≤ 1h40 · vermelho acima.
// =============================================================================

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, differenceInMinutes } from "date-fns";
import { ArrowLeft, RefreshCw, Syringe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MainLayout } from "@/components/layout/MainLayout";
import { useFarolRealtime } from "@/features/farol/hooks/useFarolRealtime";
import { useModalidadeThroughput, formatETA } from "@/features/farol/services/previsaoAtendimento";
import {
  useEmSalaRm, calcularEtasRm, classificarSemaforoExcel, SEMAFORO_EXCEL_INFO,
  type SemaforoExcel,
} from "@/features/farol/services/etaRm";
import { useTemposExames, formatarSegundos } from "@/features/farol/services/temposExameService";
import { MODALIDADE, SITUACAO } from "@/services/netris/client";
import { familiaPorNomeExame } from "@/features/farol/lib/modalidades";

// Só Ressonância, com e sem contraste. A Tomografia NÃO entra — ver cabeçalho
// sobre o nome da situação 64, que menciona TC e engana.
const MODALIDADES_RM = [
  MODALIDADE.RESSONANCIA,
  MODALIDADE.RESSONANCIA_CONTRASTE,
];
// A fila inteira até o exame — as MESMAS situações do Farol RM
// (/farol/ressonancia). Antes esta tela levava só as duas de "encaminhado"
// (13 e 64) e por isso mostrava menos gente: em 18/ago eram 3 aqui contra 8 lá,
// e os 5 de diferença eram justamente quem já tinha passado da anamnese e do
// preparo. Como as duas telas devem falar da mesma fila, a lista foi igualada.
//
// O que separa as duas agora é só a apresentação: aqui o farol de bolas grande
// da aba FAROL ATRASO da planilha; lá a tabela com ordem manual, status e ETA.
const SITUACOES_ENCAMINHADO = [
  SITUACAO.ENCAMINHADO_EXAME,
  SITUACAO.ANAMNESE,
  SITUACAO.PACIENTE_PREPARADO,
  SITUACAO.PREPARADO_ENFERMAGEM,
  SITUACAO.ENCAMINHADO_RM_TC,
];

// ── Farol de bolas (réplica dos shapes GREENB/YELLOWB/REDB da planilha) ──────
function TrafficLight({ estado }: { estado: SemaforoExcel }) {
  const bola = (cor: SemaforoExcel, aceso: boolean) => {
    const cores: Record<SemaforoExcel, string> = {
      vermelho: aceso
        ? "bg-red-500 shadow-[0_0_24px_6px_rgba(239,68,68,0.8)] animate-soft-pulse"
        : "bg-red-950/60",
      amarelo: aceso
        ? "bg-yellow-400 shadow-[0_0_24px_6px_rgba(234,179,8,0.7)]"
        : "bg-yellow-950/60",
      verde: aceso
        ? "bg-green-500 shadow-[0_0_24px_6px_rgba(34,197,94,0.7)]"
        : "bg-green-950/60",
    };
    return <span key={cor} className={`h-12 w-12 md:h-14 md:w-14 rounded-full transition-all ${cores[cor]}`} />;
  };
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-slate-900 border-4 border-slate-700 px-4 py-5 shadow-xl shrink-0">
      {bola("vermelho", estado === "vermelho")}
      {bola("amarelo", estado === "amarelo")}
      {bola("verde", estado === "verde")}
    </div>
  );
}

const ESTADO_TEXTO: Record<SemaforoExcel, string> = {
  verde: "text-green-500",
  amarelo: "text-yellow-500",
  vermelho: "text-red-500",
};

export default function FarolAnamnese() {
  const navigate = useNavigate();
  const { pacientes: pacientesCrus, loading, syncing, lastSync, syncNow } =
    useFarolRealtime(MODALIDADES_RM, SITUACOES_ENCAMINHADO);
  const { data: temposRm } = useTemposExames("RM");
  const { data: emSala } = useEmSalaRm(MODALIDADES_RM, true);
  const { data: throughput } = useModalidadeThroughput("Ressonância Magnética");

  const [tick, setTick] = useState(0);
  useState(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  });

  const now = new Date();

  // Segunda linha de defesa, igual à do Farol RM: tirar TOMOGRAFIA da lista de
  // modalidades acima já resolve o caso normal, mas o filtro por modalidade
  // depende do `idModalidade` que o NetRis mandou. Conferir também o nome do
  // exame custa nada e garante o que foi pedido — TC não entra.
  //
  // Exame cujo nome não identifica família nenhuma FICA: fazer paciente sumir
  // de uma fila de enfermagem é falha pior que mostrar um exame a mais.
  const { pacientes, exameForasteiros } = useMemo(() => {
    const forasteiros: string[] = [];
    const mantidos: typeof pacientesCrus = [];
    for (const p of pacientesCrus) {
      const meus = p.exames.filter(e => {
        const f = familiaPorNomeExame(e.nome);
        if (f === null || f === "rm") return true;
        forasteiros.push(e.nome);
        return false;
      });
      if (meus.length === p.exames.length) mantidos.push(p);
      else if (meus.length > 0) mantidos.push({ ...p, exames: meus });
    }
    return { pacientes: mantidos, exameForasteiros: forasteiros };
  }, [pacientesCrus]);

  const eta = useMemo(() => {
    if (!temposRm || temposRm.length === 0) return null;
    return calcularEtasRm({
      pacientes,
      tempos: temposRm,
      emSala: emSala ?? [],
      fallbackMin: throughput?.duracaoMediaMinutos ?? 20,
      agora: new Date(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacientes, temposRm, emSala, throughput?.duracaoMediaMinutos, tick]);

  const trabalhoSeg = eta?.trabalhoTotalSeg ?? 0;
  const estado = classificarSemaforoExcel(trabalhoSeg);
  const info = SEMAFORO_EXCEL_INFO[estado];

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
              <h1 className="text-sm font-bold text-foreground leading-tight truncate">Encaminhados para Exame</h1>
              <p className="text-[10px] text-muted-foreground hidden sm:block">Ressonância · encaminhados para exame</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-base font-mono font-bold text-foreground leading-none">{format(now, "HH:mm")}</p>
              <p className="text-[10px] text-muted-foreground">{format(now, "dd/MM/yy")}</p>
            </div>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0 md:w-auto md:px-3 md:gap-1.5" onClick={syncNow} disabled={syncing}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span className="hidden md:inline text-xs">{syncing ? "Sync..." : "Atualizar"}</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-3 md:p-5 overflow-y-auto space-y-4">

          {exameForasteiros.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-semibold">
                {exameForasteiros.length} exame{exameForasteiros.length !== 1 ? "s" : ""} de outra modalidade
                {" "}fora desta fila:
              </span>{" "}
              {[...new Set(exameForasteiros)].join(" · ")}
              <span className="block mt-0.5 text-amber-800/80">
                Esta fila é só de Ressonância. O exame chegou marcado com a modalidade da RM no NetRis,
                mas o nome diz outra coisa.
              </span>
            </div>
          )}

          {/* Farol grande — a área que no Excel era copiada pro WhatsApp */}
          <div className="bg-card rounded-xl border border-border shadow-card p-4 md:p-6 flex items-center gap-5 md:gap-8">
            <TrafficLight estado={estado} />
            <div className="min-w-0">
              <p className={`text-2xl md:text-4xl font-black leading-tight ${ESTADO_TEXTO[estado]}`}>
                {info.rotulo.toUpperCase()}
              </p>
              <p className="font-mono text-xl md:text-3xl font-bold text-foreground mt-1">
                {formatarSegundos(trabalhoSeg)}
                <span className="text-xs md:text-sm font-sans font-medium text-muted-foreground ml-2">de trabalho pendente</span>
              </p>
              <p className="text-xs md:text-sm text-muted-foreground mt-2 max-w-xl">{info.acao}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground font-mono">
                <span>{pacientes.length} encaminhado{pacientes.length !== 1 ? "s" : ""} para exame</span>
                {eta && eta.pacientesEmSala > 0 && <span>{eta.pacientesEmSala} em sala</span>}
                <span>verde ≤ 1h · amarelo ≤ 1h40 · vermelho acima</span>
              </div>
            </div>
          </div>

          {/* Fila */}
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-3">Paciente</div>
              <div className="col-span-4">Exame(s)</div>
              <div className="col-span-1">Agendado</div>
              <div className="col-span-1 text-right">Espera</div>
              <div className="col-span-1 text-right">Ciclo</div>
              <div className="col-span-1 text-right">Previsão</div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Carregando dados do NetRis...</span>
              </div>
            ) : pacientes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <span className="text-3xl">🟢</span>
                <p className="text-base font-medium">Ninguém encaminhado para exame</p>
                <p className="text-sm">Todos os encaminhados já passaram pela enfermagem.</p>
              </div>
            ) : (
              pacientes.map((p, i) => {
                const infoEta = eta?.porChave.get(p.chave) ?? null;
                const esperaMin = differenceInMinutes(now, p.vistoPrimeiraVezEm);
                const espera = esperaMin < 1 ? "< 1m" : esperaMin < 60
                  ? `${esperaMin}m` : `${Math.floor(esperaMin / 60)}h ${esperaMin % 60}m`;
                return (
                  <div key={p.chave} className="border-b border-border/50 last:border-0">
                    {/* Mobile */}
                    <div className="md:hidden p-3 flex items-start gap-2.5">
                      <span className="font-mono text-xs font-bold text-muted-foreground pt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">
                          {p.anestesia && <Syringe className="inline h-3 w-3 mr-1 text-purple-600" aria-label="Anestesia" />}
                          {p.nomePaciente}
                        </p>
                        {p.exames.map(e => (
                          <p key={e.id} className="text-xs text-muted-foreground truncate">🔬 {e.nome}</p>
                        ))}
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <p className="font-mono text-xs text-muted-foreground">{p.horarioAgendamento ?? "—"}</p>
                        <p className="font-mono text-xs font-bold">{espera}</p>
                        {infoEta && <p className="font-mono text-xs text-sky-700">{formatETA(infoEta.entradaEstimada, now)}</p>}
                      </div>
                    </div>
                    {/* Desktop */}
                    <div className="hidden md:grid grid-cols-12 gap-2 items-center px-4 py-2.5">
                      <div className="col-span-1 text-center font-mono text-sm font-bold text-muted-foreground">{i + 1}</div>
                      <div className="col-span-3 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {p.anestesia && <Syringe className="inline h-3.5 w-3.5 mr-1 text-purple-600" aria-label="Anestesia" />}
                          {p.nomePaciente}
                        </p>
                      </div>
                      <div className="col-span-4 min-w-0">
                        {p.exames.map(e => (
                          <p key={e.id} className="text-xs text-muted-foreground truncate">🔬 {e.nome}</p>
                        ))}
                      </div>
                      <div className="col-span-1 font-mono text-sm text-muted-foreground">{p.horarioAgendamento ?? "—"}</div>
                      <div className="col-span-1 text-right font-mono text-xs font-bold">{espera}</div>
                      <div className="col-span-1 text-right font-mono text-xs text-violet-700">
                        {infoEta ? formatarSegundos(infoEta.cicloSeg) : "—"}
                      </div>
                      <div className="col-span-1 text-right font-mono text-xs text-sky-700" title="Previsão de chegar à vez, mantida a ordem atual">
                        {infoEta ? formatETA(infoEta.entradaEstimada, now) : "—"}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>

        <footer className="px-3 py-1.5 md:px-5 md:py-2 bg-card border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{lastSync ? `Atualizado: ${format(lastSync, "HH:mm:ss")} · auto 30s` : "Aguardando sync..."}</span>
          <span className="hidden sm:inline">Sai da fila quando a anamnese é registrada no NetRis (situação 61)</span>
        </footer>
      </div>
    </MainLayout>
  );
}
