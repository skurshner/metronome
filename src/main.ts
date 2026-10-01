import { MetronomeEngine } from './engine/engine';
import { mountApp } from './ui/app';
import './style.css';

/**
 * iOS standalone reports a layout viewport shorter than the screen (812 of 874 on iPhone 17 Pro: the top inset is
 * subtracted) and clips painting at that height. Record the shortfall so the bottom safe-area inset can be discounted.
 */
function measureMissingHeight() {
  const standalone = matchMedia('(display-mode: standalone)').matches;
  const portrait = innerWidth === screen.width;
  const missing = standalone && portrait ? Math.max(0, screen.height - innerHeight) : 0;
  document.documentElement.style.setProperty('--missing', `${missing}px`);
}
measureMissingHeight();
addEventListener('resize', measureMissingHeight);

const engine = new MetronomeEngine();
mountApp(document.getElementById('app')!, engine);
if (import.meta.env.DEV) (window as unknown as { __engine: MetronomeEngine }).__engine = engine;
if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
