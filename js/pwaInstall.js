import { reactive } from './vue.js';

export const pwaInstall = reactive({
  deferredPrompt: null,
  available: false,
  installed: false,
  dismissed: false,
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwaInstall.deferredPrompt = e;
  pwaInstall.available = true;
});

window.addEventListener('appinstalled', () => {
  pwaInstall.installed = true;
  pwaInstall.available = false;
  pwaInstall.deferredPrompt = null;
});

export async function promptInstall() {
  const promptEvent = pwaInstall.deferredPrompt;
  if (!promptEvent) return;
  promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  pwaInstall.deferredPrompt = null;
  pwaInstall.available = false;
  return choice.outcome;
}

export function dismissInstallBanner() {
  pwaInstall.dismissed = true;
}
