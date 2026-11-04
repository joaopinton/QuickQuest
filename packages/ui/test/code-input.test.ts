import { describe, expect, test } from 'vitest';
import { applyBackspaceOnEmpty, applyCellInput } from '../src/components/code-input-logic';

const norm = (ch: string) => (/[A-Z2-9]/i.test(ch) && !/[01OI]/i.test(ch) ? ch.toUpperCase() : '');

describe('caselle del codice', () => {
  test('digitazione normale avanza di una casella', () => {
    expect(applyCellInput('', 0, 'k', 4, norm)).toEqual({ value: 'K', focus: 1 });
    expect(applyCellInput('K7R', 3, 'm', 4, norm)).toEqual({ value: 'K7RM', focus: 3 });
  });

  test('incolla di tutto il codice nella prima casella', () => {
    expect(applyCellInput('', 0, 'k7rm', 4, norm)).toEqual({ value: 'K7RM', focus: 3 });
  });

  test('cancellare una casella piena (anche l’ultima) toglie il carattere', () => {
    expect(applyCellInput('K7RM', 3, '', 4, norm)).toEqual({ value: 'K7R', focus: 3 });
    expect(applyCellInput('K7RM', 1, '', 4, norm)).toEqual({ value: 'KRM', focus: 1 });
  });

  test('sovrascrivere una casella in mezzo non tronca il resto', () => {
    expect(applyCellInput('ABCD', 1, 'X', 4, norm)?.value).toBe('AXCD');
    expect(applyCellInput('ABCD', 1, 'BX', 4, norm)?.value).toBe('AXCD'); // testo non selezionato
  });

  test('caratteri non ammessi: la casella va ripristinata', () => {
    expect(applyCellInput('AB', 2, '0', 4, norm)).toBeNull();
  });

  test('backspace su casella vuota torna indietro e cancella', () => {
    expect(applyBackspaceOnEmpty('K7', 2)).toEqual({ value: 'K', focus: 1 });
    expect(applyBackspaceOnEmpty('K7', 0)).toBeNull();
    expect(applyBackspaceOnEmpty('K7RM', 2)).toBeNull(); // casella piena: ci pensa l'input
  });
});
