import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { buscarAtendimentos, listarModalidades } from "@/services/netris";
import { gerarCsvRelatorioMedico } from "@/services/netris";
import { GRUPO_SITUACOES, GRUPO_LABELS } from "@/services/netris/types";
import type { Atendimento, GrupoBusca } from "@/services/netris";
import { hojeISO } from "@/services/netris/client";
import { format, differenceInMinutes } from "date-fns";
import { Search, Download, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function BuscaAtendimentos() {
  const [modalidades, setModalidades] = useState<{ id: number; nome: string }[]>([]);
  const [modalidadeId, setModalidadeId] = useState<number>(0);
  const [grupo,        setGrupo]        = useState<GrupoBusca>("chegou");
  const [data,         setData]         = useState(hojeISO());
  const [paciente,     setPaciente]     = useState("");
  const [loading,      setLoading]      = useState(false);
  const [resultados,   setResultados]   = useState<Atendimento[]>([]);
  const [buscado,      setBuscado]      = useState(false);

  useEffect(() => {
    listarModalidades().then(setModalidades);
  }, []);

  const buscar = async () => {
    setLoading(true);
    try {
      const situacoes = GRUPO_SITUACOES[grupo];
      const lista = await buscarAtendimentos({
        dataInicial:  data,
        dataFinal:    data,
        situacaoId:   situacoes.length > 0 ? situacoes : undefined,
        modalidadeId: modalidadeId > 0 ? modalidadeId : undefined,
        pacienteNome: paciente.trim() || undefined,
      });
      setResultados(lista);
      setBuscado(true);
    } catch {
      toast.error("Erro ao buscar no NetRis");
    } finally {
      setLoading(false);
    }
  };

  function minEspera(a: Atendimento) {
    if (!a.dataHora) return 0;
    return Math.max(0, differenceInMinutes(new Date(), new Date(a.dataHora)));
  }

  function corSituacao(sid: number) {
    if ([5].includes(sid))     return "bg-red-100 text-red-700";
    if ([2, 26].includes(sid)) return "bg-amber-100 text-amber-700";
    if ([3].includes(sid))     return "bg-emerald-100 text-emerald-700";
    if ([13].includes(sid))    return "bg-blue-100 text-blue-700";
    return "bg-muted text-muted-foreground";
  }

  return (
    <MainLayout>
      <div className="space-y-5 p-4 md:p-6 animate-in fade-in duration-300">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <Filter className="h-4 w-4" /> NetRis · Busca
          </div>
          <h1 className="text-2xl font-extrabold">Busca de Atendimentos</h1>
          <p className="text-muted-foreground text-sm">Filtre por modalidade, status e data</p>
        </div>

        {/* Filtros */}
        <div className="bg-card rounded-xl border shadow-card p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

            {/* Data */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>

            {/* Modalidade */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Modalidade</label>
              <select value={modalidadeId} onChange={e => setModalidadeId(Number(e.target.value))}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-card">
                <option value={0}>Todas as modalidades</option>
                {modalidades.map(m => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>

            {/* Status / Grupo */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Status</label>
              <select value={grupo} onChange={e => setGrupo(e.target.value as GrupoBusca)}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-card">
                {(Object.keys(GRUPO_LABELS) as GrupoBusca[]).map(g => (
                  <option key={g} value={g}>{GRUPO_LABELS[g]}</option>
                ))}
              </select>
            </div>

            {/* Nome paciente */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Paciente</label>
              <input value={paciente} onChange={e => setPaciente(e.target.value)}
                onKeyDown={e => e.key === "Enter" && buscar()}
                placeholder="Nome do paciente…"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
          </div>

          <div className="flex justify-between items-center">
            <Button onClick={buscar} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Search className="h-4 w-4 mr-1.5" />}
              Buscar
            </Button>
            {buscado && resultados.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => gerarCsvRelatorioMedico(resultados, `busca_${data}`)}>
                <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
              </Button>
            )}
          </div>
        </div>

        {/* Resultados */}
        {buscado && (
          <>
            <p className="text-sm text-muted-foreground font-medium">
              {resultados.length} paciente{resultados.length !== 1 ? "s" : ""} encontrado{resultados.length !== 1 ? "s" : ""}
              {" · "}{GRUPO_LABELS[grupo]}{" · "}{format(new Date(data + "T12:00:00"), "dd/MM/yyyy")}
            </p>

            {resultados.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhum resultado para os filtros selecionados</p>
              </div>
            ) : (
              <div className="bg-card rounded-xl border shadow-card overflow-hidden">
                <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <div className="col-span-1">#</div>
                  <div className="col-span-3">Nome</div>
                  <div className="col-span-2">Exame</div>
                  <div className="col-span-2">Médico</div>
                  <div className="col-span-1">Horário</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-1 text-right">Espera</div>
                </div>
                {resultados.map((a, i) => {
                  const min = minEspera(a);
                  return (
                    <div key={a.id} className="border-b last:border-0">
                      <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm">
                        <div className="col-span-1 text-muted-foreground text-xs font-mono">{i + 1}</div>
                        <div className="col-span-3 font-semibold text-foreground truncate">{a.nomePaciente}</div>
                        <div className="col-span-2 text-muted-foreground text-xs truncate">{a.exame}</div>
                        <div className="col-span-2 text-muted-foreground text-xs truncate">{a.medico ?? "—"}</div>
                        <div className="col-span-1 text-muted-foreground text-xs font-mono">{a.horario ?? "—"}</div>
                        <div className="col-span-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${corSituacao(a.situacaoId)}`}>
                            {a.situacao ?? `Sit. ${a.situacaoId}`}
                          </span>
                        </div>
                        <div className="col-span-1 text-right text-xs font-mono text-muted-foreground">
                          {min > 0 ? `${min}m` : "—"}
                        </div>
                      </div>

                      {/* Mobile */}
                      <div className="md:hidden p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-sm truncate">{a.nomePaciente}</p>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${corSituacao(a.situacaoId)}`}>
                              {a.situacao ?? `Sit. ${a.situacaoId}`}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{a.exame}</p>
                          {a.medico && <p className="text-xs text-muted-foreground">{a.medico}</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
