import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

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
