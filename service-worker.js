const CACHE_NAME = 'gestao-torres-v6-offline'; // Mudei versão para forçar atualização

// Arquivos OBRIGATÓRIOS para o app funcionar
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './offline.html',
  './style.css',
  './app.js',
  './manifest.json',
  
  // Bibliotecas
  'https://fonts.googleapis.com/icon?family=Material+Icons',
  'https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.0/firebase-firestore.js',
  'https://cdn.jsdelivr.net/npm/idb@7/build/umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js'
];

// 1. INSTALAÇÃO: Baixa tudo imediatamente
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Força o SW a ativar imediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Baixando arquivos vitais...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. ATIVAÇÃO: Limpa caches velhos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim(); // Assume controle da página imediatamente
});

// 3. FETCH: Intercepta requisições
self.addEventListener('fetch', (event) => {
  // Se for requisição para API (Firestore), deixa passar direto
  if (event.request.url.includes('firestore.googleapis.com') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Se tem no cache, entrega rápido (Cache First)
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Se não tem, tenta buscar na internet
      return fetch(event.request).catch(() => {
        // 3. Se falhar a internet E for uma página HTML, entrega o offline.html
        if (event.request.mode === 'navigate') {
          return caches.match('./offline.html');
        }
      });
    })
  );
});
