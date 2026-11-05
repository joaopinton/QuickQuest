import { describe, expect, test, vi } from 'vitest';
import { createPauseGate } from './pause-gate';

const texts = { paused: 'Pausa', resumed: 'Si riprende!' };

function setup() {
  const io = { setActiveSlot: vi.fn(), sendCue: vi.fn() };
  return { io, gate: createPauseGate(io, texts) };
}

describe('pausa della partita', () => {
  test('fuori pausa il turno e gli eventi passano', () => {
    const { io, gate } = setup();
    const cb = vi.fn();
    gate.setActiveSlot('P1');
    gate.filter(cb)('P1', { kind: 'throw', data: {} });
    expect(io.setActiveSlot).toHaveBeenLastCalledWith('P1');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('in pausa niente eventi, turno chiuso e i telefoni avvisati', () => {
    const { io, gate } = setup();
    const cb = vi.fn();
    gate.setActiveSlot('P2');
    expect(gate.pause()).toBe(true);
    expect(gate.pause()).toBe(false); // già in pausa
    expect(gate.isPaused).toBe(true);
    expect(io.setActiveSlot).toHaveBeenLastCalledWith(null);
    expect(io.sendCue).toHaveBeenLastCalledWith(null, { kind: 'select', text: 'Pausa' });
    gate.filter(cb)('P2', { kind: 'throw', data: {} });
    expect(cb).not.toHaveBeenCalled();
  });

  test('alla ripresa torna il turno chiesto dal gioco, anche se cambiato in pausa', () => {
    const { io, gate } = setup();
    gate.setActiveSlot('P1');
    gate.pause();
    gate.setActiveSlot('P3'); // il gioco ha passato il turno mentre il menù era aperto
    expect(io.setActiveSlot).toHaveBeenLastCalledWith(null);
    expect(gate.resume()).toBe(true);
    expect(gate.resume()).toBe(false);
    expect(io.setActiveSlot).toHaveBeenLastCalledWith('P3');
    expect(io.sendCue).toHaveBeenLastCalledWith(null, { kind: 'tap', text: 'Si riprende!' });
  });
});
