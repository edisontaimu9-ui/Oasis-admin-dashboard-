import { reactive } from '../vue.js';

export const toasts = reactive({ items: [] });
let _id = 0;

export function showToast(msg, type = 'info') {
  const id = ++_id;
  toasts.items.push({ id, msg, type });
  setTimeout(() => {
    const i = toasts.items.findIndex(t => t.id === id);
    if (i !== -1) toasts.items.splice(i, 1);
  }, 3500);
}

export default {
  name: 'ToastHost',
  computed: { toasts() { return toasts; } },
  template: `
    <div id="toast">
      <div v-for="t in toasts.items" :key="t.id" :class="'toast-item toast-' + t.type">{{ t.msg }}</div>
    </div>
  `,
};
