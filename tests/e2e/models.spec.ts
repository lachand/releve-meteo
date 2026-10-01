import { stubApis } from './apiStub';
import { expect, openLyon, tabByLabel, test } from './fixtures';

test('choix manuel d un modele puis retour a la selection automatique', async ({ page }) => {
  await stubApis(page);
  await openLyon(page);

  await tabByLabel(page, 'Modèles').click();
  const chooser = page.getByRole('group', { name: 'Modèle de référence pour ce lieu' });
  await expect(chooser).toBeVisible();

  await chooser.getByRole('radio', { name: /^ARPEGE/ }).click();
  await expect(page.getByText('Choix manuel')).toBeVisible();
  await expect(page.locator('[data-model]').first()).toHaveAttribute('data-model', 'arpege');
  await expect(page.getByText('ARPEGE, choisi manuellement.')).toBeVisible();

  await chooser.getByRole('radio', { name: /^Automatique/ }).click();
  // exact:true : la vue Modeles affiche aussi un sous-titre statique
  // "Modele retenu a chaque echeance" (CascadeFrieze), qui contiendrait
  // sinon aussi ce texte.
  await expect(page.getByText('Modèle retenu', { exact: true })).toBeVisible();
  // Les mesures enregistrees de Bron donnent ICON-D2 plus juste : la mesure locale
  // l'emporte sur l'a priori de maille d'AROME.
  await expect(page.locator('[data-model]').first()).toHaveAttribute('data-model', 'icon_d2');
  await expect(page.getByText('ICON-D2 retenu pour ce lieu et cette échéance.')).toBeVisible();
});
