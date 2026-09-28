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
