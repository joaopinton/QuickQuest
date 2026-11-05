// Pad del golf sul telefono (docs/05 § Lato controller). Il colpo pieno parte dal gesto:
// si tiene fermo il telefono un attimo (presa), poi swing. Sul green si tiene premuto
// "Putt", si fa il movimento e si rilascia. Lo schermo decide cosa vale e lo dice con i cue.
import { slotStyle } from '@quickquest/ui';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ControllerPadProps } from '../../contract';
import { ClubArt } from '../shared/ClubArt';
import { CLUB_CARRY_M, CLUB_HINT, CLUB_NAME, clubFromTurnText, FULL_CLUBS, type Club } from '../shared/clubs';
import { createGolfRecognizer, type GolfShotData } from './recognizer';
import './golf-pad.css';

const UI_REFRESH_MS = 120;
const SIM_PUTT_DEG = 22;

interface ClubPickerProps {
  readonly club: Club;
  readonly isEnabled: boolean;
  readonly onPick: (club: Club) => void;
}

/** Le mazze disegnate, una accanto all'altra: si tocca quella che si vuole. Sul green c'è solo il putter. */
function ClubPicker({ club, isEnabled, onPick }: ClubPickerProps) {
  if (club === 'putter') {
    return (
      <div class="golf-clubs golf-clubs--putter" role="group" aria-label="Mazza">
        <div class="golf-club is-selected" aria-current="true">
          <ClubArt club="putter" class="golf-club__art" />
          <span class="golf-club__name">{CLUB_NAME.putter}</span>
          <span class="golf-club__meta">{CLUB_HINT.putter}</span>
        </div>
      </div>
    );
  }
  return (
    <div class="golf-clubs" role="radiogroup" aria-label="Scegli la mazza">
      {FULL_CLUBS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === club}
          class={`golf-club ${c === club ? 'is-selected' : ''}`}
          disabled={!isEnabled}
          onClick={() => onPick(c)}
        >
          <ClubArt club={c} class="golf-club__art" />
          <span class="golf-club__name">{CLUB_NAME[c]}</span>
          <span class="golf-club__meta">fino a {CLUB_CARRY_M[c]} m</span>
        </button>
      ))}
    </div>
  );
}

function shotEvent(shot: GolfShotData) {
  return {
    kind: 'shot',
    data: {
      kind: shot.kind,
      power: Math.round(shot.power * 1000) / 1000,
      faceDeg: Math.round(shot.faceDeg * 10) / 10,
      aimDeg: Math.round(shot.aimDeg * 10) / 10,
      strokeDeg: Math.round(shot.strokeDeg * 10) / 10,
    },
  };
}

export function Pad({ slot, color, activeSlot, isLost, isDemo, isSimulated, tracker, haptics, lastCue, send, onLeave }: ControllerPadProps) {
  const recognizer = useMemo(() => createGolfRecognizer(), []);
  const [hasGrip, setGrip] = useState(false);
  const [aimDeg, setAim] = useState(0);
  const [isPutting, setPutting] = useState(false);
  const [club, setClub] = useState<Club>('driver');
  const isMyTurn = activeSlot === slot && !isLost;
  const style = slotStyle(slot);
  // il tracker chiama a 60 Hz: turno e funzioni si leggono da ref, senza riabbonarsi a ogni render
  const live = useRef({ isMyTurn, send, haptics });
  live.current = { isMyTurn, send, haptics };

  // turno nuovo (o perso): si riparte da una presa nuova
  useEffect(() => recognizer.reset(), [isMyTurn, recognizer]);

  useEffect(() => {
    const off = tracker.subscribe((s) => {
      const shot = recognizer.feed(s);
      if (shot && live.current.isMyTurn) {
        live.current.send(shotEvent(shot));
        live.current.haptics.impact(shot.power); // fuori da un tocco: su iPhone non vibra
      }
    });
    const id = setInterval(() => {
      setGrip(recognizer.hasGrip);
      setAim(Math.round(recognizer.aimDeg));
    }, UI_REFRESH_MS);
    return () => {
      off();
      clearInterval(id);
    };
  }, [tracker, recognizer]);

  // a ogni turno lo schermo dice che mazza ha messo in mano (suggerita o putter sul green)
  useEffect(() => {
    const suggested = clubFromTurnText(lastCue?.text);
    if (suggested) setClub(suggested);
  }, [lastCue]);

  const pickClub = (next: Club) => {
    if (next === club) return;
    setClub(next);
    haptics.play('select');
    send({ kind: 'club', data: { club: next } });
  };

  const puttDown = (e: PointerEvent) => {
    e.preventDefault();
    if (!isMyTurn) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    recognizer.pressPutt(performance.now());
    setPutting(true);
    haptics.play('tap');
  };

  const puttUp = (e: PointerEvent) => {
    e.preventDefault();
    if (!isPutting) return;
    setPutting(false);
    const shot = recognizer.releasePutt(performance.now());
    if (shot && isMyTurn) {
      send(shotEvent(shot));
      haptics.play('success');
    }
  };

  const simulatedSwing = () => {
    // sul green un colpo pieno verrebbe rifiutato: il simulatore fa un putt medio
    const shot: GolfShotData = club === 'putter'
      ? { kind: 'putt', power: 0, faceDeg: 0, aimDeg: 0, strokeDeg: SIM_PUTT_DEG }
      : { kind: 'full', power: 0.75, faceDeg: 0, aimDeg: 0, strokeDeg: 0 };
    send(shotEvent(shot));
    haptics.play('success');
  };

  let status = 'Aspetta il tuo turno';
  if (isLost) status = 'Riconnessione…';
  else if (isMyTurn && !hasGrip && !isSimulated) status = 'Tieni fermo il telefono come un bastone…';
  else if (isMyTurn) status = 'Presa ok: swing!';

  return (
    <section class="ctl-screen ctl-game golf-pad" style={{ '--slot': color || style.hex }}>
      <header class="ctl-game__bar">
        <div class="ctl-slot-pill">
          <span>{style.symbol}</span>
          <strong>{slot}</strong>
        </div>
        <span class="ctl-game__title">Golf</span>
        {isDemo && <span class="ctl-demo">demo</span>}
      </header>

      <p class={`ctl-turn ${isMyTurn ? 'ctl-turn--mine' : ''}`} aria-live="polite">{status}</p>
      {lastCue?.text && <p class="golf-pad__cue" aria-live="polite">{lastCue.text}</p>}

      <ClubPicker club={club} isEnabled={isMyTurn} onPick={pickClub} />

      <div class={`golf-pad__aim ${hasGrip ? 'is-ready' : ''}`} aria-label={`Mira ${aimDeg} gradi`}>
        <span class="golf-pad__aim-dot" style={{ transform: `translateX(${aimDeg * 4}px)` }} />
        <span class="golf-pad__aim-label">{aimDeg === 0 ? 'dritto' : aimDeg > 0 ? `${aimDeg}° a destra` : `${-aimDeg}° a sinistra`}</span>
      </div>

      {isSimulated && isMyTurn && (
        <button type="button" class="ctl-action-btn" onClick={simulatedSwing}>
          <span class="ctl-action-btn__icon" aria-hidden="true">🏌️</span>
          <span>Colpo di prova</span>
        </button>
      )}

      <button
        type="button"
        class={`ctl-action-btn golf-pad__putt ${isPutting ? 'is-pressed' : ''}`}
        disabled={!isMyTurn}
        onPointerDown={puttDown}
        onPointerUp={puttUp}
        onPointerCancel={puttUp}
      >
        <span class="ctl-action-btn__icon" aria-hidden="true">⛳</span>
        <span>{isPutting ? 'Rilascia per puttare' : 'Tieni premuto per il putt'}</span>
      </button>

      <footer class="ctl-actions">
        <button type="button" class="qq-btn qq-btn--ghost" onClick={onLeave}>Esci</button>
      </footer>
    </section>
  );
}
