var CACHE_NAME = 'keryx-v1';
var STATIC_ASSETS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-icon-512.png',
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  var request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  if (request.url.includes('/api/')) {
    return;
  }

  if (request.destination === 'image' || request.url.match(/\.(png|jpg|jpeg|svg|ico|webp)$/)) {
    event.respondWith(
      caches.match(request).then(function(cached) {
        if (cached) {
          return cached;
        }
        return fetch(request).then(function(response) {
          if (response.ok) {
            var responseClone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(request, responseClone);
            });
          }
          return response;
        }).catch(function() {
          return new Response('', { status: 404 });
        });
      })
    );
    return;
  }

  if (request.url.match(/\.(js|css|woff2?)$/)) {
    event.respondWith(
      fetch(request).then(function(response) {
        if (response.ok) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(request, responseClone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(request).then(function(cached) {
          return cached || new Response('', { status: 404 });
        });
      })
    );
    return;
  }
});

self.addEventListener('push', function(event) {
  if (!event.data) {
    return;
  }

  var payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {
      title: 'Keryx',
      body: event.data.text(),
    };
  }

  var options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-72.png',
    tag: payload.tag || 'keryx-notification',
    data: payload.data || {},
    actions: payload.actions || [],
    requireInteraction: payload.requireInteraction || false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Keryx', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var action = event.action;
  var data = event.notification.data || {};
  var urlToOpen = data.url || '/dashboard';

  if (action === 'dismiss' || action === 'later') {
    return;
  }

  if (action === 'view' || action === 'review') {
    urlToOpen = data.url || '/dashboard';
  }

  var isExternal = urlToOpen.startsWith('http://') || urlToOpen.startsWith('https://');

  if (isExternal) {
    event.waitUntil(clients.openWindow(urlToOpen));
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('notificationclose', function(event) {
});
