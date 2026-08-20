import type { ReactNode } from 'react';
import type { Area, Papel, SessaoPainel } from '../tipos.js';
import { Card } from '../ui/index.js';
import { CartaoSaude, obterSaudeHttp, type SaudeModulo } from './saude.js';

/**
 * Visão geral.
 *
 * Existe para o painel ter uma tela inicial que diz algo verdadeiro em vez de um
 * "Bem-vindo" vazio: quem você é, em que tenant, e se o backend está de pé.
 * Vem do template, que a herdou do ExameQR.
 */
export interface OpcoesAreaVisaoGeral<P extends string = Papel> {
  sessao: SessaoPainel<P> | null;
  /** Ausente = não mostra o cartão de saúde. `true` = usa `/health`. */
  saude?: boolean | (() => Promise<SaudeModulo>);
  modulosHabilitados?: readonly string[] | undefined;
  chave?: string;
  titulo?: string;
  papeis?: P[];
}

export function criarAreaVisaoGeral<P extends string = Papel>(
  opcoes: OpcoesAreaVisaoGeral<P>,
): Area<ReactNode, P> {
  const { sessao, saude, modulosHabilitados } = opcoes;
  const obterSaude =
    saude === true ? () => obterSaudeHttp() : typeof saude === 'function' ? saude : null;

  return {
    chave: opcoes.chave ?? 'visao-geral',
    titulo: opcoes.titulo ?? 'Visão geral',
    ...(opcoes.papeis ? { papeis: opcoes.papeis } : {}),
    render: () => (
      <div className="space-y-6">
        <header>
          <h2 className="text-2xl font-bold">Visão geral</h2>
          <p className="mt-1 text-sm text-muted-foreground">Estado deste módulo.</p>
        </header>

        <Card className="p-5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sua sessão
          </span>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Nome</dt>
              <dd className="font-medium">{sessao?.nome ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Papel</dt>
              <dd className="font-medium">{sessao?.papel ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="font-medium">{sessao?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tenant</dt>
              {/* Sem tenant é o owner, que é global por definição — dizer isso
                  é melhor que mostrar um traço e deixar parecer dado faltando. */}
              <dd className="font-mono text-xs">{sessao?.tenantId ?? 'global (sem tenant)'}</dd>
            </div>
          </dl>
        </Card>

        {modulosHabilitados !== undefined && (
          <Card className="p-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Módulos habilitados
            </span>
            {modulosHabilitados.length === 0 ? (
              /* Lista vazia com o gate ligado é informação, não erro: alguém
                 desligou tudo, e a tela precisa dizer isso em vez de sumir. */
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhum módulo habilitado para este cliente.
              </p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {modulosHabilitados.map((m) => (
                  <li
                    key={m}
                    className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {obterSaude && <CartaoSaude obter={obterSaude} />}
      </div>
    ),
  };
}
