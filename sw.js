// Minimal root service worker for PWA install
const CACHE = 'sit-reminder-root-v2';
const ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // 对于HTML文件，优先从网络获取，确保获取最新版本
  if (e.request.url.includes('.html') || e.request.url.endsWith('/')) {
    e.respondWith(
      fetch(e.request).then(response => {
        // 如果网络请求成功，更新缓存
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE).then(cache => {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // 网络失败时返回缓存版本
        return caches.match(e.request);
      })
    );
  } else {
    // 其他资源使用缓存优先策略
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});

