// web/src/lib/autoRefresh.ts
import { useEffect, useRef } from "react";

type AutoRefreshOptions = {
  /**
   * Intervalo do polling em ms.
   * Ex: 15000 = 15s
   */
  intervalMs?: number;

  /** Se true, roda refresh quando a janela ganhar foco */
  refreshOnFocus?: boolean;

  /** Se true, roda refresh quando a aba ficar visível novamente */
  refreshOnVisible?: boolean;

  /**
   * Se false, desabilita completamente (useful para só habilitar quando houver routineId etc.)
   */
  enabled?: boolean;

  /**
   * Se true, roda 1 refresh imediatamente ao montar/ativar.
   * (Recomendado quando a página abre)
   */
  runOnMount?: boolean;
};

/**
 * Hook reutilizável para auto refresh com polling + eventos de foco/visibilidade.
 *
 * - Evita refresh concorrente: se um refresh estiver em andamento, ignora triggers.
 * - Evita atualizar estado após unmount (não cancela request, mas evita duplicar/empilhar).
 *
 * Uso:
 *   useAutoRefresh(() => refreshAll(), { intervalMs: 15000, enabled: !!routineId });
 */
export function useAutoRefresh(
  refreshFn: () => Promise<void> | void,
  options: AutoRefreshOptions = {}
) {
  const {
    intervalMs = 15000,
    refreshOnFocus = true,
    refreshOnVisible = true,
    enabled = true,
    runOnMount = true,
  } = options;

  const isMountedRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const refreshFnRef = useRef(refreshFn);

  // mantém a referência atual da função sem re-registrar listeners toda hora
  useEffect(() => {
    refreshFnRef.current = refreshFn;
  }, [refreshFn]);

  useEffect(() => {
    isMountedRef.current = true;

    async function safeRefresh() {
      if (!enabled) return;
      if (!isMountedRef.current) return;
      if (isRefreshingRef.current) return;

      isRefreshingRef.current = true;
      try {
        await refreshFnRef.current();
      } finally {
        isRefreshingRef.current = false;
      }
    }

    // refresh inicial (opcional)
    if (enabled && runOnMount) {
      // não precisa await
      void safeRefresh();
    }

    // polling (opcional)
    if (enabled && intervalMs > 0) {
      timerRef.current = window.setInterval(() => {
        void safeRefresh();
      }, intervalMs);
    }

    // focus / visible
    const onFocus = () => {
      if (refreshOnFocus) void safeRefresh();
    };

    const onVisibilityChange = () => {
      if (!refreshOnVisible) return;
      if (document.visibilityState === "visible") void safeRefresh();
    };

    if (enabled) {
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      isMountedRef.current = false;

      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }

      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // Nota: dependências aqui são as opções (não o refreshFn, que é ref).
  }, [enabled, intervalMs, refreshOnFocus, refreshOnVisible, runOnMount]);
}
