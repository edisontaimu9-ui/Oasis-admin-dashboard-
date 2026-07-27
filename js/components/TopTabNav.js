import { store, switchTab } from '../state.js';

export default {
  name: 'TopTabNav',
  computed: { store() { return store; } },
  methods: { go(tab) { switchTab(tab); } },
  template: `
    <nav class="top-tab-nav">
      <div class="ttn-item" :class="{active: store.currentTab==='home'}" @click="go('home')"><span class="ttn-icon">🏠</span> Home</div>
      <div class="ttn-item" :class="{active: store.currentTab==='library'}" @click="go('library')"><span class="ttn-icon">📚</span> Library</div>
      <div class="ttn-item" :class="{active: store.currentTab==='fooddb'}" @click="go('fooddb')"><span class="ttn-icon">🍱</span> Food DB</div>
      <div class="ttn-item" :class="{active: store.currentTab==='settings'}" @click="go('settings')"><span class="ttn-icon">⚙️</span> Settings</div>
    </nav>
  `,
};
