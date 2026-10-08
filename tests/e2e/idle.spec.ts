import { expect } from '@playwright/test';
import { LYON_URL, stubApis } from './apiStub';
import { test } from './fixtures';

/*
 * Au repos, une page ne bouge pas. Une boucle de rendu (un effet dont l'ecriture change l'etat
 * dont il depend) ne casse aucune assertion fonctionnelle, mais occupe le processeur en
 * permanence : batterie du telephone, tous les graphiques recrees une dizaine de fois par
 * seconde, analyse d'accessibilite quatre a vingt fois plus lente (c'est ainsi qu'elle a ete
 * vue : les tests axe de l'onglet Heures depassaient leur delai sous WebKit). On observe donc
 * les modifications du DOM d'une page posee : une boucle en fait des centaines par seconde.
 */

const SETTLE_MS = 2000;
const OBSERVE_MS = 2500;
// Une page posee ne change plus rien ; la marge couvre un rafraichissement tardif et isole.
const MAX_MUTATIONS = 20;

for (const view of ['jour', 'heures', 'fiabilite'] as const) {
  test(`au repos, l'onglet ${view} ne modifie plus le DOM`, async ({ page }) => {
    await stubApis(page);
    await page.goto(LYON_URL.replace('/?', `/?vue=${view}&`));
    await expect(page.getByRole('tabpanel')).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SETTLE_MS);

    const mutations = await page.evaluate(
      (duration) =>
        new Promise<number>((resolve) => {
          let count = 0;
          const observer = new MutationObserver((records) => {
            count += records.length;
          });
          observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
          });
          window.setTimeout(() => {
            observer.disconnect();
            resolve(count);
          }, duration);
        }),
      OBSERVE_MS,
    );

    expect(mutations).toBeLessThanOrEqual(MAX_MUTATIONS);
  });
}
