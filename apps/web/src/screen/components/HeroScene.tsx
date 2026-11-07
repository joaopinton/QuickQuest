// Scena della home: strati di carta (cielo, colline, Bubù) con parallasse leggero.
import { Bubu, t } from '@quickquest/ui';
import { useEffect, useRef } from 'preact/hooks';

function Hills() {
  return (
    <svg class="scene__hills" viewBox="0 0 800 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path class="scene__layer scene__layer--far" data-depth="0.2" d="M0 250 C120 190 220 210 330 240 C450 270 560 180 800 210 V420 H0 Z" fill="#B7E58E" />
      <path class="scene__layer scene__layer--mid" data-depth="0.45" d="M0 300 C160 250 300 300 420 290 C560 278 650 240 800 270 V420 H0 Z" fill="#7ED957" />
      <path class="scene__layer scene__layer--near" data-depth="0.8" d="M-20 350 C140 300 320 330 460 336 C620 342 700 320 820 330 V420 H-20 Z" fill="#3FAE4A" />
      {/* fiori e sassolini sulla collina vicina */}
      <g class="scene__layer" data-depth="0.8">
        <circle cx="120" cy="352" r="7" fill="#FFD23F" />
        <circle cx="134" cy="360" r="5" fill="#FF7EB6" />
        <circle cx="660" cy="346" r="6" fill="#fff" />
        <circle cx="676" cy="352" r="4" fill="#FFD23F" />
        <ellipse cx="560" cy="372" rx="16" ry="7" fill="#2E8F3A" />
      </g>
    </svg>
  );
}

function Pins() {
  const pin = (x: number, y: number, s: number) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M10 0c5 0 6 5 5 9-1 4-3 5-3 8 0 4 6 7 6 16 0 7-3 11-8 11s-8-4-8-11c0-9 6-12 6-16 0-3-2-4-3-8-1-4 0-9 5-9z" fill="#fff" />
      <path d="M5 14h10M4.6 17h10.8" stroke="#F0505A" stroke-width="2" stroke-linecap="round" />
    </g>
  );
  return (
    <svg class="scene__pins scene__layer" data-depth="0.6" viewBox="0 0 90 60" aria-hidden="true">
      {pin(30, 2, 1)}
      {pin(10, 12, 0.92)}
      {pin(50, 12, 0.92)}
      {pin(66, 18, 0.85)}
    </svg>
  );
}

/** Scena illustrata; il parallasse si spegne con prefers-reduced-motion. */
export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const handleMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', handleMove);
    };
  }, []);

  return (
    <div class="scene" ref={ref} role="img" aria-label={t('home.sceneLabel')}>
      <div class="scene__sky" />
      <div class="scene__sun scene__layer" data-depth="0.1" />
      <div class="scene__cloud scene__cloud--a" />
      <div class="scene__cloud scene__cloud--b" />
      <Hills />
      <Pins />
      <div class="scene__cast">
        <div class="scene__bubu scene__bubu--left scene__layer" data-depth="0.7">
          <Bubu color="#F7C531" look={{ pattern: 'belly', mouth: 'grin', hat: 'cap' }} mood="happy" motion="hop" delay={0.4} size="100%" />
        </div>
        <div class="scene__bubu scene__bubu--center scene__layer" data-depth="0.9">
          <Bubu color="#9C6BFF" look={{ pattern: 'stripes', color2: '#FFD23F', eyes: 'sleepy', hat: 'headphones' }} ball motion="breathe" size="100%" />
        </div>
        <div class="scene__bubu scene__bubu--right scene__layer" data-depth="0.75">
          <Bubu color="#3C8CF0" look={{ pattern: 'dots', neck: 'scarf', color2: '#FF7EB6', face: 'glasses' }} mood="idle" motion="breathe" wave delay={1.2} size="100%" />
        </div>
      </div>
    </div>
  );
}
