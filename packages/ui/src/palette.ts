// Colori dei Pupi e degli slot giocatore (docs/07 § 4).

export interface PupoColor {
  readonly id: string;
  readonly hex: string;
}

export const PUPO_COLORS: readonly PupoColor[] = [
  { id: 'cherry', hex: '#EF4E5B' },
  { id: 'ocean', hex: '#3C8CF0' },
  { id: 'lemon', hex: '#F7C531' },
  { id: 'mint', hex: '#34C27A' },
  { id: 'orange', hex: '#FF9A3C' },
  { id: 'grape', hex: '#9C6BFF' },
  { id: 'candy', hex: '#FF7EB6' },
  { id: 'lagoon', hex: '#2EC4B6' },
];

export type Accessory = 'none' | 'cap' | 'band' | 'headphones' | 'glasses' | 'bowtie' | 'leaves';
export const ACCESSORIES: readonly Accessory[] = ['none', 'cap', 'band', 'headphones', 'glasses', 'bowtie', 'leaves'];

export type SlotId = 'P1' | 'P2' | 'P3' | 'P4';

export interface PlayerSlotStyle {
  readonly id: SlotId;
  readonly hex: string;
  readonly symbol: string;
  readonly symbolName: string;
}

export const PLAYER_SLOTS: readonly PlayerSlotStyle[] = [
  { id: 'P1', hex: '#EF4E5B', symbol: '●', symbolName: 'cerchio' },
  { id: 'P2', hex: '#3C8CF0', symbol: '▲', symbolName: 'triangolo' },
  { id: 'P3', hex: '#F7C531', symbol: '■', symbolName: 'quadrato' },
  { id: 'P4', hex: '#34C27A', symbol: '◆', symbolName: 'rombo' },
];

export function slotStyle(id: SlotId): PlayerSlotStyle {
  const found = PLAYER_SLOTS.find((s) => s.id === id);
  if (!found) throw new Error(`Slot sconosciuto: ${id}`);
  return found;
}

export function pupoColor(id: string): PupoColor {
  return PUPO_COLORS.find((c) => c.id === id) ?? PUPO_COLORS[0]!;
}
