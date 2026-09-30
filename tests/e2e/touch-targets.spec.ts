import { stubApis } from './apiStub';
import { expect, openLyon, test } from './fixtures';

// Cibles tactiles : chaque bouton, onglet et sommaire visible de l'accueil
// mesure au moins 44 px dans les deux sens (DESIGN.md, accessibilite). Les
// liens integres a une phrase sont exemptes : leur cible est la ligne.
const MIN_PX = 44;

test('a 380 px, les commandes de l’accueil ont une cible d’au moins 44 px', async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 0) > 500,
    'Cibles tactiles : verifiees sur le profil mobile seulement',
  );
  await stubApis(page);
  await openLyon(page);
  await expect(page.getByText('Modèle retenu', { exact: true })).toBeVisible({ timeout: 15000 });

  const tooSmall = await page.evaluate((min) => {
    const selector = 'button, [role="tab"], summary, select, input:not([type="hidden"])';
    const found: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width === 0 || box.height === 0 || style.visibility === 'hidden') {
        continue;
      }
      if (box.width < min - 0.5 || box.height < min - 0.5) {
        const name =
          element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30) ?? '';
        found.push(
          `${element.tagName.toLowerCase()} « ${name} » ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
      }
    }
    return found;
  }, MIN_PX);

  expect(tooSmall, `cibles trop petites : ${tooSmall.join(' ; ')}`).toEqual([]);
});
