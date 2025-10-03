// Root service worker for PWA install + Web Push
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

// Web Push: 在后台由 SW 弹出系统通知（iOS PWA 需要）
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || '久坐提醒';
  const body = data.body || '到了该休息的时间';
  const icon = data.icon || '/icon-192.png';
  const badge = data.badge || '/icon-192.png';
  const options = {
    body,
    icon,
    badge,
    requireInteraction: true,
    tag: 'sit-reminder',
    renotify: false,
    vibrate: [300, 120, 300, 120, 600]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const targetUrl = new URL('/', self.location.origin).toString();
      for (const client of list) {
        if (client.url === targetUrl) { client.focus(); return; }
      }
      return clients.openWindow('/');
    })
  );
});

