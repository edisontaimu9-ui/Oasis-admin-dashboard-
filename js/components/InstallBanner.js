import { pwaInstall, promptInstall, dismissInstallBanner } from '../pwaInstall.js';

export default {
  name: 'InstallBanner',
  computed: {
    show() { return pwaInstall.available && !pwaInstall.dismissed && !pwaInstall.installed; },
  },
  methods: {
    install() { promptInstall(); },
    dismiss() { dismissInstallBanner(); },
  },
  template: `
    <div class="install-banner" v-if="show">
      <div class="install-banner-icon">🌿</div>
      <div class="install-banner-text">
        <div class="install-banner-title">Install Oasis Admin</div>
        <div class="install-banner-sub">Add to your home screen for full-screen access.</div>
      </div>
      <button class="install-banner-btn" @click="install">Install</button>
      <button class="install-banner-close" @click="dismiss" aria-label="Dismiss">✕</button>
    </div>
  `,
};
