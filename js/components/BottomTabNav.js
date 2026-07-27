import { store, switchTab } from '../state.js';

export default {
  name: 'BottomTabNav',
  computed: { store() { return store; } },
  methods: { go(tab) { switchTab(tab); } },
  template: `
    <nav class="bottom-tab-nav">
      <div class="btn-item" :class="{active: store.currentTab==='analytics'}" @click="go('analytics')"><span class="ttn-icon">📈</span> Analytics</div>
      <div class="btn-item" :class="{active: store.currentTab==='online'}" @click="go('online')"><span class="ttn-icon">👤</span> Online</div>
      <div class="btn-item" :class="{active: store.currentTab==='sessions'}" @click="go('sessions')"><span class="ttn-icon">📋</span> Sessions</div>
      <div class="btn-item" :class="{active: store.currentTab==='feedback'}" @click="go('feedback')"><span class="ttn-icon">💬</span> Feedback</div>
    </nav>
  `,
};
