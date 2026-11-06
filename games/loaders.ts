// Loader dei giochi che seguono il contratto (contract.ts). Import dinamici: il telefono scarica
// solo il pad del gioco in corso, lo schermo solo la sua scena.
import type { ControllerModule, ScreenModule } from './contract';
import type { GameMeta } from './registry';

export interface GameLoaders {
  readonly screen: () => Promise<ScreenModule>;
  readonly controller: () => Promise<ControllerModule>;
}

export const GAME_LOADERS: Partial<Record<GameMeta['id'], GameLoaders>> = {
  bowling: {
    screen: () => import('./bowling/screen/BowlingScreen'),
    controller: () => import('./bowling/controller/BowlingPad'),
  },
  'free-throw': {
    screen: () => import('./free-throw/screen/FreeThrowScreen'),
    controller: () => import('./free-throw/controller/FreeThrowPad'),
  },
  golf: {
    screen: () => import('./golf/screen/GolfScreen'),
    controller: () => import('./golf/controller/GolfPad'),
  },
};

export function loadersFor(id: string | null): GameLoaders | undefined {
  return id ? GAME_LOADERS[id as GameMeta['id']] : undefined;
}

/** Si può avviare dalla lobby: ha i suoi loader. */
export function isPlayable(id: string): boolean {
  return loadersFor(id) !== undefined;
}
