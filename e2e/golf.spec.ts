import { expect, test } from '@playwright/test';

// Golf sul contratto modulo: lo schermo carica la scena, il telefono il suo pad, e un colpo
// del telefono di turno arriva alle regole (game-event) che rispondono col turno (cue).
test('golf: dalla lobby al primo colpo dal telefono simulato', async ({ context }) => {
  const screen = await context.newPage();
  await screen.goto('/stanza');
  const code = (await screen.locator('.code-tiles').getAttribute('data-code')) ?? '';

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/c/${code}?sim`);
  await phone.getByRole('button', { name: 'Connetti' }).click();
  await phone.getByRole('button', { name: 'Questo è il mio Pupo' }).click({ timeout: 10_000 });
  await phone.getByRole('button', { name: 'Ho capito' }).click();
  await phone.getByRole('button', { name: 'Salta (simulatore)' }).click();
  await expect(screen.locator('[data-slot="P1"]')).toHaveAttribute('data-state', 'ready');

  await screen.getByRole('button', { name: 'Scegli il gioco' }).click();
  await screen.getByRole('button', { name: 'Dettagli su Golf' }).click();

  await expect(screen.getByText('Buca 1/3')).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByText(/Tocca a te · .* m alla bandiera/)).toBeVisible({ timeout: 10_000 });

  await phone.getByRole('button', { name: 'Colpo di prova' }).click();
  await expect(screen.getByText('1 colpi')).toBeVisible({ timeout: 10_000 });
  // con un solo giocatore, a palla ferma il turno torna a lui
  await expect(phone.getByText(/Tocca a te/)).toBeVisible({ timeout: 15_000 });
});
