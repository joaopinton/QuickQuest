// Pad di un gioco sul contratto modulo (games/contract.ts), caricato solo quando serve:
// il telefono scarica il codice del gioco in corso e basta.
import type { ControllerPadProps } from '@quickquest/games/contract';
import { loadersFor } from '@quickquest/games/loaders';
import { t } from '@quickquest/ui';
import type { ComponentType } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useMemo } from 'preact/hooks';

export function ModulePad({ gameId, ...props }: ControllerPadProps & { gameId: string }) {
  const Pad = useMemo<ComponentType<ControllerPadProps> | null>(() => {
    const loaders = loadersFor(gameId);
    return loaders ? lazy(() => loaders.controller().then((m) => m.Pad)) : null;
  }, [gameId]);
  if (!Pad) return null;
  return (
    <Suspense fallback={<section class="ctl-screen ctl-game"><p class="ctl-turn">{t('controller.loadingGame')}</p></section>}>
      <Pad {...props} />
    </Suspense>
  );
}
