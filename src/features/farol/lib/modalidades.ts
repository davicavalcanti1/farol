/* Modalidade → família de farol → cor.
   ---------------------------------------------------------------------------
   Fonte única do mapeamento. Antes disso o conhecimento estava em quatro
   lugares que discordavam entre si: o array FAROIS do Hub (8 grupos), os
   mapas de label do Dashboard (13 entradas) e da Ocupação (16), e um mapa de
   hex do Dashboard só para gráficos (12). Nenhum deles cobria os 16 ids.

   ── Por que família e não id ────────────────────────────────────────────────
   O NetRis tem 16 ids de modalidade. Cor categórica não distingue 16 coisas —
   o limite prático é 7–8, e isso antes de reservar matiz para ação e status.

   Então a divisão de trabalho é:

       COR    = família, ou seja, EM QUAL FAROL o paciente está.
                8 famílias, que são as filas que a recepção já opera.
       CÓDIGO = o exame exato, por id. É o que se lê primeiro.

   Um chip teal escrito BX é biópsia guiada por ultrassom: a cor diz "é da
   fila do ultrassom", o código diz "é biópsia". Nenhum dos dois sozinho
   contava a história inteira.

   Cor nunca vai sozinha: todo chip carrega o código. Cor sem texto seria
   informação só para quem enxerga cor. */

import { MODALIDADE } from "@/services/netris/client";

/** As 8 famílias de farol, mais `none` para quem não está em fila de imagem. */
export type FamiliaModalidade =
  | "rm" | "tc" | "us" | "eco" | "mg" | "do" | "rx" | "nc" | "none";

/** Rota do farol de cada família, quando existe. `null` = não tem fila. */
export const FAROL_DA_FAMILIA: Record<FamiliaModalidade, string | null> = {
  rm:   "/farol/ressonancia",
  tc:   "/farol/tomografia",
  us:   "/farol/ultrassom",
  eco:  "/farol/ecocardiograma",
  mg:   "/farol/mamografia",
  do:   "/farol/densitometria",
  rx:   "/farol/radiografia",
  nc:   "/farol/neurocardio",
  none: null,
};

interface Modalidade {
  /** Código curto, ≤4 caracteres. O que a equipe lê primeiro. */
  codigo: string;
  /** Nome por extenso, para tooltip e leitor de tela. */
  label: string;
  /** Família de farol — define a cor. */
  familia: FamiliaModalidade;
}

const POR_ID: Record<number, Modalidade> = {
  [MODALIDADE.RAIO_X]:                { codigo: "RX",   label: "Raio-X",                familia: "rx"   },
  [MODALIDADE.USG]:                   { codigo: "US",   label: "Ultrassonografia",      familia: "us"   },
  // Anestesia não tem farol: é modalidade de apoio, não fila de imagem.
  // Por isso vai no neutro — cinza aqui diz "fora de fila", não "sem dado".
  [MODALIDADE.ANESTESIA]:             { codigo: "AN",   label: "Anestesia",             familia: "none" },
  [MODALIDADE.TOMOGRAFIA]:            { codigo: "TC",   label: "Tomografia",            familia: "tc"   },
  [MODALIDADE.RESSONANCIA]:           { codigo: "RM",   label: "Ressonância",           familia: "rm"   },
  [MODALIDADE.MAMOGRAFIA]:            { codigo: "MG",   label: "Mamografia",            familia: "mg"   },
  [MODALIDADE.DENSITOMETRIA]:         { codigo: "DO",   label: "Densitometria",         familia: "do"   },
  // Guiada por ultrassom: cor do ultrassom, código próprio.
  [MODALIDADE.BIOPSIA_US]:            { codigo: "BX",   label: "Biópsia guiada por US", familia: "us"   },
  [MODALIDADE.ECOCARDIOGRAMA]:        { codigo: "ECO",  label: "Ecocardiograma",        familia: "eco"  },
  [MODALIDADE.ELETROENCEFALOGRAMA]:   { codigo: "EEG",  label: "Eletroencefalograma",   familia: "nc"   },
  [MODALIDADE.ELETROCARDIOGRAMA]:     { codigo: "ECG",  label: "Eletrocardiograma",     familia: "nc"   },
  [MODALIDADE.RESSONANCIA_CONTRASTE]: { codigo: "RM+",  label: "RM com contraste",      familia: "rm"   },
  [MODALIDADE.ESPIROMETRIA]:          { codigo: "ESP",  label: "Espirometria",          familia: "nc"   },
  [MODALIDADE.HOLTER]:                { codigo: "HOL",  label: "Holter",                familia: "nc"   },
  [MODALIDADE.RETORNO_MAPA]:          { codigo: "MAPA", label: "Retorno MAPA",          familia: "nc"   },
  [MODALIDADE.RETORNO_HOLTER]:        { codigo: "HOL+", label: "Retorno Holter",        familia: "nc"   },
};

/* Sem modalidade no registro é caso real: o NetRis devolve atendimento sem
   idModalidade. O travessão é honesto — não finge ser uma modalidade. */
const DESCONHECIDA: Modalidade = { codigo: "—", label: "Sem modalidade", familia: "none" };

export function modalidadeDe(modalidadeId?: number | null): Modalidade {
  if (modalidadeId == null) return DESCONHECIDA;
  return POR_ID[modalidadeId] ?? DESCONHECIDA;
}

/* ── Classes, escritas por extenso ──────────────────────────────────────────
   NÃO troque estes mapas por template string (`rail-${familia}`). O Tailwind
   descobre o que manter varrendo os fontes atrás de nomes de classe LITERAIS;
   um nome montado em runtime ele nunca vê, e poda a regra do CSS final.

   Isso já aconteceu aqui: na primeira versão estas funções interpolavam, e
   `.rail-us`, `.rail-rm` e `.chip-eco` sumiram do build. O rail continuava
   sendo renderizado — só que na cor de fallback, cinza de borda. Falha
   silenciosa: nada quebra, a cor só não chega.

   Escrito por extenso, o scanner acha e a regra sobrevive. */

const CLASSE_RAIL: Record<FamiliaModalidade, string> = {
  do:   "rail rail-do",
  rx:   "rail rail-rx",
  nc:   "rail rail-nc",
  eco:  "rail rail-eco",
  us:   "rail rail-us",
  tc:   "rail rail-tc",
  rm:   "rail rail-rm",
  mg:   "rail rail-mg",
  none: "rail rail-none",
};

const CLASSE_CHIP: Record<FamiliaModalidade, string> = {
  do:   "chip-modality chip-do",
  rx:   "chip-modality chip-rx",
  nc:   "chip-modality chip-nc",
  eco:  "chip-modality chip-eco",
  us:   "chip-modality chip-us",
  tc:   "chip-modality chip-tc",
  rm:   "chip-modality chip-rm",
  mg:   "chip-modality chip-mg",
  none: "chip-modality chip-none",
};

/** Classes do rail para a linha/card deste atendimento. Ver .rail em core.css. */
export function railDe(modalidadeId?: number | null): string {
  return CLASSE_RAIL[modalidadeDe(modalidadeId).familia];
}

/** Rail quando a família já é conhecida — caso dos cards do Hub, que são
    a fila inteira e não um atendimento. */
export function railDaFamilia(familia: FamiliaModalidade): string {
  return CLASSE_RAIL[familia];
}

/** Classes do chip de código. Ver .chip-modality em core.css. */
export function chipDe(modalidadeId?: number | null): string {
  return CLASSE_CHIP[modalidadeDe(modalidadeId).familia];
}

/** Chip quando a família já é conhecida. */
export function chipDaFamilia(familia: FamiliaModalidade): string {
  return CLASSE_CHIP[familia];
}

/** Cor da família como valor CSS — para gráficos, que não aceitam classe. */
export function corDe(modalidadeId?: number | null): string {
  return `hsl(var(--modality-${modalidadeDe(modalidadeId).familia}))`;
}

/* A ordem em que as famílias aparecem em legenda e filtro. Segue a rampa de
   matiz, não o alfabeto: assim a legenda parece uma escala e não uma lista. */
export const ORDEM_FAMILIAS: FamiliaModalidade[] = [
  "do", "rx", "nc", "eco", "us", "tc", "rm", "mg", "none",
];

export const CODIGO_FAMILIA: Record<FamiliaModalidade, string> = {
  do: "DO", rx: "RX", nc: "NC", eco: "ECO",
  us: "US", tc: "TC", rm: "RM", mg: "MG", none: "—",
};

export const LABEL_FAMILIA: Record<FamiliaModalidade, string> = {
  do:   "Densitometria",
  rx:   "Raio-X",
  nc:   "Neurocardio",
  eco:  "Ecocardiograma",
  us:   "Ultrassom",
  tc:   "Tomografia",
  rm:   "Ressonância",
  mg:   "Mamografia",
  none: "Fora de fila",
};
