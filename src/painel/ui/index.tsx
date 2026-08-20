/* ═══════════════════════════════════════════════════════════════════════════
   Primitivos de UI do painel
   ---------------------------------------------------------------------------
   Poucos e sem dependência externa, no espírito do ExameQR: seis componentes
   cobrem quase tudo. A tentação de instalar uma biblioteca inteira aparece
   cedo, e o custo dela é acoplar o painel a decisões de terceiros para ganhar
   componentes que não serão usados. Exigir shadcn aqui barraria justamente o
   ExameQR, que é a referência deste padrão e não usa. Quando um caso real pedir
   combobox ou date picker, aí sim.

   ── OS TOKENS SÃO OS DO @imago/design, NÃO OS DO TEMPLATE ──────────────────
   Este arquivo nasceu de `imago-module-template/web/src/components/ui/index.tsx`,
   que usa um conjunto próprio em português: `borda`, `superficie`, `primaria`,
   `sutil`, `perigo`, `rounded-base`. Nenhum desses existe no preset que os seis
   produtos adotaram em 14/ago — lá é `border`, `card`, `primary`, `muted`,
   `destructive`, `rounded-lg`.

   Copiar as classes do template para dentro dos produtos não daria erro: o
   Tailwind simplesmente não emitiria regra nenhuma e o painel apareceria sem
   estilo, o que é bem pior que quebrar. Então a tradução foi feita aqui, uma
   vez. O template é o repositório fora do padrão e adotar o `@imago/design` lá
   está no board.

   Convenção do preset que vale repetir: `text-destructive` é a cor como
   superfície; para a MESMA cor como texto sobre o fundo da página use
   `text-destructive-strong`. `text-warning` é quase sempre o que você não quer.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card text-card-foreground ${className}`}>
      {children}
    </div>
  );
}

type VarianteBotao = 'primaria' | 'secundaria' | 'perigo';

const ESTILO_BOTAO: Record<VarianteBotao, string> = {
  primaria: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secundaria: 'border border-border bg-card hover:bg-muted',
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
      className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${ESTILO_BOTAO[variante]} ${className}`}
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

export function Field({
  label,
  dica,
  children,
}: {
  label: ReactNode;
  dica?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {dica && <span className="block text-xs text-muted-foreground">{dica}</span>}
    </label>
  );
}

export function Input({ className = '', ...resto }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary ${className}`}
      {...resto}
    />
  );
}

export function Loading({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden
      />
      {texto}
    </div>
  );
}

type TomAviso = 'info' | 'erro' | 'alerta' | 'sucesso';

const ESTILO_AVISO: Record<TomAviso, string> = {
  info: 'border-info/40 bg-info/10 text-info-strong',
  erro: 'border-destructive/40 bg-destructive/10 text-destructive-strong',
  alerta: 'border-warning/40 bg-warning/10 text-warning-strong',
  sucesso: 'border-success/40 bg-success/10 text-success-strong',
};

export function Aviso({ tom = 'info', children }: { tom?: TomAviso; children: ReactNode }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${ESTILO_AVISO[tom]}`}>{children}</div>
  );
}

/** Estado vazio nomeado, porque o painel tem três deles (papel sem área,
 *  módulo desligado, lista filtrada) e todos apareciam como div solta. */
export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium">{titulo}</p>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}
