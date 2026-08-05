import { buscarAtendimentos } from "./atendimentos";
import { SITUACAO, MODALIDADE, hojeISO, ontemISO, umAnoAtrasISO } from "./client";
import type { Atendimento } from "./types";

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Retorna a data de hoje + n dias no formato YYYY-MM-DD (ISO local). */
export function daquiNDiasISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

// ── Download helper ──────────────────────────────────────────────────────────
export function downloadCsv(rows: string[][], filename: string): void {
  const bom = "\uFEFF";
  const csv = bom + rows
    .map(r => r.map(c => {
      const s = String(c ?? "");
      // Só envolve em aspas se contiver vírgula, aspas ou quebra de linha
      return (s.includes(",") || s.includes('"') || s.includes("\n"))
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Campos exportáveis ───────────────────────────────────────────────────────
export interface CampoCSV {
  key:     string;
  label:   string;
  extrair: (a: Atendimento) => string;
}

function fmtData(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** Formata telefone para o padrão +55XXXXXXXXXXX usado no CSV */
function fmtTelCSV(tel?: string): string {
  const digits = (tel ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // Já tem 55 na frente
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  // 11 dígitos: DDD + 9 + número → remove o 9
  if (digits.length === 11) return `+55${digits.slice(0, 2)}${digits.slice(3)}`;
  // 10 dígitos: DDD + número
  if (digits.length === 10) return `+55${digits}`;
  return `+55${digits}`;
}

export const CAMPOS_EXPORT: CampoCSV[] = [
  { key: "nome",       label: "Nome",           extrair: a => a.nomePaciente },
  { key: "telefone",   label: "Telefone",        extrair: a => fmtTelCSV(a.telefone) },
  { key: "data",       label: "Data do Exame",   extrair: a => fmtData(a.dataHora) },
  { key: "exame",      label: "Exames",          extrair: a => a.exame },
  { key: "horario",    label: "Horário",         extrair: a => a.horario ?? "" },
  { key: "cpf",        label: "CPF",             extrair: a => a.cpf ?? "" },
  { key: "medico",     label: "Médico",          extrair: a => a.medico ?? "" },
  { key: "modalidade", label: "Modalidade",      extrair: a => a.modalidade ?? "" },
  { key: "situacao",   label: "Situação",        extrair: a => a.situacao ?? String(a.situacaoId) },
  { key: "convenio",   label: "Convênio",        extrair: a => a.convenio ?? "" },
];

// Ordem padrão: Nome, Telefone, Data, Exame (igual ao exemplo do usuário)
export const CAMPOS_PADRAO: string[] = ["nome", "telefone", "data", "exame"];

// ── Modalidades disponíveis para seleção na UI ───────────────────────────────
export const MODALIDADES_OPCOES = [
  { id: MODALIDADE.RAIO_X,               label: "Raio-X" },
  { id: MODALIDADE.USG,                  label: "Ultrassonografia" },
  { id: MODALIDADE.TOMOGRAFIA,           label: "Tomografia" },
  { id: MODALIDADE.RESSONANCIA,          label: "Ressonância" },
  { id: MODALIDADE.RESSONANCIA_CONTRASTE,label: "RM c/ Contraste" },
  { id: MODALIDADE.MAMOGRAFIA,           label: "Mamografia" },
  { id: MODALIDADE.DENSITOMETRIA,        label: "Densitometria" },
  { id: MODALIDADE.ECOCARDIOGRAMA,       label: "Ecocardiograma" },
  { id: MODALIDADE.BIOPSIA_US,           label: "Biópsia US" },
  { id: MODALIDADE.ELETROCARDIOGRAMA,    label: "Eletrocardiograma" },
  { id: MODALIDADE.ELETROENCEFALOGRAMA,  label: "Eletroencefalograma" },
  { id: MODALIDADE.ESPIROMETRIA,         label: "Espirometria" },
  { id: MODALIDADE.HOLTER,               label: "Holter" },
  { id: MODALIDADE.ANESTESIA,            label: "Anestesia" },
] as const;

// ── Situações disponíveis para seleção na UI ─────────────────────────────────
export const SITUACOES_OPCOES = [
  { id: SITUACAO.MARCADO,           label: "Marcado" },
  { id: SITUACAO.A_CONFIRMAR,       label: "A Confirmar" },
  { id: SITUACAO.CONFIRMADO,        label: "Confirmado" },
  { id: SITUACAO.CANCELADO,         label: "Cancelado" },
  { id: SITUACAO.A_CANCELAR,        label: "A Cancelar" },
  { id: SITUACAO.CHEGOU,            label: "Chegou" },
  { id: SITUACAO.ATENDIMENTO,       label: "Em Atendimento" },
  { id: SITUACAO.ENCAMINHADO_EXAME, label: "Encaminhado p/ Exame" },
  { id: SITUACAO.EM_SALA,           label: "Em Sala" },
  { id: SITUACAO.EXAME_REALIZADO,   label: "Exame Realizado" },
  { id: SITUACAO.FINALIZADO,        label: "Finalizado" },
  { id: SITUACAO.FATURADO,          label: "Faturado" },
] as const;

// ── Config de exportação ─────────────────────────────────────────────────────
export interface ExportConfig {
  dataInicial:  string;
  dataFinal:    string;
  modalidades:  number[];   // vazio = todas
  situacoes:    number[];   // vazio = todas
  campos:       string[];
}

// ── Exportação flexível principal ────────────────────────────────────────────
export async function gerarCsvFlexivel(config: ExportConfig, nomeArquivo?: string): Promise<void> {
  const atendimentos = await buscarAtendimentos({
    dataInicial: config.dataInicial,
    dataFinal:   config.dataFinal,
    ...(config.situacoes.length > 0 ? { situacaoId: config.situacoes } : {}),
    ...(config.modalidades.length === 1 ? { modalidadeId: config.modalidades[0] } : {}),
  });

  // Filtro de modalidade client-side quando múltiplas
  const filtrados = config.modalidades.length > 1
    ? atendimentos.filter(a => config.modalidades.includes(a.modalidadeId ?? 0))
    : atendimentos;

  const camposObj = config.campos
    .map(k => CAMPOS_EXPORT.find(c => c.key === k))
    .filter(Boolean) as CampoCSV[];

  const header = camposObj.map(c => c.label);
  const linhas = filtrados.map(a => camposObj.map(c => c.extrair(a)));

  const nome = nomeArquivo ?? `netris_${config.dataInicial}_${config.dataFinal}`;
  downloadCsv([header, ...linhas], nome);
}

// ── Presets prontos ───────────────────────────────────────────────────────────
export const PRESETS: { label: string; cor: string; config: ExportConfig }[] = [
  {
    label: "Faltas de Ontem",
    cor:   "amber",
    config: {
      dataInicial: ontemISO(),
      dataFinal:   ontemISO(),
      modalidades: [],
      situacoes:   [SITUACAO.A_CONFIRMAR, SITUACAO.CONFIRMADO],
      campos:      CAMPOS_PADRAO,
    },
  },
  {
    label: "Ressonância — Ontem",
    cor:   "indigo",
    config: {
      dataInicial: ontemISO(),
      dataFinal:   ontemISO(),
      modalidades: [MODALIDADE.RESSONANCIA, MODALIDADE.RESSONANCIA_CONTRASTE],
      situacoes:   [],
      campos:      CAMPOS_PADRAO,
    },
  },
  {
    label: "Recall Densito/Mama",
    cor:   "purple",
    config: {
      dataInicial: umAnoAtrasISO(),
      dataFinal:   umAnoAtrasISO(),
      modalidades: [MODALIDADE.DENSITOMETRIA, MODALIDADE.MAMOGRAFIA],
      situacoes:   [],
      campos:      CAMPOS_PADRAO,
    },
  },
];

// ── Legado (mantido para compatibilidade) ────────────────────────────────────
export function gerarCsvRelatorioMedico(atendimentos: Atendimento[], titulo: string): void {
  const mapa = new Map<string, {
    medico: string; modalidade: string;
    total: number; realizados: number; cancelados: number; faltas: number;
  }>();
  for (const a of atendimentos) {
    const chave = `${a.medico ?? "Sem médico"}|${a.modalidade ?? a.exame}`;
    const g = mapa.get(chave) ?? { medico: a.medico ?? "Sem médico", modalidade: a.modalidade ?? a.exame, total: 0, realizados: 0, cancelados: 0, faltas: 0 };
    g.total++;
    if (a.situacaoId === SITUACAO.CANCELADO) g.cancelados++;
    else if (([SITUACAO.A_CONFIRMAR, SITUACAO.A_CANCELAR] as number[]).includes(a.situacaoId)) g.faltas++;
    else g.realizados++;
    mapa.set(chave, g);
  }
  const header = ["Médico", "Modalidade", "Total", "Realizados", "Cancelados", "Faltas"];
  const linhas = [...mapa.values()].sort((a, b) => b.total - a.total).map(g => [
    g.medico, g.modalidade, String(g.total), String(g.realizados), String(g.cancelados), String(g.faltas),
  ]);
  downloadCsv([header, ...linhas], titulo);
}
