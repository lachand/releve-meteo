import { expect, test } from './fixtures';

test('la page se charge et affiche le nom du produit', async ({ page }) => {
  await page.goto('/');
  // Le bandeau porte "Relevé" suivi d un sous-titre dans le meme paragraphe
  // (App.tsx) : on cible le bandeau plutot qu un texte exact.
  await expect(page.getByRole('banner').getByText('Relevé')).toBeVisible();
});

test('la page Sources et licences est accessible', async ({ page }) => {
  await page.goto('/sources.html');
  await expect(page.getByRole('heading', { name: 'Sources, licences et méthode' })).toBeVisible();
});

test("le manifeste est valide et le service worker s'enregistre (TESTING.md 5.7)", async ({
  page,
  baseURL,
}) => {
  const manifestResponse = await page.request.get(`${baseURL}/manifest.webmanifest`);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(
    true,
  );

  await page.goto('/');
  const registration = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      return null;
    }
    await navigator.serviceWorker.ready;
    const reg = await navigator.serviceWorker.getRegistration('/');
    return reg !== undefined ? { active: reg.active !== null, scope: reg.scope } : null;
  });
  expect(registration).toEqual({ active: true, scope: `${baseURL}/` });
});
