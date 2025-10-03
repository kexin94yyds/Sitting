// Service Worker for 久坐提醒 PWA (Instant DB 版本)
const CACHE_NAME = 'sit-reminder-instantdb-v2';
const urlsToCache = [
  '.',
  './index.html',
  './manifest.json'
];

// 安装事件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// 激活事件
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 推送事件
self.addEventListener('push', event => {
  let data = {};
  
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error('解析推送数据失败:', e);
  }

  const title = data.title || '久坐提醒';
  const body = data.body || '到了该休息的时间';
  const icon = data.icon || '/icon-192.png';
  const badge = data.badge || '/icon-192.png';

  const options = {
    body: body,
    icon: icon,
    badge: badge,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    actions: [
      {
        action: 'restart',
        title: '重新开始',
        icon: '/icon-192.png'
      },
      {
        action: 'dismiss',
        title: '知道了',
        icon: '/icon-192.png'
      }
    ],
    tag: 'sit-reminder',
    renotify: true,
    data: {
      reminderId: data.reminderId,
      reminderTime: data.reminderTime
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 通知点击事件
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'restart') {
    // 重新开始计时
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          const url = new URL('/', self.location.origin).toString();
          
          for (const client of clientList) {
            if (client.url === url) {
              client.focus();
              client.postMessage({ type: 'RESTART_TIMER' });
              return;
            }
          }
          
          return clients.openWindow('/');
        })
    );
  } else if (event.action === 'dismiss') {
    // 用户点击了"知道了"
    console.log('用户确认了提醒');
    
    // 通知主页面更新状态
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          for (const client of clientList) {
            client.postMessage({ 
              type: 'REMINDER_DISMISSED',
              reminderId: event.notification.data?.reminderId
            });
          }
        })
    );
  } else {
    // 点击通知本身
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          const url = new URL('/', self.location.origin).toString();
          
          for (const client of clientList) {
            if (client.url === url) {
              client.focus();
              client.postMessage({ 
                type: 'REMINDER',
                reminderId: event.notification.data?.reminderId
              });
              return;
            }
          }
          
          return clients.openWindow('/');
        })
    );
  }
});

// 后台同步（如果支持）
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // 这里可以添加后台同步逻辑
      console.log('后台同步触发')
    );
  }
});

// 消息事件
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 网络请求拦截
self.addEventListener('fetch', event => {
  // 对于HTML文件，优先从网络获取，确保获取最新版本
  if (event.request.url.includes('.html') || event.request.url.endsWith('/')) {
    event.respondWith(
      fetch(event.request).then(response => {
        // 如果网络请求成功，更新缓存
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // 网络失败时返回缓存版本
        return caches.match(event.request);
      })
    );
  } else {
    // 其他资源使用缓存优先策略
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          // 如果缓存中有，返回缓存版本
          if (response) {
            return response;
          }
          
          // 否则从网络获取
          return fetch(event.request);
        })
    );
  }
});

// 定期检查提醒（作为备用方案）
setInterval(async () => {
  try {
    // 这里可以添加定期检查逻辑
    // 由于 Instant DB 是实时数据库，通常不需要定期检查
    console.log('定期检查提醒...');
  } catch (error) {
    console.error('定期检查失败:', error);
  }
}, 60000); // 每分钟检查一次




