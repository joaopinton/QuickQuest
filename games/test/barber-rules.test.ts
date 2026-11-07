import { describe, expect, test } from 'vitest';
import { findHaircut, HAIRCUTS, targetLength } from '../barber/shared/haircuts';
import { createHairMap, initialHairMap } from '../barber/screen/hair-map';
import {
  CLIENT_TIME_S,
  computeAwards,
  createBarberGame,
  currentBarber,
  currentHaircut,
  isTimeUp,
  pickHaircuts,
  reactionFor,
  recordCut,
  scoreCut,
  standings,
  starsFor,
  tickTimer,
  timeBonusFor,
  type CutScore,
} from '../barber/screen/rules';

const score = (stars: CutScore['stars'], accuracy: number, symmetry = 0.9): CutScore => ({
  stars,
  accuracy,
  symmetry,
  holes: 0,
});

describe('voto del taglio', () => {
  test('una mappa identica al taglio richiesto vale 5 stelle per ogni taglio', () => {
    for (const cut of HAIRCUTS) {
      const s = scoreCut(createHairMap((d) => targetLength(cut, d)), cut);
      expect(s.accuracy).toBeGreaterThan(0.95);
      expect(s.stars).toBe(5);
    }
  });

  test('capelli intatti su "tutto a zero tranne il ciuffo" = 1 stella', () => {
    expect(scoreCut(initialHairMap(), findHaircut('quiff')).stars).toBe(1);
  });

  test('capelli intatti su una spuntatina: voto basso ma non zero', () => {
    const s = scoreCut(initialHairMap(), findHaircut('trim'));
    expect(s.stars).toBeGreaterThanOrEqual(2);
    expect(s.stars).toBeLessThanOrEqual(3);
  });

  test('rasare tutto dove servivano capelli dà buchi e voto basso', () => {
    const s = scoreCut(createHairMap(() => 0), findHaircut('trim'));
    expect(s.holes).toBeGreaterThan(0.9);
    expect(s.stars).toBe(1);
  });

  test('un lato solo tagliato abbassa la simmetria', () => {
    const cut = findHaircut('trim');
    const lopsided = createHairMap((d) => {
      const want = targetLength(cut, d);
      return d[0] > 0 || want === 0 ? want : 0.82;
    });
    const even = createHairMap((d) => targetLength(cut, d));
    expect(scoreCut(lopsided, cut).symmetry).toBeLessThan(scoreCut(even, cut).symmetry);
  });

  test('soglie delle stelle (docs/11 § 6.1)', () => {
    expect([0.95, 0.8, 0.6, 0.4, 0.1].map(starsFor)).toEqual([5, 4, 3, 2, 1]);
    expect(reactionFor(1)).toBe('shocked');
    expect(reactionFor(5)).toBe('selfie');
  });
});

describe('flusso della partita', () => {
  test('3 giri, stessa richiesta per tutti nel giro, poi fine', () => {
    let g = createBarberGame(['P1', 'P2'], { haircutIds: ['trim', 'mohawk', 'bowl'] });
    expect(currentHaircut(g).id).toBe('trim');
    g = recordCut(g, score(3, 0.6));
    expect(currentBarber(g).playerId).toBe('P2');
    expect(currentHaircut(g).id).toBe('trim');
    g = recordCut(g, score(4, 0.8));
    expect(g.currentRound).toBe(2);
    expect(currentHaircut(g).id).toBe('mohawk');
    for (let i = 0; i < 4; i++) g = recordCut(g, score(2, 0.4));
    expect(g.isOver).toBe(true);
    expect(recordCut(g, score(5, 1))).toBe(g);
  });

  test('timer di 90 s per cliente, si ricarica al cliente dopo', () => {
    let g = createBarberGame(['P1']);
    g = tickTimer(g, 30);
    expect(g.timeRemainingS).toBeCloseTo(CLIENT_TIME_S - 30);
    g = tickTimer(g, 100);
    expect(isTimeUp(g)).toBe(true);
    expect(tickTimer(g, 1)).toBe(g);
    g = recordCut(g, score(3, 0.6));
    expect(g.timeRemainingS).toBe(CLIENT_TIME_S);
  });

  test('punti = stelle × 100 + bonus tempo (solo da 3 stelle in su)', () => {
    let g = createBarberGame(['P1'], { rounds: 1 });
    g = tickTimer(g, 45);
    g = recordCut(g, score(4, 0.8));
    expect(g.players[0]!.cuts[0]!.timeBonus).toBe(25);
    expect(g.players[0]!.score).toBe(425);
    expect(timeBonusFor(2, 90)).toBe(0);
    expect(timeBonusFor(5, 90)).toBe(50);
  });

  test('classifica e premi, con la consolazione sempre assegnata', () => {
    let g = createBarberGame(['P1', 'P2'], { rounds: 1 });
    g = tickTimer(g, 20);
    g = recordCut(g, score(5, 0.95, 0.99));
    g = recordCut(g, score(1, 0.1, 0.5));
    expect(standings(g)[0]!.playerId).toBe('P1');
    const awards = computeAwards(g);
    expect(awards.find((a) => a.id === 'golden-hands')?.playerId).toBe('P1');
    expect(awards.find((a) => a.id === 'lightning')?.playerId).toBe('P1');
    expect(awards.find((a) => a.id === 'avant-garde')?.playerId).toBe('P2');
  });

  test('pickHaircuts sceglie tagli diversi', () => {
    expect(new Set(pickHaircuts(3, () => 0.5)).size).toBe(3);
  });
});
