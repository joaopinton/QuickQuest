// Ponte tra i messaggi della stanza e le regole del golf: valida gli eventi dei telefoni
// (lo schermo è autoritativo) e decide quali feedback mandare a chi.
import type { Cue, GameEvent, SlotId } from '@quickquest/protocol';
import { CLUB_TEXT, isClub, PUTT_TURN_MARK, type Club } from '../shared/clubs';
import { currentHole, distanceToPin, findPlayer, type GolfEvent, type GolfState, type HoleTerm, type RefusedReason, type ShotInput } from './rules';

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
  return isClub(club) ? club : null;
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

export const PENALTY_TEXT: Readonly<Record<'water' | 'oob', string>> = {
  water: 'In acqua: +1 colpo, si droppa più indietro',
  oob: 'Fuori limite: +1 colpo, si ritira da dove eri',
};

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
  return p.lie === 'green' ? `Tocca a te · ${PUTT_TURN_MARK} ${d} m` : `Tocca a te · ${CLUB_TEXT[p.club]} · ${d} m alla bandiera`;
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
      case 'penalty':
        cues.push({ slot: asSlot(e.playerId), cue: { kind: 'error', text: PENALTY_TEXT[e.hazard] } });
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

/** La camera resta su chi ha appena tirato fino a `until` (ms, stesso orologio di `now`). */
export interface FocusHold {
  readonly playerId: string;
  readonly until: number;
}

/**
 * Chi inquadrare: la palla in movimento, poi quella appena fermata (o che cade in buca) per
 * qualche istante, poi chi tira adesso. `null` se non c'è nessuno.
 */
export function cameraFocusId(state: GolfState, hold: FocusHold | null, now: number): string | null {
  const moving = state.players.find((p) => p.flight);
  if (moving) return moving.id;
  if (hold && now < hold.until && findPlayer(state, hold.playerId)) return hold.playerId;
  if (state.turn && findPlayer(state, state.turn)) return state.turn;
  if (hold && findPlayer(state, hold.playerId)) return hold.playerId;
  return state.players[0]?.id ?? null;
}

/** Altezza della palla sopra il terreno (m): la calcola la fisica, 0 quando rotola. */
export function ballHeight(flight: { readonly heightM: number } | null): number {
  return flight ? Math.max(0, flight.heightM) : 0;
}
