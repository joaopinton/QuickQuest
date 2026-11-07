// Slot giocatore della lobby: vuoto, in connessione, pronto, disconnesso (docs/08 § 4).
import type { JSX } from 'preact';
import { t } from '../i18n';
import type { BubuStyle } from '../look';
import type { SlotId } from '../palette';
import { slotStyle } from '../palette';
import { Bubu } from './Bubu';

export type SlotState = 'empty' | 'connecting' | 'ready' | 'disconnected';

export interface PlayerSlotProps {
  slot: SlotId;
  state: SlotState;
  bubuColor?: string;
  look?: Partial<BubuStyle>;
  /** Nome scelto dal giocatore; senza, si vede solo lo slot. */
  name?: string;
}

const STATE_LABEL: Record<SlotState, string> = {
  empty: 'lobby.slotEmpty',
  connecting: 'lobby.slotConnecting',
  ready: 'lobby.slotReady',
  disconnected: 'lobby.slotDisconnected',
};

export function PlayerSlot({ slot, state, bubuColor, look, name }: PlayerSlotProps) {
  const s = slotStyle(slot);
  const style = { '--slot': s.hex } as JSX.CSSProperties;
  const label = t(STATE_LABEL[state]);
  return (
    <div class={`qq-slot qq-slot--${state}`} style={style} data-slot={slot} data-state={state}>
      <div class="qq-slot__stage">
        {state === 'ready' || state === 'disconnected' ? (
          <Bubu
            color={state === 'disconnected' ? '#A9B4CC' : (bubuColor ?? s.hex)}
            look={look}
            mood={state === 'ready' ? 'happy' : 'lost'}
            motion={state === 'ready' ? 'hop' : 'none'}
            size="78%"
          />
        ) : state === 'connecting' ? (
          <span class="qq-dots" aria-hidden="true"><i /><i /><i /></span>
        ) : (
          <span class="qq-slot__ghost" aria-hidden="true">{s.symbol}</span>
        )}
      </div>
      <div class="qq-slot__tag">
        <span class="qq-slot__symbol" aria-hidden="true">{s.symbol}</span>
        <span class="qq-slot__id">{name ?? slot}</span>
        <span class="qq-slot__state">{label}</span>
      </div>
    </div>
  );
}
