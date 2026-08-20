-- ─────────────────────────────────────────────────────────────────────────────
-- Farol — configuração de integração por tenant
--
-- O que isto resolve, em uma linha: hoje trocar o token do NetRis exige
-- redeploy.
--
-- `server/src/lib/netris.ts` lia as credenciais assim, no topo do módulo:
--
--     const NETRIS_TOKEN = process.env.NETRIS_TOKEN ?? "";
--
-- `const` no topo é avaliada uma vez, quando o módulo carrega. Trocar a variável
-- no EasyPanel não tem efeito nenhum até o processo reiniciar — e quem troca um
-- token costuma estar com pressa, porque o antigo venceu e o Farol está
-- devolvendo 401 para a recepção inteira.
--
-- Com esta tabela, o painel `/farol/configuracoes` grava aqui e o valor passa a
-- valer em segundos (o resolvedor do @imago/integracoes tem cache de 60s e
-- invalida na gravação).
--
-- ── PRECEDÊNCIA, E POR QUE O AMBIENTE NÃO MORRE ──────────────────────────────
-- O resolvedor decide POR CAMPO: painel > ambiente > default do código. As
-- variáveis `NETRIS_*` continuam válidas como rede de segurança, então esta
-- migration NÃO é destrutiva e não há janela de indisponibilidade: enquanto
-- ninguém salvar nada no painel, tudo segue vindo do ambiente exatamente como
-- hoje. Quando o painel tiver valor, ele ganha, e aí as env vars podem sair.
--
-- ── FORMATO DA LINHA ─────────────────────────────────────────────────────────
-- Uma linha por (tenant, provedor), com os campos daquele provedor dentro de
-- `config` como jsonb plano: {"base_url": "...", "token": "..."}. É o formato
-- que `storeTenant({ porProvedor })` espera — ele embrulha e desembrulha o mapa
-- por provedor num lugar só. O upsert do pacote usa
-- `onConflict: tenant_id,provedor`, então a PK composta abaixo não é decoração:
-- sem ela o salvamento falha.
--
-- Campo em jsonb e não em coluna de propósito: campo novo de integração passa a
-- ser uma linha no registro de campos do servidor, sem migration. Foi a lição do
-- receituários, que nasceu com base_url/token/filial_id em COLUNAS e agora
-- precisa de conversão.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.farol_integracoes (
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provedor    text NOT NULL,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo       boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  PRIMARY KEY (tenant_id, provedor)
);

COMMENT ON TABLE public.farol_integracoes IS
  'Credenciais de integração do Farol por tenant e provedor. Lida somente pelo '
  'servidor com service_role: o navegador nunca toca nesta tabela.';

COMMENT ON COLUMN public.farol_integracoes.config IS
  'Campos do provedor em jsonb plano. Contém SEGREDO — o servidor mascara antes '
  'de devolver ao painel.';

COMMENT ON COLUMN public.farol_integracoes.ativo IS
  'Switch do painel. Desligado, o resolvedor ignora o que está salvo e cai para '
  'o ambiente — sem apagar nada, para religar não exigir redigitar a credencial.';

-- ── RLS: ninguém lê pelo PostgREST, nem admin ────────────────────────────────
-- Esta tabela guarda o token do NetRis em claro. RLS ligada **sem nenhuma
-- policy** é a decisão, não esquecimento: sem policy, `authenticated` e `anon`
-- não leem nem escrevem nada, e só o `service_role` (que ignora RLS) alcança a
-- linha.
--
-- É o desenho certo porque o caminho do painel é outro: o navegador chama
-- `/api/integracao` no Express, que lê com service_role e **mascara os campos
-- secretos** antes de responder. Abrir um SELECT para admin aqui daria a
-- qualquer sessão de admin o token em claro no devtools — exatamente o problema
-- que o proxy `/api/netris/proxy` resolveu quando tirou o VITE_NETRIS_TOKEN do
-- bundle. Não vale reabrir a porta por trás.
--
-- Se um dia a tela precisar de leitura direta, o que se expõe é uma VIEW sem a
-- coluna `config`, nunca a tabela.
ALTER TABLE public.farol_integracoes ENABLE ROW LEVEL SECURITY;

-- Revogação explícita: `GRANT` de esquema pode dar acesso de tabela a estes
-- papéis por herança, e aí a ausência de policy é a única barreira. Duas
-- barreiras custam uma linha.
REVOKE ALL ON public.farol_integracoes FROM anon, authenticated;
