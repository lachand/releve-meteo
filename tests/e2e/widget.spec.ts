import { stubApis } from './apiStub';
import { expect, test } from './fixtures';

/*
 * widget.html : la page que l'application Android charge sans interface pour
 * calculer le contenu de ses widgets. Ici, un faux pont `ReleveAndroid` recoit
 * ce que l'application recevrait. Aucune dependance a Chromium.
 */

test('widget.html calcule le contenu d un lieu et le remet au pont de l application', async ({
  page,
}) => {
  await stubApis(page);
  await page.addInitScript(() => {
    const published: string[] = [];
    (window as unknown as Record<string, unknown>).__published = published;
    (window as unknown as Record<string, unknown>).ReleveAndroid = {
      publish: (json: string) => published.push(json),
      fail: (message: string) => published.push(`echec : ${message}`),
    };
  });
  await page.goto('/widget.html?lat=45.7578&lon=4.832&nom=Lyon&alt=170');
  await expect
    .poll(
      () =>
        page.evaluate(() => (window as unknown as { __published: string[] }).__published.length),
      {
        timeout: 20000,
      },
    )
    .toBe(1);
  const json = await page.evaluate(
    () => (window as unknown as { __published: string[] }).__published[0] ?? '',
  );
  const payload = JSON.parse(json) as {
    version: number;
    generatedAtMs: number;
    places: {
      name: string;
      now: { model: string; temperature: number } | null;
      hours: unknown[];
    }[];
    unreachable: string[];
  };
  expect(payload.version).toBe(1);
  expect(payload.unreachable).toEqual([]);
  expect(payload.places).toHaveLength(1);
  expect(payload.places[0]?.name).toBe('Lyon');
  expect(typeof payload.places[0]?.now?.model).toBe('string');
  expect(typeof payload.places[0]?.now?.temperature).toBe('number');
  expect(payload.places[0]?.hours).toHaveLength(12);
});

test('widget.html sans pont ecrit le contenu dans la page, pour l essayer a la main', async ({
  page,
}) => {
  await stubApis(page);
  await page.goto('/widget.html?lat=45.7578&lon=4.832&nom=Lyon');
  await expect(page.locator('body')).toContainText('"places"', { timeout: 20000 });
});
