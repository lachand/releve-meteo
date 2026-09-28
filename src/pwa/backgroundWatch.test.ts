import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WATCH_MIN_INTERVAL_MS,
  disableWatch,
  enableWatch,
  readWatchStatus,
  requestWatchRun,
} from './backgroundWatch';
import { WATCH_RUN_MESSAGE, WATCH_TAG } from './watchTags';

/*
 * Periodic Background Sync et les permissions n'existent pas dans jsdom :
 * chaque test installe le navigateur qu'il simule.
 */

type Permission = 'default' | 'granted' | 'denied';

interface FakeBrowser {
  permission: Permission;
  requested: Permission;
  syncState: 'granted' | 'prompt' | 'denied' | 'throws';
  tags: string[];
  registerFails: boolean;
  withSync: boolean;
  /** Service worker pas encore enregistre au premier appel (premiere visite). */
  lateRegistration: boolean;
}

const posted: unknown[] = [];
let browser: FakeBrowser;

function install(overrides: Partial<FakeBrowser> = {}) {
  browser = {
    permission: 'default',
    requested: 'granted',
    syncState: 'granted',
    tags: [],
    registerFails: false,
    withSync: true,
    lateRegistration: false,
    ...overrides,
  };
  const periodicSync = {
    register: vi.fn((tag: string, options: { minInterval: number }) => {
      if (browser.registerFails) {
        return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      }
      expect(options.minInterval).toBe(WATCH_MIN_INTERVAL_MS);
      browser.tags.push(tag);
      return Promise.resolve();
    }),
    unregister: vi.fn((tag: string) => {
      browser.tags = browser.tags.filter((t) => t !== tag);
      return Promise.resolve();
    }),
    getTags: vi.fn(() => Promise.resolve([...browser.tags])),
  };
  const registration = {
    active: { postMessage: (message: unknown) => posted.push(message) },
    ...(browser.withSync ? { periodicSync } : {}),
  };
  vi.stubGlobal('Notification', {
    get permission() {
      return browser.permission;
    },
    requestPermission: vi.fn(() => {
      browser.permission = browser.requested;
      return Promise.resolve(browser.requested);
    }),
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: () => Promise.resolve(browser.lateRegistration ? undefined : registration),
      ready: Promise.resolve(registration),
    },
  });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: {
      query: () =>
        browser.syncState === 'throws'
          ? Promise.reject(new TypeError('unknown permission'))
          : Promise.resolve({ state: browser.syncState }),
    },
  });
}

beforeEach(() => {
  posted.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(navigator, 'permissions');
});

describe('readWatchStatus', () => {
  it('dit « non pris en charge » sans service worker, sans notification ou sans periodicSync', async () => {
    expect(await readWatchStatus()).toBe('unsupported');
    install({ withSync: false });
    expect(await readWatchStatus()).toBe('unsupported');
  });

  it('attend l enregistrement du service worker a la premiere visite', async () => {
    install({ lateRegistration: true });
    expect(await readWatchStatus()).toBe('off');
  });

  it('distingue bloque, a installer, eteinte et active', async () => {
    install({ permission: 'denied' });
    expect(await readWatchStatus()).toBe('blocked');
    install({ syncState: 'prompt' });
    expect(await readWatchStatus()).toBe('needs-install');
    install({ syncState: 'throws' });
    expect(await readWatchStatus()).toBe('needs-install');
    install();
    expect(await readWatchStatus()).toBe('off');
    install({ permission: 'granted', tags: [WATCH_TAG] });
    expect(await readWatchStatus()).toBe('on');
  });
});

describe('enableWatch et disableWatch', () => {
  it('demande la permission, inscrit la veille, puis l arrete', async () => {
    install();
    expect(await enableWatch()).toBe('on');
    expect(browser.tags).toEqual([WATCH_TAG]);
    expect(await disableWatch()).toBe('off');
    expect(browser.tags).toEqual([]);
  });

  it('respecte un refus ou une permission laissee en suspens', async () => {
    install({ requested: 'denied' });
    expect(await enableWatch()).toBe('blocked');
    install({ requested: 'default' });
    expect(await enableWatch()).toBe('off');
    expect(browser.tags).toEqual([]);
  });

  it('dit d installer l application quand le navigateur refuse l inscription', async () => {
    install({ registerFails: true });
    expect(await enableWatch()).toBe('needs-install');
  });

  it('ne fait rien sans support', async () => {
    expect(await enableWatch()).toBe('unsupported');
    expect(await disableWatch()).toBe('unsupported');
    await requestWatchRun();
    expect(posted).toEqual([]);
  });

  it('demande une veille immediate au service worker actif', async () => {
    install();
    await requestWatchRun();
    expect(posted).toEqual([{ type: WATCH_RUN_MESSAGE }]);
  });
});
