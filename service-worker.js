const CACHE_NAME = 'frota-offline-page-v4'; // Mudei a versão para forçar atualização
const OFFLINE_URL = './offline.html';

// 1. Instalação: Guarda APENAS a tela de offline no cache
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Ativa imediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando tela offline');
      return cache.add(new Request(OFFLINE_URL, {cache: 'reload'}));
    })
  );
});

// 2. Ativação: Limpa qualquer cache antigo (Remove o app "quebrado")
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Interceptação: Tenta Rede -> Falhou? -> Entrega Offline.html
self.addEventListener('fetch', (event) => {
  // Só nos importamos se for uma navegação (abrir página)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // SE A INTERNET FALHAR, MOSTRA A TELA BONITA
          return caches.match(OFFLINE_URL);
        })
    );
  }
});
