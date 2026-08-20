/* ═══════════════════════════════════════════════════════════════════════════
   A lógica das áreas comuns, sem React
   ---------------------------------------------------------------------------
   As decisões que dão errado numa tela de configuração não são de renderização:
   são "o que exatamente eu mando no PUT", "este campo está preenchido ou está
   herdando do ambiente", "posso ativar isto?". Ficam aqui, puras, e por isso
   testáveis sem DOM — mesmo motivo pelo qual `registro.ts` não importa React.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Espelha `camposPublicos()` do @imago/integracoes. Nomes em inglês porque é
 *  o que vem do servidor; traduzir na fronteira só criaria um terceiro
 *  dialeto. */
export interface CampoPublico {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder: string;
  hint: string;
  /** Nome da variável de ambiente que serve de fallback — não o valor dela. */
  env: string;
  secret: boolean;
  essencial: boolean;
  /** Tem default embutido no código — sobrevive ao desligamento sem ambiente. */
  temPadrao?: boolean;
}

export interface CamposIntegracao {
  provedor: string;
  mask: string;
  label: string;
  descricao: string;
  fields: CampoPublico[];
}

/** De onde saiu o valor que está valendo. Igual ao `Origem` do pacote. */
export type Origem = 'painel' | 'env' | 'padrao' | 'ausente';

/** O "retrato" que o router devolve depois de qualquer leitura ou gravação. */
export interface RetratoIntegracao {
  provedor: string;
  ativo: boolean;
  /** Secretos já vêm mascarados — o servidor nunca manda em claro. */
  config: Record<string, string>;
  origem: Record<string, Origem>;
  utilizavel: boolean;
  atualizadoEm: string | null;
  /**
   * Quais campos têm valor no ambiente — booleano, nunca o valor.
   *
   * Ausente em servidor que ainda não atualizou o núcleo. Nesse caso o painel
   * não afirma nada sobre desligar: silêncio é melhor que um aviso errado nas
   * duas direções.
   */
  ambienteDisponivel?: Record<string, boolean>;
}

/* ── Saúde ────────────────────────────────────────────────────────────────── */

/**
 * Se o status devolvido pelo `/health` conta como saudável.
 *
 * Aceita mais de uma palavra porque os módulos não concordam: o template
 * responde `saudavel`, e o `/api/saude-modulos` do hub já precisou traduzir
 * três formatos diferentes num contrato só. Ser tolerante aqui é mais honesto
 * que exigir que cinco repositórios mudem juntos.
 *
 * `degradado` é falso de propósito: o `/health` do template degrada em vez de
 * mentir quando o banco não responde, e tratar isso como verde apagaria
 * justamente o sinal.
 */
export function statusEhSaudavel(status: string | null | undefined): boolean {
  if (!status) return false;
  return ['saudavel', 'saudável', 'ok', 'healthy', 'up'].includes(status.trim().toLowerCase());
}

/* ── Integração ───────────────────────────────────────────────────────────── */

/** O selo que o painel mostra ao lado do campo. */
export function rotuloOrigem(origem: Origem | undefined): string {
  switch (origem) {
    case 'painel':
      return 'salvo no painel';
    case 'env':
      return 'vem do ambiente';
    case 'padrao':
      return 'default do código';
    default:
      return 'vazio';
  }
}

/**
 * Os campos essenciais que ainda faltam para a integração ser utilizável.
 *
 * Devolve rótulos, não chaves: a mensagem existe para ser lida por quem está
 * configurando ("preencha antes de ativar: Token"), e `netris_token` não é isso.
 *
 * Um campo herdado do ambiente conta como preenchido — é o ponto do fallback.
 */
export function essenciaisFaltando(
  campos: readonly CampoPublico[],
  valores: Record<string, string>,
  origem: Record<string, Origem> = {},
): string[] {
  return campos
    .filter((c) => c.essencial)
    .filter((c) => {
      if ((valores[c.key] ?? '').trim()) return false;
      const o = origem[c.key];
      return o !== 'env' && o !== 'padrao';
    })
    .map((c) => c.label);
}

/**
 * O `config` que vai no corpo do PUT.
 *
 * Duas regras, e as duas vêm de bug real:
 *
 * 1. **Campo secreto que segue igual à máscara não é enviado.** O servidor
 *    devolve `••••••••` no lugar do segredo; mandar essa string de volta
 *    gravaria a máscara como se fosse a credencial. Omitir é o que faz o
 *    servidor preservar o valor guardado.
 * 2. **Espaço nas pontas sai.** Token copiado de e-mail vem com espaço ou
 *    quebra de linha invisível, e a falha aparece como "401 sem motivo".
 *
 * Campo não-secreto **é** enviado mesmo vazio: apagar o conteúdo é uma edição
 * legítima, e omitir faria o painel ignorar quem quis limpar o campo.
 */
export function configParaSalvar(
  campos: readonly CampoPublico[],
  valores: Record<string, string>,
  mask: string,
): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const campo of campos) {
    const bruto = valores[campo.key];
    if (bruto === undefined) continue;
    const valor = bruto.trim();
    if (campo.secret && valor === mask) continue;
    if (campo.secret && valor === '') continue;
    saida[campo.key] = valor;
  }
  return saida;
}

/**
 * Se dá para ativar a integração agora.
 *
 * Espelha o `utilizavel` do servidor, mas do lado do navegador, para desabilitar
 * o switch antes do 400 em vez de depois. O servidor continua sendo a
 * autoridade — isto é cortesia, não validação.
 */
export function podeAtivar(
  campos: readonly CampoPublico[],
  valores: Record<string, string>,
  origem: Record<string, Origem> = {},
): boolean {
  return essenciaisFaltando(campos, valores, origem).length === 0;
}

/**
 * Os campos essenciais que o desligamento deixaria sem valor nenhum.
 *
 * `ativo = false` faz o servidor ignorar o painel e voltar ao ambiente. Isso é
 * um botão de pânico útil — credencial errada salva às 18h de uma sexta se
 * desfaz com um clique — **desde que exista ambiente para onde voltar**.
 *
 * Não existe sempre. No check-in as `NETRIS_*` foram removidas do EasyPanel
 * depois que o painel passou a ser a fonte, e desde então desligar o switch
 * derrubaria o módulo. O painel avisava "só continua de pé se elas ainda
 * existirem", sem saber se existiam — o que é o mesmo que não avisar.
 *
 * Devolve rótulos, para a frase ficar acionável. Lista vazia = desligar é
 * seguro. `ambienteDisponivel` ausente (servidor com núcleo antigo) também
 * devolve vazio: sem o dado, o painel não afirma nada.
 */
export function desligarDeixaSemValor(
  campos: readonly CampoPublico[],
  ambienteDisponivel: Record<string, boolean> | undefined,
): string[] {
  if (!ambienteDisponivel) return [];
  return campos
    .filter((c) => c.essencial)
    .filter((c) => !ambienteDisponivel[c.key] && !c.temPadrao)
    .map((c) => c.label);
}

/** Data legível, tolerando nulo e string que não parseia. */
export function quando(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('pt-BR');
}
