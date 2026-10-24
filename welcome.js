document.addEventListener('DOMContentLoaded', async () => {
  const { h } = UI;
  const choices = document.getElementById('behavior-choices');
  const status = document.getElementById('welcome-status');

  const saved = await chrome.storage.sync.get({ presetBehavior: 'close_all', behaviorConfirmed: false, theme: 'system' });
  if (saved.theme === 'light' || saved.theme === 'dark') document.documentElement.dataset.theme = saved.theme;

  UI.BEHAVIORS.forEach(option => {
    choices.append(h('label', { class: 'choice' },
      h('input', { type: 'radio', name: 'behavior', value: option.value, checked: option.value === saved.presetBehavior }),
      h('span', {}, h('strong', { text: option.label }), h('small', { text: option.hint }))));
  });

  async function save() {
    const picked = document.querySelector('input[name="behavior"]:checked');
    await chrome.storage.sync.set({ presetBehavior: picked.value, behaviorConfirmed: true });
    status.textContent = t('Saved. You are ready: click the toolbar icon to save your first layout.');
  }

  document.getElementById('finish').addEventListener('click', save);

  // Opening the side panel needs a user gesture, which this click provides.
  document.getElementById('library').addEventListener('click', async () => {
    await save();
    const win = await new Promise(resolve => chrome.windows.getCurrent(resolve));
    chrome.sidePanel.open({ windowId: win.id }).catch(() => {
      status.textContent = t('Saved. Open the manager from the popup with the Manage button.');
    });
  });
});
