import { expect, test } from '@playwright/test';

// Barber shop sul contratto modulo: lo schermo carica la bottega 3D (shader dei gusci dei
// capelli), il telefono simulato punta col dito, taglia con la macchinetta e chiude il cliente
// con "Finito!"; lo schermo risponde col voto allo specchio e il telefono riceve le stelle.
test('barber: dalla lobby al primo cliente servito dal telefono simulato', async ({ context }) => {
  test.setTimeout(180_000);
  const screen = await context.newPage();
  const shaderErrors: string[] = [];
  screen.on('console', (m) => {
    if (m.type() === 'error' && /shader|WebGLProgram/i.test(m.text())) shaderErrors.push(m.text());
  });
  await screen.goto('/stanza');
  const code = (await screen.locator('.code-tiles').getAttribute('data-code')) ?? '';

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/c/${code}?sim`);
  await phone.getByRole('button', { name: 'Connetti' }).click();
  await phone.getByRole('button', { name: 'Questo è il mio Piggy' }).click({ timeout: 10_000 });
  await phone.getByRole('button', { name: 'Ho capito' }).click();
  await expect(screen.locator('[data-slot="P1"]')).toHaveAttribute('data-state', 'ready');

  await screen.getByRole('button', { name: 'Scegli il gioco' }).click();
  await screen.getByRole('button', { name: 'Dettagli su Barber shop' }).click();

  await screen.getByRole('button', { name: 'Apri la bottega' }).click({ timeout: 15_000 });
  await expect(screen.getByLabel('Richiesta del cliente')).toBeVisible();
  await expect(screen.getByText(/⏱ \d+s/)).toBeVisible({ timeout: 30_000 });

  // macchinetta accesa mentre il dito si sposta sulla testa
  const track = phone.getByLabel('Trascina per puntare');
  const box = await track.boundingBox();
  if (!box) throw new Error('trackpad non visibile');
  const clipper = phone.getByRole('button', { name: /MACCHINETTA/ });
  await clipper.dispatchEvent('pointerdown', { pointerId: 2, buttons: 1 });
  await phone.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await phone.mouse.down();
  await phone.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35, { steps: 20 });
  await phone.mouse.up();
  // si passa alle forbici dal carrello (come le mazze del golf): il tasto grande fa una sforbiciata
  await phone.getByRole('radio', { name: /Forbici/ }).click();
  await phone.getByRole('button', { name: /SFORBICIATA/ }).dispatchEvent('pointerdown', { pointerId: 3, buttons: 1 });
  // "Finito!" vale dopo 5 s di lavoro (tempo di gioco: con WebGL software scorre più lento)
  const verdict = screen.getByText('Allo specchio').or(screen.getByText('Cliente 2/3'));
  await expect(async () => {
    await phone.getByRole('button', { name: /Finito/ }).click();
    await expect(verdict).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  // dopo il voto allo specchio si siede il cliente del giro dopo
  await expect(screen.getByText('Cliente 2/3')).toBeVisible({ timeout: 30_000 });
  expect(shaderErrors).toEqual([]);
});
