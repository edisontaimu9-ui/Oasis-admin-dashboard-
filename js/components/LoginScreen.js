import { store, doLogin, doForgotPassword } from '../state.js';

export default {
  name: 'LoginScreen',
  data() {
    return { email: '', pass: '' };
  },
  computed: {
    store() { return store; },
  },
  methods: {
    submit() { doLogin(this.email, this.pass); },
    forgot() { doForgotPassword(this.email); },
  },
  template: `
    <div id="login-screen">
      <div class="login-card">
        <div class="login-title">Oasis Admin</div>
        <input type="email" id="login-email" placeholder="admin@example.com"
               autocomplete="email" v-model="email" @keydown.enter="submit">
        <input type="password" id="login-pass" placeholder="Enter password…"
               autocomplete="current-password" v-model="pass" @keydown.enter="submit">
        <button class="login-btn" id="login-btn" :disabled="store.loginBusy" @click="submit">
          {{ store.loginBusy ? 'Authenticating…' : 'AUTHENTICATE →' }}
        </button>
        <div id="login-err">{{ store.loginError }}</div>
        <div class="login-forgot" @click="forgot" style="cursor:pointer;text-align:center;margin-top:10px;opacity:.7">
          Forgot password?
        </div>
      </div>
    </div>
  `,
};
