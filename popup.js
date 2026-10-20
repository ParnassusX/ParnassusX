document.addEventListener('DOMContentLoaded', () => {
  const { send, h, icon, preview, toast, plural } = UI;
  const form = document.getElementById('save-form');
  const nameInput = document.getElementById('name');
  const nameError = document.getElementById('name-error');
  const quick = document.getElementById('quick');
  const count = document.getElementById('count');
  const undoCard = document.getElementById('undo-card');
  const undoText = document.getElementById('undo-text');
  const undoButton = document.getElementById('undo');
  const changeCard = document.getElementById('change-card');
  const changeText = document.getElementById('change-text');
  const changeUndo = document.getElementById('change-undo');
  const openManager = document.getElementById('open-manager');

  openManager.replaceChildren(icon('external'), 'Manage');
  undoButton.replaceChildren(icon('undo'), 'Undo');
  changeUndo.replaceChildren(icon('undo'), 'Undo');

  chrome.storage.sync.get({ theme: 'system' }, ({ theme }) => {
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  });

  // The window the user is working in. The popup itself is not a normal window.
  function lastFocusedWindowId() {
    return new Promise(resolve => chrome.windows.getLastFocused({ windowTypes: ['normal'] }, win => resolve(win && win.id)));
  }

  async function renderQuick() {
    const [response, slotResponse] = await Promise.all([send({ action: 'getPresets' }), send({ action: 'getShortcutSlots' })]);
    quick.replaceChildren();
    if (response.status !== 'success') {
      quick.append(h('p', { class: 'muted', text: response.message || 'Could not load presets.' }));
      return;
    }
    const names = WLM.sortPresetNames(response.presets);
    count.textContent = names.length ? plural(names.length, 'preset') : '';
    if (names.length === 0) {
      quick.append(h('p', { class: 'muted', text: 'No presets yet. Arrange your windows, then save the layout above.' }));
      return;
    }
    const targets = WLM.shortcutTargets(response.presets, slotResponse.slots || {});
    for (const name of names) {
      const entry = response.presets[name];
      const slot = targets.indexOf(name);
      quick.append(h('div', { class: 'quick-item' },
        preview(entry),
        h('div', { style: 'min-width:0' },
          h('div', { class: 'preset-name', title: name, text: name }),
          h('div', { class: 'preset-meta' },
            slot !== -1 ? h('span', { class: 'badge', title: `Ctrl+Shift+${slot + 1} (Command+Shift+${slot + 1} on Mac)`, text: `Shortcut ${slot + 1}` }) : null,
            slot !== -1 ? ' ' : '',
            WLM.compactSummary(entry))),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => apply(name), 'aria-label': `Apply ${name}` }, icon('apply'), 'Apply'),
      ));
    }
  }

  async function renderUndo() {
    const [applyResponse, changeResponse] = await Promise.all([send({ action: 'getLastSession' }), send({ action: 'getUndoInfo' })]);
    const session = applyResponse.session;
    undoCard.classList.toggle('hidden', !session);
    if (session) {
      undoText.textContent = `Your last apply closed ${plural(session.windows, 'window')}.`;
    }
    const change = changeResponse.undo;
    changeCard.classList.toggle('hidden', !change);
    if (change) changeText.textContent = change.label;
  }

  async function apply(name) {
    const response = await send({ action: 'applyPreset', presetName: name, keepWindowId: await lastFocusedWindowId() });
    if (response.status === 'success') {
      toast(`Applied "${name}".`, 'success');
      setTimeout(() => window.close(), 700);
    } else {
      toast(response.message || 'Could not apply the preset.', 'error');
    }
    renderUndo();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    nameError.textContent = '';
    if (!name) {
      nameError.textContent = 'Enter a name for the layout.';
      nameInput.focus();
      return;
    }
    const response = await send({ action: 'saveCurrentLayout', presetName: name });
    if (response.success) {
      toast(response.message, 'success');
      nameInput.value = '';
      renderQuick();
      renderUndo();
    } else {
      // Keep the typed name so it can be changed, and say why.
      nameError.textContent = response.message || 'Could not save the layout.';
      nameInput.select();
    }
  });
  nameInput.addEventListener('input', () => { nameError.textContent = ''; });

  undoButton.addEventListener('click', async () => {
    const response = await send({ action: 'undoLastApply', keepWindowId: await lastFocusedWindowId() });
    toast(response.message, response.status === 'success' ? 'success' : 'error');
    renderUndo();
  });

  changeUndo.addEventListener('click', async () => {
    const response = await send({ action: 'undoPresetChange' });
    toast(response.message, response.success ? 'success' : 'error');
    renderQuick();
    renderUndo();
  });

  openManager.addEventListener('click', async () => {
    const windowId = await lastFocusedWindowId();
    chrome.sidePanel.open({ windowId }).catch(error => toast(`Could not open the side panel: ${error.message}`, 'error'));
  });

  renderQuick();
  renderUndo();
  nameInput.focus();
});
