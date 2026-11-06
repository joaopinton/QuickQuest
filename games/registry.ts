// Registro dei giochi (docs/05). Per ora solo i meta: i loader arrivano con ogni gioco.

export type GameStatus = 'soon' | 'later';

export interface GameMeta {
  readonly id: 'bowling' | 'bocce' | 'free-throw' | 'golf' | 'barber' | 'fencing';
  readonly name: string;
  readonly tagline: string;
  readonly gesture: string;
  readonly accent: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly mode: 'turni' | 'simultaneo';
  readonly estMinutes: number;
  readonly status: GameStatus;
}

export const GAMES: readonly GameMeta[] = [
  {
    id: 'bowling',
    name: 'Bowling',
    tagline: 'Dieci birilli, una pista lucida e il tuo effetto migliore.',
    gesture: 'Swing dal basso, alzi il pollice per rilasciare e ruoti il polso per l’effetto.',
    accent: '#8E5BFF',
    players: { min: 1, max: 4 },
    mode: 'turni',
    estMinutes: 15,
    status: 'soon',
  },
  {
    id: 'bocce',
    name: 'Bocce',
    tagline: 'Accosta al pallino o boccia tutto: la piazzetta è tua.',
    gesture: 'Lancio morbido dal basso: dosi la forza come con una boccia vera.',
    accent: '#E07A4F',
    players: { min: 1, max: 4 },
    mode: 'turni',
    estMinutes: 12,
    status: 'later',
  },
  {
    id: 'free-throw',
    name: 'Tiri liberi',
    tagline: 'Gomito dritto, polso morbido, solo retina.',
    gesture: 'Carica sopra la testa, spingi verso l’alto e chiudi il polso a gancio.',
    accent: '#FF8A2B',
    players: { min: 1, max: 4 },
    mode: 'turni',
    estMinutes: 8,
    status: 'soon',
  },
  {
    id: 'golf',
    name: 'Golf',
    tagline: 'Colline morbide e un green che perdona poco.',
    gesture: 'Backswing a due mani e colpo: conta la velocità e la faccia del bastone.',
    accent: '#3FAE4A',
    players: { min: 1, max: 4 },
    mode: 'turni',
    estMinutes: 15,
    status: 'soon',
  },
  {
    id: 'barber',
    name: 'Barber shop',
    tagline: 'Il cliente vuole “solo una spuntatina”. Auguri.',
    gesture: 'Il telefono è il tagliacapelli: lo inclini e lo muovi sulla testa del cliente.',
    accent: '#2EC4B6',
    players: { min: 1, max: 4 },
    mode: 'turni',
    estMinutes: 10,
    status: 'later',
  },
  {
    id: 'fencing',
    name: 'Scherma',
    tagline: 'En garde! Vince chi tocca per primo.',
    gesture: 'Il telefono è il fioretto: affondo veloce e parate con il polso.',
    accent: '#E8455A',
    players: { min: 2, max: 2 },
    mode: 'simultaneo',
    estMinutes: 6,
    status: 'later',
  },
];

export function findGame(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}
