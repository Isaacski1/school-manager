import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

interface SchoolManagerServiceWorkerGlobalScope
  extends ServiceWorkerGlobalScope {
  skipWaiting(): void;
  __WB_MANIFEST: Array<{
    revision: string | null;
    url: string;
  }>;
}

declare let self: SchoolManagerServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

// This line is replaced by the build process with the list of files to cache.
precacheAndRoute(self.__WB_MANIFEST);

cleanupOutdatedCaches();
