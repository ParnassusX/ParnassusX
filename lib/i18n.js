// A small translator. The English text in the code is the key; a locale file
// registers a dictionary from that English text to the translation. A missing
// entry falls back to English, so a new string is never blank.
//   t('Preset "{name}" saved.', { name })
const I18N = (() => {
  const dictionaries = {};
  let active = {};
  let language = 'en';

  function uiLanguage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) return chrome.i18n.getUILanguage();
    } catch (e) { /* fall through */ }
    return (typeof process !== 'undefined' && process.env && process.env.WLM_LANG) || 'en';
  }

  function select(lang) {
    language = String(lang || 'en').toLowerCase().split(/[-_]/)[0];
    active = dictionaries[language] || {};
  }

  function register(lang, dictionary) {
    dictionaries[lang] = dictionary;
    if (lang === language) active = dictionary;
  }

  function format(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, key) => (values && key in values ? String(values[key]) : match));
  }

  function t(text, values) {
    const translated = Object.prototype.hasOwnProperty.call(active, text) ? active[text] : text;
    return format(translated, values);
  }

  // "1 window" / "3 windows". The two forms are separate dictionary entries so
  // each language can inflect them.
  function count(n, word) {
    return t(n === 1 ? `{n} ${word}` : `{n} ${word}s`, { n });
  }

  // Translates the static text and the placeholder, title and aria-label
  // attributes of a page. Text that is not in the dictionary is left alone.
  function localizeDocument(root) {
    const doc = root.ownerDocument || root;
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parent = node.parentNode && node.parentNode.nodeName;
      if (parent === 'SCRIPT' || parent === 'STYLE') continue;
      const trimmed = node.nodeValue.trim();
      if (trimmed && Object.prototype.hasOwnProperty.call(active, trimmed)) {
        node.nodeValue = node.nodeValue.replace(trimmed, active[trimmed]);
      }
    }
    for (const el of root.querySelectorAll('[placeholder],[title],[aria-label]')) {
      for (const attr of ['placeholder', 'title', 'aria-label']) {
        const value = el.getAttribute(attr);
        if (value && Object.prototype.hasOwnProperty.call(active, value)) el.setAttribute(attr, active[value]);
      }
    }
    if (doc.title && Object.prototype.hasOwnProperty.call(active, doc.title)) doc.title = active[doc.title];
    if (doc.documentElement) doc.documentElement.lang = language;
  }

  select(uiLanguage());
  return { t, count, register, select, format, localizeDocument, language: () => language, dictionaries };
})();
const t = I18N.t;

if (typeof module !== 'undefined') module.exports = I18N;
