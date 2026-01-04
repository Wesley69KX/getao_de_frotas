const CACHE_NAME = 'frota-bloqueio-offline-v2'; // Mudei versão para forçar limpeza
const OFFLINE_URL = './offline.html';

// 1. Instalação: Salva APENAS a tela de erro
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando apenas tela de erro');
      return cache.add(new Request(OFFLINE_URL, {cache: 'reload'}));
    })
  );
});

// 2. Ativação: DESTRÓI o App antigo do celular
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Apagando cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Busca: Tenta Internet -> Se falhar, mostra Offline.html
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(OFFLINE_URL);
        })
    );
  }
});
