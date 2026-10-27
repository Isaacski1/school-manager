/**
 * Global fetch wrapper.
 *
 * Wraps the browser's `fetch` so that any in-flight network request toggles the
 * shared global loading indicator. This is role- and route-agnostic: Admin,
 * Teacher, Parent and Super Admin pages all share the same fetch, so the
 * indicator is consistent across every module without each page wiring it up.
 *
 * Lifecycle rules (to avoid the indicator persisting or re-triggering):
 *   - The indicator only appears after a short grace period (200 ms) so fast
 *     local/cached responses never flash it.
 *   - It is hidden as soon as the LAST outstanding request settles, with a
 *     tiny 150 ms debounce so rapid back-to-back requests don't flicker.
 *   - Every request is tracked with a `finally`-style settle, so a hung or
 *     aborted request can never leave the counter stuck above zero.
 *   - A hard safety cap (30 s) forces the indicator off even if something
 *     goes wrong upstream.
 *   - Once the app reports the initial load is "ready", the wrapper stops
 *     driving the indicator so background polling/refresh cycles never
 *     re-trigger it.
 */

let activeRequests = 0;
let showTimer: number | null = null;
let hideTimer: number | null = null;
let safetyTimer: number | null = null;
const GRACE_MS = 200;
const HIDE_DEBOUNCE_MS = 150;
const SAFETY_CAP_MS = 30_000;

let setter: ((v: { active: boolean }) => void) | null = null;
let ready = false;

export const setGlobalFetchSetter = (
  s: ((v: { active: boolean }) => void) | null,
) => {
  setter = s;
};

export const setReady = (next: boolean) => {
  ready = next;
  // When the app reports the initial load is done, clear any lingering
  // indicator so background polling doesn't keep it visible.
  if (ready) {
    activeRequests = 0;
    clearTimer({ current: showTimer });
    if (safetyTimer !== null) {
      window.clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    clearTimer({ current: hideTimer });
    setter?.({ active: false });
  }
};

const clearTimer = (ref: { current: number | null }) => {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
};

const show = () => {
  // During the initial load phase the wrapper drives the indicator. Once the
  // app is "ready", background fetches (polling, refresh cycles) must NOT
  // re-trigger it.
  if (ready) return;

  clearTimer({ current: showTimer });
  clearTimer({ current: hideTimer });
  if (safetyTimer !== null) return; // already shown
  showTimer = window.setTimeout(() => {
    showTimer = null;
    if (activeRequests > 0) {
      setter?.({ active: true });
      // Hard safety cap: never leave the indicator on forever.
      safetyTimer = window.setTimeout(() => {
        safetyTimer = null;
        setter?.({ active: false });
      }, SAFETY_CAP_MS);
    }
  }, GRACE_MS);
};

const hide = () => {
  clearTimer({ current: showTimer });
  if (safetyTimer !== null) {
    window.clearTimeout(safetyTimer);
    safetyTimer = null;
  }
  clearTimer({ current: hideTimer });
  hideTimer = window.setTimeout(() => {
    hideTimer = null;
    setter?.({ active: false });
  }, HIDE_DEBOUNCE_MS);
};

const settle = () => {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests === 0) {
    hide();
  }
};

export const installGlobalFetchWrapper = (): (() => void) | undefined => {
  if (typeof window === "undefined") return;
  if ((window as any).__globalFetchInstalled) return;
  (window as any).__globalFetchInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    activeRequests += 1;
    show();

    let settled = false;
    const onSettle = () => {
      if (settled) return;
      settled = true;
      settle();
    };

    try {
      const promise = originalFetch(input, init);
      promise.then(onSettle, onSettle);
      // If the request is aborted (e.g. AbortController), still settle.
      if (init?.signal) {
        init.signal.addEventListener("abort", onSettle, { once: true });
      }
      return promise;
    } catch (err) {
      onSettle();
      throw err;
    }
  }) as typeof window.fetch;

  return () => {
    window.fetch = originalFetch;
  };
};

export default installGlobalFetchWrapper;