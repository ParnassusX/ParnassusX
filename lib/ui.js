// Shared helpers for the popup and the side panel. Classic script, no modules,
// so it can be loaded with a plain <script> tag next to lib/preview.js.
const UI = (() => {
  const ICON_PATHS = {
    save: '<path d="M3 2.5h8.5L14 5v8.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5z"/><path d="M5 2.5v4h5v-4M5 13.5v-4h6v4"/>',
    apply: '<path d="M4 3l9 5-9 5z"/>',
    update: '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2.5v3h-3"/>',
    more: '<circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/>',
    rename: '<path d="M10.5 2.5l3 3-7.5 7.5H3v-3z"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5"/>',
    undo: '<path d="M6 4L2.5 7.5 6 11"/><path d="M3 7.5h7a4 4 0 0 1 0 8H8"/>',
    history: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>',
    trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/>',
    search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
    library: '<rect x="2.5" y="2.5" width="4.5" height="11" rx="1"/><rect x="9" y="2.5" width="4.5" height="5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    check: '<path d="M3 8.5l3 3 7-7"/>',
    warning: '<path d="M8 2.5l6 11H2z"/><path d="M8 6.5v3M8 11.5v.2"/>',
    download: '<path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10"/>',
    upload: '<path d="M8 10.5v-8M4.5 6L8 2.5 11.5 6M3 13.5h10"/>',
    settings: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.5 3.5l1.2 1.2M11.3 11.3l1.2 1.2M3.5 12.5l1.2-1.2M11.3 4.7l1.2-1.2"/>',
    layers: '<path d="M8 2.5l6 3-6 3-6-3z"/><path d="M2 8.5l6 3 6-3M2 11.5l6 3 6-3"/>',
    keyboard: '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 7h.5M7 7h.5M10 7h.5M5 10h6"/>',
  };

  function icon(name) {
    const t = document.createElement('template');
    t.innerHTML = `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
    return t.content.firstChild;
  }

  // Sends a message to the background. Always resolves with a response object.
  function send(message) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          resolve({ status: 'error', message: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { status: 'error', message: 'No response from the extension background.' });
      });
    });
  }

  // h('button', { class: 'btn', onclick: fn }, 'Label', icon('save'))
  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function preview(layout, options) {
    const t = document.createElement('template');
    t.innerHTML = WLM_PREVIEW.renderPreviewSvg(layout, options);
    return t.content.firstChild;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  function summaryLine(entry) {
    const s = WLM.summarize(entry);
    return `${plural(s.windows, 'window')} · ${plural(s.tabs, 'tab')} · ${plural(s.screens, 'screen')}`;
  }

  function formatDate(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Live region for short status messages.
  function toast(message, kind = 'info') {
    const region = document.getElementById('toast');
    if (!region) return;
    region.className = `toast toast-${kind}`;
    region.textContent = message;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { region.className = 'toast hidden'; }, kind === 'error' ? 6000 : 3000);
  }

  // Modal dialogs replace window.confirm and window.prompt, which look out of
  // place in an extension UI and cannot be styled.
  function dialog({ title, body, fields = [], confirmLabel = 'OK', danger = false, cancelLabel = 'Cancel' }) {
    return new Promise(resolve => {
      const dlg = h('dialog', { class: 'dialog' });
      const inputs = fields.map(f => h('input', { type: 'text', value: f.value || '', placeholder: f.placeholder || '', 'aria-label': f.label, maxlength: 100 }));
      const finish = (ok) => {
        const values = inputs.map(i => i.value.trim());
        dlg.close();
        dlg.remove();
        resolve(ok ? (fields.length ? values[0] : true) : (fields.length ? null : false));
      };
      dlg.append(
        h('h2', { class: 'dialog-title', text: title }),
        body ? h('p', { class: 'dialog-body', text: body }) : null,
        ...fields.map((f, i) => h('label', { class: 'field' }, h('span', { text: f.label }), inputs[i])),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => finish(false), text: cancelLabel }),
          h('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', type: 'button', onclick: () => finish(true), text: confirmLabel }),
        ),
      );
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
      document.body.append(dlg);
      dlg.showModal();
      (inputs[0] || dlg.querySelector('.btn-primary')).focus();
      inputs[0] && inputs[0].select();
      inputs[0] && inputs[0].addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } });
    });
  }

  const confirmDialog = (opts) => dialog({ ...opts, fields: [] });
  const promptDialog = (opts) => dialog({ ...opts, fields: [{ label: opts.label, value: opts.value, placeholder: opts.placeholder }] });

  return { icon, send, h, preview, plural, summaryLine, formatDate, toast, confirmDialog, promptDialog };
})();
