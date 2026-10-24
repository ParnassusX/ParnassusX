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
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
    warning: '<path d="M8 2.5l6 11H2z"/><path d="M8 6.5v3M8 11.5v.2"/>',
    download: '<path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10"/>',
    upload: '<path d="M8 10.5v-8M4.5 6L8 2.5 11.5 6M3 13.5h10"/>',
    settings: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.5 3.5l1.2 1.2M11.3 11.3l1.2 1.2M3.5 12.5l1.2-1.2M11.3 4.7l1.2-1.2"/>',
    layers: '<path d="M8 2.5l6 3-6 3-6-3z"/><path d="M2 8.5l6 3 6-3M2 11.5l6 3 6-3"/>',
    keyboard: '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 7h.5M7 7h.5M10 7h.5M5 10h6"/>',
    external: '<path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5"/><path d="M11 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/>',
  };

  function icon(name) {
    const t = document.createElement('template');
    t.innerHTML = `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
    return t.content.firstChild;
  }

  // Three panes snapping into a layout: the same shapes as the app icon.
  function emptyArt() {
    const t = document.createElement('template');
    t.innerHTML = '<svg class="empty-art" viewBox="0 0 120 76" aria-hidden="true"><rect class="a" x="8" y="6" width="62" height="64" rx="8"/><rect class="b" x="76" y="6" width="36" height="30" rx="7"/><rect class="c" x="76" y="42" width="36" height="28" rx="7"/></svg>';
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

  // Short status message at the top of the page. The optional action is a
  // button, for example "Undo", that stays visible a little longer.
  function toast(message, kind = 'info', action = null) {
    const region = document.getElementById('toast');
    if (!region) return;
    region.replaceChildren();
    region.className = `toast toast-${kind}`;
    region.append(h('span', { text: message }));
    if (action) {
      region.append(h('button', { class: 'btn toast-action', type: 'button', onclick: () => { action.onClick(); hide(); } }, action.label));
    }
    clearTimeout(toast.timer);
    const delay = action ? 8000 : kind === 'error' ? 5000 : 3000;
    toast.timer = setTimeout(hide, delay);
    function hide() { region.className = 'toast hidden'; region.replaceChildren(); }
  }

  // Modal dialog. A field may carry a validate(value) function: when it returns
  // a message, the message is shown in the dialog and the dialog stays open, so
  // nothing the user typed is lost.
  function dialog({ title, body, fields = [], choices = null, selected = null, confirmLabel = 'OK', danger = false, cancelLabel = 'Cancel' }) {
    return new Promise(resolve => {
      const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' });
      const radios = (choices || []).map(c => h('input', { type: 'radio', name: 'dlg-choice', value: c.value, checked: c.value === selected }));
      const inputs = fields.map(f => h('input', { type: 'text', value: f.value || '', placeholder: f.placeholder || '', 'aria-label': f.label, maxlength: 100 }));
      const errors = fields.map(() => h('p', { class: 'field-error', role: 'alert' }));
      let settled = false;

      const close = (result) => {
        if (settled) return;
        settled = true;
        dlg.close();
        dlg.remove();
        resolve(result);
      };
      const confirm = () => {
        if (choices) {
          const picked = radios.find(r => r.checked);
          if (picked) close(picked.value);
          return;
        }
        let firstError = null;
        fields.forEach((f, i) => {
          const value = inputs[i].value.trim();
          const error = f.validate ? f.validate(value) : null;
          errors[i].textContent = error || '';
          if (error && !firstError) firstError = inputs[i];
        });
        if (firstError) { firstError.focus(); return; }
        if (fields.length === 0) close(true);
        else close(inputs[0].value.trim());
      };
      const cancel = () => close(fields.length || choices ? null : false);

      dlg.append(
        h('h2', { class: 'dialog-title', id: 'dlg-title', text: title }),
        body ? h('p', { class: 'dialog-body', text: body }) : null,
        ...fields.map((f, i) => h('label', { class: 'field' }, h('span', { text: f.label }), inputs[i], errors[i])),
        choices ? h('div', { class: 'stack', role: 'radiogroup', 'aria-labelledby': 'dlg-title' },
          ...choices.map((c, i) => h('label', { class: 'choice' }, radios[i], h('span', {}, h('strong', { text: c.label }), h('small', { text: c.hint }))))) : null,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: cancel, text: cancelLabel }),
          h('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', type: 'button', onclick: confirm, text: confirmLabel }),
        ),
      );
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); cancel(); });
      inputs.forEach(input => input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      }));
      document.body.append(dlg);
      dlg.showModal();
      const first = inputs[0] || radios.find(r => r.checked) || dlg.querySelector('.btn-primary, .btn-danger');
      if (first) first.focus();
      if (inputs[0]) inputs[0].select();
    });
  }

  const confirmDialog = (opts) => dialog({ ...opts, fields: [] });
  const choiceDialog = (opts) => dialog({ ...opts, fields: [] });

  // How applying a layout treats the windows that are already open.
  const BEHAVIORS = [
    { value: 'close_all', label: 'Replace my windows', hint: 'Closes the other windows and opens the layout. The window you are using stays. Undo brings the closed ones back.' },
    { value: 'smart_close_pinned', label: 'Replace, but keep windows with pinned tabs', hint: 'Like the first option, but leaves any window that has a pinned tab.' },
    { value: 'merge', label: 'Add alongside', hint: 'Opens the layout and closes nothing. Windows can end up duplicated.' },
  ];

  // Nothing is ever closed until the user has chosen. The first apply asks.
  async function ensureBehaviorChosen() {
    const saved = await chrome.storage.sync.get({ behaviorConfirmed: false });
    if (saved.behaviorConfirmed) return true;
    const value = await choiceDialog({
      title: 'How should layouts be applied?',
      body: 'Choose once. You can change it later in Settings.',
      choices: BEHAVIORS, selected: 'close_all', confirmLabel: 'Apply layout',
    });
    if (!value) return false;
    await chrome.storage.sync.set({ presetBehavior: value, behaviorConfirmed: true });
    return true;
  }
  const promptDialog = (opts) => dialog({ ...opts, fields: [{ label: opts.label, value: opts.value, placeholder: opts.placeholder, validate: opts.validate }] });

  // Disclosure menus (<details class="menu">): Escape and an outside click close
  // them, the arrow keys move between items, and focus goes back to the trigger.
  function initMenus() {
    document.addEventListener('click', (e) => {
      document.querySelectorAll('details.menu[open]').forEach(menu => {
        if (!menu.contains(e.target)) menu.open = false;
      });
      const item = e.target.closest('details.menu .menu-panel button');
      if (item) item.closest('details').open = false;
    });
    document.addEventListener('toggle', (e) => {
      const menu = e.target;
      if (menu.matches && menu.matches('details.menu') && menu.open) {
        const first = menu.querySelector('.menu-panel button:not([disabled])');
        if (first) first.focus();
      }
    }, true);
    document.addEventListener('keydown', (e) => {
      const menu = e.target.closest && e.target.closest('details.menu');
      if (!menu || !menu.open) return;
      const items = [...menu.querySelectorAll('.menu-panel button:not([disabled])')];
      const index = items.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        menu.open = false;
        menu.querySelector('summary').focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = (index + (e.key === 'ArrowDown' ? 1 : items.length - 1) + items.length) % items.length;
        items[next] && items[next].focus();
      }
    });
  }

  return { icon, emptyArt, send, h, preview, plural, summaryLine, formatDate, toast, confirmDialog, promptDialog, choiceDialog, BEHAVIORS, ensureBehaviorChosen, initMenus };
})();
