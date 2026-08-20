import type { ReactNode } from 'react';
import type { Area, Papel } from '../tipos.js';
import { useCarregar } from '../hooks.js';
import { Aviso, Card, Loading } from '../ui/index.js';
import { statusEhSaudavel } from './logica.js';

/**
 * O que um `/health` de módulo Imago responde.
 *
 * Só `status` é obrigatório: os cinco módulos não concordam no resto, e exigir
 * o formato completo faria a área falhar em quem responde menos. Campo ausente
 * aparece como "—", que é a verdade.
 */
export interface SaudeModulo {
  status: string;
  versao?: string;
  uptimeSegundos?: number;
  latenciaMs?: number;
  dependencias?: Record<string, string>;
}

/** Busca o `/health` e mede a latência aqui, do lado de quem pergunta — que é a
 *  única que importa para quem está olhando a tela. */
export async function obterSaudeHttp(url = '/health'): Promise<SaudeModulo> {
  const t0 = Date.now();
  const r = await fetch(url);
  const latenciaMs = Date.now() - t0;

  // 503 com corpo é resposta legítima de `/health` que degrada em vez de
  // mentir: o corpo diz qual dependência caiu. Tratar como erro de rede
  // esconderia exatamente o diagnóstico.
  const corpo = await r.text();
  if (!corpo) {
    if (!r.ok) throw new Error(`O backend respondeu HTTP ${r.status} sem corpo.`);
    throw new Error('O backend respondeu vazio.');
  }

  const json = JSON.parse(corpo) as SaudeModulo;
  return { latenciaMs, ...json };
}

export function CartaoSaude({ obter }: { obter: () => Promise<SaudeModulo> }) {
  const { dado, erro, carregando } = useCarregar(obter);

  return (
    <Card className="p-5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Saúde do backend
      </span>

      {carregando ? (
        <Loading texto="Consultando /health…" />
      ) : erro ? (
        <div className="mt-3">
          {/* Falha aqui quase sempre é backend fora do ar, e dizer isso é mais
              útil que repetir a mensagem de rede do fetch. */}
          <Aviso tom="erro">O backend não respondeu. Ele está rodando? ({erro})</Aviso>
        </div>
      ) : dado ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Linha
            termo="Status"
            valor={dado.status}
            tom={statusEhSaudavel(dado.status) ? 'bom' : 'ruim'}
          />
          <Linha termo="Versão" valor={dado.versao ?? '—'} mono />
          <Linha
            termo="Latência"
            valor={dado.latenciaMs === undefined ? '—' : `${dado.latenciaMs} ms`}
            mono
          />
          <Linha
            termo="Uptime"
            valor={dado.uptimeSegundos === undefined ? '—' : formatarUptime(dado.uptimeSegundos)}
            mono
          />
          {Object.entries(dado.dependencias ?? {}).map(([nome, estado]) => (
            <Linha
              key={nome}
              termo={nome}
              valor={estado}
              tom={statusEhSaudavel(estado) ? 'bom' : 'ruim'}
            />
          ))}
        </dl>
      ) : null}
    </Card>
  );
}

function Linha({
  termo,
  valor,
  tom,
  mono,
}: {
  termo: string;
  valor: ReactNode;
  tom?: 'bom' | 'ruim';
  mono?: boolean;
}) {
  const cor = tom === 'bom' ? 'text-success-strong' : tom === 'ruim' ? 'text-destructive-strong' : '';
  return (
    <div>
      <dt className="text-muted-foreground">{termo}</dt>
      <dd className={`${mono ? 'font-mono text-xs' : 'font-medium'} ${cor}`}>{valor}</dd>
    </div>
  );
}

function formatarUptime(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)}s`;
  const min = Math.floor(segundos / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}min`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export interface OpcoesAreaSaude<P extends string = Papel> {
  obter?: () => Promise<SaudeModulo>;
  chave?: string;
  titulo?: string;
  papeis?: P[];
}

/** A área de Saúde. Recebe a fonte; não sabe qual é a URL do módulo nem se há
 *  proxy no caminho. */
export function criarAreaSaude<P extends string = Papel>(
  opcoes: OpcoesAreaSaude<P> = {},
): Area<ReactNode, P> {
  const obter = opcoes.obter ?? (() => obterSaudeHttp());
  return {
    chave: opcoes.chave ?? 'saude',
    titulo: opcoes.titulo ?? 'Saúde',
    ...(opcoes.papeis ? { papeis: opcoes.papeis } : {}),
    render: () => (
      <div className="space-y-6">
        <header>
          <h2 className="text-2xl font-bold">Saúde</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Estado real do backend deste módulo, direto do <code>/health</code>.
          </p>
        </header>
        <CartaoSaude obter={obter} />
      </div>
    ),
  };
}
