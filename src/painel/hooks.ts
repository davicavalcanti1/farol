import { useCallback, useEffect, useState } from 'react';

/**
 * Carregar algo assíncrono sem escrever a mesma dança três vezes.
 *
 * As três áreas comuns faziam, cada uma, o mesmo bloco: `carregando`, `erro`,
 * `dado`, mais a bandeira `vivo` no cleanup. Escrito à mão, alguma delas
 * esquecia o `vivo` e ganhava o aviso de "setState em componente
 * desmontado" — que na prática é uma resposta antiga sobrescrevendo uma nova.
 *
 * `recarregar` existe porque toda tela de configuração precisa dele depois de
 * salvar.
 */
export function useCarregar<T>(
  buscar: () => Promise<T>,
  deps: readonly unknown[] = [],
): {
  dado: T | null;
  erro: string | null;
  carregando: boolean;
  recarregar: () => void;
  definir: (valor: T) => void;
} {
  const [dado, setDado] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gatilho, setGatilho] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    void (async () => {
      try {
        const r = await buscar();
        if (vivo) {
          setDado(r);
          setErro(null);
        }
      } catch (e: unknown) {
        // A mensagem do servidor é escrita para humano ("preencha antes de
        // ativar: Token"). Trocar por "erro 400" jogaria fora o diagnóstico.
        if (vivo) setErro(e instanceof Error ? e.message : String(e));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatilho, ...deps]);

  const recarregar = useCallback(() => setGatilho((n) => n + 1), []);

  return { dado, erro, carregando, recarregar, definir: setDado };
}
