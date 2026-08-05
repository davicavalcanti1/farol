import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { buscarHojeChegou } from "@/services/netris";
import type { Atendimento } from "@/services/netris";
import { differenceInMinutes, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RefreshCw, UserCheck, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const POLL = 30_000;

function minEspera(a: Atendimento): number {
  const ref = a.dataHora ? new Date(a.dataHora) : new Date();
  return Math.max(0, differenceInMinutes(new Date(), ref));
}

function corLed(min: number) {
  if (min < 30) return "bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]";
  if (min < 60) return "bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.7)]";
  return "bg-red-500 animate-soft-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]";
}

function formatMin(min: number): string {
  if (min <= 0) return "< 1 min";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

export default function PacientesChegou() {
  const [pacientes, setPacientes]   = useState<Atendimento[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [lastSync,  setLastSync]    = useState<Date | null>(null);
  const [search,    setSearch]      = useState("");

  const buscar = async () => {
    try {
      const data = await buscarHojeChegou();
      // Ordena por tempo de espera (maior primeiro)
      data.sort((a, b) => minEspera(b) - minEspera(a));
      setPacientes(data);
      setLastSync(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    buscar();
    const t = setInterval(buscar, POLL);
    return () => clearInterval(t);
  }, []);

  const filtrados = search.trim()
    ? pacientes.filter(p =>
        p.nomePaciente.toLowerCase().includes(search.toLowerCase()) ||
        p.exame.toLowerCase().includes(search.toLowerCase()) ||
        (p.medico ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : pacientes;

  return (
    <MainLayout>
      <div className="space-y-4 p-4 md:p-6 animate-in fade-in duration-300">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-primary font-semibold text-sm">
              <UserCheck className="h-4 w-4" />
              NetRis · Tempo real
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">Pacientes Chegou</h1>
            <p className="text-muted-foreground text-sm">
              Todos os pacientes com status Chegou/Aguardando Exame hoje
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastSync && (
              <span className="text-xs text-muted-foreground">
                Atualizado {format(lastSync, "HH:mm:ss", { locale: ptBR })}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={buscar}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Atualizar
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total",         value: pacientes.length,                              color: "text-blue-700",   bg: "bg-blue-50"   },
            { label: "≥ 30 min",      value: pacientes.filter(p => minEspera(p) >= 30).length, color: "text-yellow-700", bg: "bg-yellow-50" },
            { label: "≥ 1 hora",      value: pacientes.filter(p => minEspera(p) >= 60).length, color: "text-red-700",    bg: "bg-red-50"    },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl border p-4 text-center`}>
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
              <p className={`text-xs font-medium ${s.color}/70 mt-0.5`}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, exame ou médico…"
            className="w-full pl-9 pr-4 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-card"
          />
        </div>

        {/* Tabela */}
        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum paciente com status Chegou</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border shadow-card overflow-hidden">
            {/* Cabeçalho desktop */}
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-3">Nome</div>
              <div className="col-span-3">Exame</div>
              <div className="col-span-2">Médico</div>
              <div className="col-span-1">Horário</div>
              <div className="col-span-2 text-right">Espera</div>
            </div>

            {filtrados.map((p, i) => {
              const min = minEspera(p);
              return (
                <div key={p.id} className="border-b last:border-0 hover:bg-slate-50/50 transition-colors">
                  {/* Desktop */}
                  <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm">
                    <div className="col-span-1 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-muted-foreground font-mono">{i + 1}</span>
                        <span className={`h-2.5 w-2.5 rounded-full ${corLed(min)}`} />
                      </div>
                    </div>
                    <div className="col-span-3 font-semibold text-foreground truncate">{p.nomePaciente}</div>
                    <div className="col-span-3 text-muted-foreground truncate">{p.exame}</div>
                    <div className="col-span-2 text-muted-foreground text-xs truncate">{p.medico ?? "—"}</div>
                    <div className="col-span-1 text-muted-foreground text-xs font-mono">{p.horario ?? "—"}</div>
                    <div className="col-span-2 text-right">
                      <span className={`font-bold text-sm ${min < 30 ? "text-emerald-600" : min < 60 ? "text-yellow-600" : "text-red-600"}`}>
                        {formatMin(min)}
                      </span>
                    </div>
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden p-3 flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                      <span className="text-[10px] text-muted-foreground font-mono">{i + 1}</span>
                      <span className={`h-2.5 w-2.5 rounded-full ${corLed(min)}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">{p.nomePaciente}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.exame}</p>
                      {p.medico && <p className="text-xs text-muted-foreground">{p.medico}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold text-sm ${min < 30 ? "text-emerald-600" : min < 60 ? "text-yellow-600" : "text-red-600"}`}>
                        {formatMin(min)}
                      </p>
                      {p.horario && <p className="text-[10px] text-muted-foreground">{p.horario}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
          <Clock className="h-3 w-3" />
          Atualização automática a cada 30 segundos · Fonte: NetRis
        </p>
      </div>
    </MainLayout>
  );
}
