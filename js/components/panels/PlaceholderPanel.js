export default {
  name: 'PlaceholderPanel',
  props: { title: String, sub: String },
  template: `
    <div class="tab-pane active">
      <div class="content-header"><div class="page-title">{{ title }} <span>{{ sub }}</span></div></div>
      <div style="padding:40px;opacity:.6;text-align:center">
        This panel hasn't been converted to Vue yet — coming in the next pass.
      </div>
    </div>
  `,
};
