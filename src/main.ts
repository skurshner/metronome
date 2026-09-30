import { MetronomeEngine } from './engine/engine';
import { mountApp } from './ui/app';
import './style.css';

mountApp(document.getElementById('app')!, new MetronomeEngine());
if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
