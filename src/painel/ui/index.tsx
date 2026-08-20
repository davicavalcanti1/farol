/* ═══════════════════════════════════════════════════════════════════════════
   Primitivos de UI do painel
   ---------------------------------------------------------------------------
   Poucos e sem dependência externa, no espírito do ExameQR: onze componentes
   cobrem quase tudo. A tentação de instalar uma biblioteca inteira aparece
   cedo, e o custo dela é acoplar o painel a decisões de terceiros para ganhar
   componentes que não serão usados. Exigir shadcn aqui barraria justamente o
   ExameQR, que é a referência deste padrão e não usa.

   ── O VOCABULÁRIO VEM DO KIT DO CHECK-IN, AS CORES NÃO ─────────────────────
   Em 20/ago estes primitivos subiram de nível para alcançar o
   `features/developer/components/kit.tsx` do check-in, que é o painel mais
   polido da casa (porte do `primitives.jsx` do ExameQR): cartão sem borda com
   sombra difusa, rótulo em micro-caixa-alta, cabeçalho de seção com ícone,
   selo-pílula, faixa de estado.

   O que NÃO veio de lá foram as cores. O kit usa paleta crua —
   `bg-emerald-50 text-emerald-700`, `bg-amber-50`, `bg-red-50` — e isso
   contraria a doutrina do `@imago/design` ("o chrome é neutro, a cor é sempre
   informação") e não acompanha o modo escuro: `emerald-50` é claro nos dois
   temas, então em tema escuro o selo vira mancha branca. Aqui as mesmas cinco
   tonalidades saem de `success` / `warning` / `info` / `destructive` / neutro.

   Resultado: mais rico que a versão anterior deste arquivo e mais correto que o
   kit — que é o único jeito de a adoção não ser downgrade para ninguém.

   ── ÍCONE É ReactNode, NÃO LucideIcon ──────────────────────────────────────
   O kit tipa `icone?: LucideIcon` e importa `lucide-react`. Aqui o ícone entra
   como `ReactNode` já renderizado (`icone={<KeyRound className="h-4 w-4" />}`).
   Parece detalhe e é o que mantém a dependência de runtime em zero: o pacote
   não escolhe biblioteca de ícone pelo host, e serve tanto quem usa lucide
   quanto quem não usa.

   Convenção do preset que vale repetir: `text-destructive` é a cor como
   superfície; para a MESMA cor como texto sobre o fundo da página use
   `text-destructive-strong`. `text-warning` é quase sempre o que você não quer.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/** Cartão base. Sem borda: a separação vem da sombra, como no ExameQR. */
export function Card({
  children,
  className = '',
  padding = false,
}: {
  children: ReactNode;
  className?: string;
  /** Aplica o respiro padrão do painel. Deixe falso quando o conteúdo é uma
   *  tabela ou uma lista de `Linha`, que têm padding próprio por célula. */
  padding?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl bg-card text-card-foreground shadow-card ${
        padding ? 'p-4 sm:p-6' : ''
      } ${className}`}
    >
      {children}
    </section>
  );
}

/** Cabeçalho de seção: ícone + título + subtítulo, ações à direita. */
export function TituloSecao({
  icone,
  titulo,
  subtitulo,
  acoes,
}: {
  icone?: ReactNode;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icone && (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {icone}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-tight tracking-tight">{titulo}</h2>
          {subtitulo && (
            <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{subtitulo}</p>
          )}
        </div>
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </div>
  );
}

/** Micro-rótulo caixa-alta que separa blocos dentro do cartão. */
export function Rotulo({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-[11px] font-bold uppercase tracking-widest text-muted-foreground ${className}`}
    >
      {children}
    </span>
  );
}

type VarianteBotao = 'primaria' | 'secundaria' | 'perigo';

const ESTILO_BOTAO: Record<VarianteBotao, string> = {
  primaria: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secundaria: 'ring-1 ring-border bg-card hover:bg-muted',
  perigo: 'bg-destructive text-destructive-foreground hover:opacity-90',
};

export function Button({
  children,
  variante = 'primaria',
  carregando = false,
  className = '',
  disabled,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBotao;
  carregando?: boolean;
}) {
  return (
    <button
      // Desabilitar durante o carregamento evita duplo envio, que em endpoint
      // de escrita costuma gerar registro duplicado.
      disabled={disabled || carregando}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${ESTILO_BOTAO[variante]} ${className}`}
      {...resto}
    >
      {carregando && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

/** Campo rotulado, com dica embaixo e acessório no canto do rótulo. */
export function Field({
  label,
  dica,
  acessorio,
  children,
}: {
  label: ReactNode;
  dica?: ReactNode;
  /** Canto direito da linha do rótulo — selo, link, contador. */
  acessorio?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2">
        <Rotulo>{label}</Rotulo>
        {acessorio}
      </span>
      <div className="mt-1.5">{children}</div>
      {dica && (
        <span className="mt-1.5 block text-[11px] leading-snug text-muted-foreground">{dica}</span>
      )}
    </label>
  );
}

/** Input do painel: ring em vez de border, foco em ring duplo. */
export const entradaCls =
  'w-full rounded-xl bg-background px-3.5 py-2.5 text-sm ring-1 ring-border outline-none transition ' +
  'focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50 disabled:opacity-60';

export function Input({ className = '', ...resto }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${entradaCls} ${className}`} {...resto} />;
}

/* ── Tons de estado ───────────────────────────────────────────────────────────
   Cinco tons, todos em token. `neutro` existe porque a maioria dos estados não
   é status nenhum — e pintar tudo de cor faz a cor parar de significar. */

export type Tom = 'neutro' | 'primary' | 'sucesso' | 'alerta' | 'erro' | 'info';

const TOM_SELO: Record<Tom, string> = {
  neutro: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  sucesso: 'bg-success/10 text-success-strong',
  alerta: 'bg-warning/10 text-warning-strong',
  erro: 'bg-destructive/10 text-destructive-strong',
  info: 'bg-info/10 text-info-strong',
};

const TOM_FAIXA: Record<Tom, string> = {
  neutro: 'bg-muted/60 text-foreground',
  primary: 'bg-primary/5 text-primary ring-1 ring-primary/20',
  sucesso: 'bg-success/10 text-success-strong ring-1 ring-success/30',
  alerta: 'bg-warning/10 text-warning-strong ring-1 ring-warning/30',
  erro: 'bg-destructive/10 text-destructive-strong ring-1 ring-destructive/30',
  info: 'bg-info/10 text-info-strong ring-1 ring-info/30',
};

/** Selo-pílula caixa-alta para estado curto. */
export function Selo({
  tom = 'neutro',
  icone,
  children,
  title,
}: {
  tom?: Tom;
  icone?: ReactNode;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${TOM_SELO[tom]}`}
    >
      {icone}
      {children}
    </span>
  );
}

/**
 * Faixa de estado: o retorno de um teste, um aviso, uma pendência.
 *
 * `Aviso` é o nome antigo disto e continua exportado — o farol já o usa, e
 * renomear em cima de um adotante para ganhar consistência de nome seria trocar
 * trabalho dele por gosto meu.
 */
export function Faixa({
  tom = 'neutro',
  icone,
  children,
  acoes,
}: {
  tom?: Tom;
  icone?: ReactNode;
  children: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3.5 py-3 text-sm ${TOM_FAIXA[tom]}`}
    >
      {icone && <span className="shrink-0">{icone}</span>}
      <span className="min-w-[220px] flex-1 leading-snug">{children}</span>
      {acoes}
    </div>
  );
}

/** Nome anterior de `Faixa`, com os tons antigos. Mantido por compatibilidade. */
export function Aviso({
  tom = 'info',
  children,
  icone,
  acoes,
}: {
  tom?: 'info' | 'erro' | 'alerta' | 'sucesso';
  children: ReactNode;
  icone?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <Faixa tom={tom} icone={icone} acoes={acoes}>
      {children}
    </Faixa>
  );
}

/** Par rótulo/valor, para listas de leitura (console, diagnóstico). */
export function Linha({ label, valor }: { label: ReactNode; valor: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 px-3.5 py-2.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right font-semibold">{valor ?? '—'}</span>
    </div>
  );
}

export function Loading({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <span
        className="h-7 w-7 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden
      />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

/** Estado vazio nomeado, porque o painel tem vários (papel sem área, módulo
 *  desligado, lista filtrada) e todos apareciam como div solta. */
export function Vazio({
  titulo,
  icone,
  children,
  acao,
}: {
  titulo: string;
  icone?: ReactNode;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icone && <span className="text-muted-foreground/40">{icone}</span>}
      <p className="font-semibold">{titulo}</p>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}
