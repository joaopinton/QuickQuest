import { expect, test, type Page } from '@playwright/test';

async function roomCode(page: Page): Promise<string> {
  const code = (await page.locator('.code-tiles').getAttribute('data-code')) ?? '';
  expect(code).toMatch(/^[A-Z2-9]{4}$/);
  return code;
}

test('stanza → telefono simulato → scelta Pupo → lo slot P1 diventa pronto', async ({ context }) => {
  const screen = await context.newPage();
  await screen.goto('/stanza');
  await expect(screen.getByRole('heading', { name: 'La tua stanza' })).toBeVisible();
  const code = await roomCode(screen);
  await expect(screen.locator('[data-slot="P1"]')).toHaveAttribute('data-state', 'empty');

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/c/${code}?sim`);
  await expect(phone.getByText('Ti stai unendo alla stanza')).toBeVisible();
  await phone.getByRole('button', { name: 'Connetti' }).click();
  await expect(phone.getByRole('heading', { name: 'Scegli il tuo Pupo' })).toBeVisible({ timeout: 10_000 });
  await expect(phone.getByText('Giocatore P1')).toBeVisible();
  await expect(screen.locator('[data-slot="P1"]')).toHaveAttribute('data-state', 'connecting');

  await phone.getByRole('radio', { name: 'Colore Uva' }).click();
  await phone.getByRole('radio', { name: 'Occhiali tondi' }).click();
  await phone.getByRole('button', { name: 'Questo è il mio Pupo' }).click();
  await phone.getByRole('button', { name: 'Ho capito' }).click();
  await expect(phone.getByRole('heading', { name: 'Guarda lo schermo!' })).toBeVisible();
  await expect(phone.getByText('Demo: nessuno schermo collegato')).toHaveCount(0);

  await expect(screen.locator('[data-slot="P1"]')).toHaveAttribute('data-state', 'ready');
  await expect(screen.getByText('1 di 4 giocatori')).toBeVisible();
  await screen.getByRole('button', { name: 'Scegli il gioco' }).click();
  await expect(screen.getByRole('heading', { name: 'A cosa giochiamo?' })).toBeVisible();
  await screen.getByRole('button', { name: 'Dettagli su Bowling' }).click();
  await expect(screen.getByText('Il bowling arriva presto!')).toBeVisible();
});

test('un telefono senza giroscopio vede "non può giocare" e non entra', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/c/ABCD?sim=nogyro');
  await page.getByRole('button', { name: 'Connetti' }).click();
  await expect(page.getByRole('heading', { name: 'Questo telefono non può giocare' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('probabilmente il telefono non ce l\'ha')).toBeVisible();
});

test('senza schermo raggiungibile il telefono entra in modalità demo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/c/ZZZZ?sim');
  await page.getByRole('button', { name: 'Connetti' }).click();
  await page.getByRole('button', { name: 'Questo è il mio Pupo' }).click({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Ho capito' }).click();
  await expect(page.getByText('Demo: nessuno schermo collegato')).toBeVisible();
});

test('"Ho un codice" porta alla stanza; un codice sbagliato viene segnalato', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho un codice' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Carattere 1 di 4').pressSequentially('k7rm');
  await expect(page).toHaveURL(/\/c\/K7RM$/);
  await page.goto('/c/K0RM');
  await expect(page.getByText('Questo codice non esiste')).toBeVisible();
});

test('home navigabile da tastiera', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Vai al contenuto' })).toBeFocused();
  // skip link → logo → Giochi → Come si gioca → Crea una stanza (header)
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  const cta = page.locator('.site-nav__cta');
  await expect(cta).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/stanza$/);
});

test('pagina inesistente', async ({ page }) => {
  await page.goto('/pista-sbagliata');
  await expect(page.getByRole('heading', { name: 'Questa pagina è uscita dalla pista' })).toBeVisible();
});
