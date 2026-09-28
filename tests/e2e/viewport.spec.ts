import { stubApis } from './apiStub';
import { expect, openLyon, test } from './fixtures';

// Force 380 px quel que soit le projet Playwright qui execute ce fichier
// (chromium comme mobile-380) : la regle testee est la largeur, pas le
// projet.
test.use({ viewport: { width: 380, height: 720 } });

test('a 380 px de large, aucun onglet ne deborde horizontalement', async ({ page }) => {
  await stubApis(page);
  await openLyon(page);

  const tabs = page.getByRole('tab');
  const count = await tabs.count();
  for (let i = 0; i < count; i += 1) {
    const tab = tabs.nth(i);
    const name = (await tab.textContent()) ?? `#${i}`;
    await tab.click();
    await expect(page.getByRole('tabpanel')).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      scrollWidth,
      `onglet "${name}" : scrollWidth=${scrollWidth} depasse clientWidth=${clientWidth}`,
    ).toBeLessThanOrEqual(clientWidth);
  }
});

// Regression : sous 640 px, le libelle complet etait masque par
// `display:none` et le court est `aria-hidden` : les onglets n'avaient
// plus aucun nom accessible (WCAG 4.1.2).
test('a 380 px de large, chaque onglet garde son nom accessible complet', async ({ page }) => {
  await stubApis(page);
  await openLyon(page);

  for (const name of [
    'Aujourd’hui',
    'Heure par heure',
    '15 jours',
    'Radar',
    'Modèles',
    'Fiabilité',
  ]) {
    await expect(page.getByRole('tab', { name, exact: true })).toBeVisible({ timeout: 3000 });
  }
});
