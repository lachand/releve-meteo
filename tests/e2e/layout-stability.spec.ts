import { expect, test } from './fixtures';

// Lighthouse declenche `beforeinstallprompt` : une banniere inseree en haut de
// page poussait tout le contenu (CLS 0,14, score de performance sous 0,9).
// L'invitation doit flotter, jamais decaler le releve.
test("l'invitation a installer ne decale pas le contenu", async ({ page }) => {
  await page.goto('/');
  const main = page.locator('main#contenu');
  await expect(main).toBeVisible();
  const before = await main.boundingBox();

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    Object.assign(event, { prompt: () => Promise.resolve(), userChoice: new Promise(() => {}) });
    window.dispatchEvent(event);
  });
  await expect(page.getByText('Installer Relevé pour un accès hors ligne')).toBeVisible();

  const after = await main.boundingBox();
  expect(after?.y).toBe(before?.y);

  await page.getByRole('button', { name: 'Plus tard' }).click();
  await expect(page.getByText('Installer Relevé pour un accès hors ligne')).toBeHidden();
});
