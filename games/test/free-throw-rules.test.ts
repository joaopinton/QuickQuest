import { describe, expect, test } from 'vitest';
import { idealSpeedForAngle } from '../free-throw/screen/physics';
import {
  applyShotAssist,
  computeAwards,
  createFreeThrowGame,
  currentShooter,
  feedbackMessageFor,
  HOT_HAND_STREAK,
  POINTS_BASKET,
  POINTS_SWISH,
  recordShot,
  shouldShowGuideArc,
  standings,
  tickTimedMode,
  TIMED_DURATION_S,
} from '../free-throw/screen/rules';

describe('Regole, Punteggio, Assist e Premi dei Tiri liberi (docs/games/free-throw.md)', () => {
  test('punteggio: canestro vale 2 punti, swish ("ciuff") vale 3 punti (bonus)', () => {
    let g = createFreeThrowGame(['P1'], { mode: 'quick', rounds: 3 });
    g = recordShot(g, 'rim-in');
    expect(g.players[0]!.score).toBe(POINTS_BASKET); // 2

    g = recordShot(g, 'swish');
    expect(g.players[0]!.score).toBe(POINTS_BASKET + POINTS_SWISH); // 5
    expect(g.players[0]!.swishes).toBe(1);

    g = recordShot(g, 'rim-out');
    expect(g.players[0]!.score).toBe(5);
    expect(g.isOver).toBe(true);
  });

  test('rotazione dei turni a giri: P1 tiro 1 -> P2 tiro 1 -> P1 tiro 2', () => {
    let g = createFreeThrowGame(['P1', 'P2'], { mode: 'quick', rounds: 2 });
    expect(currentShooter(g).playerId).toBe('P1');
    expect(g.currentRound).toBe(1);

    g = recordShot(g, 'swish'); // P1 fa 3 pt
    expect(currentShooter(g).playerId).toBe('P2');
    expect(g.currentRound).toBe(1);

    g = recordShot(g, 'rim-in'); // P2 fa 2 pt
    expect(currentShooter(g).playerId).toBe('P1');
    expect(g.currentRound).toBe(2);

    g = recordShot(g, 'airball'); // P1 resta a 3
    g = recordShot(g, 'rim-out'); // P2 resta a 2
    expect(g.isOver).toBe(true);
    expect(standings(g)[0]!.playerId).toBe('P1');
  });

  test('spareggio a morte improvvisa (tiebreaker) quando i primi finiscono in parità', () => {
    let g = createFreeThrowGame(['P1', 'P2', 'P3'], { mode: 'quick', rounds: 1 });
    g = recordShot(g, 'swish');  // P1: 3 pt
    g = recordShot(g, 'swish');  // P2: 3 pt
    g = recordShot(g, 'rim-in'); // P3: 2 pt

    // P1 e P2 sono in parità a 3 pt: parte lo spareggio solo tra P1 e P2!
    expect(g.isOver).toBe(false);
    expect(g.isTiebreaker).toBe(true);
    expect(g.activeIndices).toEqual([0, 1]);
    expect(currentShooter(g).playerId).toBe('P1');

    // Nel giro di spareggio P1 segna e P2 sbaglia -> P1 vince
    g = recordShot(g, 'rim-in');
    expect(currentShooter(g).playerId).toBe('P2');
    g = recordShot(g, 'rim-out');
    expect(g.isOver).toBe(true);
    expect(standings(g)[0]!.playerId).toBe('P1');
  });

  test('modalità a tempo (60 s): serie di 3 canestri attiva Mano calda (moltiplicatore ×2)', () => {
    let g = createFreeThrowGame(['P1', 'P2'], { mode: 'timed' });
    expect(g.timeRemainingS).toBe(TIMED_DURATION_S);

    // 3 canestri normali (2 + 2 + 2 = 6 pt): attiva la serie di 3
    for (let i = 0; i < HOT_HAND_STREAK; i++) {
      g = recordShot(g, 'rim-in');
    }
    expect(g.players[0]!.streak).toBe(3);
    expect(g.players[0]!.score).toBe(6);

    // Il 4° canestro consecutivo è in Mano calda (×2): uno swish vale 3 × 2 = 6 punti!
    g = recordShot(g, 'swish');
    expect(g.players[0]!.score).toBe(12);

    // Sbagliando si azzera la serie
    g = recordShot(g, 'airball');
    expect(g.players[0]!.streak).toBe(0);

    // Scade il tempo di P1 -> tocca a P2 con 60s nuovi
    g = tickTimedMode(g, 60);
    expect(g.isOver).toBe(false);
    expect(currentShooter(g).playerId).toBe('P2');
    expect(g.timeRemainingS).toBe(TIMED_DURATION_S);

    // Scade il tempo di P2 -> fine partita
    g = tickTimedMode(g, 60);
    expect(g.isOver).toBe(true);
  });

  test('assist: arco guida nei primi 3 tiri in Normale, sweet spot attrae la velocità verso il valore ideale', () => {
    expect(shouldShowGuideArc('easy', 8)).toBe(true);
    expect(shouldShowGuideArc('normal', 0)).toBe(true);
    expect(shouldShowGuideArc('normal', 2)).toBe(true);
    expect(shouldShowGuideArc('normal', 3)).toBe(false);
    expect(shouldShowGuideArc('pro', 0)).toBe(false);

    const ideal = idealSpeedForAngle(53, 0.85);
    const slightlyOff = {
      speed: ideal * 1.05, // +5% (dentro lo sweet spot ±8%)
      releaseAngleDeg: 53,
      backspin: 0.85,
      hookQuality: 0.9,
      dir: 0.1,
    };

    const assistedNormal = applyShotAssist(slightlyOff, 'normal');
    const assistedPro = applyShotAssist(slightlyOff, 'pro');

    expect(Math.abs(assistedNormal.speed - ideal)).toBeLessThan(Math.abs(slightlyOff.speed - ideal));
    expect(assistedPro.speed).toBeCloseTo(slightlyOff.speed, 5);
    expect(assistedNormal.dir).toBeCloseTo(0.05, 5); // ×0.5
    expect(assistedPro.dir).toBeCloseTo(0.09, 5); // ×0.9
  });

  test('premi di fine partita: Solo retina, Mano calda, Freddo come il ghiaccio e Mattoncino', () => {
    let g = createFreeThrowGame(['P1', 'P2'], { mode: 'quick', rounds: 2 });
    g = recordShot(g, 'swish');   // P1 giro 1
    g = recordShot(g, 'rim-out'); // P2 giro 1 (ferro)
    g = recordShot(g, 'swish');   // P1 giro 2 (2 di fila + clutch)
    g = recordShot(g, 'rim-out'); // P2 giro 2 (2° ferro)

    const awards = computeAwards(g);
    const ids = awards.map((a) => a.id);
    expect(ids).toContain('swish-master');
    expect(ids).toContain('hot-hand');
    expect(ids).toContain('ice-cold');
    expect(ids).toContain('brick-layer');
    expect(awards.find((a) => a.id === 'brick-layer')?.playerId).toBe('P2');

    const fb = feedbackMessageFor('swish', 'perfect', 3, 1);
    expect(fb.isGood).toBe(true);
    expect(fb.title).toContain('CIUFF');
  });
});

