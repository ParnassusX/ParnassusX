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
  const suggest = document.getElementById('suggest');
  const matchCard = document.getElementById('match-card');
  const matchText = document.getElementById('match-text');
  const matchUpdate = document.getElementById('match-update');
  let matchedName = null;

  openManager.replaceChildren(icon('external'), t('Manage'));
  undoButton.replaceChildren(icon('undo'), t('Undo'));
  changeUndo.replaceChildren(icon('undo'), t('Undo'));

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
      quick.append(h('p', { class: 'muted', text: response.message || t('Could not load presets.') }));
      return;
    }
    const names = WLM.sortPresetNames(response.presets);
    count.textContent = names.length ? plural(names.length, 'preset') : '';
    if (names.length === 0) {
      quick.append(h('div', { class: 'empty' },
        UI.emptyArt(),
        h('h2', { text: t('Nothing saved yet') }),
        h('p', { text: t('Arrange your windows, then save the layout above.') })));
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
            slot !== -1 ? h('span', { class: 'badge', title: t('Ctrl+Shift+{n} (Command+Shift+{n} on Mac)', { n: slot + 1 }), text: t('Shortcut {n}', { n: slot + 1 }) }) : null,
            slot !== -1 ? ' ' : '',
            WLM.compactSummary(entry))),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => apply(name), 'aria-label': t('Apply {name}', { name }) }, icon('apply'), t('Apply')),
      ));
    }
  }

  async function renderUndo() {
    const [applyResponse, changeResponse] = await Promise.all([send({ action: 'getLastSession' }), send({ action: 'getUndoInfo' })]);
    const session = applyResponse.session;
    undoCard.classList.toggle('hidden', !session);
    if (session) {
      undoText.textContent = t('Your last apply closed {windows}.', { windows: plural(session.windows, 'window') });
    }
    const change = changeResponse.undo;
    changeCard.classList.toggle('hidden', !change);
    if (change) changeText.textContent = change.label;
  }

  // What the current windows look like: the preset they are closest to, and a
  // name for a new one. Only addresses are compared, so nothing is stored.
  async function renderSmart() {
    const [captured, saved] = await Promise.all([send({ action: 'captureLayout' }), send({ action: 'getPresets' })]);
    suggest.classList.add('hidden');
    matchCard.classList.add('hidden');
    if (captured.status !== 'success' || saved.status !== 'success') return;
    const layout = WLM.sanitizeLayout(captured.layout);
    if (!layout) return;

    const taken = WLM.uniqueName(saved.presets, WLM.suggestName(layout));
    if (taken && !nameInput.value.trim()) {
      suggest.replaceChildren(icon('plus'), t('Name it "{name}"', { name: taken }));
      suggest.onclick = () => { nameInput.value = taken; nameInput.focus(); suggest.classList.add('hidden'); };
      suggest.classList.remove('hidden');
    }

    const match = WLM.matchPreset(layout, saved.presets);
    matchedName = null;
    if (!match || match.score < 0.5) return;
    matchCard.classList.remove('hidden');
    if (match.score === 1) {
      matchText.textContent = t('Your windows match "{name}".', { name: match.name });
      matchUpdate.classList.add('hidden');
      return;
    }
    matchedName = match.name;
    matchText.textContent = t('Looks like "{name}": {added} new and {removed} closed since you saved it.', { name: match.name, added: match.added, removed: match.removed });
    matchUpdate.replaceChildren(icon('update'), t('Update'));
    matchUpdate.setAttribute('aria-label', t('Update {name} with the current windows', { name: match.name }));
    matchUpdate.classList.remove('hidden');
  }

  matchUpdate.addEventListener('click', async () => {
    if (!matchedName) return;
    const response = await send({ action: 'updateCurrentLayout', presetName: matchedName });
    toast(response.message, response.success ? 'success' : 'error');
    renderQuick(); renderUndo(); renderSmart();
  });

  async function apply(name) {
    if (!(await UI.ensureBehaviorChosen())) return;
    const response = await send({ action: 'applyPreset', presetName: name, keepWindowId: await lastFocusedWindowId() });
    if (response.status === 'success') {
      toast(t('Applied "{name}".', { name }), 'success');
      setTimeout(() => window.close(), 700);
    } else {
      toast(response.message || t('Could not apply the preset.'), 'error');
    }
    renderUndo();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    nameError.textContent = '';
    if (!name) {
      nameError.textContent = t('Enter a name for the layout.');
      nameInput.focus();
      return;
    }
    const response = await send({ action: 'saveCurrentLayout', presetName: name });
    if (response.success) {
      toast(response.message, 'success');
      nameInput.value = '';
      renderQuick();
      renderUndo();
      renderSmart();
    } else {
      // Keep the typed name so it can be changed, and say why.
      nameError.textContent = response.message || t('Could not save the layout.');
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
    chrome.sidePanel.open({ windowId }).catch(error => toast(t('Could not open the side panel: {error}', { error: error.message }), 'error'));
  });

  renderQuick();
  renderUndo();
  renderSmart();
  nameInput.focus();
});
