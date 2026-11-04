// Accesso ai sensori nel browser: permessi (iOS), raccolta campioni, wake lock.

import { rawFromEvent, type RawSample } from './raw';

export type PermissionOutcome = 'granted' | 'denied' | 'unsupported' | 'insecure';

interface PermissionCapable {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * Chiede i permessi dei sensori. Su iOS va chiamata DENTRO un tap e come prima `await`,
 * altrimenti Safari rifiuta senza chiedere.
 */
export async function requestMotionPermission(): Promise<PermissionOutcome> {
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure';
  if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
  const motion = DeviceMotionEvent as unknown as PermissionCapable;
  if (typeof motion.requestPermission === 'function') {
    try {
      if ((await motion.requestPermission()) !== 'granted') return 'denied';
    } catch {
      return 'denied';
    }
  }
  const orientation = (typeof DeviceOrientationEvent === 'undefined' ? {} : DeviceOrientationEvent) as unknown as PermissionCapable;
  if (typeof orientation.requestPermission === 'function') {
    await orientation.requestPermission().catch(() => 'denied'); // facoltativo: non usiamo deviceorientation
  }
  return 'granted';
}

/** Raccoglie i campioni `devicemotion` per `ms` millisecondi. */
export function collectMotion(ms: number, onProgress: (p: number) => void = () => {}): Promise<RawSample[]> {
  return new Promise((resolve) => {
    const out: RawSample[] = [];
    const handler = (e: DeviceMotionEvent) => {
      const raw = rawFromEvent(e);
      // alcuni browser danno timeStamp 0: si ripiega sull'orologio della pagina
      out.push(raw[0] ? raw : [performance.now(), ...raw.slice(1)]);
    };
    window.addEventListener('devicemotion', handler);
    const start = performance.now();
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / ms);
      onProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    setTimeout(() => {
      cancelAnimationFrame(raf);
      window.removeEventListener('devicemotion', handler);
      onProgress(1);
      resolve(out);
    }, ms);
  });
}

let wakeLock: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<boolean> {
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
    return wakeLock !== null;
  } catch {
    return false; // non disponibile o rifiutato: si gioca lo stesso
  }
}

// Il browser rilascia il wake lock quando la scheda va in background: lo si richiede al ritorno.
function handleVisibility() {
  if (wanted && document.visibilityState === 'visible' && (wakeLock === null || wakeLock.released)) void acquire();
}

/** Tiene acceso lo schermo del telefono durante la partita (iOS 16.4+, Android). */
export async function keepAwake(): Promise<boolean> {
  if (!wanted) document.addEventListener('visibilitychange', handleVisibility);
  wanted = true;
  return acquire();
}

export function releaseWakeLock(): void {
  wanted = false;
  document.removeEventListener('visibilitychange', handleVisibility);
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

export function detectPlatform(ua: string): 'ios' | 'android' | 'altro' {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'altro';
}
