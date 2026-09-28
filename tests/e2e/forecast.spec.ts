import { stubApis } from './apiStub';
import { expect, openLyon, tabByLabel, test } from './fixtures';

test('recherche et ouverture de Lyon : tampon du modele et justification visibles', async ({
  page,
}) => {
  await stubApis(page);
  await openLyon(page);

  await expect(page.getByRole('heading', { level: 1, name: 'Lyon' })).toBeVisible();
  await expect(page.getByText('Modèle retenu')).toBeVisible();
  // Le tampon porte le nom du modele choisi (AGENTS.md regle 7, provenance
  // toujours visible) : verifie sur le conteneur plutot que sur un texte
  // compose, pour ne pas dependre de la mise en forme interne.
  await expect(page.locator('[data-model]').first()).toContainText('AROME');
  await expect(page.getByText('AROME retenu pour ce lieu et cette échéance.')).toBeVisible();
});

test('le changement de modele est marque dans le releve heure par heure', async ({ page }) => {
  await stubApis(page);
  await openLyon(page);

  const hoursTab = tabByLabel(page, 'Heure par heure');
  await hoursTab.click();
  await expect(hoursTab).toHaveAttribute('aria-selected', 'true');

  // AGENTS.md regle 6 : jamais de raccord lisse entre modeles. L attribut
  // `data-transition` n existe dans le DOM que sur les colonnes ou le
  // modele actif change (HourlyStrip.tsx) ; sa presence prouve le marqueur.
  const transitionMarker = page
    .getByRole('tabpanel')
    .locator('th[data-transition], td[data-transition]')
    .first();
  await expect(transitionMarker).toBeVisible();
});

test('etat d erreur et bouton de reprise quand la prevision echoue', async ({ page }) => {
  await stubApis(page, { failForecast: true });
  await page.goto('/');
  await page.getByLabel('Chercher une commune').fill('Lyon');
  await page.getByRole('button', { name: 'Lyon, Rhône', exact: true }).click();

  await expect(page.getByText('Prévision indisponible.')).toBeVisible({ timeout: 15000 });
  const retry = page.getByRole('button', { name: 'Réessayer' });
  await expect(retry).toBeVisible();

  // Le bouchon continue d echouer apres le clic : l etat d erreur reste
  // affiche, ce qui est verifiable sans dependre d un minutage reseau.
  await retry.click();
  await expect(page.getByText('Prévision indisponible.')).toBeVisible();
});
