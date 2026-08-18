import { CACHE_PREFIX, TILE_CACHE_MAX_ENTRIES, TILE_TTL_MS, TILES_CACHE_NAME } from './cacheNames';

// Redeclare le global `self` avec le type specifique au service worker : le
// lib "WebWorker" de tsconfig.sw.json le type par defaut en scope generique.
declare const self: ServiceWorkerGlobalScope;

// Injectes au build par le plugin Vite dedie (vite.config.ts), voir
// SERVICE_WORKER.md section 2 et 3.
declare const __BUILD_ID__: string;
declare const __BUILD_MANIFEST_ASSETS__: readonly string[];

const CACHES = {
  shell: `${CACHE_PREFIX}-shell-${__BUILD_ID__}`,
  assets: `${CACHE_PREFIX}-assets-${__BUILD_ID__}`,
  tiles: TILES_CACHE_NAME,
} as const;

const ALL_CURRENT = new Set<string>(Object.values(CACHES));

const PRECACHE_SHELL: readonly string[] = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/fonts/plex-sans-400.woff2',
  '/fonts/plex-sans-600.woff2',
  '/fonts/plex-sans-condensed-600.woff2',
  '/fonts/plex-mono-400.woff2',
  '/data/coastline-fr.json',
];

const STATIC_PREFIXES = ['/fonts/', '/icons/', '/data/'];

const API_HOSTS = new Set(['api.open-meteo.com', 'geocoding-api.open-meteo.com']);

// Vide au lot 3, peuple au lot 6 : fond de carte OpenStreetMap et overlay
// radar RainViewer (data/clients/rainviewer.ts construit les URLs de
// tuiles sur cet hote). La regle de routage existait deja au lot 3, seul
// cet ensemble change ici.
const TILE_HOSTS = new Set(['tile.openstreetmap.org', 'tilecache.rainviewer.com']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(CACHES.shell);
      // addAll est atomique : un seul echec annule tout le precache, un
      // shell partiel est pire que pas de shell (SERVICE_WORKER.md 3).
      await shell.addAll([...PRECACHE_SHELL, ...__BUILD_MANIFEST_ASSETS__]);
      // Pas de skipWaiting ici : voir le protocole de mise a jour, section 6.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      // Ne purge que les caches prefixes meteo-fr, jamais tout le domaine.
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && !ALL_CURRENT.has(name))
          .map((name) => caches.delete(name)),
      );
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached !== undefined) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

/** Piege 1 (section 12) : garde une borne sur les entrees, y compris opaques. */
async function trimCache(cacheName: string, maxEntries: number): Promise<void> {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i += 1) {
    const key = keys[i];
    if (key !== undefined) {
      await cache.delete(key);
    }
  }
}

const CACHED_AT_HEADER = 'x-meteo-fr-cached-at';

async function cacheFirstWithExpiry(
  request: Request,
  cacheName: string,
  ttlMs: number,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached !== undefined) {
    const cachedAt = Number(cached.headers.get(CACHED_AT_HEADER) ?? 0);
    if (Date.now() - cachedAt < ttlMs) {
      return cached;
    }
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      const toStore = response.clone();
      const stamped = new Response(toStore.body, {
        status: toStore.status,
        statusText: toStore.statusText,
        headers: new Headers(toStore.headers),
      });
      stamped.headers.set(CACHED_AT_HEADER, String(Date.now()));
      await cache.put(request, stamped);
      await trimCache(cacheName, TILE_CACHE_MAX_ENTRIES);
    } else if (response.type === 'opaque') {
      // Reponse opaque (cross-origine sans CORS) : status vaut toujours 0
      // et les en-tetes sont illisibles. Construire une Response avec
      // status: 0 leve une RangeError (200-599 exiges), ce qui faisait
      // echouer silencieusement toute tuile passant par cette branche
      // avant ce correctif. Sans horodatage possible a y accrocher, elle
      // est mise en cache telle quelle, sans suivi de fraicheur : repli
      // pour un hote de tuiles futur sans CORS. Les deux hotes actuels
      // (OSM, RainViewer) envoient tous deux Access-Control-Allow-Origin,
      // et RadarMap.tsx force crossOrigin sur les calques Leaflet : cette
      // branche n'est donc pas exercee en pratique aujourd'hui (piege 1).
      await cache.put(request, response.clone());
      await trimCache(cacheName, TILE_CACHE_MAX_ENTRIES);
    }
    return response;
  } catch (error) {
    // Hors ligne : une tuile perimee reste utilisable, plutot que rien du
    // tout (BACKLOG.md Lot 6, "la carte fonctionne hors ligne sur les
    // tuiles deja visitees"). Sans ce repli, une tuile visitee il y a plus
    // de TILE_TTL_MS echouait purement et simplement des que le reseau
    // manquait, ce que rien avant le Lot 6 n'avait pu exercer (TILE_HOSTS
    // etait vide jusqu'ici).
    if (cached !== undefined) {
      return cached;
    }
    throw error;
  }
}

async function handleNavigate(event: FetchEvent): Promise<Response> {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) {
      return preloaded as Response;
    }
    return await fetch(event.request);
  } catch {
    const shell = await caches.open(CACHES.shell);
    return (
      (await shell.match('/index.html')) ??
      (await shell.match('/offline.html')) ??
      new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Regle 1 : jamais d'interception hors GET.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  // Piege 5 : ne pas intercepter chrome-extension: ni les schemas non http.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Regle 2.
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  if (url.origin === self.location.origin) {
    // Regle 3.
    if (url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(request, CACHES.assets));
      return;
    }
    // Regle 4.
    if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
      event.respondWith(cacheFirst(request, CACHES.shell));
      return;
    }
    // Regle 8 : reste meme origine non liste, reseau sans repli.
    return;
  }

  // Regles 5 et 6 : aucune interception des API, voir SERVICE_WORKER.md 7.
  if (API_HOSTS.has(url.hostname)) {
    return;
  }
  // Regle 7.
  if (TILE_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirstWithExpiry(request, CACHES.tiles, TILE_TTL_MS));
    return;
  }
  // Regle 8 : tout le reste, reseau sans repli.
});
