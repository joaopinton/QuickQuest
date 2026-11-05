// Regole del golf, senza Three.js né DOM (docs/games/golf.md).
// Adattato da choijunhuk/phonemote (MIT), apps/game/src/scenes/games/golfState.ts.
//
// Il campo è in metri: x attraversa la buca (+ a destra del giocatore), y va dal tee (0) alla
// bandiera (hole.lengthM). Le direzioni sono gradi rispetto alla linea verso la bandiera,
// + a destra, quindi un passo è (sin, cos) senza atan2.
// Differenze da PhoneMote, per ADR-002: lo swing si riconosce sul telefono, che manda già
// potenza (0..1, relativa al giocatore), faccia del bastone e mira; qui si gioca il colpo.
// Lo stato è immutabile: ogni funzione restituisce uno stato nuovo e gli eventi accaduti.

export type Lie = 'tee' | 'fairway' | 'rough' | 'bunker' | 'green';
export type Club = 'driver' | 'iron' | 'wedge' | 'putter';
export type ShotKind = 'full' | 'putt';
export type GolfPhase = 'aim' | 'flight' | 'hole_over' | 'over';
export type HoleTerm = 'albatross' | 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'other';
export type RefusedReason = 'not_your_turn' | 'ball_moving' | 'green_needs_putt' | 'too_small' | 'hole_finished';

export interface Bunker {
  readonly x: number;
  readonly y: number;
  readonly radiusM: number;
}

export interface GolfHole {
  readonly par: number;
  readonly lengthM: number;
  readonly greenRadiusM: number;
  /** Moltiplica la lunghezza del putt: green veloce = palla che corre. */
  readonly greenSpeed: number;
  /** Curva del putt (gradi per metro): la pendenza del green. */
  readonly slopeDegPerM: number;
  /** Vento laterale (m/s), + verso destra. */
  readonly wind: number;
  readonly bunkers: readonly Bunker[];
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Flight {
  readonly headingDeg: number;
  readonly speed: number;
  readonly airborne: boolean;
  readonly carryLeft: number;
  readonly carryM: number;
  readonly curveDegPerM: number;
  readonly decel: number;
}

/** Colpo riconosciuto sul telefono. */
export interface ShotInput {
  readonly kind: ShotKind;
  /** 0..1 rispetto alla scala del giocatore (colpi pieni). */
  readonly power: number;
  /** Faccia del bastone (gradi): + aperta, la palla parte e curva a destra. */
  readonly faceDeg: number;
  /** Mira (gradi) rispetto alla bandiera, + a destra. */
  readonly aimDeg: number;
  /** Ampiezza del movimento del putt (gradi). */
  readonly strokeDeg: number;
}

export interface ShotRecord {
  readonly kind: ShotKind;
  readonly club: Club;
  readonly from: Point;
  readonly to: Point;
  readonly distanceM: number;
  readonly endLie: Lie;
  readonly holed: boolean;
}

export type HoleResult = 'playing' | 'holed' | 'picked_up';

export interface GolfPlayer {
  readonly id: string;
  readonly ball: Point;
  readonly lie: Lie;
  readonly club: Club;
  readonly clubChosen: boolean;
  readonly strokes: number;
  readonly result: HoleResult;
  readonly flight: Flight | null;
  readonly shotFrom: Point | null;
  readonly card: readonly (number | null)[];
  readonly lastShot: ShotRecord | null;
}

export interface GolfState {
  readonly course: readonly GolfHole[];
  readonly hole: number; // 1-based
  readonly phase: GolfPhase;
  readonly players: readonly GolfPlayer[];
  /** Chi tira adesso; `null` mentre una palla è in volo o a buca chiusa. */
  readonly turn: string | null;
  readonly timer: number;
  readonly accumulator: number;
}

export type GolfEvent =
  | { readonly kind: 'struck'; readonly playerId: string; readonly shot: ShotKind; readonly club: Club; readonly carryM: number }
  | { readonly kind: 'landed'; readonly playerId: string; readonly lie: Lie }
  | { readonly kind: 'rested'; readonly playerId: string; readonly record: ShotRecord }
  | { readonly kind: 'refused'; readonly playerId: string; readonly reason: RefusedReason }
  | { readonly kind: 'holed'; readonly playerId: string; readonly strokes: number; readonly par: number; readonly term: HoleTerm; readonly conceded: boolean }
  | { readonly kind: 'picked_up'; readonly playerId: string; readonly strokes: number }
  | { readonly kind: 'turn'; readonly playerId: string }
  | { readonly kind: 'hole_started'; readonly hole: number; readonly par: number }
  | { readonly kind: 'hole_over'; readonly hole: number }
  | { readonly kind: 'over' };

export interface Step {
  readonly state: GolfState;
  readonly events: readonly GolfEvent[];
}

export const CLUB_CARRY_M: Readonly<Record<Club, number>> = { driver: 210, iron: 150, wedge: 70, putter: 0 };
export const CLUBS: readonly Club[] = ['driver', 'iron', 'wedge', 'putter'];
const LIE_CARRY: Readonly<Record<Lie, number>> = { tee: 1, fairway: 1, rough: 0.82, bunker: 0.6, green: 1 };
const LIE_SPREAD: Readonly<Record<Lie, number>> = { tee: 1, fairway: 1, rough: 1.4, bunker: 1.6, green: 1 };
const ROLL_FRACTION: Readonly<Record<Lie, number>> = { tee: 0.16, fairway: 0.16, rough: 0.05, bunker: 0.01, green: 0.07 };
const ROLL_DECEL: Readonly<Record<Lie, number>> = { tee: 3.5, fairway: 3.5, rough: 6, bunker: 9, green: 1 };
const PUTT_DECEL = 1;
export const FAIRWAY_HALF_WIDTH_M = 18;
const FACE_START_SHARE = 0.35;
const CURVE_PER_FACE_DEG = 0.0035;
const WIND_CURVE_PER_MS = 0.004;
export const FACE_LIMIT_DEG = 12;
export const AIM_LIMIT_DEG = 15;
export const CUP_RADIUS_M = 0.055;
const CUP_CAPTURE_SPEED = 1.4;
/** Palla ferma così vicina: concessa, con il colpo del tap-in. 55 mm di buca da 5 m chiederebbero 0,6° di linea. */
export const GIMME_RADIUS_M = 0.45;
const PUTT_M_PER_DEG = 0.09;
export const PUTT_MIN_DEG = 3;
const STROKES_OVER_PAR = 5;
const HOLE_OVER_SECONDS = 3;
const FLIGHT_STEP = 1 / 120;
const MAX_CATCH_UP = 0.25;
const PAR_POOL: readonly number[] = [4, 4, 3, 5, 4, 4, 3, 5, 4];
const DEG = Math.PI / 180;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** Generatore pseudo-casuale con seme (mulberry32): stessa partita a parità di seme. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeHole(par: number, rng: () => number): GolfHole {
  const lengthM = par === 3 ? 130 + rng() * 60 : par === 5 ? 440 + rng() * 90 : 300 + rng() * 100;
  const count = rng() < 0.35 ? 0 : rng() < 0.8 ? 1 : 2;
  const bunkers = Array.from({ length: count }, () => ({
    x: (rng() * 2 - 1) * 22,
    y: lengthM - (8 + rng() * 30),
    radiusM: 5 + rng() * 4,
  }));
  return {
    par,
    lengthM,
    greenRadiusM: 14,
    greenSpeed: 2.3 + rng() * 0.6,
    slopeDegPerM: (rng() * 2 - 1) * 1.2,
    wind: (rng() * 2 - 1) * 4,
    bunkers,
  };
}

export function makeCourse(holes: number, seed: number): readonly GolfHole[] {
  const rng = seededRng(seed);
  const pars = Array.from({ length: holes }, (_, i) => PAR_POOL[i % PAR_POOL.length] ?? 4);
  for (let i = pars.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pars[i], pars[j]] = [pars[j]!, pars[i]!];
  }
  return pars.map((par) => makeHole(par, rng));
}

export function suggestClub(distanceM: number, lie: Lie): Club {
  if (lie === 'green') return 'putter';
  if (distanceM <= 80) return 'wedge';
  if (distanceM <= 175) return 'iron';
  return 'driver';
}

export function termFor(strokes: number, par: number): HoleTerm {
  const over = strokes - par;
  if (over <= -3) return 'albatross';
  if (over === -2) return 'eagle';
  if (over === -1) return 'birdie';
  if (over === 0) return 'par';
  if (over === 1) return 'bogey';
  if (over === 2) return 'double';
  return 'other';
}

export function currentHole(state: GolfState): GolfHole {
  return state.course[state.hole - 1] ?? state.course[0]!;
}

export const pinOf = (hole: GolfHole): Point => ({ x: 0, y: hole.lengthM });

export function distanceToPin(hole: GolfHole, ball: Point): number {
  return Math.hypot(ball.x, ball.y - hole.lengthM);
}

export function lieAt(hole: GolfHole, p: Point): Lie {
  if (hole.greenRadiusM > 0 && Math.hypot(p.x, p.y - hole.lengthM) <= hole.greenRadiusM) return 'green';
  if (hole.bunkers.some((b) => Math.hypot(p.x - b.x, p.y - b.y) <= b.radiusM)) return 'bunker';
  if (p.y >= -5 && p.y <= hole.lengthM && Math.abs(p.x) <= FAIRWAY_HALF_WIDTH_M) return 'fairway';
  return 'rough';
}

function onTee(hole: GolfHole, player: GolfPlayer): GolfPlayer {
  return {
    ...player,
    ball: { x: 0, y: 0 },
    lie: 'tee',
    club: suggestClub(hole.lengthM, 'tee'),
    clubChosen: false,
    strokes: 0,
    result: 'playing',
    flight: null,
    shotFrom: null,
    lastShot: null,
  };
}

const isDone = (p: GolfPlayer) => p.result !== 'playing';

/** Tira chi è più lontano dalla bandiera (regola del golf); `null` se hanno finito tutti. */
export function nextShooter(state: GolfState): string | null {
  const hole = currentHole(state);
  const waiting = state.players.filter((p) => !isDone(p));
  if (waiting.length === 0) return null;
  return waiting.reduce((far, p) => (distanceToPin(hole, p.ball) > distanceToPin(hole, far.ball) ? p : far)).id;
}

export interface GolfOptions {
  readonly holes?: number;
  readonly seed?: number;
}

export function createGolf(playerIds: readonly string[], opts: GolfOptions = {}): Step {
  const course = makeCourse(Math.max(1, opts.holes ?? 3), opts.seed ?? 1);
  const hole = course[0]!;
  const blank: GolfPlayer = {
    id: '', ball: { x: 0, y: 0 }, lie: 'tee', club: 'driver', clubChosen: false, strokes: 0, result: 'playing',
    flight: null, shotFrom: null, card: course.map(() => null), lastShot: null,
  };
  const players = playerIds.map((id) => onTee(hole, { ...blank, id }));
  const base: GolfState = { course, hole: 1, phase: 'aim', players, turn: players[0]?.id ?? null, timer: 0, accumulator: 0 };
  const events: GolfEvent[] = [{ kind: 'hole_started', hole: 1, par: hole.par }];
  if (base.turn) events.push({ kind: 'turn', playerId: base.turn });
  return { state: base, events };
}

const replacePlayer = (state: GolfState, player: GolfPlayer): GolfState => ({
  ...state,
  players: state.players.map((p) => (p.id === player.id ? player : p)),
});

export function findPlayer(state: GolfState, id: string): GolfPlayer | undefined {
  return state.players.find((p) => p.id === id);
}

/** Il giocatore sceglie la mazza (il putter va solo sul green). */
export function setClub(state: GolfState, id: string, club: Club): GolfState {
  const player = findPlayer(state, id);
  if (!player || !CLUBS.includes(club) || (club === 'putter') !== (player.lie === 'green')) return state;
  return replacePlayer(state, { ...player, club, clubChosen: true });
}

function refusal(state: GolfState, player: GolfPlayer, shot: ShotInput): RefusedReason | null {
  if (isDone(player)) return 'hole_finished';
  if (player.flight || state.phase === 'flight') return 'ball_moving';
  if (state.turn !== player.id) return 'not_your_turn';
  if (shot.kind === 'full' && player.lie === 'green') return 'green_needs_putt';
  if (shot.kind === 'putt' && player.lie === 'green' && shot.strokeDeg < PUTT_MIN_DEG) return 'too_small';
  return null;
}

/** Gioca un colpo riconosciuto sul telefono. */
export function applyShot(state: GolfState, id: string, shot: ShotInput): Step {
  const player = findPlayer(state, id);
  if (!player) return { state, events: [] };
  const why = refusal(state, player, shot);
  if (why) return { state, events: [{ kind: 'refused', playerId: id, reason: why }] };

  const hole = currentHole(state);
  const toPinX = -player.ball.x;
  const toPinY = hole.lengthM - player.ball.y;
  const bearingDeg = Math.atan2(toPinX, toPinY) / DEG;
  const aimDeg = clamp(shot.aimDeg, -AIM_LIMIT_DEG, AIM_LIMIT_DEG);
  const isPutt = player.lie === 'green';
  let flight: Flight;
  let carryM: number;
  if (isPutt) {
    carryM = shot.strokeDeg * PUTT_M_PER_DEG * hole.greenSpeed;
    flight = {
      headingDeg: bearingDeg + aimDeg,
      speed: Math.sqrt(2 * PUTT_DECEL * Math.max(0, carryM)),
      airborne: false,
      carryLeft: 0,
      carryM,
      curveDegPerM: hole.slopeDegPerM,
      decel: PUTT_DECEL,
    };
  } else {
    // un colpo "full" fatto dolcemente, o un putt fuori dal green, gioca la mazza in mano
    const power = shot.kind === 'putt' ? clamp01(shot.strokeDeg / 140) : clamp01(shot.power);
    const faceDeg = shot.kind === 'putt' ? 0 : clamp(shot.faceDeg, -FACE_LIMIT_DEG, FACE_LIMIT_DEG);
    const spread = LIE_SPREAD[player.lie];
    carryM = CLUB_CARRY_M[player.club] * (0.35 + 0.65 * power) * LIE_CARRY[player.lie];
    flight = {
      headingDeg: bearingDeg + aimDeg + faceDeg * FACE_START_SHARE * spread,
      speed: 26 + 0.09 * carryM,
      airborne: true,
      carryLeft: carryM,
      carryM,
      curveDegPerM: faceDeg * CURVE_PER_FACE_DEG * spread + hole.wind * WIND_CURVE_PER_MS,
      decel: 0,
    };
  }
  const struck: GolfPlayer = { ...player, strokes: player.strokes + 1, flight, shotFrom: player.ball, clubChosen: false };
  return {
    state: { ...replacePlayer(state, struck), phase: 'flight', turn: null },
    events: [{ kind: 'struck', playerId: id, shot: isPutt ? 'putt' : 'full', club: player.club, carryM }],
  };
}

/** Un passo di volo/rotolamento (passo fisso). */
function advanceFlight(hole: GolfHole, player: GolfPlayer, h: number): { player: GolfPlayer; events: GolfEvent[]; rested: boolean; holed: boolean; conceded: boolean } {
  const f = player.flight!;
  const stepM = f.speed * h;
  const headingDeg = f.headingDeg + f.curveDegPerM * stepM;
  const ball = { x: player.ball.x + Math.sin(headingDeg * DEG) * stepM, y: player.ball.y + Math.cos(headingDeg * DEG) * stepM };
  let next: Flight = { ...f, headingDeg };
  const events: GolfEvent[] = [];
  let lie = player.lie;

  if (f.airborne) {
    const carryLeft = f.carryLeft - stepM;
    if (carryLeft > 0) return { player: { ...player, ball, flight: { ...next, carryLeft } }, events, rested: false, holed: false, conceded: false };
    lie = lieAt(hole, ball);
    const decel = ROLL_DECEL[lie];
    const rollM = f.carryM * ROLL_FRACTION[lie];
    next = { ...next, airborne: false, carryLeft: 0, decel, curveDegPerM: lie === 'green' ? hole.slopeDegPerM : 0, speed: Math.sqrt(2 * decel * rollM) };
    events.push({ kind: 'landed', playerId: player.id, lie });
  } else {
    next = { ...next, speed: Math.max(0, f.speed - f.decel * h) };
  }

  const toPin = distanceToPin(hole, ball);
  if (hole.greenRadiusM > 0 && toPin <= CUP_RADIUS_M && next.speed <= CUP_CAPTURE_SPEED) {
    return { player: { ...player, ball: pinOf(hole), lie: 'green', flight: null }, events, rested: true, holed: true, conceded: false };
  }
  if (next.speed <= 0) {
    const restLie = lieAt(hole, ball);
    const conceded = restLie === 'green' && toPin <= GIMME_RADIUS_M;
    const rested: GolfPlayer = {
      ...player,
      ball: conceded ? pinOf(hole) : ball,
      lie: restLie,
      flight: null,
      strokes: conceded ? player.strokes + 1 : player.strokes,
    };
    return { player: rested, events, rested: true, holed: conceded, conceded };
  }
  return { player: { ...player, ball, lie, flight: next }, events, rested: false, holed: false, conceded: false };
}

function settle(state: GolfState, player: GolfPlayer, holed: boolean, conceded: boolean): { player: GolfPlayer; events: GolfEvent[] } {
  const hole = currentHole(state);
  const from = player.shotFrom ?? player.ball;
  const record: ShotRecord = {
    kind: lieAt(hole, from) === 'green' ? 'putt' : 'full',
    club: player.club,
    from,
    to: player.ball,
    distanceM: Math.hypot(player.ball.x - from.x, player.ball.y - from.y),
    endLie: player.lie,
    holed,
  };
  const events: GolfEvent[] = [{ kind: 'rested', playerId: player.id, record }];
  const setCard = (strokes: number) => player.card.map((c, i) => (i === state.hole - 1 ? strokes : c));
  let next: GolfPlayer = { ...player, shotFrom: null, lastShot: record };
  if (holed) {
    next = { ...next, result: 'holed', card: setCard(player.strokes) };
    events.push({ kind: 'holed', playerId: player.id, strokes: player.strokes, par: hole.par, term: termFor(player.strokes, hole.par), conceded });
  } else if (player.strokes >= hole.par + STROKES_OVER_PAR) {
    next = { ...next, result: 'picked_up', card: setCard(player.strokes) };
    events.push({ kind: 'picked_up', playerId: player.id, strokes: player.strokes });
  } else if (!player.clubChosen) {
    next = { ...next, club: suggestClub(distanceToPin(hole, player.ball), player.lie) };
  }
  return { player: next, events };
}

function startHole(state: GolfState, hole: number): Step {
  const h = state.course[hole - 1]!;
  const players = state.players.map((p) => onTee(h, p));
  const next: GolfState = { ...state, hole, phase: 'aim', players, turn: null, timer: 0 };
  const turn = nextShooter(next);
  const events: GolfEvent[] = [{ kind: 'hole_started', hole, par: h.par }];
  if (turn) events.push({ kind: 'turn', playerId: turn });
  return { state: { ...next, turn }, events };
}

/** Avanza il tempo di `dt` secondi: volo delle palle, fine buca, passaggio del turno. */
export function stepGolf(state: GolfState, dt: number): Step {
  if (state.phase === 'over') return { state, events: [] };
  if (state.phase === 'hole_over') {
    const timer = state.timer - dt;
    if (timer > 0) return { state: { ...state, timer }, events: [] };
    if (state.hole >= state.course.length) return { state: { ...state, phase: 'over', timer: 0 }, events: [{ kind: 'over' }] };
    return startHole(state, state.hole + 1);
  }

  const events: GolfEvent[] = [];
  let s: GolfState = state;
  let accumulator = Math.min(state.accumulator + dt, MAX_CATCH_UP);
  const hole = currentHole(state);
  while (accumulator >= FLIGHT_STEP) {
    accumulator -= FLIGHT_STEP;
    for (const p of s.players) {
      if (!p.flight) continue;
      const r = advanceFlight(hole, p, FLIGHT_STEP);
      events.push(...r.events);
      let updated = r.player;
      if (r.rested) {
        const settled = settle(s, updated, r.holed, r.conceded);
        updated = settled.player;
        events.push(...settled.events);
      }
      s = replacePlayer(s, updated);
    }
  }
  s = { ...s, accumulator };

  if (s.phase === 'flight' && !s.players.some((p) => p.flight)) {
    if (s.players.every(isDone)) {
      return { state: { ...s, phase: 'hole_over', turn: null, timer: HOLE_OVER_SECONDS }, events: [...events, { kind: 'hole_over', hole: s.hole }] };
    }
    const turn = nextShooter(s);
    s = { ...s, phase: 'aim', turn };
    if (turn) events.push({ kind: 'turn', playerId: turn });
  }
  return { state: s, events };
}

/** Un giocatore lascia la partita: la sua buca finisce qui (raccolta). */
export function removePlayer(state: GolfState, id: string): Step {
  const player = findPlayer(state, id);
  if (!player || isDone(player)) return { state, events: [] };
  const picked = { ...player, result: 'picked_up' as const, flight: null, card: player.card.map((c, i) => (i === state.hole - 1 ? player.strokes : c)) };
  let s = replacePlayer(state, picked);
  const events: GolfEvent[] = [{ kind: 'picked_up', playerId: id, strokes: player.strokes }];
  if (s.turn === id) {
    const turn = s.players.every(isDone) ? null : nextShooter(s);
    s = { ...s, turn };
    if (turn) events.push({ kind: 'turn', playerId: turn });
  }
  if (s.phase === 'aim' && s.players.every(isDone)) {
    return { state: { ...s, phase: 'hole_over', timer: HOLE_OVER_SECONDS }, events: [...events, { kind: 'hole_over', hole: s.hole }] };
  }
  return { state: s, events };
}

export interface Card {
  readonly playerId: string;
  readonly total: number;
  readonly toPar: number;
  readonly holesPlayed: number;
}

export function cardOf(state: GolfState, player: GolfPlayer): Card {
  let total = 0;
  let par = 0;
  let holesPlayed = 0;
  player.card.forEach((strokes, i) => {
    if (strokes === null) return;
    total += strokes;
    par += state.course[i]?.par ?? 0;
    holesPlayed++;
  });
  return { playerId: player.id, total, toPar: total - par, holesPlayed };
}

/** Classifica: meno colpi rispetto al par, a parità di buche giocate. */
export function leaderboard(state: GolfState): readonly Card[] {
  return state.players.map((p) => cardOf(state, p)).sort((a, b) => b.holesPlayed - a.holesPlayed || a.toPar - b.toPar);
}
