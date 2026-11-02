/* SmartPOS Service Worker */
const CACHE_VERSION = 'smartpos-v1.0.4';
const RUNTIME_CACHE = 'smartpos-runtime-v1.0.4';
const API_CACHE = 'smartpos-api-v1.0.4';

const APP_SHELL = [
    '/', '/index.html', '/style.css', '/mobile.css', '/manifest.json',
    '/api.js', '/script.js', '/settings.js', '/employees.js', '/analytics.js',
    '/backup.js', '/labels.js', '/import.js', '/returns.js', '/sounds.js', '/pwa.js',
    '/icons/icon-192.svg', '/icons/icon-512.svg', '/icons/icon-maskable.svg',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

const CACHEABLE_API = [
    '/api/products', '/api/companies', '/api/employees',
    '/api/reports/report', '/api/reports/monthly', '/api/reports/yearly'
];

self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_VERSION).then(cache => {
            return cache.addAll(APP_SHELL.map(url => new Request(url, { credentials: 'omit' })))
                .catch(err => console.warn('[SW] Some files failed:', err));
        }).then(() => {
            console.log('[SW] Installed');
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => !key.includes('v1.0.4'))
                .map(key => { console.log('[SW] Deleting old:', key); return caches.delete(key); })
        )).then(() => {
            console.log('[SW] Activated');
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET') return;
    if (!url.protocol.startsWith('http')) return;
    if (url.pathname.includes('/api/auth/')) return;

    if (url.pathname.startsWith('/api/')) {
        const isCacheable = CACHEABLE_API.some(path => url.pathname.startsWith(path));
        if (isCacheable) {
            event.respondWith(
                fetch(request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(API_CACHE).then(cache => cache.put(request, clone));
                    }
                    return response;
                }).catch(() => {
                    return caches.match(request).then(cached => cached || 
                        new Response(JSON.stringify({ error: 'Offline' }), {
                            status: 503, headers: { 'Content-Type': 'application/json' }
                        }));
                })
            );
        }
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) {
                fetch(request).then(response => {
                    if (response.ok) caches.open(CACHE_VERSION).then(cache => cache.put(request, response));
                }).catch(() => {});
                return cached;
            }
            return fetch(request).then(response => {
                if (response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch(err => {
                if (request.mode === 'navigate') return caches.match('/index.html');
                throw err;
            });
        })
    );
});

self.addEventListener('sync', event => {
    if (event.tag === 'sync-sales') event.waitUntil(syncQueuedSales());
});

async function syncQueuedSales() {
    const db = await openDB();
    const sales = await getAllFromStore(db, 'pendingSales');
    for (const sale of sales) {
        try {
            const response = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sale.token}` },
                body: JSON.stringify(sale.data)
            });
            if (response.ok) await deleteFromStore(db, 'pendingSales', sale.id);
        } catch (err) {}
    }
}

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('SmartPOSQueue', 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('pendingSales')) db.createObjectStore('pendingSales', { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function getAllFromStore(db, storeName) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

function deleteFromStore(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}
