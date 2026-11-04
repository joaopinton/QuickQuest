// Frame binario di posa a 30 Hz (docs/03 § 3.3). 24 byte esatti.
// Trasmette l'orientamento (quaternione) e gli input del controller verso lo schermo.

import type { SlotId } from './messages';

export const POSE_FRAME_BYTES = 24;
export const FRAME_TYPE_POSE = 0x01;

export const BUTTON_ACTION = 1 << 0;
export const BUTTON_TRACKPAD = 1 << 1;

export const FLAG_CALIBRATED = 1 << 0;

export interface PoseFrame {
  readonly slot?: SlotId;
  readonly seq: number;
  readonly ts: number;
  readonly q: readonly [x: number, y: number, z: number, w: number];
  /** Modulo dell'accelerazione in m/s² (memorizzato in centesimi di m/s² nel frame). */
  readonly accelMagnitude: number;
  readonly buttons: number;
  readonly flags: number;
  /** Coordinate trackpad normalizzate tra -1 e 1. */
  readonly trackpad?: readonly [x: number, y: number];
}

export function slotToIndex(slot: SlotId | undefined): number {
  switch (slot) {
    case 'P1': return 0;
    case 'P2': return 1;
    case 'P3': return 2;
    case 'P4': return 3;
    default: return 0xff;
  }
}

export function indexToSlot(idx: number): SlotId | undefined {
  switch (idx) {
    case 0: return 'P1';
    case 1: return 'P2';
    case 2: return 'P3';
    case 3: return 'P4';
    default: return undefined;
  }
}

const clamp = (val: number, min: number, max: number): number => Math.max(min, Math.min(max, val));

/**
 * Codifica una posa in un buffer binario di 24 byte.
 */
export function encodePose(frame: PoseFrame): ArrayBuffer {
  const buffer = new ArrayBuffer(POSE_FRAME_BYTES);
  const view = new DataView(buffer);

  view.setUint8(0, FRAME_TYPE_POSE);
  view.setUint8(1, slotToIndex(frame.slot));
  view.setUint16(2, frame.seq & 0xffff, true);
  view.setUint32(4, frame.ts >>> 0, true);

  // Quaternione normalizzato [-1, 1] mappato su int16 [-32767, 32767]
  const [qx, qy, qz, qw] = frame.q;
  view.setInt16(8, Math.round(clamp(qx, -1, 1) * 32767), true);
  view.setInt16(10, Math.round(clamp(qy, -1, 1) * 32767), true);
  view.setInt16(12, Math.round(clamp(qz, -1, 1) * 32767), true);
  view.setInt16(14, Math.round(clamp(qw, -1, 1) * 32767), true);

  // Accelerazione in centesimi di m/s² (es. 9.81 m/s² -> 981)
  const accelCentis = Math.round(clamp(frame.accelMagnitude * 100, 0, 65535));
  view.setUint16(16, accelCentis, true);

  view.setUint8(18, frame.buttons & 0xff);
  view.setUint8(19, frame.flags & 0xff);

  // Trackpad [-1, 1] mappato su int16
  const tx = frame.trackpad ? frame.trackpad[0] : 0;
  const ty = frame.trackpad ? frame.trackpad[1] : 0;
  view.setInt16(20, Math.round(clamp(tx, -1, 1) * 32767), true);
  view.setInt16(22, Math.round(clamp(ty, -1, 1) * 32767), true);

  return buffer;
}

/**
 * Decodifica un frame binario di posa. Restituisce null se la lunghezza o il tipo sono errati.
 */
export function decodePose(data: ArrayBufferLike | ArrayBufferView): PoseFrame | null {
  const view = ArrayBuffer.isView(data)
    ? new DataView(data.buffer, data.byteOffset, data.byteLength)
    : new DataView(data);

  if (view.byteLength !== POSE_FRAME_BYTES) return null;
  if (view.getUint8(0) !== FRAME_TYPE_POSE) return null;

  const slot = indexToSlot(view.getUint8(1));
  const seq = view.getUint16(2, true);
  const ts = view.getUint32(4, true);

  const q: [number, number, number, number] = [
    view.getInt16(8, true) / 32767,
    view.getInt16(10, true) / 32767,
    view.getInt16(12, true) / 32767,
    view.getInt16(14, true) / 32767,
  ];

  const accelMagnitude = view.getUint16(16, true) / 100;
  const buttons = view.getUint8(18);
  const flags = view.getUint8(19);

  const trackpad: [number, number] = [
    view.getInt16(20, true) / 32767,
    view.getInt16(22, true) / 32767,
  ];

  return { slot, seq, ts, q, accelMagnitude, buttons, flags, trackpad };
}

/**
 * Sovrascrive lo slot del mittente nel frame senza decodificare l'intero buffer.
 * Utilizzato dal relay Cloudflare DO (docs/03 § 3.3).
 */
export function rewritePoseSlot(data: ArrayBufferLike | ArrayBufferView, slot: SlotId): boolean {
  const bytes = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
  if (bytes.byteLength !== POSE_FRAME_BYTES || bytes[0] !== FRAME_TYPE_POSE) return false;
  bytes[1] = slotToIndex(slot);
  return true;
}
