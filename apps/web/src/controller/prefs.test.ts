import { decode, encode } from '@quickquest/protocol';
import { describe, expect, test } from 'vitest';
import { choiceProfile, normalizeChoice, randomChoice } from './prefs';

describe('scelta del Bubù salvata sul telefono', () => {
  test('una scelta salvata vecchia o rotta diventa una scelta valida', () => {
    const c = normalizeChoice({ colorId: 'grape', accessory: 'cap' });
    expect(c.colorId).toBe('grape');
    expect(c.hat).toBe('none');
    expect(c.name).toBe('');
    expect(normalizeChoice({ colorId: 'nope' }).colorId).not.toBe('nope');
  });

  test('il profilo mandato allo schermo passa sempre la validazione del protocollo', () => {
    for (let i = 0; i < 50; i++) {
      const profile = choiceProfile(randomChoice(i % 2 === 0 ? 'Zoë la Bella' : ''));
      const back = decode(encode({ t: 'profile', p: profile }));
      expect(back.ok).toBe(true);
    }
  });

  test('anche un nome scritto male arriva pulito', () => {
    const profile = choiceProfile({ ...randomChoice(''), name: '  <Ugo>!! ' });
    expect(profile.name).toBe('Ugo');
    expect(decode(encode({ t: 'profile', p: profile })).ok).toBe(true);
  });
});
