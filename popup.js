document.addEventListener('DOMContentLoaded', () => {
  const { send, h, icon, preview, toast, summaryLine, formatDate } = UI;
  const form = document.getElementById('save-form');
  const nameInput = document.getElementById('name');
  const quick = document.getElementById('quick');
  const undoCard = document.getElementById('undo-card');
  const undoText = document.getElementById('undo-text');
  const undoButton = document.getElementById('undo');
  const openManager = document.getElementById('open-manager');

  openManager.replaceChildren(icon('layers'));
  chrome.storage.sync.get({ theme: 'system' }, ({ theme }) => {
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  });
  undoButton.replaceChildren(icon('undo'), 'Undo');

  async function renderQuick() {
    const response = await send({ action: 'getPresets' });
    quick.replaceChildren();
    if (response.status !== 'success') {
      quick.append(h('p', { class: 'muted', text: response.message || 'Could not load presets.' }));
      return;
    }
    const names = Object.keys(response.presets).sort().slice(0, 3);
    if (names.length === 0) {
      quick.append(h('p', { class: 'muted', text: 'No presets yet. Arrange your windows, then save the layout above.' }));
      return;
    }
    for (const name of names) {
      const entry = response.presets[name];
      quick.append(h('div', { class: 'quick-item' },
        preview(entry),
        h('div', { style: 'min-width:0' },
          h('div', { class: 'preset-name', title: name, text: name }),
          h('div', { class: 'preset-meta', text: summaryLine(entry) })),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => apply(name), 'aria-label': `Apply ${name}` }, icon('apply'), 'Apply'),
      ));
    }
  }

  async function renderUndo() {
    const response = await send({ action: 'getLastSession' });
    const session = response.session;
    undoCard.classList.toggle('hidden', !session);
    if (session) {
      undoText.textContent = `Replaced ${UI.plural(session.windows, 'window')} at ${new Date(session.savedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`;
    }
  }

  async function apply(name) {
    const response = await send({ action: 'applyPreset', presetName: name });
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
    if (!name) {
      toast('Enter a name for the layout first.', 'error');
      nameInput.focus();
      return;
    }
    const response = await send({ action: 'saveCurrentLayout', presetName: name });
    if (response.status === 'success' && response.success) {
      toast(response.message, 'success');
      nameInput.value = '';
      renderQuick();
    } else {
      toast(response.message || 'Could not save the layout.', 'error');
    }
  });

  undoButton.addEventListener('click', async () => {
    const response = await send({ action: 'undoLastApply' });
    toast(response.message, response.status === 'success' ? 'success' : 'error');
    renderUndo();
  });

  openManager.addEventListener('click', () => {
    chrome.windows.getCurrent(win => {
      chrome.sidePanel.open({ windowId: win.id }).catch(error => toast(`Could not open the side panel: ${error.message}`, 'error'));
    });
  });

  renderQuick();
  renderUndo();
  nameInput.focus();
});
