import { MetronomeEngine } from './engine/engine';
import { mountApp } from './ui/app';
import './style.css';

/**
 * iOS standalone reports a layout viewport shorter than the screen (here 812 of 874: the top inset is subtracted)
 * even though the page paints edge to edge. Size to the real screen height in that case.
 */
function fitHeight() {
  const standalone = matchMedia('(display-mode: standalone)').matches;
  const portrait = innerWidth === screen.width;
  const h = standalone && portrait ? Math.max(innerHeight, screen.height) : 0;
  document.documentElement.style.setProperty('--app-h', h ? `${h}px` : '100%');
}
fitHeight();
addEventListener('resize', fitHeight);

mountApp(document.getElementById('app')!, new MetronomeEngine());
if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
