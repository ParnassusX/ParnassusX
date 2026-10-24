document.addEventListener('DOMContentLoaded', () => {
  const { send, h, icon, preview, toast, summaryLine, formatDate, promptDialog, plural } = UI;

  const tabs = [...document.querySelectorAll('.tab')];
  const panels = { presets: 'panel-presets', library: 'panel-library', settings: 'panel-settings', data: 'panel-data' };
  const presetList = document.getElementById('preset-list');
  const searchInput = document.getElementById('search');
  const changeBanner = document.getElementById('change-banner');
  const undoBanner = document.getElementById('undo-banner');
  const screensBanner = document.getElementById('screens-banner');
  const libraryList = document.getElementById('library-list');
  const fitToggle = document.getElementById('fit');
  const lazyToggle = document.getElementById('lazy');
  const themeSelect = document.getElementById('theme');
  const slotList = document.getElementById('slot-list');

  let presets = {};
  let slots = {};
  let shortcutNames = [];
  let currentSignature = null;
  let screensDismissed = false;
  let highlightName = null;
  const PAGE_SIZE = 50;
  let visibleCount = PAGE_SIZE;

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
    if (name === 'settings') renderSlots();
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

  // ---- Banners ------------------------------------------------------------
  function banner(el, { iconName, text, actionLabel, onAction, onDismiss }) {
    el.classList.remove('hidden');
    // replaceChildren() would print null as text, so build the list without gaps.
    el.replaceChildren(...[
      icon(iconName),
      h('p', { text }),
      actionLabel ? h('button', { class: 'btn', type: 'button', onclick: onAction }, actionLabel) : null,
      onDismiss ? h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': t('Dismiss'), onclick: onDismiss }, icon('close')) : null,
    ].filter(Boolean));
  }
  function hideBanner(el) {
    el.classList.add('hidden');
    el.replaceChildren();
  }

  // Undo for preset edits (delete, update, rename, import, ...).
  async function refreshChangeBanner() {
    const { undo } = await send({ action: 'getUndoInfo' });
    if (!undo) return hideBanner(changeBanner);
    banner(changeBanner, {
      iconName: 'undo',
      text: undo.label,
      actionLabel: t('Undo'),
      onAction: async () => {
        const response = await send({ action: 'undoPresetChange' });
        toast(response.message, response.success ? 'success' : 'error');
        loadPresets();
      },
    });
  }

  // Undo for applying a layout that closed windows.
  async function refreshApplyBanner() {
    const { session } = await send({ action: 'getLastSession' });
    if (!session) return hideBanner(undoBanner);
    const time = new Date(session.savedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    banner(undoBanner, {
      iconName: 'undo',
      text: t('A layout closed your windows at {time}. {windows} can come back.', { time, windows: plural(session.windows, 'window') }),
      actionLabel: t('Bring back'),
      onAction: undoLastApply,
    });
  }

  function renderScreensBanner() {
    const changed = currentSignature && Object.values(presets).some(p => !p.reference && WLM.displaySignature(p.displays) !== currentSignature);
    if (!changed || screensDismissed) return hideBanner(screensBanner);
    banner(screensBanner, {
      iconName: 'warning',
      text: t('Your screens differ from when some presets were saved. Those presets are scaled to fit.'),
      onDismiss: () => { screensDismissed = true; renderScreensBanner(); },
    });
  }

  // ---- Presets ------------------------------------------------------------
  async function loadPresets() {
    const [presetResponse, displayResponse, slotResponse] = await Promise.all([
      send({ action: 'getPresets' }), send({ action: 'getDisplays' }), send({ action: 'getShortcutSlots' }),
    ]);
    if (presetResponse.status === 'success') presets = presetResponse.presets;
    if (displayResponse.status === 'success') currentSignature = displayResponse.signature;
    if (slotResponse.status === 'success') slots = slotResponse.slots;
    shortcutNames = WLM.shortcutTargets(presets, slots);
    renderPresets();
    refreshChangeBanner();
  }

  function slotOf(name) {
    const index = shortcutNames.indexOf(name);
    return index === -1 ? null : index + 1;
  }

  function tabList(name, entry) {
    const lines = entry.windows.flatMap((win, w) => [
      h('li', { class: 'tab-window', text: win.state !== 'normal' ? t('Window {n} ({state})', { n: w + 1, state: t(win.state) }) : t('Window {n}', { n: w + 1 }) }),
      ...win.tabs.map((tab, ti) => h('li', { class: 'tab-line' + (tab.pinned ? ' pinned' : ''), title: tab.url },
        h('span', { class: 'tab-text' }, tab.pinned ? h('span', { class: 'pin-mark', 'aria-label': t('pinned') }, '● ') : null, h('span', { text: tab.title || tab.url })),
        entry.windows.reduce((n, x) => n + x.tabs.length, 0) > 1
          ? h('button', { class: 'btn btn-ghost btn-icon tab-remove', type: 'button', title: t('Remove this tab from the preset'), 'aria-label': t('Remove {tab} from {name}', { tab: tab.title || tab.url, name }),
              onclick: () => removeTab(name, w, ti) }, icon('close'))
          : null)),
    ]);
    return h('details', { class: 'tab-details' },
      h('summary', { text: t('Show {tabs}', { tabs: plural(entry.windows.reduce((n, w) => n + w.tabs.length, 0), 'tab') }) }),
      h('ul', { class: 'tab-tree' }, ...lines));
  }

  function presetCard(name) {
    const entry = presets[name];
    const changed = !entry.reference && currentSignature && WLM.displaySignature(entry.displays) !== currentSignature;
    const slot = slotOf(name);
    const menuItem = (iconName, label, onclick, { disabled = false, danger = false, current = false } = {}) => h('button', {
      type: 'button', role: 'menuitem', class: danger ? 'danger' : '', disabled,
      'aria-current': current ? 'true' : null,
      onclick,
    }, icon(iconName), label, current ? h('span', { class: 'menu-note', text: t('current') }) : null);

    const slotItems = [1, 2, 3].map(index => menuItem('keyboard', t('Shortcut {n}', { n: index }),
      () => setSlot(index, name), { current: slot === index }));
    if (slot) slotItems.push(menuItem('close', t('Remove shortcut'), () => setSlot(slot, null)));

    const menu = h('details', { class: 'menu' },
      h('summary', { class: 'btn btn-ghost btn-icon', title: t('More actions'), 'aria-label': t('More actions for {name}', { name }), 'aria-haspopup': 'menu' }, icon('more')),
      h('div', { class: 'menu-panel', role: 'menu' },
        menuItem('rename', t('Rename'), () => renamePreset(name)),
        menuItem('copy', t('Duplicate'), () => duplicatePreset(name)),
        menuItem('history', t('Previous version'), () => revertPreset(name), { disabled: entry.history.length === 0 }),
        h('div', { class: 'menu-sep', role: 'separator' }),
        h('div', { class: 'menu-label', text: t('Keyboard shortcut') }),
        ...slotItems,
        h('div', { class: 'menu-sep', role: 'separator' }),
        menuItem('trash', t('Delete'), () => deletePreset(name), { danger: true }),
      ),
    );

    const card = h('article', { class: 'preset' + (highlightName === name ? ' highlight' : ''), 'data-name': name },
      preview(entry, { width: 96, height: 60 }),
      h('div', { class: 'preset-body' },
        h('div', { class: 'preset-name-row' },
          h('span', { class: 'preset-name', title: name, text: name }),
          slot ? h('span', { class: 'badge', title: t('Ctrl+Shift+{n} (Command+Shift+{n} on Mac)', { n: slot }), text: t('Shortcut {n}', { n: slot }) }) : null),
        h('div', { class: 'preset-meta', text: summaryLine(entry) }),
        h('div', { class: 'preset-meta', text: t('Saved {date}', { date: formatDate(entry.savedAt) }) + (entry.updatedAt !== entry.savedAt ? ' · ' + t('updated {date}', { date: formatDate(entry.updatedAt) }) : '') }),
        changed ? h('div', { class: 'flag', text: t('Screens differ: will be scaled') }) : null,
        entry.reference ? h('div', { class: 'preset-meta', text: t('Library layout, scaled to this screen') }) : null,
        h('div', { class: 'preset-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => applyPreset(name), 'aria-label': t('Apply {name}', { name }) }, icon('apply'), t('Apply')),
          h('button', { class: 'btn', type: 'button', onclick: () => updatePreset(name), 'aria-label': t('Update {name} with the current layout', { name }) }, icon('update'), t('Update')),
          menu,
        ),
      ),
      tabList(name, entry),
    );
    return card;
  }

  function renderPresets() {
    renderScreensBanner();
    const names = WLM.searchPresets(presets, searchInput.value);
    presetList.replaceChildren();
    if (Object.keys(presets).length === 0) {
      presetList.append(h('div', { class: 'empty' },
        UI.emptyArt(),
        h('h2', { text: t('Nothing saved yet') }),
        h('p', { text: t('Arrange your windows the way you like them, then press Capture. Or start from the Library.') })));
      return;
    }
    if (names.length === 0) {
      presetList.append(h('p', { class: 'muted', text: t('Nothing matches "{query}".', { query: searchInput.value.trim() }) }));
      return;
    }
    if (highlightName && names.indexOf(highlightName) >= visibleCount) visibleCount = names.indexOf(highlightName) + 1;
    names.slice(0, visibleCount).forEach(name => presetList.append(presetCard(name)));
    if (names.length > visibleCount) {
      const remaining = names.length - visibleCount;
      presetList.append(h('button', { class: 'btn btn-block', type: 'button', onclick: () => { visibleCount += PAGE_SIZE; renderPresets(); } },
        t('Show {n} more ({remaining} not shown)', { n: Math.min(remaining, PAGE_SIZE), remaining })));
    }
    if (highlightName) {
      const node = presetList.querySelector(`[data-name="${CSS.escape(highlightName)}"]`);
      if (node) node.scrollIntoView({ block: 'nearest' });
      highlightName = null;
    }
  }

  // Name validation shared by Capture and Rename. Returns an error message or null.
  function nameError(value, ignore = null) {
    if (!value) return t('Enter a name.');
    if (value !== ignore && Object.prototype.hasOwnProperty.call(presets, value)) return t('That name is already used. Pick another.');
    return null;
  }

  function suggestName() {
    for (let i = 1; i < 1000; i++) {
      const candidate = i === 1 ? t('Layout') : `${t('Layout')} ${i}`;
      if (!presets[candidate]) return candidate;
    }
    return '';
  }

  async function captureNew() {
    const name = await promptDialog({
      title: t('Save current layout'), label: t('Name'), value: suggestName(), confirmLabel: t('Save'),
      validate: value => nameError(value),
    });
    if (!name) return;
    const response = await send({ action: 'saveCurrentLayout', presetName: name });
    toast(response.message, response.success ? 'success' : 'error');
    if (response.success) loadPresets();
  }

  async function applyPreset(name) {
    if (!(await UI.ensureBehaviorChosen())) return;
    const response = await send({ action: 'applyPreset', presetName: name, keepWindowId: await currentWindowId() });
    toast(response.status === 'success' ? t('Applied "{name}".', { name }) : response.message, response.status === 'success' ? 'success' : 'error');
    refreshApplyBanner();
    loadPresets();
  }

  async function undoLastApply() {
    const response = await send({ action: 'undoLastApply', keepWindowId: await currentWindowId() });
    toast(response.message, response.success ? 'success' : 'error');
    refreshApplyBanner();
  }

  async function currentWindowId() {
    return new Promise(resolve => chrome.windows.getCurrent(win => resolve(win && win.id)));
  }

  async function report(promise) {
    const response = await promise;
    toast(response.message, response.success ? 'success' : 'error');
    if (response.success) loadPresets();
    return response;
  }

  function updatePreset(name) {
    return report(send({ action: 'updateCurrentLayout', presetName: name }));
  }

  async function renamePreset(name) {
    const newName = await promptDialog({
      title: t('Rename preset'), label: t('Name'), value: name, confirmLabel: t('Rename'),
      validate: value => nameError(value, name),
    });
    if (!newName || newName === name) return;
    return report(send({ action: 'renamePreset', presetName: name, newName }));
  }

  function duplicatePreset(name) {
    return report(send({ action: 'duplicatePreset', presetName: name }));
  }

  function revertPreset(name) {
    return report(send({ action: 'revertPreset', presetName: name }));
  }

  // Deleting is immediate and reversible: the change banner offers Undo.
  function deletePreset(name) {
    return report(send({ action: 'deletePreset', presetName: name }));
  }

  function removeTab(name, windowIndex, tabIndex) {
    return report(send({ action: 'removeTab', presetName: name, windowIndex, tabIndex }));
  }

  async function setSlot(index, name) {
    const response = await send({ action: 'setShortcutSlot', index, presetName: name });
    toast(response.message, response.success ? 'success' : 'error');
    loadPresets();
  }

  searchInput.addEventListener('input', () => { visibleCount = PAGE_SIZE; renderPresets(); });
  const captureButton = document.getElementById('capture');
  captureButton.replaceChildren(icon('plus'), t('Capture'));
  captureButton.addEventListener('click', captureNew);

  // ---- Library ------------------------------------------------------------
  let library = null;

  async function loadLibrary() {
    if (library) return library;
    try {
      const response = await fetch('library/presets.json');
      library = (await response.json()).presets;
    } catch (error) {
      library = [];
      toast(t('Could not load the library: {error}', { error: error.message }), 'error');
    }
    return library;
  }

  // A library entry may carry translations: { it: { name, category, description } }.
  function libraryText(item) {
    const translated = item.translations && item.translations[I18N.language()];
    return { name: item.name, category: item.category, description: item.description, ...(translated || {}) };
  }

  async function renderLibrary() {
    const items = await loadLibrary();
    libraryList.replaceChildren();
    for (const item of items) {
      const stored = WLM.normalizeStoredEntry(item.layout, 0);
      if (!stored) continue;
      libraryList.append(h('article', { class: 'preset library-card' },
        preview(stored, { width: 96, height: 60 }),
        h('div', { class: 'preset-body' },
          h('div', { class: 'preset-name', text: libraryText(item).name }),
          h('span', { class: 'chip', text: libraryText(item).category }),
          h('p', { text: libraryText(item).description }),
          h('div', { class: 'preset-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => addFromLibrary(item), 'aria-label': t('Add {name} to my presets', { name: libraryText(item).name }) }, icon('plus'), t('Add to my presets')),
          ),
        ),
      ));
    }
  }

  async function addFromLibrary(item) {
    const response = await send({ action: 'installPreset', presetName: libraryText(item).name, layoutData: item.layout });
    if (!response.success) return toast(response.message, 'error');
    const name = response.name || libraryText(item).name;
    await loadPresets();
    toast(t('Added "{name}".', { name }), 'success', {
      label: t('View'),
      onClick: () => { highlightName = name; selectTab('presets'); },
    });
  }

  // ---- Settings -----------------------------------------------------------
  function applyTheme(value) {
    if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value;
    else delete document.documentElement.dataset.theme;
  }

  async function loadSettings() {
    const items = await chrome.storage.sync.get({ presetBehavior: 'close_all', fitToScreens: true, lazyTabs: true, theme: 'system' });
    const radio = document.querySelector(`input[name="behavior"][value="${items.presetBehavior}"]`) || document.querySelector('input[name="behavior"][value="close_all"]');
    radio.checked = true;
    fitToggle.checked = items.fitToScreens !== false;
    lazyToggle.checked = items.lazyTabs !== false;
    themeSelect.value = items.theme;
    applyTheme(items.theme);
  }

  // Settings apply at once; the control itself shows the new state, so no toast.
  document.querySelectorAll('input[name="behavior"]').forEach(radio => radio.addEventListener('change', () => {
    chrome.storage.sync.set({ presetBehavior: radio.value, behaviorConfirmed: true });
  }));
  lazyToggle.addEventListener('change', () => chrome.storage.sync.set({ lazyTabs: lazyToggle.checked }));
  fitToggle.addEventListener('change', () => chrome.storage.sync.set({ fitToScreens: fitToggle.checked }));
  themeSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ theme: themeSelect.value });
    applyTheme(themeSelect.value);
  });
  document.getElementById('shortcuts').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  function renderSlots() {
    slotList.replaceChildren();
    [1, 2, 3].forEach((index, i) => {
      slotList.append(h('li', {},
        h('kbd', { text: t('Ctrl+Shift+{n}', { n: index }) }),
        h('span', { text: shortcutNames[i] ? ` → ${shortcutNames[i]}` : ' → ' + t('no preset yet') })));
    });
  }

  // ---- Data ---------------------------------------------------------------
  const exportButton = document.getElementById('export');
  const importButton = document.getElementById('import');
  exportButton.replaceChildren(icon('download'), t('Export all presets'));
  importButton.replaceChildren(icon('upload'), t('Import presets'));

  exportButton.addEventListener('click', async () => {
    const response = await send({ action: 'getPresets' });
    if (response.status !== 'success') return toast(response.message, 'error');
    const count = Object.keys(response.presets).length;
    if (count === 0) return toast(t('No presets to export yet.'), 'info');
    const blob = new Blob([JSON.stringify(response.presets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const a = h('a', { href: url, download: `window-presets-${stamp}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('Exported {presets}.', { presets: plural(count, 'preset') }), 'success');
  });

  importButton.addEventListener('click', () => {
    const input = document.getElementById('import-file');
    const file = input.files[0];
    if (!file) return toast(t('Choose a JSON file first.'), 'error');
    const reader = new FileReader();
    reader.onerror = () => toast(t('Could not read that file.'), 'error');
    reader.onload = async () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (error) {
        return toast(t('That file is not valid JSON.'), 'error');
      }
      input.value = '';
      await report(send({ action: 'importPresets', data }));
    };
    reader.readAsText(file);
  });

  // Plugging or unplugging a screen changes the scaling, so refresh.
  chrome.system.display.onDisplayChanged.addListener(() => loadPresets());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.presets || changes.shortcutSlots || changes.undoLog) loadPresets();
    if (changes.lastSession) refreshApplyBanner();
  });

  UI.initMenus();
  loadSettings();
  refreshApplyBanner();
  loadPresets();
});
