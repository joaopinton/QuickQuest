// Tipi ed eventi del gioco Bowling (docs/05, docs/games/bowling.md § 3.3).

export interface BowlingReleaseData {
  readonly speed: number;        // m/s (4.0 - 10.5)
  readonly spin: number;         // -1.0 (hook dx) .. +1.0 (hook sx)
  readonly dir: number;          // radianti deviazione orizzontale (-0.1 .. +0.1)
  readonly startX: number;       // posizione laterale di partenza sulla tavola (-0.45 .. +0.45 m)
  readonly tRelease?: number;    // timestamp ms
}

export interface BowlingPinStatus {
  readonly id: number;           // 1 .. 10
  readonly knockedDown: boolean;
  readonly x: number;
  readonly z: number;
  readonly tiltAngleDeg: number;
}

export interface BowlingShotResult {
  readonly pinCount: number;     // 0 .. 10
  readonly isStrike: boolean;
  readonly pins: readonly BowlingPinStatus[];
  readonly speedKmh: number;
  readonly durationSeconds: number;
}
