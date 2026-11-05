// Mazze del golf, condivise tra schermo (regole, HUD) e telefono (scelta della mazza).
// Niente DOM né Three.js: il pad le importa senza tirarsi dietro la scena.

export type Club = 'driver' | 'iron' | 'wedge' | 'putter';

export const CLUBS: readonly Club[] = ['driver', 'iron', 'wedge', 'putter'];
/** Mazze per i colpi pieni: il putter si usa solo sul green. */
export const FULL_CLUBS: readonly Club[] = ['driver', 'iron', 'wedge'];

/** Volo pieno a potenza massima (m). */
export const CLUB_CARRY_M: Readonly<Record<Club, number>> = { driver: 210, iron: 150, wedge: 70, putter: 0 };

export const CLUB_NAME: Readonly<Record<Club, string>> = { driver: 'Driver', iron: 'Ferro', wedge: 'Wedge', putter: 'Putter' };
/** Nome nel testo del turno ("Tocca a te · ferro · 120 m"). */
export const CLUB_TEXT: Readonly<Record<Club, string>> = { driver: 'driver', iron: 'ferro', wedge: 'wedge', putter: 'putter' };
export const CLUB_HINT: Readonly<Record<Club, string>> = {
  driver: 'Lungo dal tee',
  iron: 'Medie distanze',
  wedge: 'Approcci corti, palla alta',
  putter: 'Sul green',
};

export const PUTT_TURN_MARK = 'putt da';

export const isClub = (v: unknown): v is Club => typeof v === 'string' && (CLUBS as readonly string[]).includes(v);

/**
 * La mazza che lo schermo ha messo in mano, letta dal testo del turno: il telefono si allinea
 * al suggerimento dello schermo senza un messaggio in più. `null` se il testo non la dice.
 */
export function clubFromTurnText(text: string | undefined): Club | null {
  if (!text?.startsWith('Tocca a te')) return null;
  if (text.includes(PUTT_TURN_MARK)) return 'putter';
  const parts = text.split(' · ');
  return FULL_CLUBS.find((c) => parts.includes(CLUB_TEXT[c])) ?? null;
}
