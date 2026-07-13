import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const clearDevelopmentServiceWorkers = async () => {
  if (!import.meta.env.DEV || !("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  const hadServiceWorker =
    registrations.length > 0 || Boolean(navigator.serviceWorker.controller);

  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }

  if (hadServiceWorker && !sessionStorage.getItem("dev-sw-cleared")) {
    sessionStorage.setItem("dev-sw-cleared", "true");
    window.location.reload();
    await new Promise(() => undefined);
  }
};

const startApp = async () => {
  await clearDevelopmentServiceWorkers();

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

  if (!import.meta.env.PROD) return;

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_, registration) {
      if (!registration) return;
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "activated") {
            window.dispatchEvent(new Event("sw-activated"));
          }
        });
      });
    },
    onRegisterError(error) {
      console.error("Service worker registration failed:", error);
    },
  });

  window.addEventListener("sw-update", () => {
    updateSW(true);
  });
};

void startApp();
