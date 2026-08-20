// ─────────────────────────────────────────────────────────────────────────────
// O registro de campos das integrações do Farol — a fonte única
//
// A UI do painel se desenha daqui, o servidor decide o que mascarar pela flag
// `secret`, o fallback de ambiente sai do `env` e o "utilizável" sai do
// `essencial`. Campo novo é uma linha aqui: sem migration, sem tocar em
// componente.
//
// ── POR QUE ISTO NÃO MORA JUNTO DO RESOLVEDOR ────────────────────────────────
// Este arquivo é dado puro e não importa nada. `integracaoNetris.ts` importa o
// cliente do Supabase, e enquanto o registro morava lá, qualquer coisa que
// quisesse só a lista de campos — um teste, um script, uma checagem — precisava
// de SUPABASE_URL e SERVICE_ROLE_KEY no ambiente, senão o módulo lançava na
// importação. Separar é o que torna o registro exercitável sem credencial.
// ─────────────────────────────────────────────────────────────────────────────

import { semBarraFinal, type RegistroProvedores } from "../integracoes/index.js";

export const PROVEDOR_NETRIS = "netris";

/**
 * As duplas `["NETRIS_TOKEN", "VITE_NETRIS_TOKEN"]` são o mesmo valor sob dois
 * nomes, herança de quando o navegador falava com o gateway direto. Ficam na
 * ordem de preferência, e a prefixada é só histórico — `config.ts` já grita
 * quando alguém define a versão VITE_, porque ela recoloca o token no bundle.
 */
export const REGISTRO_INTEGRACOES: RegistroProvedores = {
  [PROVEDOR_NETRIS]: {
    label: "NetRis",
    descricao:
      "Gateway do NetRis: de onde vêm os atendimentos do Farol e para onde vai a baixa de situação.",
    fields: [
      {
        key: "base_url",
        label: "URL base do gateway",
        type: "text",
        placeholder: "https://gateway.exemplo.com.br",
        hint: "Sem barra no fim — o código concatena /netris/api depois.",
        env: "NETRIS_BASE_URL",
        essencial: true,
        normalizar: semBarraFinal,
      },
      {
        key: "token",
        label: "Token",
        type: "password",
        secret: true,
        hint: "Vai no header Authorization, exatamente como está aqui.",
        env: ["NETRIS_TOKEN", "VITE_NETRIS_TOKEN"],
        essencial: true,
      },
      {
        key: "filial_id",
        label: "ID da filial",
        type: "text",
        placeholder: "1",
        hint: "Sem isto as buscas saem sem filtro de filial — trazem a rede toda.",
        env: ["NETRIS_FILIAL_ID", "VITE_NETRIS_FILIAL_ID"],
      },
      {
        key: "pacs_base_url",
        label: "URL base do PACS",
        type: "text",
        hint: "Host do Netris-web, usado só pelo histórico de situações.",
        env: "NETRIS_PACS_BASE_URL",
        // Este default existe no código desde sempre. Fica como `padrao` e não
        // como valor importável de propósito: importar gravaria no banco um
        // endereço que ninguém escolheu, e daí em diante mudar o default aqui
        // não teria mais efeito.
        padrao: "https://pacs.imagoradiologia.com.br/Netris-web",
        normalizar: semBarraFinal,
      },
    ],
  },
};
