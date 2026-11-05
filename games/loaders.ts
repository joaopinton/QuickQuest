// Loader dei giochi che seguono il contratto (contract.ts). Import dinamici: il telefono scarica
// solo il pad del gioco in corso, lo schermo solo la sua scena.
import type { ControllerModule, ScreenModule } from './contract';
import type { GameMeta } from './registry';

export interface GameLoaders {
  readonly screen: () => Promise<ScreenModule>;
  readonly controller: () => Promise<ControllerModule>;
}

export const GAME_LOADERS: Partial<Record<GameMeta['id'], GameLoaders>> = {
  golf: {
    screen: () => import('./golf/screen/GolfScreen'),
    controller: () => import('./golf/controller/GolfPad'),
  },
};

export function loadersFor(id: string | null): GameLoaders | undefined {
  return id ? GAME_LOADERS[id as GameMeta['id']] : undefined;
}

/** Si può avviare dalla lobby: il bowling (cablato) o un gioco con i suoi loader. */
export function isPlayable(id: string): boolean {
  return id === 'bowling' || loadersFor(id) !== undefined;
}
