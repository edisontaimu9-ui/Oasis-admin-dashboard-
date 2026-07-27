import { store } from './state.js';
import ToastHost from './components/Toast.js';
import InstallBanner from './components/InstallBanner.js';
import LoginScreen from './components/LoginScreen.js';
import Sidebar from './components/Sidebar.js';
import TopTabNav from './components/TopTabNav.js';
import BottomTabNav from './components/BottomTabNav.js';
import HomePanel from './components/panels/HomePanel.js';
import OverviewPanel from './components/panels/OverviewPanel.js';
import AnalyticsPanel from './components/panels/AnalyticsPanel.js';
import OnlinePanel from './components/panels/OnlinePanel.js';
import SessionsPanel from './components/panels/SessionsPanel.js';
import FeedbackPanel from './components/panels/FeedbackPanel.js';
import UsersPanel from './components/panels/UsersPanel.js';
import ErrorLogPanel from './components/panels/ErrorLogPanel.js';
import OfflinePanel from './components/panels/OfflinePanel.js';
import LibraryPanel from './components/panels/LibraryPanel.js';
import FoodDBPanel from './components/panels/FoodDBPanel.js';
import SettingsPanel from './components/panels/SettingsPanel.js';
import PlaceholderPanel from './components/panels/PlaceholderPanel.js';

// tab -> { title, sub } for any panel not yet converted (currently none)
const PLACEHOLDERS = {};

export default {
  name: 'App',
  components: {
    ToastHost, InstallBanner, LoginScreen, Sidebar, TopTabNav, BottomTabNav,
    HomePanel, OverviewPanel, AnalyticsPanel, OnlinePanel, SessionsPanel, FeedbackPanel,
    UsersPanel, ErrorLogPanel, OfflinePanel, LibraryPanel, FoodDBPanel, SettingsPanel,
    PlaceholderPanel,
  },
  computed: {
    store() { return store; },
    placeholder() {
      const p = PLACEHOLDERS[store.currentTab];
      return p ? { title: p[0], sub: p[1] } : null;
    },
  },
  template: `
    <ToastHost />
    <InstallBanner />
    <LoginScreen v-if="!store.currentUser" />
    <div id="app" v-else>
      <TopTabNav />
      <div class="dashboard-body">
        <Sidebar />
        <main class="content-area">
          <HomePanel v-if="store.currentTab === 'home'" />
          <OverviewPanel v-else-if="store.currentTab === 'overview'" />
          <AnalyticsPanel v-else-if="store.currentTab === 'analytics'" />
          <OnlinePanel v-else-if="store.currentTab === 'online'" />
          <SessionsPanel v-else-if="store.currentTab === 'sessions'" />
          <FeedbackPanel v-else-if="store.currentTab === 'feedback'" />
          <UsersPanel v-else-if="store.currentTab === 'users'" />
          <ErrorLogPanel v-else-if="store.currentTab === 'errors'" />
          <OfflinePanel v-else-if="store.currentTab === 'offline'" />
          <LibraryPanel v-else-if="store.currentTab === 'library'" />
          <FoodDBPanel v-else-if="store.currentTab === 'fooddb'" />
          <SettingsPanel v-else-if="store.currentTab === 'settings'" />
          <PlaceholderPanel v-else-if="placeholder" :title="placeholder.title" :sub="placeholder.sub" />
        </main>
      </div>
      <BottomTabNav />
    </div>
  `,
};
