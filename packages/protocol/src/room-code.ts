// Codici stanza di 4 caratteri senza ambiguità: niente 0/O e 1/I (docs/03 § 2).

export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

const VALID = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

type RandomFill = (buf: Uint8Array<ArrayBuffer>) => Uint8Array;
const cryptoFill: RandomFill = (buf) => crypto.getRandomValues(buf);

/** 32 simboli: un byte modulo 32 è uniforme, quindi niente bias. */
export function generateRoomCode(fill: RandomFill = cryptoFill): string {
  const bytes = fill(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Maiuscolo se il carattere è ammesso, altrimenti stringa vuota. */
export function normalizeCodeChar(ch: string): string {
  const up = ch.toUpperCase();
  return up.length === 1 && ALPHABET.includes(up) ? up : '';
}

export function isValidRoomCode(code: string): boolean {
  return VALID.test(code);
}
