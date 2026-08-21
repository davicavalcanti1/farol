import { useState, type ReactNode } from 'react';
import type { Area, Papel } from '../tipos.js';
import { useCarregar } from '../hooks.js';
import { Aviso, Button, Card, Loading, Vazio } from '../ui/index.js';
import { quando } from './logica.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Área Owner — a visão de quem opera a plataforma, não o cliente
   ---------------------------------------------------------------------------
   É o papel `owner` do ExameQR generalizado: atravessa clientes. Duas
   perguntas, que são as que se faz numa terça-feira de manhã:

     1. O que está de pé? (saúde e versão de TODOS os produtos, num lugar)
     2. Quem tem acesso a quê? (módulos por cliente — e o kill-switch)

   ── POR QUE ELA NÃO BUSCA NADA SOZINHA ─────────────────────────────────────
   A sonda de `/health` **tem** de ser server-side. Produto em outro domínio
   responderia com o CORS bloqueando o fetch do navegador, e o painel mostraria
   "inalcançável" para tudo que está no ar — o pior erro possível num painel de
   saúde, porque parece incidente. Então a área recebe as duas fontes prontas e o
   host decide como as serve.

   No hub isso já existe: `/api/saude-modulos` sonda `/api/health` e `/health` de
   cada módulo, com timeout, e traduz os três formatos de resposta que existem
   hoje num contrato só. O normalizador fica lá, e não aqui, porque é código de
   servidor — trazê-lo para um pacote de frontend seria mudá-lo de lugar sem
   mudar de dono.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Espelha o contrato do `/api/saude-modulos` do hub, para o retorno dele
 *  entrar aqui sem tradução. */
export type EstadoSaude =
  | 'saudavel'
  | 'degradado'
  | 'sem_health'
  | 'inalcancavel'
  | 'sem_url';

export interface ProdutoOwner {
  id: string;
  nome: string;
  url: string | null;
  estado: EstadoSaude;
  versao?: string | null;
  banco?: string | null;
  latenciaMs?: number | null;
  detalhe?: string | null;
  /** Do GitHub, quando o host tem esse dado. */
  commit?: string | null;
  atualizadoEm?: string | null;
}

export interface Cliente {
  id: string;
  nome: string;
}

export interface ModuloDisponivel {
  id: string;
  nome: string;
}

export interface MapaEntitlements {
  clientes: Cliente[];
  modulos: ModuloDisponivel[];
  /** clienteId → ids dos módulos habilitados. */
  habilitados: Record<string, string[]>;
}

export interface FonteEntitlements {
  listar: () => Promise<MapaEntitlements>;
  /**
   * Liga ou desliga um módulo para um cliente.
   *
   * **Tem de lançar quando o banco não confirmar.** RLS que bloqueia em silêncio
   * devolve sucesso com zero linhas, e o painel diria "salvo" sem ter salvado —
   * já aconteceu aqui, com toggle de permissão. Se esta função não lançar, o
   * checkbox mente.
   */
  alternar: (clienteId: string, moduloId: string, habilitar: boolean) => Promise<void>;
}

/* ── Saúde ────────────────────────────────────────────────────────────────── */

const ROTULO_ESTADO: Record<EstadoSaude, string> = {
  saudavel: 'no ar',
  degradado: 'degradado',
  sem_health: 'sem /health',
  inalcancavel: 'inalcançável',
  sem_url: 'sem URL',
};

/** Só `saudavel` é verde. `degradado` é âmbar porque o processo responde mas
 *  alguma dependência caiu — e `sem_health` não é falha do produto, é falta de
 *  instrumentação: pintar de vermelho faria o painel gritar sobre algo que
 *  ninguém vai consertar às 3h da manhã. */
const TOM_ESTADO: Record<EstadoSaude, string> = {
  saudavel: 'text-success-strong',
  degradado: 'text-warning-strong',
  sem_health: 'text-muted-foreground',
  inalcancavel: 'text-destructive-strong',
  sem_url: 'text-muted-foreground',
};

export function PainelSaudeProdutos({ produtos }: { produtos: () => Promise<ProdutoOwner[]> }) {
  const { dado, erro, carregando, recarregar } = useCarregar(produtos);

  if (carregando) return <Loading texto="Sondando os produtos…" />;
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dado || dado.length === 0) return <Vazio titulo="Nenhum produto no catálogo." />;

  const fora = dado.filter((p) => p.estado === 'inalcancavel');

  /* Quem não tem URL não está no ar — e não é o mesmo que estar com problema.
     Misturado na mesma tabela, o "sem URL" afoga o que importa: com 9 produtos
     e 3 implantados, seis linhas de travessão dominam a tela e a informação de
     saúde some no meio. Vira lista curta no pé, e a tabela fica só com o que
     tem estado de verdade. */
  const implantados = dado.filter((p) => p.estado !== 'sem_url');
  const naoImplantados = dado.filter((p) => p.estado === 'sem_url');

  return (
    <div className="space-y-4">
      {fora.length > 0 && (
        <Aviso tom="erro">
          {fora.length === 1
            ? `${fora[0]!.nome} está inalcançável.`
            : `${fora.length} produtos inalcançáveis: ${fora.map((p) => p.nome).join(', ')}.`}
        </Aviso>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Produto ({implantados.length})</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Versão</th>
              <th className="px-4 py-3 font-semibold">Banco</th>
              <th className="px-4 py-3 font-semibold">Latência</th>
            </tr>
          </thead>
          <tbody>
            {implantados.map((p) => (
              <tr key={p.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{p.nome}</div>
                  {p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary"
                    >
                      {p.url.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <div className="text-xs text-muted-foreground">não implantado</div>
                  )}
                </td>
                <td className={`px-4 py-3 font-medium ${TOM_ESTADO[p.estado]}`}>
                  {ROTULO_ESTADO[p.estado]}
                  {p.detalhe && (
                    <div className="text-xs font-normal text-muted-foreground">{p.detalhe}</div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{p.versao ?? '—'}</td>
                <td className="px-4 py-3 text-xs">{p.banco ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {p.latenciaMs == null ? '—' : `${p.latenciaMs} ms`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {naoImplantados.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold">Não implantados ({naoImplantados.length}):</span>{' '}
          {naoImplantados.map((p) => p.nome).join(', ')}. Sem URL no catálogo, não há o que
          sondar — e isso é estado do deploy, não problema de saúde.
        </p>
      )}

      <Button variante="secundaria" onClick={recarregar}>
        Sondar de novo
      </Button>
    </div>
  );
}

/* ── Módulos por cliente ──────────────────────────────────────────────────── */

export function PainelEntitlements({ fonte }: { fonte: FonteEntitlements }) {
  const { dado, erro, carregando, definir } = useCarregar(() => fonte.listar());
  const [salvando, setSalvando] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  if (carregando) return <Loading texto="Carregando clientes e módulos…" />;
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dado) return null;

  const { clientes, modulos, habilitados } = dado;
  if (clientes.length === 0) return <Vazio titulo="Nenhum cliente cadastrado." />;

  async function alternar(clienteId: string, moduloId: string, ligar: boolean) {
    const chave = `${clienteId}:${moduloId}`;
    setSalvando(chave);
    setFalha(null);

    // Otimista, porque o clique tem de responder na hora. Mas com reversão: se
    // a gravação falhar e a tela ficar com o estado novo, alguém acredita que
    // desligou um módulo que segue ligado.
    const antes = habilitados[clienteId] ?? [];
    const depois = ligar ? [...antes, moduloId] : antes.filter((m) => m !== moduloId);
    /* Objeto montado campo a campo em vez de spread: `definir` exige o mapa
       completo, e um spread de valor narrowed deixa as listas opcionais no
       tipo — o que compilaria aqui e explodiria em quem chamasse. */
    const comValor = (lista: string[]): MapaEntitlements => ({
      clientes,
      modulos,
      habilitados: { ...habilitados, [clienteId]: lista },
    });
    definir(comValor(depois));

    try {
      await fonte.alternar(clienteId, moduloId, ligar);
    } catch (e: unknown) {
      definir(comValor(antes));
      setFalha(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="space-y-4">
      {falha && <Aviso tom="erro">{falha}</Aviso>}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Cliente</th>
              {modulos.map((m) => (
                <th key={m.id} className="px-4 py-3 text-center font-semibold">
                  {m.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3 font-medium">{c.nome}</td>
                {modulos.map((m) => {
                  const ligado = (habilitados[c.id] ?? []).includes(m.id);
                  const chave = `${c.id}:${m.id}`;
                  return (
                    <td key={m.id} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={ligado}
                        disabled={salvando === chave}
                        onChange={(e) => void alternar(c.id, m.id, e.target.checked)}
                        aria-label={`${m.nome} para ${c.nome}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted-foreground">
        Desmarcar é o kill-switch: o módulo desaparece do painel daquele cliente na próxima carga,
        sem deploy. É a mesma tabela que libera e que desliga.
      </p>
    </div>
  );
}

/* ── A área ───────────────────────────────────────────────────────────────── */

export interface OpcoesAreaOwner<P extends string = Papel> {
  produtos: () => Promise<ProdutoOwner[]>;
  /** Ausente = a seção de módulos por cliente não aparece. */
  entitlements?: FonteEntitlements;
  /** Última sondagem, quando o host sabe. Só exibição. */
  sondadoEm?: string | null;
  chave?: string;
  titulo?: string;
  papeis?: P[];
}

/**
 * A área Owner.
 *
 * `papeis` default é `['owner']`: ela atravessa clientes por definição, e um
 * admin de um tenant não pode ver a lista dos outros. Este é o único lugar do
 * pacote onde o filtro de papel protege algo que importa de verdade — ainda
 * assim, o servidor é quem tem de recusar.
 */
export function criarAreaOwner<P extends string = Papel>(
  opcoes: OpcoesAreaOwner<P>,
): Area<ReactNode, P> {
  return {
    chave: opcoes.chave ?? 'owner',
    titulo: opcoes.titulo ?? 'Plataforma',
    papeis: opcoes.papeis ?? (['owner'] as unknown as P[]),
    render: () => (
      <div className="space-y-8">
        <header>
          <h2 className="text-2xl font-bold">Plataforma</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Todos os produtos e todos os clientes, num lugar.
            {opcoes.sondadoEm ? ` Última sondagem: ${quando(opcoes.sondadoEm)}.` : ''}
          </p>
        </header>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Saúde dos produtos
          </h3>
          <PainelSaudeProdutos produtos={opcoes.produtos} />
        </section>

        {opcoes.entitlements && (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Módulos por cliente
            </h3>
            <PainelEntitlements fonte={opcoes.entitlements} />
          </section>
        )}
      </div>
    ),
  };
}
