import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LYON_URL, stubApis } from './apiStub';
import { test } from './fixtures';

/*
 * Accessibilite automatisee (axe-core, WCAG 2.0 et 2.1 A et AA) sur chaque
 * onglet, en theme clair et en theme sombre, a 380 px et en bureau. Une
 * regle enfreinte fait echouer le test avec son identifiant et les
 * elements concernes : elle se corrige, elle ne se desactive pas.
 */

const VIEWS = ['jour', 'heures', 'jours', 'carte', 'modeles', 'fiabilite'] as const;

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations.map(
    (v) =>
      `${v.id} (${v.impact ?? 'n/a'}) : ${v.nodes
        .slice(0, 4)
        .map((n) => n.target.join(' '))
        .join(' ; ')}`,
  );
}

for (const theme of ['light', 'dark'] as const) {
  for (const view of VIEWS) {
    test(`axe : onglet ${view}, theme ${theme}`, async ({ page }) => {
      // L'analyse axe de l'onglet Heures (neuf sections, grands tableaux) prend 21 a 23 s sous
      // Firefox et WebKit en CI, pour un delai de 30 s : on triple le delai, aucune regle n'est desactivee.
      test.slow();
      await page.emulateMedia({ colorScheme: theme });
      await stubApis(page);
      await page.goto(LYON_URL.replace('/?', `/?vue=${view}&`));
      await expect(page.getByRole('tabpanel')).toBeVisible({ timeout: 20000 });
      // Laisse les jeux de donnees, les graphiques et les cartes se poser.
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1200);
      expect(await violations(page)).toEqual([]);
    });
  }
}

test('axe : reglages', async ({ page }) => {
  await stubApis(page);
  await page.goto(LYON_URL);
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(page.getByRole('region', { name: 'Veille en arrière-plan' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

// Pages statiques : lire, sources et accessibilite, en clair et en sombre.
const STATIC_PAGES = [
  { path: '/lire.html', heading: 'Comment lire Relevé' },
  { path: '/sources.html', heading: 'Sources, licences et méthode' },
  { path: '/accessibilite.html', heading: 'Accessibilité' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  for (const { path, heading } of STATIC_PAGES) {
    test(`axe : page ${path}, theme ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }
}

// Garde-fou du garde-fou : axe doit voir une vraie infraction, sinon un
// resultat vide ne prouverait rien.
test('axe detecte bien un bouton sans nom accessible', async ({ page }) => {
  await stubApis(page);
  await page.goto(LYON_URL);
  await expect(page.getByRole('tabpanel')).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'sans-nom';
    document.body.append(button);
  });
  const found = await violations(page);
  expect(found.some((line) => line.startsWith('button-name'))).toBe(true);
});
