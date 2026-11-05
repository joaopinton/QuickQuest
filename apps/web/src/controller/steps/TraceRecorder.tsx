// Registratore di tracce (`?rec`, solo per lo sviluppo e il tuning, docs/04 § 7).
// Registra gli eventi `devicemotion` e li scarica come JSON nel formato di
// packages/motion/test/traces, pronti per un test di regressione.
import { createTraceRecorder, type TraceRecorder as Recorder } from '@quickquest/motion';
import { useEffect, useRef, useState } from 'preact/hooks';

export function TraceRecorder({ platform }: { platform: string }) {
  const [isRecording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const recRef = useRef<Recorder | null>(null);

  useEffect(() => {
    if (!isRecording) return;
    const rec = createTraceRecorder(`quickquest ${platform} ${navigator.userAgent}`);
    recRef.current = rec;
    const onMotion = (e: DeviceMotionEvent) => rec.add(e, performance.now());
    window.addEventListener('devicemotion', onMotion);
    const id = setInterval(() => setCount(rec.count), 250);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      clearInterval(id);
    };
  }, [isRecording, platform]);

  const stopAndSave = () => {
    setRecording(false);
    const rec = recRef.current;
    if (!rec || rec.count === 0) return;
    const note = window.prompt('Che movimento hai registrato?') ?? '';
    const blob = new Blob([`${JSON.stringify(rec.finish(note))}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace-${platform}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <button
      type="button"
      class={`ctl-rec ${isRecording ? 'is-recording' : ''}`}
      onClick={isRecording ? stopAndSave : () => { setCount(0); setRecording(true); }}
    >
      {isRecording ? `■ ${count}` : '● REC'}
    </button>
  );
}
