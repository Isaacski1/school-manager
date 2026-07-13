const measurementId = String(
  import.meta.env.VITE_GA_MEASUREMENT_ID || "G-G0RTW77NM6",
).trim();

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export const initializeGoogleAnalytics = () => {
  if (!import.meta.env.PROD || !measurementId || typeof window === "undefined") {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
};

export const trackPageView = (path: string) => {
  if (!import.meta.env.PROD || !measurementId || !window.gtag) return;

  window.gtag("event", "page_view", {
    page_path: path,
    page_location: `${window.location.origin}${window.location.pathname}#${path}`,
    page_title: document.title,
  });
};
