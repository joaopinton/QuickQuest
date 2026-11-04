// Grafico a striscia su canvas, leggero: niente librerie.

const MAX_POINTS = 600;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{colors:string[], windowMs?:number, min?:number, max?:number, guides?:number[]}} opts
 */
export function createStripChart(canvas, { colors, windowMs = 4000, min, max, guides = [] }) {
  const ctx = canvas.getContext('2d');
  const points = []; // { t, v: number[] }
  let cssHeight = canvas.height;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  cssHeight = Number(canvas.getAttribute('height')) || 100;
  resize();
  window.addEventListener('resize', resize);

  function push(t, values) {
    points.push({ t, v: values });
    if (points.length > MAX_POINTS) points.splice(0, points.length - MAX_POINTS);
  }

  function draw(now) {
    const w = canvas.clientWidth;
    const h = cssHeight;
    ctx.clearRect(0, 0, w, h);
    const visible = points.filter((p) => p.t >= now - windowMs);
    let lo = min;
    let hi = max;
    if (lo === undefined || hi === undefined) {
      const all = visible.flatMap((p) => p.v);
      const peak = Math.max(1, ...all.map(Math.abs));
      lo = lo ?? -peak;
      hi = hi ?? peak;
    }
    const y = (v) => h - ((v - lo) / (hi - lo || 1)) * h;
    const x = (t) => w - ((now - t) / windowMs) * w;

    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e6e1fb';
    for (const g of [0, ...guides]) {
      if (g < lo || g > hi) continue;
      ctx.beginPath();
      ctx.moveTo(0, y(g));
      ctx.lineTo(w, y(g));
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    colors.forEach((color, k) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      visible.forEach((p, i) => {
        const px = x(p.t);
        const py = y(Math.max(lo, Math.min(hi, p.v[k])));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });
  }

  return { push, draw };
}
