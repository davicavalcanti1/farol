// =============================================================================
// Tempos de Exame — administração da tabela de protocolos do Farol RM
// =============================================================================
// Substitui a aba "TEMPO EXAMES" da planilha: a coordenação edita base,
// tolerância, preparo, contraste e saída; o total é calculado pelo banco com
// a mesma fórmula. Linhas com "REVISAR" na observação vieram de duplicatas
// divergentes da planilha original e precisam de confirmação humana.
// =============================================================================

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search, Pencil, Trash2, Download, AlertTriangle } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  TempoExame, TempoExameInput,
  useTemposExames, useSalvarTempoExame, useExcluirTempoExame, useImportarTabelaPadrao,
  formatarSegundos, parseDuracao,
} from "../services/temposExameService";

interface FormState {
  procedimento: string;
  base: string;       // "mm:ss" (aceita minutos puros)
  tolerancia: string; // percentual, ex. "5" = 5%
  preparo: string;
  contraste: string;
  saida: string;
  observacao: string;
}

const FORM_VAZIO: FormState = {
  procedimento: "", base: "", tolerancia: "5",
  preparo: "01:30", contraste: "00:00", saida: "01:30", observacao: "",
};

function tempoParaForm(t: TempoExame): FormState {
  return {
    procedimento: t.procedimento,
    base: formatarSegundos(t.base_seg),
    tolerancia: String(Math.round(t.tolerancia * 100)),
    preparo: formatarSegundos(t.preparo_seg),
    contraste: formatarSegundos(t.contraste_seg),
    saida: formatarSegundos(t.saida_seg),
    observacao: t.observacao ?? "",
  };
}

function formParaInput(f: FormState): TempoExameInput | string {
  if (!f.procedimento.trim()) return "Informe o nome do procedimento.";
  const base = parseDuracao(f.base);
  const preparo = parseDuracao(f.preparo);
  const contraste = parseDuracao(f.contraste);
  const saida = parseDuracao(f.saida);
  if (base === null || preparo === null || contraste === null || saida === null) {
    return "Tempos devem estar no formato mm:ss (ou minutos puros, ex. 12).";
  }
  const tol = Number(f.tolerancia.replace(",", "."));
  if (Number.isNaN(tol) || tol < 0) return "Tolerância inválida — use percentual, ex. 5.";
  return {
    procedimento: f.procedimento,
    base_seg: base,
    tolerancia: tol / 100,
    preparo_seg: preparo,
    contraste_seg: contraste,
    saida_seg: saida,
    observacao: f.observacao || null,
  };
}

function totalPreview(f: FormState): string {
  const base = parseDuracao(f.base) ?? 0;
  const tol = Number(f.tolerancia.replace(",", ".")) || 0;
  const total = Math.round(base * (1 + tol / 100))
    + (parseDuracao(f.preparo) ?? 0)
    + (parseDuracao(f.contraste) ?? 0)
    + (parseDuracao(f.saida) ?? 0);
  return formatarSegundos(total);
}

export default function TemposExames() {
  const { data: tempos, isLoading, error } = useTemposExames();
  const salvar = useSalvarTempoExame();
  const excluir = useExcluirTempoExame();
  const importar = useImportarTabelaPadrao();

  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<{ id: string | null; form: FormState } | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<TempoExame | null>(null);

  const filtrados = useMemo(() => {
    if (!tempos) return [];
    const q = busca.trim().toUpperCase();
    if (!q) return tempos;
    return tempos.filter(t => t.procedimento.toUpperCase().includes(q));
  }, [tempos, busca]);

  const pendentesRevisao = useMemo(
    () => (tempos ?? []).filter(t => t.observacao?.includes("REVISAR")).length,
    [tempos],
  );

  async function handleSalvar() {
    if (!editando) return;
    const input = formParaInput(editando.form);
    if (typeof input === "string") { toast.error(input); return; }
    try {
      await salvar.mutateAsync({ id: editando.id, input });
      toast.success(editando.id ? "Protocolo atualizado" : "Protocolo criado");
      setEditando(null);
    } catch (e: any) {
      toast.error("Não foi possível salvar", { description: e?.message });
    }
  }

  async function handleExcluir() {
    if (!confirmandoExclusao) return;
    try {
      await excluir.mutateAsync(confirmandoExclusao.id);
      toast.success("Protocolo excluído");
      setConfirmandoExclusao(null);
    } catch (e: any) {
      toast.error("Não foi possível excluir", { description: e?.message });
    }
  }

  async function handleImportar() {
    try {
      const r = await importar.mutateAsync();
      toast.success(`Tabela padrão importada: ${r.importados} protocolos`, {
        description: r.pulados > 0 ? `${r.pulados} já existiam e foram mantidos.` : undefined,
      });
    } catch (e: any) {
      toast.error("Falha na importação", { description: e?.message });
    }
  }

  return (
    <MainLayout
      eyebrow="Farol · Ressonância"
      title="Tempos de Exame"
      subtitle="Duração por protocolo usada na previsão de horário. Total = base × (1 + tolerância) + preparo + contraste + saída."
      headerActions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleImportar} disabled={importar.isPending}>
            {importar.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            <span className="ml-1.5">Importar tabela padrão</span>
          </Button>
          <Button size="sm" onClick={() => setEditando({ id: null, form: FORM_VAZIO })}>
            <Plus className="h-4 w-4" /><span className="ml-1.5">Novo protocolo</span>
          </Button>
        </div>
      }
    >
      {pendentesRevisao > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {pendentesRevisao} protocolo(s) marcado(s) com REVISAR — duplicatas divergentes na planilha
          original. Confirme os tempos com a coordenação de RM.
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar procedimento…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">
          Erro ao carregar a tabela: {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && (tempos?.length ?? 0) === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="mb-1 font-medium">Nenhum protocolo cadastrado ainda</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Importe a tabela padrão (152 protocolos de RM calibrados pela operação) e ajuste a partir dela.
          </p>
          <Button onClick={handleImportar} disabled={importar.isPending}>
            {importar.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            <span className="ml-1.5">Importar tabela padrão</span>
          </Button>
        </div>
      )}

      {filtrados.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Procedimento</th>
                <th className="px-3 py-2 font-medium">Base</th>
                <th className="px-3 py-2 font-medium">Tolerância</th>
                <th className="px-3 py-2 font-medium">Preparo</th>
                <th className="px-3 py-2 font-medium">Contraste</th>
                <th className="px-3 py-2 font-medium">Saída</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(t => (
                <tr
                  key={t.id}
                  className={`border-b last:border-b-0 hover:bg-muted/30 ${
                    t.observacao?.includes("REVISAR") ? "bg-amber-50 dark:bg-amber-950/20" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{t.procedimento}</div>
                    {t.observacao && (
                      <div className="mt-0.5 max-w-md text-xs text-muted-foreground">{t.observacao}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatarSegundos(t.base_seg)}</td>
                  <td className="px-3 py-2 tabular-nums">{Math.round(t.tolerancia * 100)}%</td>
                  <td className="px-3 py-2 tabular-nums">{formatarSegundos(t.preparo_seg)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatarSegundos(t.contraste_seg)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatarSegundos(t.saida_seg)}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-primary">
                    {formatarSegundos(t.total_seg)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost" size="sm" className="h-8 w-8 p-0"
                        aria-label={`Editar ${t.procedimento}`}
                        onClick={() => setEditando({ id: t.id, form: tempoParaForm(t) })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive"
                        aria-label={`Excluir ${t.procedimento}`}
                        onClick={() => setConfirmandoExclusao(t)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && (tempos?.length ?? 0) > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {filtrados.length} de {tempos!.length} protocolos
          {busca && " (filtrados)"} · edições ficam registradas no histórico
        </p>
      )}

      {/* ── Dialog criar/editar ── */}
      <Dialog open={!!editando} onOpenChange={open => !open && setEditando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar protocolo" : "Novo protocolo"}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Procedimento (nome igual ao NetRis)
                </label>
                <Input
                  value={editando.form.procedimento}
                  onChange={e => setEditando({ ...editando, form: { ...editando.form, procedimento: e.target.value } })}
                  placeholder="RM CRANIO - ROTINA (CEFALEIA)"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {([
                  ["base", "Base (máquina)"],
                  ["tolerancia", "Tolerância %"],
                  ["preparo", "Preparo em sala"],
                  ["contraste", "Contraste"],
                  ["saida", "Saída do paciente"],
                ] as const).map(([campo, rotulo]) => (
                  <div key={campo}>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{rotulo}</label>
                    <Input
                      value={editando.form[campo]}
                      onChange={e => setEditando({ ...editando, form: { ...editando.form, [campo]: e.target.value } })}
                      placeholder={campo === "tolerancia" ? "5" : "mm:ss"}
                      className="tabular-nums"
                    />
                  </div>
                ))}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Total calculado</label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 font-semibold tabular-nums text-primary">
                    {totalPreview(editando.form)}
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Observação</label>
                <Input
                  value={editando.form.observacao}
                  onChange={e => setEditando({ ...editando, form: { ...editando.form, observacao: e.target.value } })}
                  placeholder="Ex.: paciente precisa de preparo especial"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog confirmar exclusão ── */}
      <Dialog open={!!confirmandoExclusao} onOpenChange={open => !open && setConfirmandoExclusao(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir protocolo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{confirmandoExclusao?.procedimento}</strong> deixará de
            ter previsão específica — exames com esse nome passam a usar a média da modalidade.
            A exclusão fica registrada no histórico.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmandoExclusao(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleExcluir} disabled={excluir.isPending}>
              {excluir.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
