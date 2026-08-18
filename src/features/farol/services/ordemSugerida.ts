// =============================================================================
// Ordem sugerida de atendimento — "problema da mochila" de 1 hora
// =============================================================================
// Porte de KnapsackAppointmentScheduler (módulo E_ProblemaDaMochila.bas do
// RM - FAROL ATENDIMENTO RM v1.6.3.xlsm).
//
// A planilha não resolve mochila de verdade (não há programação dinâmica ali):
// é um GULOSO sobre uma fila ordenada por nível de prioridade e, dentro do
// nível, por duração crescente. O nome ficou. Portei o comportamento real, não
// o nome — quem comparar com o Excel tem que ver a mesma ordem sair.
//
//   nível 1 — exame já atrasado (horário agendado ≤ agora)
//   nível 2 — não atrasado, marcado como prioritário (coluna K = 1)
//   nível 3 — o resto
//
// Dentro do mesmo nível, exame mais curto primeiro: é o que faz caber mais
// gente na janela. Depois de ordenar, vai somando ciclo por ciclo enquanto
// couber em 1 hora; quem não couber é PULADO e a soma continua — então um exame
// curto de nível 3 pode entrar mesmo com um longo de nível 1 tendo ficado fora.
// Isso é comportamento da planilha, não descuido: a janela é sobre trabalho que
// caiba na próxima hora, não sobre atender a fila em ordem de prioridade.
// =============================================================================

/** Uma hora, em segundos — a "capacidade da mochila" (1/24 do dia no VBA). */
export const JANELA_PADRAO_SEG = 3600;

export type NivelPrioridade = 1 | 2 | 3;

export interface ItemFilaOrdem {
  chave: string;
  /** "HH:MM" do agendamento; null entra como não-atrasado (igual ao IsDate falso do VBA) */
  horarioAgendado: string | null;
  /** Ciclo do paciente em segundos (soma dos protocolos + anestesia) */
  duracaoSeg: number;
  prioritario: boolean;
}

export interface ItemClassificado extends ItemFilaOrdem {
  nivel: NivelPrioridade;
  atrasado: boolean;
}

export interface SugestaoOrdem {
  /** Chaves na ordem sugerida, só as que caberam na janela */
  dentroDaJanela: string[];
  /** Chaves que não couberam, na mesma ordenação por prioridade/duração */
  foraDaJanela: string[];
  /** Soma dos ciclos selecionados, em segundos */
  totalSeg: number;
  /** Classificação de cada item, para a UI explicar o porquê da ordem */
  classificacao: Map<string, ItemClassificado>;
}

import { horarioParaMinutos } from "./statusAgendado";

/**
 * `agora` entra como Date e é comparado só pela hora do dia — o VBA usa
 * `Time()`, que descarta a data. Para a fila do dia dá no mesmo, e evita que um
 * agendamento de amanhã (que não deveria estar na fila de hoje) apareça como
 * atrasado.
 */
export function classificarItens(itens: ItemFilaOrdem[], agora: Date): ItemClassificado[] {
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();
  return itens.map(it => {
    const min = horarioParaMinutos(it.horarioAgendado);
    // `<=` e não `<`: no VBA, exame marcado para exatamente agora já conta como
    // atrasado (apptTime <= nowTime).
    const atrasado = min !== null && min <= agoraMin;
    const nivel: NivelPrioridade = atrasado ? 1 : it.prioritario ? 2 : 3;
    return { ...it, nivel, atrasado };
  });
}

export function sugerirOrdem(
  itens: ItemFilaOrdem[],
  agora: Date,
  janelaSeg: number = JANELA_PADRAO_SEG,
): SugestaoOrdem {
  const classificados = classificarItens(itens, agora);

  // Array.prototype.sort é estável (ES2019+), então empate de nível E duração
  // preserva a ordem de entrada — que é a ordem atual da fila. Sem isso, duas
  // chamadas seguidas poderiam devolver ordens diferentes para a mesma fila e a
  // tela ficaria "pulando" a cada refresh.
  const ordenados = [...classificados].sort((a, b) =>
    a.nivel !== b.nivel ? a.nivel - b.nivel : a.duracaoSeg - b.duracaoSeg,
  );

  const dentroDaJanela: string[] = [];
  const foraDaJanela: string[] = [];
  let totalSeg = 0;

  for (const it of ordenados) {
    if (totalSeg + it.duracaoSeg <= janelaSeg) {
      totalSeg += it.duracaoSeg;
      dentroDaJanela.push(it.chave);
    } else {
      foraDaJanela.push(it.chave);
    }
  }

  return {
    dentroDaJanela,
    foraDaJanela,
    totalSeg,
    classificacao: new Map(classificados.map(c => [c.chave, c])),
  };
}

/**
 * Ordem completa a aplicar na fila: primeiro quem cabe na janela (na ordem
 * sugerida), depois o resto. A planilha só escrevia as colunas M:P com quem
 * cabia e deixava o resto onde estava; aqui a fila é uma lista única, então o
 * excedente vai para o fim mantendo a ordenação por prioridade — senão aplicar
 * a sugestão embaralharia silenciosamente quem ficou fora.
 */
export function ordemCompletaSugerida(s: SugestaoOrdem): string[] {
  return [...s.dentroDaJanela, ...s.foraDaJanela];
}
