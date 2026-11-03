import { useEffect, useRef, useState } from 'preact/hooks';

const COMMON = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 170, 180, 200, 240, 280, 300, 360, 480, 500];

export default function RefreshRateTest() {
  const [hz, setHz] = useState(0);
  const [stable, setStable] = useState(0);
  const [dropped, setDropped] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0, last = performance.now(), frames: number[] = [], x = 0, drop = 0, tShow = 0;
    const hist: number[] = [];
    const loop = (t: number) => {
      const dt = t - last; last = t;
      if (dt > 0 && dt < 200) { frames.push(dt); if (frames.length > 120) frames.shift(); }
      const sorted = frames.slice().sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)] || 16.7;
      if (dt > med * 1.7 && frames.length > 30) drop++;
      const est = 1000 / med;
      if (t - tShow > 250) {
        tShow = t; setHz(est); setDropped(drop);
        const snap = COMMON.reduce((a, b) => (Math.abs(b - est) < Math.abs(a - est) ? b : a), 60);
        setStable(Math.abs(snap - est) / snap < 0.04 ? snap : Math.round(est));
        hist.push(est); if (hist.length > 60) hist.shift();
        const c = canvas.current; if (c) { const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height); const mx = Math.max(70, ...hist) * 1.15; g.strokeStyle = '#0891b2'; g.lineWidth = 3; g.beginPath(); hist.forEach((v, k) => { const px = (k / 59) * c.width, py = c.height - (v / mx) * c.height; k ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); }
      }
      // moving block: one step per frame — smooth at high Hz
      const el = bar.current; if (el) { const w = el.parentElement!.clientWidth - 40; x = (x + 960 / est) % w; el.style.transform = `translateX(${x}px)`; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div>
      <div class="hz-big"><b>{stable || '…'}</b><span>Hz</span></div>
      <p class="status">Measured: {hz ? hz.toFixed(1) : '–'} frames per second{dropped ? ` · ${dropped} skipped frame${dropped === 1 ? '' : 's'}` : ''}</p>
      <div class="hz-track"><div ref={bar} class="hz-ufo" /></div>
      <canvas ref={canvas} width={700} height={120} class="hz-chart" />
      <div class="dt-results">
        <div><span>Refresh rate</span><b>{stable ? `${stable} Hz` : '–'}</b></div>
        <div><span>Frame time</span><b>{hz ? `${(1000 / hz).toFixed(2)} ms` : '–'}</b></div>
        <div><span>Skipped frames</span><b>{dropped}</b><small>{dropped > 10 ? 'other apps may be busy' : 'smooth'}</small></div>
      </div>
      <p class="status" style={{ textAlign: 'left' }}>Keep this tab in front and don't move the window while measuring. If you have two monitors, move the browser window to the screen you want to test and reload the page.</p>
    </div>
  );
}
