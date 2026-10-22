// Turni & Indennità – service worker v27
const CACHE_NAME = 'turni-cache-v27';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
// Librerie esterne con URL versionato: si scaricano una volta e restano in cache
const CDN = ['https://www.gstatic.com/firebasejs/', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/'];
const NET_TIMEOUT = 3500;

self.addEventListener('install', event => {
  // cache:'reload' evita di salvare una copia vecchia presa dalla cache HTTP del browser
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
  );
  // Non si attiva da solo: l'app mostra l'avviso "Aggiorna" e chiede SKIP_WAITING
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rete prima (versione più recente), ma se la rete non risponde entro 3,5 s
// usa la copia salvata: l'app si apre subito anche con segnale scarso.
function networkFirst(request, key) {
  return caches.open(CACHE_NAME).then(cache => {
    const net = fetch(request, { cache: 'no-store' }).then(resp => {
      if (resp && resp.ok) cache.put(key, resp.clone());
      return resp;
    });
    const timer = new Promise(res => setTimeout(() => res('timeout'), NET_TIMEOUT));
    return Promise.race([net.catch(() => null), timer]).then(r => {
      if (r && r !== 'timeout') return r;
      return cache.match(key).then(hit => hit || net);
    });
  });
}

function cacheFirst(request) {
  return caches.open(CACHE_NAME).then(cache =>
    cache.match(request).then(hit => hit || fetch(request).then(resp => {
      if (resp && (resp.ok || resp.type === 'opaque')) cache.put(request, resp.clone());
      return resp;
    }))
  );
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Pagina: una sola copia in cache, qualunque sia il ?query (es. ?nocache=...)
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) {
      event.respondWith(networkFirst(url.origin + url.pathname, './index.html'));
      return;
    }
    if (url.pathname.endsWith('/sw.js')) return;
    event.respondWith(networkFirst(req, url.origin + url.pathname));
    return;
  }
  if (CDN.some(p => req.url.startsWith(p))) {
    event.respondWith(cacheFirst(req));
  }
  // Tutto il resto (es. Firestore) passa direttamente in rete, senza cache
});
