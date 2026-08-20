// =============================================================================
// Configurações do Farol — a integração do NetRis sem redeploy
// =============================================================================
// A tela em si vem do `@imago/painel` (`src/painel/`, propagado por cópia):
// `criarAreaIntegracoes` desenha o formulário a partir do registro de campos do
// servidor, mostra a origem de cada valor (painel / ambiente / default), e liga
// os botões de salvar, testar conexão e importar do ambiente.
//
// O que é do Farol aqui é só a moldura: o `MainLayout`, o gate de papel e o
// cliente HTTP com o token da sessão.
//
// ── ADOÇÃO PARCIAL, DE PROPÓSITO ─────────────────────────────────────────────
// Está sendo usada a ÁREA, não o `Shell`. O Farol já tem navegação própria
// (`MainLayout` + `Sidebar`), e trocá-la pela casca do pacote seria mexer em
// dezesseis telas que funcionam para ganhar nada hoje. A casca entra quando
// houver um painel de configuração com várias áreas — que é justamente o
// próximo passo.
// =============================================================================

import { useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/shared/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { criarAreaIntegracoes, clienteIntegracaoHttp, Aviso } from "@/painel";

/** Mesma lista do `PAPEIS_CONFIGURACAO` do servidor.
 *
 *  Duplicada por necessidade — são dois runtimes — e não por descuido: o gate
 *  que vale é o do servidor (`exigirPapel`), que responde 403 mesmo se alguém
 *  chegar aqui por URL. Este é o que evita mostrar um formulário que só vai
 *  falhar no salvamento. */
const PAPEIS_CONFIGURACAO = ["admin", "developer"];

export default function Configuracoes() {
  const { role, loading } = useAuth();

  const area = useMemo(
    () =>
      criarAreaIntegracoes({
        cliente: clienteIntegracaoHttp({
          base: "/api/integracao",
          // Função, não string: o supabase-js renova o JWT em background, e um
          // token capturado uma vez expira em uma hora — o que apareceria como
          // "salvei e deu 401" no fim do turno.
          autorizacao: async () => {
            const { data } = await supabase.auth.getSession();
            return data.session?.access_token ?? null;
          },
        }),
      }),
    [],
  );

  return (
    <MainLayout
      eyebrow="Farol"
      title="Configurações"
      subtitle="Credenciais das integrações deste módulo. Trocar aqui vale em segundos, sem redeploy."
    >
      {loading ? null : !role || !PAPEIS_CONFIGURACAO.includes(role) ? (
        <Aviso tom="erro">
          Esta tela exige o papel {PAPEIS_CONFIGURACAO.join(" ou ")}. Fale com um administrador.
        </Aviso>
      ) : (
        area.render()
      )}
    </MainLayout>
  );
}
