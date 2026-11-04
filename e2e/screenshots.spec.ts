// Screenshot per la revisione visiva (docs/rules: 375, 768, 1440, 1920). Non confronta: salva.
import { test } from '@playwright/test';

const WIDTHS = [375, 768, 1440, 1920];
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'giochi', path: '/giochi' },
  { name: 'come-si-gioca', path: '/come-si-gioca' },
  { name: 'stanza', path: '/stanza' },
];

for (const width of WIDTHS) {
  for (const p of PAGES) {
    test(`screenshot ${p.name} @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 800 ? 900 : 1000 });
      await page.goto(p.path);
      await page.waitForTimeout(1200); // lascia finire le animazioni d'ingresso
      await page.screenshot({ path: `e2e/screenshots/${p.name}-${width}.png`, fullPage: true });
    });
  }
}

test('screenshot del flusso telefono', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/c/ZZZZ?sim');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'e2e/screenshots/telefono-1-benvenuto.png' });
  await page.getByRole('button', { name: 'Connetti' }).click();
  await page.getByRole('heading', { name: 'Scegli il tuo Pupo' }).waitFor({ timeout: 10_000 });
  await page.getByRole('radio', { name: 'Colore Laguna' }).click();
  await page.getByRole('radio', { name: 'Cuffie' }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'e2e/screenshots/telefono-2-pupo.png', fullPage: true });
  await page.getByRole('button', { name: 'Questo è il mio Pupo' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e/screenshots/telefono-3-sicurezza.png' });
  await page.getByRole('button', { name: 'Ho capito' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'e2e/screenshots/telefono-4-attesa.png' });
  await page.goto('/c/ABCD?sim=nogyro');
  await page.getByRole('button', { name: 'Connetti' }).click();
  await page.getByRole('heading', { name: 'Questo telefono non può giocare' }).waitFor({ timeout: 10_000 });
  await page.screenshot({ path: 'e2e/screenshots/telefono-5-non-compatibile.png', fullPage: true });
});
