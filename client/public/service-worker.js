var CACHE_NAME = 'keryx-v2';
var SHARE_CACHE = 'keryx-share-v1';
var OFFLINE_QUEUE_KEY = 'keryx-offline-queue';

var STATIC_ASSETS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-icon-512.png',
];

// ─── IndexedDB helpers for offline queue ──────────────────────────────────────

function openDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('keryx-offline', 1);
    req.onupgradeneeded = function(e) {
      e.target.result.createObjectStore('queue', { autoIncrement: true });
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function enqueueRequest(db, entry) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('queue', 'readwrite');
    var req = tx.objectStore('queue').add(entry);
    req.onsuccess = function() { resolve(); };
    req.onerror = function() { reject(req.error); };
  });
}

function getAllQueued(db) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('queue', 'readonly');
    var req = tx.objectStore('queue').getAll();
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function getAllQueuedKeys(db) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('queue', 'readonly');
    var req = tx.objectStore('queue').getAllKeys();
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function deleteQueued(db, key) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('queue', 'readwrite');
    var req = tx.objectStore('queue').delete(key);
    req.onsuccess = function() { resolve(); };
    req.onerror = function() { reject(req.error); };
  });
}

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME && name !== SHARE_CACHE;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ─── Share Target Handler ──────────────────────────────────────────────────────

function handleShareTarget(event) {
  var responsePromise = event.request.formData().then(function(formData) {
    var file = formData.get('file');
    var title = formData.get('title') || '';
    var text = formData.get('text') || '';

    if (!file) {
      return Response.redirect('/share-import?error=no-file', 303);
    }

    return file.arrayBuffer().then(function(buffer) {
      return caches.open(SHARE_CACHE).then(function(cache) {
        var meta = JSON.stringify({
          name: file.name || 'shared-file',
          type: file.type || 'application/octet-stream',
          size: buffer.byteLength,
          title: title,
          text: text,
        });
        var response = new Response(buffer, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Share-Meta': meta,
          },
        });
        return cache.put('/share-pending-file', response);
      }).then(function() {
        return Response.redirect('/share-import', 303);
      });
    });
  }).catch(function() {
    return Response.redirect('/share-import?error=failed', 303);
  });

  event.respondWith(responsePromise);
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);

  // Handle Web Share Target
  if (url.pathname === '/share' && request.method === 'POST') {
    handleShareTarget(event);
    return;
  }

  if (request.method !== 'GET') {
    // Intercept POST to /api/log-entries for offline queuing
    if (request.method === 'POST' && url.pathname === '/api/log-entries') {
      event.respondWith(
        fetch(request.clone()).catch(function() {
          return request.clone().json().then(function(body) {
            return openDB().then(function(db) {
              return enqueueRequest(db, {
                url: request.url,
                method: request.method,
                body: JSON.stringify(body),
                headers: { 'Content-Type': 'application/json' },
                timestamp: Date.now(),
              });
            }).then(function() {
              if ('sync' in self.registration) {
                return self.registration.sync.register('keryx-sync-queue').catch(function() {});
              }
            }).then(function() {
              return new Response(JSON.stringify({ queued: true, offline: true }), {
                status: 202,
                headers: { 'Content-Type': 'application/json' },
              });
            });
          }).catch(function() {
            return new Response(JSON.stringify({ error: 'offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          });
        })
      );
    }
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

// ─── Background Sync ──────────────────────────────────────────────────────────

self.addEventListener('sync', function(event) {
  if (event.tag === 'keryx-sync-queue') {
    event.waitUntil(replayOfflineQueue());
  }
});

function replayOfflineQueue() {
  return openDB().then(function(db) {
    return Promise.all([getAllQueued(db), getAllQueuedKeys(db)]).then(function(results) {
      var items = results[0];
      var keys = results[1];
      return items.reduce(function(promise, item, index) {
        return promise.then(function() {
          return fetch(item.url, {
            method: item.method,
            body: item.body,
            headers: item.headers,
            credentials: 'include',
          }).then(function(response) {
            if (response.ok) {
              return deleteQueued(db, keys[index]);
            }
          }).catch(function() {});
        });
      }, Promise.resolve());
    });
  }).then(function() {
    return self.clients.matchAll().then(function(clients) {
      clients.forEach(function(client) {
        client.postMessage({ type: 'SYNC_COMPLETE' });
      });
    });
  });
}

// ─── Push Notifications ───────────────────────────────────────────────────────

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

