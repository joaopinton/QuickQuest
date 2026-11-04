// PoseStreamer (docs/04 § 1, docs/03 § 3.3).
// Limita la frequenza dello streaming di orientamento a 30 Hz (~33.3 ms)
// e produce il frame binario a 24 byte pronto per il trasporto WebSocket.

import {
  BUTTON_ACTION,
  BUTTON_TRACKPAD,
  encodePose,
  FLAG_CALIBRATED,
  type PoseFrame,
  type SlotId,
} from '@quickquest/protocol';
import { norm, toProtocolQ, type Quaternion, type Vector3 } from './math';

export const POSE_HZ = 30;
export const POSE_INTERVAL_MS = 1000 / POSE_HZ; // ~33.3 ms

export interface PoseStreamerOptions {
  readonly slot?: SlotId;
  readonly onPoseFrame?: (buffer: ArrayBuffer) => void;
}

export interface PoseStreamer {
  feed(
    t: number,
    q: Quaternion,
    accG: Vector3,
    buttons?: number,
    isCalibrated?: boolean,
    trackpad?: readonly [number, number],
  ): ArrayBuffer | null;
  readonly seq: number;
}

export function createPoseStreamer(opts: PoseStreamerOptions = {}): PoseStreamer {
  const { slot, onPoseFrame } = opts;
  let lastSentMs = 0;
  let seq = 0;

  return {
    get seq() {
      return seq;
    },

    feed(
      t: number,
      q: Quaternion,
      accG: Vector3,
      buttons = 0,
      isCalibrated = false,
      trackpad?: readonly [number, number],
    ): ArrayBuffer | null {
      if (t - lastSentMs < POSE_INTERVAL_MS) {
        return null;
      }
      lastSentMs = t;
      seq = (seq + 1) & 0xffff;

      const frame: PoseFrame = {
        slot,
        seq,
        ts: Math.round(t) >>> 0,
        q: toProtocolQ(q),
        accelMagnitude: norm(accG),
        buttons,
        flags: isCalibrated ? FLAG_CALIBRATED : 0,
        trackpad,
      };

      const buffer = encodePose(frame);
      onPoseFrame?.(buffer);
      return buffer;
    },
  };
}

