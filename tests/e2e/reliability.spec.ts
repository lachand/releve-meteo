import { stubApis } from './apiStub';
import { expect, openLyon, tabByLabel, test } from './fixtures';

test('l onglet Fiabilite nomme la station de reference une fois la verification chargee', async ({
  page,
}) => {
  await stubApis(page);
  await openLyon(page);

  await tabByLabel(page, 'Fiabilité').click();
  // Temperature et vent sont verifies contre la station la plus proche ;
  // le calcul (decompression, appariement) prend un instant reel.
  await expect(page.getByText(/mesures de la station Lyon \/ Bron/).first()).toBeVisible({
    timeout: 15000,
  });
});

test('la Fiabilite se replie sur la maille et l echeance quand la verification echoue', async ({
  page,
}) => {
  await stubApis(page, { failVerification: true });
  await openLyon(page);

  await tabByLabel(page, 'Fiabilité').click();
  await expect(page.getByRole('alert')).toContainText('Vérification indisponible', {
    timeout: 15000,
  });
});

test('Mon relevé garde vos mesures apres un rechargement et les range a part des modeles', async ({
  page,
}) => {
  await stubApis(page);
  await openLyon(page);

  await tabByLabel(page, 'Fiabilité').click();
  const form = page.getByRole('form', { name: 'Nouvelle mesure' });
  await form.getByLabel('Maximum (°C)').fill('20,5');
  await form.getByLabel('Minimum (°C)').fill('10');
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Mesuré par vous').first()).toBeVisible({ timeout: 15000 });

  // Rechargement : la mesure est gardee sur l'appareil, sans compte ni serveur.
  await page.reload();
  await tabByLabel(page, 'Fiabilité').click();
  await expect(page.getByText('20,5 / 10 °C').first()).toBeVisible({ timeout: 15000 });
  await page
    .getByRole('button', { name: /Supprimer la mesure du/ })
    .first()
    .click();
  await expect(page.getByText(/Aucune mesure saisie pour/)).toBeVisible();
});
