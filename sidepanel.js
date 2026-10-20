document.addEventListener('DOMContentLoaded', () => {
  const { send, h, icon, preview, toast, summaryLine, formatDate, promptDialog, confirmDialog } = UI;

  const tabs = [...document.querySelectorAll('.tab')];
  const panels = { presets: 'panel-presets', library: 'panel-library', settings: 'panel-settings', data: 'panel-data' };
  const presetList = document.getElementById('preset-list');
  const searchInput = document.getElementById('search');
  const undoBanner = document.getElementById('undo-banner');
  const screensBanner = document.getElementById('screens-banner');
  const libraryList = document.getElementById('library-list');
  const fitToggle = document.getElementById('fit');
  const themeSelect = document.getElementById('theme');

  let presets = {};
  let currentSignature = null;
  let screensDismissed = false;

  // ---- Tabs ---------------------------------------------------------------
  function selectTab(name) {
    for (const tab of tabs) {
      const active = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(panels[tab.dataset.tab]).hidden = !active;
    }
    if (name === 'presets') renderPresets();
    if (name === 'library') renderLibrary();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      selectTab(next.dataset.tab);
    });
  });

  // ---- Presets ------------------------------------------------------------
  async function loadPresets() {
    const [presetResponse, displayResponse] = await Promise.all([send({ action: 'getPresets' }), send({ action: 'getDisplays' })]);
    if (presetResponse.status === 'success') presets = presetResponse.presets;
    if (displayResponse.status === 'success') currentSignature = displayResponse.signature;
    renderPresets();
  }

  async function renderUndo() {
    const response = await send({ action: 'getLastSession' });
    const session = response.session;
    undoBanner.classList.toggle('hidden', !session);
    undoBanner.replaceChildren();
    if (!session) return;
    const time = new Date(session.savedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    undoBanner.append(
      icon('undo'),
      h('p', { text: `Your last apply at ${time} closed windows. ${UI.plural(session.windows, 'window')} can be brought back.` }),
      h('button', { class: 'btn', type: 'button', onclick: undoLastApply }, 'Undo'),
    );
  }

  function renderScreensBanner() {
    const changed = currentSignature && Object.values(presets).some(p => !p.reference && WLM.displaySignature(p.displays) !== currentSignature);
    const show = changed && !screensDismissed;
    screensBanner.classList.toggle('hidden', !show);
    screensBanner.replaceChildren();
    if (!show) return;
    screensBanner.append(
      icon('warning'),
      h('p', { text: 'Your screens are different from when some presets were saved. Those presets are scaled to fit the current screens.' }),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Dismiss', onclick: () => { screensDismissed = true; renderScreensBanner(); } }, icon('check')),
    );
  }

  // Lists the saved windows and tabs, so a layout can be checked before applying.
  function tabList(entry) {
    const lines = entry.windows.flatMap((win, i) => [
      h('li', { class: 'tab-window', text: `Window ${i + 1}${win.state !== 'normal' ? ` (${win.state})` : ''}` }),
      ...win.tabs.map(tab => h('li', { class: 'tab-line' + (tab.pinned ? ' pinned' : ''), title: tab.url },
        tab.pinned ? h('span', { class: 'pin-mark', 'aria-label': 'pinned' }, '📌 ') : null,
        h('span', { text: tab.title || tab.url }))),
    ]);
    return h('details', { class: 'tab-details' },
      h('summary', { text: `Show ${UI.plural(entry.windows.reduce((n, w) => n + w.tabs.length, 0), 'tab')}` }),
      h('ul', { class: 'tab-tree' }, ...lines));
  }

  function presetCard(name) {
    const entry = presets[name];
    const changed = !entry.reference && currentSignature && WLM.displaySignature(entry.displays) !== currentSignature;
    const menuItem = (iconName, label, onclick, disabled = false, danger = false) => h('button', {
      type: 'button', class: danger ? 'danger' : '', disabled,
      onclick: (e) => { e.currentTarget.closest('details').open = false; onclick(); },
    }, icon(iconName), label);

    const menu = h('details', { class: 'menu' },
      h('summary', { class: 'btn btn-ghost btn-icon', title: 'More actions', 'aria-label': `More actions for ${name}` }, icon('more')),
      h('div', { class: 'menu-panel', role: 'menu' },
        menuItem('rename', 'Rename', () => renamePreset(name)),
        menuItem('copy', 'Duplicate', () => duplicatePreset(name)),
        menuItem('history', 'Restore previous version', () => revertPreset(name), entry.history.length === 0),
        menuItem('trash', 'Delete', () => deletePreset(name), false, true),
      ),
    );

    return h('article', { class: 'preset', 'data-name': name },
      preview(entry, { width: 96, height: 60 }),
      h('div', { class: 'preset-body' },
        h('div', { class: 'preset-name', title: name, text: name }),
        h('div', { class: 'preset-meta', text: `${summaryLine(entry)}` }),
        h('div', { class: 'preset-meta', text: `Saved ${formatDate(entry.savedAt)}${entry.updatedAt !== entry.savedAt ? ` · updated ${formatDate(entry.updatedAt)}` : ''}` }),
        changed ? h('div', { class: 'flag', text: 'Screens differ: will be scaled' }) : null,
        entry.reference ? h('div', { class: 'preset-meta', text: 'Library layout, scaled to this screen' }) : null,
        h('div', { class: 'preset-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => applyPreset(name), 'aria-label': `Apply ${name}` }, icon('apply'), 'Apply'),
          h('button', { class: 'btn', type: 'button', onclick: () => updatePreset(name), 'aria-label': `Update ${name} with the current layout` }, icon('update'), 'Update'),
          menu,
        ),
      ),
      tabList(entry),
    );
  }

  function renderPresets() {
    renderScreensBanner();
    const query = searchInput.value.trim().toLowerCase();
    const names = Object.keys(presets).sort().filter(n => n.toLowerCase().includes(query));
    presetList.replaceChildren();
    if (Object.keys(presets).length === 0) {
      presetList.append(h('div', { class: 'empty' },
        h('h2', { text: 'No presets yet' }),
        h('p', { text: 'Arrange your windows, then press Capture. Or start from the Library.' })));
      return;
    }
    if (names.length === 0) {
      presetList.append(h('p', { class: 'muted', text: `No presets match "${searchInput.value.trim()}".` }));
      return;
    }
    names.forEach(name => presetList.append(presetCard(name)));
  }

  async function captureNew() {
    const name = await promptDialog({ title: 'Save current layout', label: 'Name', placeholder: 'e.g. Code review', confirmLabel: 'Save' });
    if (!name) return;
    const response = await send({ action: 'saveCurrentLayout', presetName: name });
    toast(response.message, response.success ? 'success' : 'error');
    if (response.success) loadPresets();
  }

  async function applyPreset(name) {
    const response = await send({ action: 'applyPreset', presetName: name });
    toast(response.status === 'success' ? `Applied "${name}".` : response.message, response.status === 'success' ? 'success' : 'error');
    renderUndo();
  }

  async function updatePreset(name) {
    const response = await send({ action: 'updateCurrentLayout', presetName: name });
    toast(response.message, response.success ? 'success' : 'error');
    if (response.success) loadPresets();
  }

  async function renamePreset(name) {
    const newName = await promptDialog({ title: 'Rename preset', label: 'Name', value: name, confirmLabel: 'Rename' });
    if (!newName || newName === name) return;
    const response = await send({ action: 'renamePreset', presetName: name, newName });
    toast(response.message, response.success ? 'success' : 'error');
    if (response.success) loadPresets();
  }

  async function duplicatePreset(name) {
    const response = await send({ action: 'duplicatePreset', presetName: name });
    toast(response.message, response.success ? 'success' : 'error');
    if (response.success) loadPresets();
  }

  async function revertPreset(name) {
    const response = await send({ action: 'revertPreset', presetName: name });
    toast(response.message, response.success ? 'success' : 'error');
    if (response.success) loadPresets();
  }

  async function deletePreset(name) {
    const ok = await confirmDialog({
      title: `Delete "${name}"?`,
      body: 'This removes the preset and its earlier versions. It cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const response = await send({ action: 'deletePreset', presetName: name });
    toast(response.message, response.success ? 'success' : 'error');
    if (response.success) loadPresets();
  }

  async function undoLastApply() {
    const response = await send({ action: 'undoLastApply' });
    toast(response.message, response.success ? 'success' : 'error');
    renderUndo();
    if (response.success) loadPresets();
  }

  searchInput.addEventListener('input', renderPresets);

  document.getElementById('capture').replaceChildren(icon('plus'), 'Capture');
  document.getElementById('capture').addEventListener('click', captureNew);

  // ---- Library ------------------------------------------------------------
  let library = null;

  async function loadLibrary() {
    if (library) return library;
    try {
      const response = await fetch('library/presets.json');
      library = (await response.json()).presets;
    } catch (error) {
      library = [];
      toast(`Could not load the library: ${error.message}`, 'error');
    }
    return library;
  }

  async function renderLibrary() {
    const items = await loadLibrary();
    libraryList.replaceChildren();
    for (const item of items) {
      const entry = WLM.sanitizeLayout(item.layout);
      if (!entry) continue;
      const stored = WLM.normalizeStoredEntry(item.layout, 0);
      libraryList.append(h('article', { class: 'preset library-card' },
        preview(stored, { width: 96, height: 60 }),
        h('div', { class: 'preset-body' },
          h('div', { class: 'preset-name', text: item.name }),
          h('span', { class: 'chip', text: item.category }),
          h('p', { text: item.description }),
          h('div', { class: 'preset-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => addFromLibrary(item), 'aria-label': `Add ${item.name} to my presets` }, icon('plus'), 'Add to my presets'),
          ),
        ),
      ));
    }
  }

  async function addFromLibrary(item) {
    const response = await send({ action: 'installPreset', presetName: item.name, layoutData: item.layout });
    toast(response.message, response.success ? 'success' : 'error');
    if (response.success) loadPresets();
  }

  // ---- Settings -----------------------------------------------------------
  function applyTheme(value) {
    if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value;
    else delete document.documentElement.dataset.theme;
  }

  async function loadSettings() {
    const items = await chrome.storage.sync.get({ presetBehavior: 'close_all', fitToScreens: true, theme: 'system' });
    const radio = document.querySelector(`input[name="behavior"][value="${items.presetBehavior}"]`) || document.querySelector('input[name="behavior"][value="close_all"]');
    radio.checked = true;
    fitToggle.checked = items.fitToScreens !== false;
    themeSelect.value = items.theme;
    applyTheme(items.theme);
  }

  document.querySelectorAll('input[name="behavior"]').forEach(radio => radio.addEventListener('change', async () => {
    await chrome.storage.sync.set({ presetBehavior: radio.value });
    toast('Setting saved.', 'success');
  }));
  fitToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ fitToScreens: fitToggle.checked });
    toast('Setting saved.', 'success');
  });
  themeSelect.addEventListener('change', async () => {
    await chrome.storage.sync.set({ theme: themeSelect.value });
    applyTheme(themeSelect.value);
  });
  document.getElementById('shortcuts').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // ---- Data ---------------------------------------------------------------
  const exportButton = document.getElementById('export');
  const importButton = document.getElementById('import');
  exportButton.replaceChildren(icon('download'), 'Export all presets');
  importButton.replaceChildren(icon('upload'), 'Import presets');

  exportButton.addEventListener('click', async () => {
    const response = await send({ action: 'getPresets' });
    if (response.status !== 'success') return toast(response.message, 'error');
    if (Object.keys(response.presets).length === 0) return toast('No presets to export yet.', 'info');
    const blob = new Blob([JSON.stringify(response.presets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'window-presets.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${UI.plural(Object.keys(response.presets).length, 'preset')}.`, 'success');
  });

  importButton.addEventListener('click', () => {
    const file = document.getElementById('import-file').files[0];
    if (!file) return toast('Choose a JSON file first.', 'error');
    const reader = new FileReader();
    reader.onerror = () => toast('Could not read that file.', 'error');
    reader.onload = async () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (error) {
        return toast('That file is not valid JSON.', 'error');
      }
      const response = await send({ action: 'importPresets', data });
      toast(response.message, response.success ? 'success' : 'error');
      document.getElementById('import-file').value = '';
      if (response.success) loadPresets();
    };
    reader.readAsText(file);
  });

  // Plugging or unplugging a screen changes the layouts' scaling, so refresh the banner.
  chrome.system.display.onDisplayChanged.addListener(() => loadPresets());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.presets) loadPresets();
    if (area === 'local' && changes.lastSession) renderUndo();
  });

  loadSettings();
  renderUndo();
  loadPresets();
});
