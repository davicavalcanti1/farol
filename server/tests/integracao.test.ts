/**
 * Prova de fumaça da integração do Farol, sem banco e sem NetRis.
 *
 * Exercita exatamente o caminho que o painel usa — registro de campos,
 * resolvedor, precedência e mascaramento — com o `storeMemoria` no lugar do
 * Supabase. O que isto pega e o `tsc` não pegava: registro de campos inválido,
 * chave errada no `configNetris`, e precedência invertida.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  criarResolvedor,
  storeMemoria,
  camposPublicos,
  mascarar,
  MASK,
} from "../src/integracoes/index.js";
import {
  REGISTRO_INTEGRACOES,
  PROVEDOR_NETRIS,
} from "../src/lib/integracaoRegistro.js";

const ok = (condicao: unknown, rotulo: string) => assert.ok(condicao, rotulo);

/* Compartilhado por quatro casos: o ambiente representa o estado de HOJE, com
   as NETRIS_* no EasyPanel e nada salvo no painel. */
const ambiente = {
  NETRIS_BASE_URL: "https://gateway.exemplo.com/",
  NETRIS_TOKEN: "token-do-ambiente",
  NETRIS_FILIAL_ID: "7",
};

test("O registro de campos e valido e publico", async () => {
  // ── 1. O registro é válido e público ────────────────────────────────────────
  const publicos = camposPublicos(REGISTRO_INTEGRACOES, PROVEDOR_NETRIS);
  ok(publicos.label === "NetRis", "camposPublicos devolve o label do provedor");
  ok(publicos.fields.length === 4, `4 campos declarados (veio ${publicos.fields.length})`);

  const token = publicos.fields.find((f) => f.key === "token");
  ok(token?.secret === true, "o token é marcado como secreto");
  ok(token?.env === "NETRIS_TOKEN", `o token aponta NETRIS_TOKEN (veio "${token?.env}")`);
  ok(
    publicos.fields.filter((f) => f.essencial).length === 2,
    "dois campos essenciais: base_url e token",
  );
});

test("Sem nada salvo, tudo vem do ambiente - o comportamento de hoje", async () => {
  // ── 2. Ambiente sozinho: é o comportamento de HOJE, antes de salvar nada ────
  const soAmbiente = criarResolvedor({
    registro: REGISTRO_INTEGRACOES,
    provedor: PROVEDOR_NETRIS,
    store: storeMemoria(),
    ambiente,
  });

  const e1 = await soAmbiente.efetivos();
  ok(e1.utilizavel === true, "com as env vars, a integração é utilizável");
  ok(
    e1.valores.base_url === "https://gateway.exemplo.com",
    `a barra final é removida (veio "${e1.valores.base_url}")`,
  );
  ok(e1.valores.token === "token-do-ambiente", "o token vem do ambiente");
  ok(e1.origem.token === "env", `a origem do token é "env" (veio "${e1.origem.token}")`);
  ok(
    e1.valores.pacs_base_url === "https://pacs.imagoradiologia.com.br/Netris-web",
    "o PACS cai no default do código",
  );
  ok(e1.origem.pacs_base_url === "padrao", "a origem do PACS é o default");
});

test("O painel vence o ambiente CAMPO POR CAMPO", async () => {
  // ── 3. Painel vence o ambiente, campo por campo ─────────────────────────────
  const comPainel = criarResolvedor({
    registro: REGISTRO_INTEGRACOES,
    provedor: PROVEDOR_NETRIS,
    store: storeMemoria({
      config: { [PROVEDOR_NETRIS]: { token: "token-do-painel" } },
      ativo: true,
    }),
    ambiente,
  });

  const e2 = await comPainel.efetivos();
  ok(e2.valores.token === "token-do-painel", "o painel vence no campo que ele preencheu");
  ok(e2.origem.token === "painel", "e a origem daquele campo vira painel");
  ok(
    e2.valores.base_url === "https://gateway.exemplo.com",
    "o campo NÃO preenchido continua vindo do ambiente",
  );
  ok(e2.origem.base_url === "env", "com a origem certa — é a precedência POR CAMPO");
});

test("Desligar o switch volta ao ambiente sem apagar o que esta salvo", async () => {
  // ── 4. Switch desligado é o interruptor de emergência ───────────────────────
  const desligado = criarResolvedor({
    registro: REGISTRO_INTEGRACOES,
    provedor: PROVEDOR_NETRIS,
    store: storeMemoria({
      config: { [PROVEDOR_NETRIS]: { token: "token-errado-salvo-numa-sexta" } },
      ativo: false,
    }),
    ambiente,
  });

  const e3 = await desligado.efetivos();
  ok(
    e3.valores.token === "token-do-ambiente",
    "desligar o switch volta ao ambiente sem apagar o que está salvo",
  );
});

test("Sem credencial nenhuma nao estoura, so fica nao utilizavel", async () => {
  // ── 5. Sem nada: não utilizável, e nada estoura ─────────────────────────────
  const vazio = criarResolvedor({
    registro: REGISTRO_INTEGRACOES,
    provedor: PROVEDOR_NETRIS,
    store: storeMemoria(),
    ambiente: {},
  });
  const e4 = await vazio.efetivos();
  ok(e4.utilizavel === false, "sem credencial nenhuma, utilizavel = false");
  ok(e4.valores.token === "", "e o token sai vazio em vez de undefined");
});

test("O segredo nunca sai em claro", async () => {
  // ── 6. O segredo nunca sai em claro ─────────────────────────────────────────
  const mascarado = mascarar(REGISTRO_INTEGRACOES, PROVEDOR_NETRIS, {
    token: "segredo-real",
    base_url: "https://x",
  });
  ok(mascarado.token === MASK, "o token volta mascarado para o navegador");
  ok(mascarado.base_url === "https://x", "campo não-secreto volta em claro");
});

test("Banco caindo degrada para o ambiente em vez de derrubar o Farol", async () => {
  // ── 7. O banco caindo degrada para o ambiente, não derruba o Farol ──────────
  const bancoQuebrado = criarResolvedor({
    registro: REGISTRO_INTEGRACOES,
    provedor: PROVEDOR_NETRIS,
    store: {
      rotulo: "quebrado",
      ler: async () => {
        throw new Error('relation "farol_integracoes" does not exist');
      },
      gravar: async () => {},
    },
    ambiente,
    aviso: () => {},
  });

  const e5 = await bancoQuebrado.efetivos();
  ok(
    e5.valores.token === "token-do-ambiente",
    "migration não aplicada NÃO derruba: cai no ambiente e o Farol segue",
  );
});
