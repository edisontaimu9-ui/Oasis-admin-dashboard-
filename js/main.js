import { createApp } from './vue.js';
import './errorLog.js'; // side effect: patches window.onerror / console.error+warn
import './appearance.js'; // side effect: applies saved theme/accent immediately
import App from './App.js';

createApp(App).mount('#app-root');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed:', err));
  });
}
