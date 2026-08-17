# SERVICE_WORKER.md

Spécification normative du service worker. Toute modification de `src/pwa/sw.ts` doit relire ce document.

Le service worker est le composant le plus coûteux à déboguer en production d'une PWA, parce qu'une erreur y persiste sur les appareils des utilisateurs bien après le correctif. Les règles ci-dessous existent pour rendre ce cas impossible.

## 1. Cadre général

- Écrit en TypeScript, compilé par Vite en tant qu'entrée séparée, sortie `sw.js` à la racine du domaine.
- Portée `/`. Le fichier doit être servi depuis la racine, jamais depuis `/assets/`.
- **Pas de Workbox.** La logique est courte et explicite. Une dépendance de plus ici ajoute une couche de comportement implicite exactement là où l'implicite coûte cher.
- Aucun appel à `skipWaiting()` automatique. Voir section 6.

## 2. Nommage et versionnement des caches

```ts
// Injecte au build par Vite: define: { __BUILD_ID__: JSON.stringify(buildId) }
declare const __BUILD_ID__: string;

const CACHE_PREFIX = 'meteo-fr';

const CACHES = {
  shell:  `${CACHE_PREFIX}-shell-${__BUILD_ID__}`,
  assets: `${CACHE_PREFIX}-assets-${__BUILD_ID__}`,
  tiles:  `${CACHE_PREFIX}-tiles-v1`,   // versionne a la main, survit aux deploiements
} as const;

const ALL_CURRENT = new Set<string>(Object.values(CACHES));
```

`__BUILD_ID__` est un horodatage de build ou un hash de commit. Deux déploiements ne produisent jamais le même identifiant. C'est ce qui garantit qu'un nouveau déploiement invalide bien l'ancien shell.

Le cache `tiles` est délibérément hors du versionnement de build : les tuiles de carte ne changent pas d'un déploiement à l'autre et les re-télécharger serait un gaspillage de bande passante chez l'utilisateur.

## 3. Précaches à l'installation

```ts
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
```

Les bundles JS et CSS hashés sont ajoutés au manifeste de précache par un plugin Vite au build, pas listés à la main.

```ts
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(CACHES.shell);
      // addAll est atomique: un seul echec annule tout le precache.
      // C'est le comportement voulu, un shell partiel est pire que pas de shell.
      await shell.addAll(PRECACHE_SHELL);
      await shell.addAll(BUILD_MANIFEST_ASSETS);
      // Pas de skipWaiting ici.
    })(),
  );
});
```

## 4. Activation et purge

```ts
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(CACHE_PREFIX) && !ALL_CURRENT.has(n))
          .map((n) => caches.delete(n)),
      );
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});
```

La purge ne supprime que les caches préfixés `meteo-fr`. Ne jamais itérer et supprimer aveuglément tous les caches du domaine.

## 5. Table de routage

Le gestionnaire `fetch` applique la première règle qui correspond, dans cet ordre.

| # | Correspondance | Stratégie | Cache | Notes |
|---|---|---|---|---|
| 1 | `request.method !== 'GET'` | passer au réseau, aucune interception | aucun | |
| 2 | `request.mode === 'navigate'` | réseau d'abord, avec `preloadResponse`, repli `/index.html` du shell, puis `/offline.html` | `shell` | |
| 3 | même origine, `/assets/` | cache d'abord | `assets` | fichiers hashés, immuables |
| 4 | même origine, `/fonts/`, `/icons/`, `/data/` | cache d'abord | `shell` | |
| 5 | hôte `api.open-meteo.com` | **aucune interception** | aucun | voir section 7 |
| 6 | hôte `geocoding-api.open-meteo.com` | aucune interception | aucun | |
| 7 | hôte de tuiles carte ou radar | cache d'abord avec expiration | `tiles` | plafond 300 entrées, 15 min pour le radar |
| 8 | tout le reste | réseau, sans repli | aucun | |

Squelette :

```ts
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(request, CACHES.assets));
      return;
    }
    if (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))) {
      event.respondWith(cacheFirst(request, CACHES.shell));
      return;
    }
    return;
  }
  if (API_HOSTS.has(url.hostname)) return;      // laisse passer, cf. section 7
  if (TILE_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirstWithExpiry(request, CACHES.tiles, TILE_TTL_MS));
    return;
  }
});
```

Navigation :

```ts
async function handleNavigate(event: FetchEvent): Promise<Response> {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded as Response;
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
```

## 6. Cycle de mise à jour

Le SW ne se substitue jamais à lui-même sans que l'utilisateur le sache. Une mise à jour silencieuse en cours de consultation peut remplacer le bundle JS pendant qu'un import dynamique est en vol, ce qui produit un écran blanc inexplicable.

Protocole, côté page :

1. `navigator.serviceWorker.register('/sw.js')` au chargement.
2. Écouter `updatefound`, puis l'état `installed` du nouveau worker avec un `controller` déjà présent.
3. Afficher un bandeau discret : « Une nouvelle version est disponible. » avec l'action « Actualiser ».
4. Au clic, envoyer `postMessage({ type: 'SKIP_WAITING' })` au worker en attente.
5. Sur `controllerchange`, recharger la page **une seule fois**, protégé par un drapeau, sinon boucle de rechargement infinie.

```ts
// sw.ts
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
```

```ts
// install.ts, extrait
let reloading = false;
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (reloading) return;
  reloading = true;
  window.location.reload();
});
```

Vérification périodique : appeler `registration.update()` au retour au premier plan (`visibilitychange`), au maximum une fois par heure.

## 7. Pourquoi le SW n'intercepte pas les appels d'API

Le cache des prévisions vit dans IndexedDB, géré par `data/cache/`, pas dans le service worker. Ce choix est délibéré.

- Le TTL des prévisions dépend de la logique métier (heure de mise à jour des modèles, `forceRefresh` demandé par l'utilisateur). Cette logique ne doit pas être dupliquée dans le SW.
- L'UI a besoin de savoir si une donnée vient du cache et si elle est périmée, pour afficher l'horodatage. Un cache dans le SW rend cette information invisible depuis la page.
- La déduplication de requêtes concurrentes est déjà faite par `data/queue.ts`.

Conséquence à assumer : hors ligne, ce n'est pas le SW qui sert la prévision, c'est le repository depuis IndexedDB. Le SW ne garantit que le chargement de l'application elle-même. Cette séparation doit rester nette, et l'agent ne doit pas « améliorer » le SW en y ajoutant un cache d'API.

## 8. Gestion du quota de stockage

```ts
export async function ensureStorageHeadroom(): Promise<void> {
  if (!navigator.storage?.estimate) return;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  if (quota > 0 && usage / quota > 0.8) {
    await trimTileCache(150);        // reduit le cache de tuiles
    await pruneExpiredForecasts();   // IndexedDB
  }
}
```

Appelé au démarrage de l'application et après chaque écriture importante.

Persistance : demander `navigator.storage.persist()` une seule fois, après que l'utilisateur a enregistré son premier favori. Demander à froid au premier chargement est refusé par la plupart des navigateurs et gaspille l'unique occasion.

## 9. Notifications, amélioration progressive

Les notifications sont une **amélioration progressive**, jamais une promesse de l'interface tant que le support n'est pas vérifié.

```ts
export type PushSupport = 'full' | 'foreground-only' | 'none';

export function detectPushSupport(): PushSupport;
```

- `full` : `Notification`, `PushManager` et `serviceWorker` disponibles, et permission accordable. Cas Chrome et Firefox sur Android et bureau.
- `foreground-only` : les règles d'alerte sont évaluées à l'ouverture de l'application et affichées en bandeau. Cas iOS et Safari en général, et tout navigateur ayant refusé la permission.
- `none` : la section des alertes est masquée.

Le texte de l'interface doit refléter le mode réel. En `foreground-only`, l'intitulé est « Alertes à l'ouverture » et non « Notifications », et un texte d'aide explique que l'appareil ne permet pas les alertes en arrière-plan. Promettre une notification qui n'arrivera jamais est le pire défaut possible pour une application météo.

Gestionnaires côté SW, uniquement si `full` :

```ts
self.addEventListener('push', (event) => { /* ... */ });
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(focusOrOpen('/'));
});
```

## 10. Manifeste

`public/manifest.webmanifest` :

```json
{
  "name": "Releve, prevision multi-modeles",
  "short_name": "Releve",
  "description": "Previsions pour la France metropolitaine, avec le modele et la confiance affiches.",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#E9EDEA",
  "theme_color": "#16232B",
  "lang": "fr",
  "dir": "ltr",
  "categories": ["weather", "utilities"],
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Ma position", "url": "/?geo=1" },
    { "name": "Comparer les modeles", "url": "/?view=compare" }
  ]
}
```

`background_color` doit correspondre exactement à `--papier` en mode clair, sinon un flash apparaît au lancement.

## 11. Développement local

- Le SW est désactivé en mode `dev` (`import.meta.env.DEV`), sauf si `VITE_SW=1`. Un SW actif en développement masque les modifications et fait perdre un temps considérable.
- Une commande `npm run sw:reset` désenregistre le SW et vide tous les caches préfixés.
- Documenter dans le README : en cas de comportement inexplicable, « Application » puis « Unregister » dans les outils de développement avant toute autre investigation.

## 12. Pièges à éviter, explicitement

1. Ne pas mettre en cache les réponses opaques (`response.type === 'opaque'`) sans plafond : elles comptent pour plusieurs mégaoctets dans le quota quelle que soit leur taille réelle.
2. Ne jamais mettre en cache une réponse dont `response.ok` est faux.
3. Toujours `response.clone()` avant `cache.put()`, un flux ne se lit qu'une fois.
4. Ne pas appeler `event.respondWith()` de façon conditionnelle après un `await` : la décision d'intercepter doit être synchrone.
5. Ne pas intercepter les requêtes `chrome-extension:` ni les schémas non `http`.
6. Ne pas supposer que `caches.match()` retourne rapidement, c'est asynchrone et peut être lent sur un stockage saturé.
7. Ne pas versionner le cache de tuiles sur le build, cela vide la carte à chaque déploiement.

## 13. Vérifications avant mise en production

- [ ] Deux déploiements successifs, l'ancien cache est bien purgé, aucun asset orphelin.
- [ ] Le bandeau de mise à jour apparaît, le rechargement se fait une seule fois.
- [ ] Mode avion : l'application se lance, affiche le contenu et l'horodatage.
- [ ] Premier chargement hors ligne d'un appareil neuf : `offline.html` s'affiche correctement.
- [ ] Lighthouse déclare l'application installable.
- [ ] Purge de stockage sous quota saturé, testée manuellement.
- [ ] Sur iOS, la section d'alertes affiche bien le mode « à l'ouverture » et non une promesse de notification.
