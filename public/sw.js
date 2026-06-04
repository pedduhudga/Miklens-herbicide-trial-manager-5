const CACHE_NAME = 'herbicide-app-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/react_app.html',
    'https://cdn.tailwindcss.com',
    'https://cdn.tailwindcss.com/',
    'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.12/cropper.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.12/cropper.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js',
    'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
    'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
    'https://cdn.jsdelivr.net/npm/jstat@1.9.6/dist/jstat.min.js',
    'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.min.js',
    'https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js',
    'https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

async function cacheAsset(cache, asset) {
    try {
        const request = asset.startsWith('http')
            ? new Request(asset, { mode: 'no-cors' })
            : new Request(asset);
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
            await cache.put(asset, response.clone());
        } else {
            console.warn('[Service Worker] Asset fetch failed:', asset, response.status, response.statusText);
        }
    } catch (err) {
        console.warn('[Service Worker] Asset install error:', asset, err.message || err);
    }
}

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            for (const asset of ASSETS) {
                await cacheAsset(cache, asset);
            }
        })
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    const requestUrl = new URL(e.request.url);
    if (!['http:', 'https:'].includes(requestUrl.protocol)) return;

    e.respondWith(
        caches.match(e.request).then((response) => {
            if (response) return response;
            return fetch(e.request).then((fetchRes) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    if (fetchRes && (fetchRes.ok || fetchRes.type === 'opaque')) {
                        cache.put(e.request, fetchRes.clone()).catch((err) => {
                            console.warn('[Service Worker] Cache put failed:', e.request.url, err.message || err);
                        });
                    }
                    return fetchRes;
                });
            });
        }).catch(() => {
            console.log('[Service Worker] Fetch failed, returning offline fallback if available');
        })
    );
});
