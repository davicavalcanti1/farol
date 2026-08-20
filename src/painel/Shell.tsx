/* ═══════════════════════════════════════════════════════════════════════════
   A casca do painel
   ---------------------------------------------------------------------------
   A diferença entre isto e o `Painel.tsx` do template é uma linha de conceito:
   lá a casca importa as áreas; aqui ela não sabe que elas existem. Por isso ela
   pode viver num pacote e servir seis produtos.

   O que a casca NÃO faz, de propósito:

   - não conhece Supabase, JWT ou qualquer fonte de sessão. Recebe `sessao`.
   - não busca módulos habilitados. Recebe a lista.
   - não decide autorização. `resolverNav` filtra o MENU; quem protege é a RLS e
     o gate de papel do backend. Esconder item não impede chamar a API.
   - não guarda rota. Ela guarda a chave da área atual; quem quiser URL
     (`/painel/auditoria`) passa `chave` e `aoTrocar` e manda no router do app.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, type ReactNode } from 'react';
import { areaAtual, resolverNav } from './registro.js';
import type { Area, ModulosHabilitados, Papel, SessaoPainel } from './tipos.js';
import { Button, Vazio } from './ui/index.js';

export interface ShellProps<P extends string = Papel> {
  /** Nome do produto, no topo da barra lateral. */
  titulo: string;
  areas: readonly Area<ReactNode, P>[];
  sessao: SessaoPainel<P> | null;
  modulosHabilitados?: ModulosHabilitados;
  papelGlobal?: P | null;
  aoSair?: () => void | Promise<void>;
  /** Chave da área atual, para quem controla a navegação por URL. Sem isto a
   *  casca administra o estado por conta própria. */
  chave?: string;
  aoTrocar?: (chave: string) => void;
  /** Canto inferior da barra lateral, acima do botão Sair — versão do build,
   *  ambiente, seletor de tenant. */
  rodape?: ReactNode;
}

export function Shell<P extends string = Papel>({
  titulo,
  areas,
  sessao,
  modulosHabilitados,
  papelGlobal,
  aoSair,
  chave,
  aoTrocar,
  rodape,
}: ShellProps<P>) {
  const [chaveInterna, setChaveInterna] = useState<string | null>(null);

  // Controlado quando o app passa `chave`; autônomo caso contrário. Os dois
  // modos existem porque metade dos produtos tem router e metade não.
  const chaveAtual = chave ?? chaveInterna;
  const trocar = (nova: string) => {
    if (aoTrocar) aoTrocar(nova);
    if (chave === undefined) setChaveInterna(nova);
  };

  const visiveis = sessao
    ? resolverNav(areas, { papel: sessao.papel, modulosHabilitados, papelGlobal })
    : [];
  const area = areaAtual(visiveis, chaveAtual);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
        <div className="mb-6 px-2">
          <p className="font-semibold leading-tight">{titulo}</p>
          {sessao && <p className="text-xs text-muted-foreground">{sessao.nome}</p>}
        </div>

        <nav className="flex flex-col gap-1">
          {visiveis.map((a) => (
            <button
              key={a.chave}
              onClick={() => trocar(a.chave)}
              aria-current={area?.chave === a.chave ? 'page' : undefined}
              className={`rounded-md px-3 py-2 text-left text-sm transition ${
                area?.chave === a.chave
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              }`}
            >
              {a.titulo}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-3 pt-4">
          {rodape}
          {aoSair && (
            <Button variante="secundaria" onClick={() => void aoSair()} className="w-full">
              Sair
            </Button>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto p-8">
        {area ? (
          area.render()
        ) : (
          /* Três caminhos chegam aqui, e dizer qual é evita meia hora de
             procura: sem sessão, papel sem nenhuma área, ou todas as áreas
             presas atrás de módulo desligado. */
          <Vazio titulo={naoTemAreaPorque(sessao, areas.length)}>
            {sessao
              ? 'Se você deveria ver algo aqui, é permissão de papel ou módulo não habilitado para este cliente.'
              : undefined}
          </Vazio>
        )}
      </main>
    </div>
  );
}

function naoTemAreaPorque(sessao: SessaoPainel<string> | null, total: number): string {
  if (!sessao) return 'Sem sessão.';
  if (total === 0) return 'Este produto ainda não registrou nenhuma área.';
  return 'Seu papel não tem áreas disponíveis.';
}
