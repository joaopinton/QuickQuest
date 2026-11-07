// Attesa: tinta del giocatore al 12%, simbolo dello slot, il proprio Piggy (docs/08 § 2).
import type { LobbyPlayer } from '@quickquest/protocol';
import { Button, Piggy, displayName, slotStyle, t, type PiggyStyle, type SlotId } from '@quickquest/ui';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';

export interface WaitingProps {
  slot: SlotId;
  color: string;
  look: PiggyStyle;
  name: string;
  isDemo: boolean;
  isLost: boolean;
  players: readonly LobbyPlayer[];
  onChangePiggy: () => void;
  onLeave: () => void;
}

export function Waiting({ slot, color, look, name, isDemo, isLost, players, onChangePiggy, onLeave }: WaitingProps) {
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
        <Piggy color={color} look={look} mood="wait" motion="breathe" size={210} />
      </div>
      <p class="ctl-wait__name">{displayName(name, slot)}</p>
      <h1 class="ctl-title">{t('controller.waitTitle')}</h1>
      <p class="ctl-lead">{t('controller.waitLead')}</p>
      {players.length > 0 && (
        <ul class="ctl-others" aria-label={t('controller.othersLabel')}>
          {players.map((p) => (
            <li key={p.slot} class={`ctl-other ctl-other--${p.state}`} style={{ '--slot': slotStyle(p.slot).hex } as JSX.CSSProperties}>
              <span aria-hidden="true">{slotStyle(p.slot).symbol}</span> {displayName(p.profile?.name, p.slot)}
            </li>
          ))}
        </ul>
      )}
      <div class="ctl-actions">
        <Button size="xl" variant="secondary" isBlock onClick={onChangePiggy}>{t('controller.changePiggy')}</Button>
        <Button size="lg" variant="ghost" isBlock onClick={onLeave}>{t('controller.leave')}</Button>
      </div>
    </section>
  );
}
