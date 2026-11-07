// Telefono in orizzontale che fa da schermo condiviso: lobby, scelta del gioco, pausa e ogni gioco
// devono stare tutti dentro ~390px di altezza. Salva gli screenshot per la revisione visiva e
// controlla che nessun pannello esca dallo schermo. In verticale, in partita, chiede di girarlo.
import { expect, test, type Page } from '@playwright/test';

const PHONES = [
  { name: 'iphone', width: 844, height: 390 },
  { name: 'android', width: 915, height: 412 },
];

/** Nome nel picker e, se c'è, il pulsante della schermata d'inizio che avvia la partita. */
const GAMES: ReadonlyArray<{ name: string; start?: RegExp }> = [
  { name: 'Bowling', start: /Partita veloce/ },
  { name: 'Tiri liberi', start: /Veloce/ },
  { name: 'Golf' },
  { name: 'Barber shop', start: /Apri la bottega/ },
];

/** Pannelli sopra la scena che non devono uscire dallo schermo (scale e transform compresi). */
const PANELS = [
  '.lobby__main', '.join-panel', '.lobby__slots', '.screen-dock', '.pause__card',
  '.golf__bar', '.golf__board', '.golf__turn',
  '.bb-header', '.bb-request', '.bb-tools', '.bb-board', '.bb-prompt', '.bb-modal',
  '.ft-header', '.ft-shot-strip', '.ft-leaderboard', '.ft-prompt', '.ft-modal',
  '.bowling-hud-header', '.bowling-pin-rack', '.bw-strip', '.bw-side', '.bowling-controls-panel', '.bw-overlay > *',
].join(', ');

async function panelsOutside(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') return;
      const tol = 2;
      if (r.left < -tol || r.top < -tol || r.right > w + tol || r.bottom > h + tol) {
        out.push(`${el.className} [${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}]`);
      }
    });
    return out;
  }, PANELS);
}

async function joinPhone(page: Page, code: string): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/c/${code}?sim`);
  await page.getByRole('button', { name: 'Connetti' }).click();
  await page.getByRole('button', { name: 'Questo è il mio Piggy' }).click({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Ho capito' }).click();
}

for (const phone of PHONES) {
  test(`host su telefono orizzontale (${phone.name} ${phone.width}×${phone.height})`, async ({ context }) => {
    test.setTimeout(120_000);
    const shot = (name: string) => `e2e/screenshots/orizzontale-${phone.name}-${name}.png`;
    const screen = await context.newPage();
    await screen.setViewportSize({ width: phone.width, height: phone.height });
    await screen.goto('/stanza');
    const code = (await screen.locator('.code-tiles').getAttribute('data-code')) ?? '';

    const controller = await context.newPage();
    await joinPhone(controller, code);
    await expect(screen.locator('[data-slot="P1"]')).toHaveAttribute('data-state', 'ready');
    await screen.waitForTimeout(900); // animazioni d'ingresso
    await screen.screenshot({ path: shot('1-lobby') });
    expect(await panelsOutside(screen)).toEqual([]);
    await expect(screen.getByRole('button', { name: 'Scegli il gioco' })).toBeInViewport();

    await screen.getByRole('button', { name: 'Scegli il gioco' }).click();
    await expect(screen.getByRole('heading', { name: 'A cosa giochiamo?' })).toBeVisible();
    await screen.waitForTimeout(500);
    await screen.screenshot({ path: shot('2-scelta') });

    for (const [i, game] of GAMES.entries()) {
      if (i > 0) await screen.getByRole('button', { name: 'Scegli il gioco' }).click();
      await screen.getByRole('button', { name: `Dettagli su ${game.name}` }).click();
      await expect(screen.locator('.game-stage canvas').first()).toBeVisible({ timeout: 20_000 });
      await screen.waitForTimeout(2500); // scena e HUD d'apertura
      const slug = game.name.toLowerCase().replace(/\s+/g, '-');
      await screen.screenshot({ path: shot(`3-${slug}`) });
      expect(await panelsOutside(screen), game.name).toEqual([]);
      if (game.start) {
        await screen.getByRole('button', { name: game.start }).first().click();
        await screen.waitForTimeout(2500); // HUD della partita in corso
        await screen.screenshot({ path: shot(`3b-${slug}-in-partita`) });
        expect(await panelsOutside(screen), `${game.name} in partita`).toEqual([]);
      }

      await screen.keyboard.press('p');
      await expect(screen.getByRole('dialog', { name: 'Pausa' })).toBeVisible();
      await screen.waitForTimeout(400);
      if (i === 0) await screen.screenshot({ path: shot('4-pausa') });
      expect(await panelsOutside(screen), `${game.name} in pausa`).toEqual([]);
      await expect(screen.getByRole('button', { name: 'Esci e chiudi la stanza' })).toBeInViewport();
      await screen.getByRole('button', { name: 'Torna alla lobby' }).click();
      await expect(screen.getByRole('button', { name: 'Scegli il gioco' })).toBeVisible();
    }
  });
}

test('in verticale, in partita, il telefono host chiede di essere girato', async ({ context }) => {
  test.setTimeout(60_000);
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 844, height: 390 });
  await screen.goto('/stanza');
  const code = (await screen.locator('.code-tiles').getAttribute('data-code')) ?? '';
  const controller = await context.newPage();
  await joinPhone(controller, code);
  await expect(screen.locator('[data-slot="P1"]')).toHaveAttribute('data-state', 'ready');
  await screen.getByRole('button', { name: 'Scegli il gioco' }).click();
  await screen.getByRole('button', { name: 'Dettagli su Golf' }).click();
  await expect(screen.locator('.game-stage canvas').first()).toBeVisible({ timeout: 20_000 });
  await expect(screen.getByText('Gira il telefono')).toBeHidden();

  await screen.setViewportSize({ width: 390, height: 844 });
  await expect(screen.getByText('Gira il telefono')).toBeVisible();
  await screen.waitForTimeout(400);
  await screen.screenshot({ path: 'e2e/screenshots/verticale-gira-il-telefono.png' });
  await expect(screen.getByRole('button', { name: 'Pausa (P)' })).toBeVisible();
});
