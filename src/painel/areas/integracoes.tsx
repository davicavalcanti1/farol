import { useEffect, useState, type ReactNode } from 'react';
import type { Area, Papel } from '../tipos.js';
import { useCarregar } from '../hooks.js';
import { Aviso, Button, Card, Field, Input, Loading } from '../ui/index.js';
import {
  configParaSalvar,
  desligarDeixaSemValor,
  essenciaisFaltando,
  quando,
  rotuloOrigem,
  type CamposIntegracao,
  type RetratoIntegracao,
} from './logica.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Área de Integrações — o primeiro consumidor real do @imago/integracoes
   ---------------------------------------------------------------------------
   Esta tela fala o contrato do `criarRouterIntegracao` daquele pacote, e não o
   do `lib/api.ts` do template. Os dois existem e são diferentes:

     template   GET /integracao/providers  ·  campos[]  ·  { tipo, obrigatorio }
     pacote     GET <base>/campos          ·  fields[]  ·  { type, essencial }

   O pacote nasceu para unificar os quatro dialetos que o padrão tinha; portar o
   dialeto antigo para dentro do pacote compartilhado recriaria o problema num
   quinto lugar, e cada adotante precisaria de adaptação. Então o alvo é o
   contrato do pacote — que é também o único com 39 testes atrás.

   O que esta tela dá e o dialeto antigo não tinha: selo de origem por campo
   (painel / ambiente / default), `utilizavel` vindo do servidor, e o botão de
   importar do ambiente.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ResultadoTeste {
  ok: boolean;
  mensagem: string;
}

export interface ResultadoImportar extends RetratoIntegracao {
  ok: boolean;
  importados: string[];
  mensagem: string;
}

/** As quatro operações do router. Interface e não fetch direto para que o app
 *  decida como anexa o token — e para a área ser testável com um duble. */
export interface ClienteIntegracao {
  campos: () => Promise<CamposIntegracao>;
  ler: () => Promise<RetratoIntegracao>;
  salvar: (corpo: {
    ativo: boolean;
    config: Record<string, string>;
  }) => Promise<RetratoIntegracao>;
  importarDoAmbiente?: () => Promise<ResultadoImportar>;
  testar?: () => Promise<ResultadoTeste>;
}

/**
 * Cliente HTTP padrão.
 *
 * `autorizacao` é uma função, não uma string: o supabase-js renova o JWT em
 * background, e um token capturado uma vez expira em uma hora — foi o bug do
 * `lib/api.ts`, que por isso lê a sessão a cada chamada.
 */
export function clienteIntegracaoHttp(opcoes: {
  base?: string;
  autorizacao?: () => Promise<string | null> | string | null;
}): ClienteIntegracao {
  const base = (opcoes.base ?? '/api/integracao').replace(/\/+$/, '');

  async function req<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    const token = await opcoes.autorizacao?.();
    const r = await fetch(`${base}${caminho}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });

    const corpo = await r.text();
    const json: unknown = corpo ? JSON.parse(corpo) : null;

    if (!r.ok) {
      // O router escreve mensagens para humano ("preencha antes de ativar:
      // Token") em `error`/`detail`. Trocar por "HTTP 400" jogaria fora o
      // diagnóstico que o servidor se esforçou para dar.
      const o = (json ?? {}) as { error?: unknown; detail?: unknown };
      const msg = o.error ? String(o.error) : `Falha na requisição (HTTP ${r.status})`;
      throw new Error(o.detail ? `${msg}: ${String(o.detail)}` : msg);
    }
    return json as T;
  }

  return {
    campos: () => req<CamposIntegracao>('/campos'),
    ler: () => req<RetratoIntegracao>('/'),
    salvar: (corpo) => req<RetratoIntegracao>('/', { method: 'PUT', body: JSON.stringify(corpo) }),
    importarDoAmbiente: () => req<ResultadoImportar>('/importar-env', { method: 'POST' }),
    testar: () => req<ResultadoTeste>('/testar', { method: 'POST' }),
  };
}

/**
 * O painel, como componente.
 *
 * Exportado porque metade dos adotantes **não** quer a área inteira: o check-in
 * tem um painel próprio de quatro abas e precisa só deste cartão dentro da aba
 * "Integração", sem o cabeçalho de página que a área desenha. Host com casca
 * própria usa isto; host sem casca usa `criarAreaIntegracoes`.
 */
export function PainelIntegracoes({
  cliente,
  comCabecalho = true,
}: {
  cliente: ClienteIntegracao;
  /** Falso quando o host já tem título de página próprio. */
  comCabecalho?: boolean;
}) {
  const meta = useCarregar(() => cliente.campos());
  const atual = useCarregar(() => cliente.ler());

  const [valores, setValores] = useState<Record<string, string>>({});
  const [ativo, setAtivo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [recado, setRecado] = useState<{ tom: 'sucesso' | 'erro' | 'info'; texto: string } | null>(
    null,
  );

  // Semear o formulário quando o retrato chega, e a cada recarga depois de
  // salvar. Sem isto o campo secreto perderia a máscara e pareceria vazio, o
  // que convida a redigitar a credencial sem necessidade.
  useEffect(() => {
    if (atual.dado) {
      setValores({ ...atual.dado.config });
      setAtivo(atual.dado.ativo);
    }
  }, [atual.dado]);

  if (meta.carregando || atual.carregando) return <Loading texto="Carregando a integração…" />;
  if (meta.erro) return <Aviso tom="erro">{meta.erro}</Aviso>;
  if (atual.erro) return <Aviso tom="erro">{atual.erro}</Aviso>;
  if (!meta.dado || !atual.dado) return null;

  const { fields, mask, label, descricao } = meta.dado;
  const { origem, utilizavel, atualizadoEm, ambienteDisponivel } = atual.dado;
  const faltando = essenciaisFaltando(fields, valores, origem);
  /* O que desligar o switch deixaria sem valor nenhum. Vazio = desligar é
     seguro; com item = desligar derruba, e a frase precisa dizer isso. */
  const semRedeDeSeguranca = desligarDeixaSemValor(fields, ambienteDisponivel);

  async function comRecado(acao: () => Promise<void>) {
    setSalvando(true);
    setRecado(null);
    try {
      await acao();
    } catch (e: unknown) {
      setRecado({ tom: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  }

  const salvar = () =>
    comRecado(async () => {
      const retrato = await cliente.salvar({
        ativo,
        config: configParaSalvar(fields, valores, mask),
      });
      atual.definir(retrato);
      setRecado({ tom: 'sucesso', texto: 'Configuração salva. Vale a partir de agora.' });
    });

  const importar = () =>
    comRecado(async () => {
      const r = await cliente.importarDoAmbiente!();
      atual.definir(r);
      setRecado({ tom: r.importados.length ? 'sucesso' : 'info', texto: r.mensagem });
    });

  const testar = () =>
    comRecado(async () => {
      const r = await cliente.testar!();
      setRecado({ tom: r.ok ? 'sucesso' : 'erro', texto: r.mensagem });
    });

  return (
    <div className="space-y-6">
      {comCabecalho && (
        <header>
          <h2 className="text-2xl font-bold">{label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
        </header>
      )}

      {recado && <Aviso tom={recado.tom === 'info' ? 'info' : recado.tom === 'erro' ? 'erro' : 'sucesso'}>{recado.texto}</Aviso>}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Estado
            </span>
            <p className="mt-1 text-sm">
              {utilizavel ? (
                <span className="text-success-strong">Utilizável</span>
              ) : (
                <span className="text-warning-strong">Faltam campos essenciais</span>
              )}
              <span className="text-muted-foreground"> · salvo {quando(atualizadoEm)}</span>
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ativo}
              // Desabilitar quando falta essencial evita o 400 do servidor —
              // que continua sendo a autoridade; isto é cortesia, não validação.
              disabled={faltando.length > 0 && !ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            Integração ativa
          </label>
        </div>

        {faltando.length > 0 && (
          <div className="mt-4">
            <Aviso tom="alerta">Preencha antes de ativar: {faltando.join(', ')}</Aviso>
          </div>
        )}

        <div className="mt-4">
          {semRedeDeSeguranca.length > 0 ? (
            /* O caso do check-in: as variáveis saíram do EasyPanel depois que o
               painel virou a fonte. Desligar aqui não volta a nada — derruba. */
            <Aviso tom="erro">
              <strong>Não desligue.</strong> Desligar faz o servidor voltar ao ambiente, e{' '}
              {semRedeDeSeguranca.length === 1 ? 'o campo' : 'os campos'}{' '}
              {semRedeDeSeguranca.join(', ')} não {semRedeDeSeguranca.length === 1 ? 'tem' : 'têm'}{' '}
              valor lá. A integração ficaria fora do ar até alguém religar.
            </Aviso>
          ) : ambienteDisponivel ? (
            <Aviso tom="info">
              Desligar é seguro: o servidor volta a usar as variáveis de ambiente, que estão
              preenchidas. O que está salvo aqui não é apagado.
            </Aviso>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        {fields.map((campo) => (
          <Field
            key={campo.key}
            label={
              <span className="flex items-center gap-2">
                {campo.label}
                {campo.essencial && <span className="text-destructive-strong">*</span>}
                <span className="font-normal normal-case tracking-normal text-muted-foreground">
                  {rotuloOrigem(origem[campo.key])}
                </span>
              </span>
            }
            dica={
              campo.hint ||
              // Mostrar o NOME da env, nunca o valor: serve para quem configura
              // entender de onde sai o fallback sem expor a credencial na tela.
              (campo.env ? `Sem valor aqui, o módulo usa ${campo.env} do ambiente.` : undefined)
            }
          >
            <Input
              type={campo.secret ? 'password' : 'text'}
              placeholder={campo.placeholder}
              value={valores[campo.key] ?? ''}
              onChange={(e) => setValores((v) => ({ ...v, [campo.key]: e.target.value }))}
            />
          </Field>
        ))}
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void salvar()} carregando={salvando}>
          Salvar
        </Button>
        {cliente.testar && (
          <Button variante="secundaria" onClick={() => void testar()} disabled={salvando}>
            Testar conexão
          </Button>
        )}
        {cliente.importarDoAmbiente && (
          <Button variante="secundaria" onClick={() => void importar()} disabled={salvando}>
            Importar do ambiente
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Depois de importar, o painel passa a ser a fonte e as variáveis de ambiente podem sair do
        EasyPanel. Importar duas vezes não desfaz ajuste manual: campo que já tem valor aqui é
        preservado.
      </p>
    </div>
  );
}

export interface OpcoesAreaIntegracoes<P extends string = Papel> {
  cliente: ClienteIntegracao;
  chave?: string;
  titulo?: string;
  papeis?: P[];
  modulo?: string;
}

/**
 * A área de Integrações.
 *
 * `papeis` default é `['admin']`: credencial de sistema não é assunto de quem
 * opera a fila. Passe explicitamente para mudar.
 */
export function criarAreaIntegracoes<P extends string = Papel>(
  opcoes: OpcoesAreaIntegracoes<P>,
): Area<ReactNode, P> {
  return {
    chave: opcoes.chave ?? 'integracoes',
    titulo: opcoes.titulo ?? 'Integrações',
    papeis: opcoes.papeis ?? (['admin'] as unknown as P[]),
    ...(opcoes.modulo ? { modulo: opcoes.modulo } : {}),
    render: () => <PainelIntegracoes cliente={opcoes.cliente} />,
  };
}
