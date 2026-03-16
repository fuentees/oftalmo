/* eslint-disable no-restricted-globals */
// Kill-switch para service workers legados de versões antigas do app.
// Objetivo: desregistrar qualquer SW antigo e forçar clientes para versão atual.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await self.registration.unregister();
      } catch {
        // best effort
      }
      try {
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        clients.forEach((client) => client.navigate(client.url));
      } catch {
        // best effort
      }
    })()
  );
});
