// Ponte tra i messaggi della stanza e le regole del golf: valida gli eventi dei telefoni
// (lo schermo è autoritativo) e decide quali feedback mandare a chi.
import type { Cue, GameEvent, SlotId } from '@quickquest/protocol';
import { CLUBS, currentHole, distanceToPin, findPlayer, type Club, type GolfEvent, type GolfState, type HoleTerm, type RefusedReason, type ShotInput } from './rules';

const finite = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;

/** Colpo dal telefono; `null` se i dati non tornano. I valori fuori scala si riportano nei limiti. */
export function parseShot(e: GameEvent): ShotInput | null {
  if (e.kind !== 'shot') return null;
  const { kind } = e.data;
  if (kind !== 'full' && kind !== 'putt') return null;
  const power = finite(e.data.power, 0, 1);
  const faceDeg = finite(e.data.faceDeg, -45, 45);
  const aimDeg = finite(e.data.aimDeg, -45, 45);
  const strokeDeg = finite(e.data.strokeDeg, 0, 360);
  if (power === null || faceDeg === null || aimDeg === null || strokeDeg === null) return null;
  return { kind, power, faceDeg, aimDeg, strokeDeg };
}

export function parseClub(e: GameEvent): Club | null {
  if (e.kind !== 'club') return null;
  const club = e.data.club;
  return typeof club === 'string' && (CLUBS as readonly string[]).includes(club) ? (club as Club) : null;
}

export const TERM_TEXT: Readonly<Record<HoleTerm, string>> = {
  albatross: 'Albatros!',
  eagle: 'Eagle!',
  birdie: 'Birdie!',
  par: 'Par',
  bogey: 'Bogey',
  double: 'Doppio bogey',
  other: 'In buca',
};

const REFUSED_TEXT: Readonly<Record<RefusedReason, string>> = {
  not_your_turn: 'Non è il tuo turno',
  ball_moving: 'La palla è ancora in movimento',
  green_needs_putt: 'Sul green si putta: tieni premuto Putt',
  too_small: 'Movimento troppo piccolo per un putt',
  hole_finished: 'Hai già finito la buca',
};

const CLUB_TEXT: Readonly<Record<Club, string>> = { driver: 'driver', iron: 'ferro', wedge: 'wedge', putter: 'putter' };

export interface Outbox {
  readonly cues: readonly { readonly slot: SlotId | null; readonly cue: Cue }[];
  /** Nuovo turno da dire alla stanza; `undefined` = nessun cambio. */
  readonly activeSlot?: SlotId | null;
}

const asSlot = (id: string): SlotId => id as SlotId;

/** Testo del turno: mazza e distanza dalla bandiera. */
export function turnText(state: GolfState, id: string): string {
  const p = findPlayer(state, id);
  if (!p) return 'Tocca a te';
  const d = Math.round(distanceToPin(currentHole(state), p.ball));
  return p.lie === 'green' ? `Tocca a te · putt da ${d} m` : `Tocca a te · ${CLUB_TEXT[p.club]} · ${d} m alla bandiera`;
}

/** Cosa dire ai telefoni dopo gli eventi delle regole. */
export function outboxFor(events: readonly GolfEvent[], state: GolfState): Outbox {
  const cues: { slot: SlotId | null; cue: Cue }[] = [];
  let activeSlot: SlotId | null | undefined;
  for (const e of events) {
    switch (e.kind) {
      case 'turn':
        activeSlot = asSlot(e.playerId);
        cues.push({ slot: asSlot(e.playerId), cue: { kind: 'tap', text: turnText(state, e.playerId) } });
        break;
      case 'struck':
        activeSlot = null;
        break;
      case 'refused':
        cues.push({ slot: asSlot(e.playerId), cue: { kind: 'error', text: REFUSED_TEXT[e.reason] } });
        break;
      case 'holed':
        cues.push({ slot: asSlot(e.playerId), cue: { kind: 'success', text: `${TERM_TEXT[e.term]} ${e.strokes} colpi` } });
        break;
      case 'picked_up':
        cues.push({ slot: asSlot(e.playerId), cue: { kind: 'select', text: 'Palla raccolta' } });
        break;
      case 'hole_over':
      case 'over':
        activeSlot = null;
        cues.push({ slot: null, cue: { kind: 'select', text: e.kind === 'over' ? 'Partita finita!' : `Buca ${e.hole} finita` } });
        break;
      default:
        break;
    }
  }
  return activeSlot === undefined ? { cues } : { cues, activeSlot };
}

/** Altezza visiva della palla (m): parabola sul carry, nulla quando rotola. */
export function ballHeight(flight: { readonly airborne: boolean; readonly carryLeft: number; readonly carryM: number } | null): number {
  if (!flight || !flight.airborne || flight.carryM <= 0) return 0;
  const p = Math.min(1, Math.max(0, 1 - flight.carryLeft / flight.carryM));
  const apex = Math.min(40, flight.carryM * 0.15);
  return 4 * apex * p * (1 - p);
}
