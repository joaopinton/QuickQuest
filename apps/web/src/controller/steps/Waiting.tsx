// Attesa: tinta del giocatore al 12%, simbolo dello slot, il proprio Pupo (docs/08 § 2).
import type { LobbyPlayer } from '@quickquest/protocol';
import { Button, Pupo, slotStyle, t, type Accessory, type SlotId } from '@quickquest/ui';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';

export interface WaitingProps {
  slot: SlotId;
  color: string;
  accessory: Accessory;
  isDemo: boolean;
  isLost: boolean;
  players: readonly LobbyPlayer[];
  onChangePupo: () => void;
  onLeave: () => void;
}

export function Waiting({ slot, color, accessory, isDemo, isLost, players, onChangePupo, onLeave }: WaitingProps) {
  const s = slotStyle(slot);
  const style = { '--slot': s.hex, '--tint': color } as JSX.CSSProperties;

  // Tinta del giocatore al 12% su tutta la pagina: ognuno riconosce il proprio telefono.
  useEffect(() => {
    document.body.style.backgroundColor = `color-mix(in oklab, ${s.hex} 12%, #FFF6E5)`;
    return () => { document.body.style.backgroundColor = ''; };
  }, [s.hex]);
  return (
    <section class="ctl-screen ctl-wait" style={style}>
      <header class="ctl-wait__bar">
        <span class="ctl-slot-pill"><span aria-hidden="true">{s.symbol}</span> {t('controller.youAre', { slot })}</span>
        {isDemo && <span class="ctl-demo">{t('controller.demoBadge')}</span>}
      </header>
      {isLost && <p class="ctl-banner ctl-banner--danger" role="alert">{t('controller.reconnecting')}</p>}
      <div class="ctl-wait__stage">
        <span class="ctl-wait__halo" aria-hidden="true" />
        <span class="ctl-wait__orbit" aria-hidden="true"><i>{s.symbol}</i><i>{s.symbol}</i><i>{s.symbol}</i></span>
        <Pupo color={color} accessory={accessory} mood="wait" motion="breathe" size={210} />
      </div>
      <h1 class="ctl-title">{t('controller.waitTitle')}</h1>
      <p class="ctl-lead">{t('controller.waitLead')}</p>
      {players.length > 0 && (
        <ul class="ctl-others" aria-label={t('controller.othersLabel')}>
          {players.map((p) => (
            <li key={p.slot} class={`ctl-other ctl-other--${p.state}`} style={{ '--slot': slotStyle(p.slot).hex } as JSX.CSSProperties}>
              <span aria-hidden="true">{slotStyle(p.slot).symbol}</span> {p.slot}
            </li>
          ))}
        </ul>
      )}
      <div class="ctl-actions ctl-actions--row">
        <Button variant="secondary" onClick={onChangePupo}>{t('controller.changePupo')}</Button>
        <Button variant="ghost" onClick={onLeave}>{t('controller.leave')}</Button>
      </div>
    </section>
  );
}
