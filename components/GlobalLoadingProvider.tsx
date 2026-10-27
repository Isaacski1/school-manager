import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Global loading state shared across the whole application.
 *
 * The compact indicator is rendered once in the top-right of the viewport by
 * the provider. Any module (data service, fetch wrapper, etc.) can call the
 * exported helpers to start/stop an active fetch without knowing which
 * component is rendering the indicator.
 */

type GlobalLoadingContextValue = {
  active: boolean;
  start: () => void;
  stop: () => void;
  /** Tell the fetch wrapper the initial page load is complete so it stops
   *  re-triggering the indicator on background polling/refresh cycles. */
  setReady: (ready: boolean) => void;
};

const GlobalLoadingContext =
  createContext<GlobalLoadingContextValue | null>(null);

export const useGlobalLoading = (): GlobalLoadingContextValue => {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) {
    throw new Error(
      "useGlobalLoading must be rendered inside a GlobalLoadingProvider",
    );
  }
  return ctx;
};

export const GlobalLoadingProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [active, setActive] = useState(false);
  const [ready, setReadyState] = useState(false);

  const start = useCallback(() => setActive(true), []);
  const stop = useCallback(() => setActive(false), []);

  const setReady = useCallback((next: boolean) => {
    setReadyState(next);
    // When the app reports the initial load is done, make sure any lingering
    // indicator from the initial load is cleared.
    if (next) setActive(false);
  }, []);

  const value = useMemo(
    () => ({ active, start, stop, ready, setReady }),
    [active, ready, start, stop, setReady],
  );

  // Install the global fetch wrapper exactly once so every in-flight network
  // request (Admin, Teacher, Parent, Super Admin) toggles the same indicator
  // during the initial load phase.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let mounted = true;

    import("../services/globalFetch")
      .then(({ installGlobalFetchWrapper, setGlobalFetchSetter, setReady }) => {
        if (!mounted) return;
        setGlobalFetchSetter((v: { active: boolean }) => setActive(v.active));
        setReady(ready);
        cleanup = installGlobalFetchWrapper();
      })
      .catch((err) =>
        console.error("Failed to install global fetch wrapper", err),
      );

    return () => {
      mounted = false;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the fetch wrapper's ready gate in sync with the provider state.
  useEffect(() => {
    import("../services/globalFetch")
      .then(({ setReady }) => setReady(ready))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
    </GlobalLoadingContext.Provider>
  );
};

export default GlobalLoadingProvider;