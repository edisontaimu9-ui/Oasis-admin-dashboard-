import { store, deleteFeedback, deleteAllFeedback, sendAdminReply } from '../../state.js';
import { showToast } from '../Toast.js';
import { fmtTs, deviceIcon, deviceLabel, downloadCSV, TODAY } from '../../utils.js';

export default {
  name: 'FeedbackPanel',
  data() {
    return { openReplyId: null, drafts: {} };
  },
  computed: {
    store() { return store; },
    emojiCounts() {
      const counts = { '👍': 0, '❤️': 0, '😐': 0, '🐛': 0, '💡': 0, '⚕️': 0, '💬': 0 };
      store.allFeedback.forEach(f => { if (counts[f.emoji] !== undefined) counts[f.emoji]++; });
      return {
        thumbsup: counts['👍'],
        heart: counts['❤️'],
        neutral: counts['😐'],
        bug: counts['🐛'] + counts['⚕️'],
        idea: counts['💡'] + counts['💬'],
      };
    },
  },
  methods: {
    fmtTs, deviceIcon, deviceLabel,
    replyLabel(f) { return f.adminReply ? '✏ EDIT REPLY' : '💬 REPLY'; },
    draftFor(f) {
      if (!(f.id in this.drafts)) this.drafts[f.id] = f.adminReply?.message || '';
      return this.drafts[f.id];
    },
    toggleReply(f) {
      this.draftFor(f); // seed draft
      this.openReplyId = this.openReplyId === f.id ? null : f.id;
    },
    async send(f) {
      const text = this.drafts[f.id] || '';
      if (!text.trim()) { showToast('Reply cannot be empty.', 'error'); return; }
      try { await sendAdminReply(f.id, text); showToast('Reply sent ✓', 'success'); this.openReplyId = null; }
      catch (e) { showToast('Failed to send reply.', 'error'); }
    },
    async removeOne(id) {
      try { await deleteFeedback(id); showToast('Feedback dismissed.', 'success'); }
      catch (e) { showToast('Dismiss failed: ' + e.message, 'error'); }
    },
    async removeAll() {
      if (!store.allFeedback.length) return;
      if (!confirm(`Permanently delete ALL ${store.allFeedback.length} feedback submission(s)? This cannot be undone.`)) return;
      showToast(`Deleting ${store.allFeedback.length} feedback item(s)…`, 'info');
      const { ok, fail } = await deleteAllFeedback();
      showToast(`Deleted ${ok} feedback item(s)${fail ? ` · ${fail} failed` : ''}.`, fail ? 'error' : 'success');
    },
    exportCSV() {
      const headers = ['Emoji', 'Message', 'Sender Name', 'User Role', 'User ID', 'Session ID', 'Device', 'Timestamp', 'Reply', 'Replied At'];
      const rows = store.allFeedback.map(f => [
        f.emoji || '', (f.message || '').replace(/,/g, ' '),
        f.userName || '—', f.userRole || '—', f.userId || '—',
        f.sessionId || '', deviceLabel(f.deviceInfo), fmtTs(f.sentAt),
        f.adminReply?.message || '',
        f.adminReply?.repliedAt ? fmtTs(f.adminReply.repliedAt) : '',
      ]);
      downloadCSV('nutritrack_feedback_' + TODAY + '.csv', headers, rows);
      showToast('Feedback CSV exported ✓', 'success');
    },
  },
  template: `
    <div class="tab-pane active">
      <div class="content-header">
        <div class="page-title">Feedback <span>{{ store.allFeedback.length }} total submissions</span></div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-teal" @click="exportCSV">⬇ Export CSV</button>
          <button class="btn" style="background:rgba(220,53,69,.15);color:#ff6b6b;border:1px solid rgba(220,53,69,.35)" @click="removeAll">🗑 Delete All</button>
        </div>
      </div>

      <div class="section-hdr"><span class="section-title">Reaction Summary</span><div class="section-line"></div></div>
      <div class="fb-emoji-summary">
        <div class="emoji-stat"><div class="es-emoji">👍</div><div><div class="es-count">{{ emojiCounts.thumbsup }}</div><div class="es-label">Helpful</div></div></div>
        <div class="emoji-stat"><div class="es-emoji">❤️</div><div><div class="es-count">{{ emojiCounts.heart }}</div><div class="es-label">Love it</div></div></div>
        <div class="emoji-stat"><div class="es-emoji">😐</div><div><div class="es-count">{{ emojiCounts.neutral }}</div><div class="es-label">Neutral</div></div></div>
        <div class="emoji-stat"><div class="es-emoji">🐛</div><div><div class="es-count">{{ emojiCounts.bug }}</div><div class="es-label">Bug report</div></div></div>
        <div class="emoji-stat"><div class="es-emoji">💡</div><div><div class="es-count">{{ emojiCounts.idea }}</div><div class="es-label">Idea</div></div></div>
      </div>

      <div class="section-hdr"><span class="section-title">Feedback List</span><div class="section-line"></div></div>
      <div id="fb-list">
        <div v-if="!store.allFeedback.length" class="empty-state"><div class="empty-state-icon">💬</div>No feedback yet</div>
        <div v-for="f in store.allFeedback" :key="f.id" class="fb-card" style="position:relative;flex-wrap:wrap">
          <div class="fb-emoji">{{ f.emoji || '💬' }}</div>
          <div class="fb-body" style="padding-right:150px">
            <div class="fb-sender" style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap">
              <span style="font-size:12px;font-weight:700;color:var(--text)">{{ f.userName || f.userId || f.sessionId || '—' }}</span>
              <span v-if="f.userRole" class="badge badge-dim" style="font-size:8px;padding:1px 6px">{{ f.userRole }}</span>
              <span v-if="f.feedbackType" class="badge badge-dim" style="font-size:8px;padding:1px 6px;margin-left:2px">{{ f.feedbackType }}</span>
              <span v-if="f.adminReply" class="badge badge-green" style="font-size:8px;padding:1px 6px;margin-left:2px">✓ REPLIED</span>
              <span v-if="f.adminReply && f.replyRead===false" class="badge badge-amber" style="font-size:8px;padding:1px 6px;margin-left:2px">● Unread</span>
            </div>
            <div v-if="f.subject" style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:3px;opacity:.85">{{ f.subject }}</div>
            <div class="fb-msg">{{ f.message || '(no message)' }}</div>
            <div v-if="f.adminReply" style="border-left:3px solid var(--teal);padding-left:10px;font-size:11px;color:var(--text-muted);margin-top:6px;font-style:italic;line-height:1.5">
              ↩ Admin ({{ f.adminReply.adminName || 'Admin' }}): {{ (f.adminReply.message||'').slice(0,100) }}{{ (f.adminReply.message||'').length > 100 ? '…' : '' }}
            </div>
            <div class="fb-meta">
              <span v-if="f.userId" class="fb-meta-item" title="User ID">🪪 {{ f.userId.slice(0,16) }}</span>
              <span class="fb-meta-item">📋 {{ (f.sessionId||'—').slice(0,14) }}</span>
              <span class="fb-meta-item">
                <template v-if="deviceLabel(f.deviceInfo) !== 'Unknown'">{{ deviceIcon(f.deviceInfo) }} {{ deviceLabel(f.deviceInfo) }}</template>
                <span v-else style="color:var(--text-muted);font-size:9px">Device unknown</span>
              </span>
              <span class="fb-meta-item">🕐 {{ fmtTs(f.sentAt) }}</span>
            </div>
          </div>
          <div style="position:absolute;top:8px;right:8px;display:flex;gap:6px;align-items:center">
            <button @click="toggleReply(f)" style="background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.28);border-radius:6px;cursor:pointer;font-size:11px;color:var(--blue);opacity:.85;padding:3px 8px;line-height:1;font-family:var(--mono);letter-spacing:.5px">{{ replyLabel(f) }}</button>
            <button @click="removeOne(f.id)" title="Delete this feedback" style="background:rgba(251,113,133,0.08);border:1px solid rgba(251,113,133,0.25);border-radius:6px;cursor:pointer;font-size:11px;color:var(--red);opacity:.7;padding:3px 8px;line-height:1;font-family:var(--mono);letter-spacing:.5px">🗑 DEL</button>
          </div>
          <div v-if="openReplyId===f.id" style="width:100%;flex-basis:100%;margin-top:10px;padding:12px 14px;background:var(--surface2);border:1px solid rgba(96,165,250,0.2);border-radius:8px;box-sizing:border-box">
            <textarea v-model="drafts[f.id]" maxlength="1000" rows="3" placeholder="Type your reply to this user…"
              style="width:100%;box-sizing:border-box;background:var(--surface);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:12px;padding:9px 12px;outline:none;resize:vertical;line-height:1.5"></textarea>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
              <button @click="openReplyId=null" style="background:transparent;border:1px solid var(--border2);border-radius:6px;cursor:pointer;font-size:10px;color:var(--text-muted);padding:5px 12px;font-family:var(--mono);letter-spacing:.5px">CANCEL</button>
              <button @click="send(f)" style="background:rgba(29,233,212,0.1);border:1px solid rgba(29,233,212,0.35);border-radius:6px;cursor:pointer;font-size:10px;color:var(--teal);padding:5px 12px;font-family:var(--mono);letter-spacing:.5px">SEND REPLY</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
};
