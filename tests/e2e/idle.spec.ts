import { expect } from '@playwright/test';
import { LYON_URL, stubApis } from './apiStub';
import { test } from './fixtures';

/*
 * Une page posee ne bouge plus. Une boucle de rendu (un effet dont l'ecriture change l'etat dont
 * il depend) ne casse aucune assertion fonctionnelle, mais occupe le processeur en permanence :
 * batterie du telephone, tous les graphiques recrees une dizaine de fois par seconde, analyse
 * d'accessibilite quatre a vingt fois plus lente (c'est ainsi qu'elle a ete vue : les tests axe de
 * l'onglet Heures depassaient leur delai sous WebKit).
 *
 * On ne compte pas les modifications du DOM sur une duree fixe (un demarrage a froid sous WebKit
 * en fait plus qu'un autre) : on demande a la page de SE POSER, c'est-a-dire de rester sans la
 * moindre modification pendant QUIET_MS, dans un delai de MAX_WAIT_MS. Une boucle ne se pose
 * jamais ; l'echec dit ce qui bouge.
 */

const QUIET_MS = 1500;
const MAX_WAIT_MS = 20000;

interface Settling {
  readonly settled: boolean;
  readonly waitedMs: number;
  readonly mutations: number;
  readonly top: string[];
}

// La carte est exclue : ses tuiles et ses couches changent legitimement le DOM.
for (const view of ['jour', 'heures', 'jours', 'modeles', 'fiabilite'] as const) {
  test(`au repos, l'onglet ${view} se pose et ne modifie plus le DOM`, async ({ page }) => {
    await stubApis(page);
    await page.goto(LYON_URL.replace('/?', `/?vue=${view}&`));
    await expect(page.getByRole('tabpanel')).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(
      ({ quietMs, maxWaitMs }) =>
        new Promise<Settling>((resolve) => {
          const counts = new Map<string, number>();
          let total = 0;
          const started = performance.now();
          let last = started;
          const describe = (node: Node): string => {
            const element = node instanceof Element ? node : node.parentElement;
            if (element === null) {
              return '?';
            }
            const parent = element.parentElement;
            const where = (parent?.className ?? '').toString().split(' ')[0] ?? '';
            return `${element.tagName.toLowerCase()} dans ${parent?.tagName.toLowerCase() ?? '?'}${where === '' ? '' : `.${where}`}`;
          };
          const observer = new MutationObserver((records) => {
            last = performance.now();
            for (const record of records) {
              const key = `${record.type}${record.attributeName === null ? '' : `:${record.attributeName}`} ${describe(record.target)}`;
              total += 1;
              counts.set(key, (counts.get(key) ?? 0) + 1);
            }
          });
          observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
          });
          const timer = window.setInterval(() => {
            const now = performance.now();
            const quiet = now - last >= quietMs;
            if (quiet || now - started >= maxWaitMs) {
              window.clearInterval(timer);
              observer.disconnect();
              resolve({
                settled: quiet,
                waitedMs: Math.round(now - started),
                mutations: total,
                top: [...counts.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([key, count]) => `${count} x ${key}`),
              });
            }
          }, 100);
        }),
      { quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS },
    );

    expect(result.settled, `la page ne se pose pas : ${JSON.stringify(result)}`).toBe(true);
  });
}
