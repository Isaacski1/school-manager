const measurementId = String(
  import.meta.env.VITE_GA_MEASUREMENT_ID || "G-G0RTW77NM6",
).trim();

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export const trackPageView = (path: string) => {
  if (!import.meta.env.PROD || !measurementId || !window.gtag) return;

  window.gtag("event", "page_view", {
    page_path: path,
    page_location: `${window.location.origin}${window.location.pathname}#${path}`,
    page_title: document.title,
  });
};
