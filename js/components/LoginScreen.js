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
      <div class="login-box">
        <div class="login-logo">
          <div class="login-logo-ring">🌿</div>
          <div>
            <div class="login-logo-text">Oasis <em>Admin</em></div>
            <div class="login-logo-sub">Clinical Nutrition Support Tool</div>
          </div>
        </div>
        <div class="login-badge">Restricted Access</div>
        <div class="login-field">
          <label for="login-email">Email</label>
          <input type="email" id="login-email" placeholder="admin@example.com"
                 autocomplete="email" v-model="email" @keydown.enter="submit">
        </div>
        <div class="login-field">
          <label for="login-pass">Password</label>
          <input type="password" id="login-pass" placeholder="Enter password…"
                 autocomplete="current-password" v-model="pass" @keydown.enter="submit">
        </div>
        <button class="login-btn" id="login-btn" :disabled="store.loginBusy" @click="submit">
          {{ store.loginBusy ? 'Authenticating…' : 'AUTHENTICATE →' }}
        </button>
        <div id="login-err">{{ store.loginError }}</div>
        <div class="login-forgot" @click="forgot" style="cursor:pointer;text-align:center;margin-top:10px;opacity:.7;font-family:var(--mono);font-size:10px;">
          Forgot password?
        </div>
      </div>
    </div>
  `,
};
