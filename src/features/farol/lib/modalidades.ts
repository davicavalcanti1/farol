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


/* ── Família pelo NOME do exame ──────────────────────────────────────────────
   O `idModalidade` do NetRis não é confiável para decidir de qual fila o exame
   é: existe procedimento de Tomografia cadastrado lá com a modalidade da
   Ressonância, e foi assim que "TC ABDOME TOTAL" e "TC COLUNA CERVICAL"
   apareceram na fila do Farol RM em 18/ago. A correção de raiz é no cadastro do
   NetRis; enquanto ela não vem, a tela se defende olhando o nome.

   Os prefixos são casados SEM normalizar acento de propósito: "RM", "TC",
   "USG", "MMG" não têm acento, e as formas por extenso ganham classe de
   caractere ("RESSON[AÂ]NCIA"). Evita arrastar o normalizador de
   temposExameService — que traz o react-query junto — para dentro deste módulo,
   que é importado até pela TV.

   Devolve `null` quando o nome não identifica família nenhuma. Quem filtra deve
   tratar `null` como "fica": sumir com paciente da fila é falha muito pior que
   mostrar um exame a mais. */
/* Três camadas, nesta ordem, porque a primeira é a mais confiável e a última é
   a que mais arrisca falso positivo:

     1. PREFIXO   "RM ...", "TC ...", "ANGIO RM ...", "USG ..." — o formato da
                  esmagadora maioria dos procedimentos do NetRis.
     2. POR EXTENSO em qualquer posição: "ENTERO RESSONÂNCIA" é RM e não começa
                  com RM nenhum. Só roda depois da camada 1 para que um exame
                  batizado "TC ... COMPARATIVO COM RESSONANCIA" continue sendo TC.
     3. SIGLA SOLTA em qualquer posição: "ENTEROGRAFIA POR RM". Último recurso.

   Sem a camada 2, "ENTERO RESSONÂNCIA" caía em `null` — não sumia da fila (o
   nulo é tratado como "fica"), mas ficava dependendo da rede de segurança em vez
   de ser reconhecido. */
const PREFIXO_DA_FAMILIA: [FamiliaModalidade, RegExp][] = [
  ["rm",  /^\s*(ANGIO\s*)?RM\b/i],
  ["tc",  /^\s*(ANGIO\s*)?TC\b/i],
  ["us",  /^\s*(USG?\b|ULTRASSON)/i],
  ["mg",  /^\s*(MMG?\b|MAMOGRAFIA\b)/i],
  ["do",  /^\s*(DO\b|DENSITOMETRIA\b)/i],
  ["eco", /^\s*(ECOCARDIO|ECO\b)/i],
  ["nc",  /^\s*(EEG\b|ECG\b|ELETROENCEFALO|ELETROCARDIO|HOLTER\b|MAPA\b|ESPIROMETRIA\b)/i],
  ["rx",  /^\s*(RX\b|RAIO)/i],
];

const EXTENSO_DA_FAMILIA: [FamiliaModalidade, RegExp][] = [
  ["rm",  /RESSON[A\u00c2]NCIA/i],
  ["tc",  /TOMOGRAFIA/i],
  ["us",  /ULTRASSON/i],
  ["mg",  /MAMOGRAFIA/i],
  ["do",  /DENSITOMETRIA/i],
  ["eco", /ECOCARDIO/i],
  ["nc",  /ELETROENCEFALO|ELETROCARDIO/i],
];

const SIGLA_SOLTA_DA_FAMILIA: [FamiliaModalidade, RegExp][] = [
  ["rm", /\bRM\b/i],
  ["tc", /\bTC\b/i],
];

export function familiaPorNomeExame(nome?: string | null): FamiliaModalidade | null {
  const n = (nome ?? "").trim();
  if (!n) return null;
  for (const camada of [PREFIXO_DA_FAMILIA, EXTENSO_DA_FAMILIA, SIGLA_SOLTA_DA_FAMILIA]) {
    for (const [familia, padrao] of camada) {
      if (padrao.test(n)) return familia;
    }
  }
  return null;
}

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
