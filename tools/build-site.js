// Builds the static site (landing page and privacy policy, English and Italian)
// into site/. Plain HTML and CSS, no scripts, no external requests, no tracking.
//   STORE_URL=https://chromewebstore.google.com/detail/... CONTACT_EMAIL=you@example.com node tools/build-site.js
// Without STORE_URL the install button says "Coming soon"; without CONTACT_EMAIL
// the contact line is left out. Both are needed before the store submission.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'site');
const STORE_URL = process.env.STORE_URL || '';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';

const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const COPY = {
  en: {
    lang: 'en', other: { code: 'it', label: 'Italiano', path: 'it/' }, self: '',
    title: 'Window Layout Manager: save and restore your window layouts',
    description: 'Save how your browser is arranged and bring it back in one click. Adapts to your screens, and every change can be undone. Private: everything stays on your device.',
    nav: { features: 'Features', how: 'How it works', faq: 'Questions', privacy: 'Privacy' },
    heroTitle: 'Your windows, exactly how you left them.',
    heroSub: 'Save how your browser is arranged, and bring it back in one click. Wherever your screens are.',
    heroAlt: 'The toolbar popup, where a layout is saved with a name, next to the side panel that lists saved layouts with a thumbnail of each.',
    cta: 'Add to Chrome', ctaSoon: 'Coming soon to the Chrome Web Store', ctaSecondary: 'See how it works',
    freeNote: 'Free. No account. Works in Chrome 123 and later.',
    featuresTitle: 'Made for the way you actually work',
    features: [
      ['Save a layout, restore it in one click', 'Windows, tabs, pinned tabs, positions and the screen each window was on. Apply from the toolbar, the side panel or Ctrl+Shift+1, 2, 3.'],
      ['Adapts to your screens', 'A different screen size or a missing monitor? Windows keep their place proportionally and always stay on screen.'],
      ['Undo anything', 'Delete, rename, update, import, even a layout that closed your windows. One click brings it back.'],
      ['Ready-made layouts', 'Start from code review, writing with sources, planning, presentations, reading or meetings, then make them yours.'],
      ['Knows what you have open', 'It notices when your windows match a saved layout, offers to update it, and suggests a name from the sites you have open.'],
      ['Private by design', 'Everything stays on your device. No account, no analytics, no tracking, no remote code.'],
    ],
    howTitle: 'Three steps',
    how: [['Arrange', 'Open the windows and tabs the way you work.'], ['Save', 'Click the toolbar icon, name the layout, press Save.'], ['Apply', 'One click, or a shortcut. Undo is always there.']],
    galleryTitle: 'A look inside',
    faqTitle: 'Questions',
    faq: [
      ['Does it send my data anywhere?', 'No. Layouts are stored in your browser on your device. The extension has no account, no analytics and makes no network requests of its own. See the privacy policy for the details.'],
      ['Why does it ask for the "tabs" permission?', 'To read the address and title of each tab so it can save them, and to open tabs when a layout is restored. Without it the extension cannot know which pages are open. It never reads the content of a page.'],
      ['What are the other permissions for?', '"windows" reads and sets window position, size and state. "system.display" reads your screen layout so windows are placed on the right screen. "storage" keeps your presets and settings. "sidePanel" shows the manager in Chrome\'s side panel.'],
      ['What happens to windows that are already open when I apply a layout?', 'You choose once: replace them, replace them but keep windows with pinned tabs, or add the layout alongside. Until you choose, nothing is closed, and Undo brings back anything that was.'],
      ['Which tabs are saved?', 'Web pages (http and https). Browser pages, local files and extension pages are skipped, and a layout imported from a file is filtered the same way.'],
      ['Is it free?', 'Yes.'],
    ],
    footer: 'Window Layout Manager', privacyLink: 'Privacy policy', contact: 'Contact',
    privacy: {
      title: 'Privacy policy', updated: 'Last updated: October 2026',
      intro: 'Window Layout Manager saves the arrangement of your browser windows and tabs so you can restore it later.',
      sections: [
        ['What the extension stores', [
          'When you save a layout, it stores on your device the web address (URL) and title of each tab in your open windows, and each window\'s position, size and state, and the size and position of your screens.',
          'It also stores your settings (how to apply a layout, screen scaling, theme) and a short history of your own changes so you can undo them.',
          'Tabs that are not web pages (for example chrome:// pages and local files) are not saved.']],
        ['Where it is stored', [
          'Layouts and the change history are kept in the browser\'s local extension storage, on this device only.',
          'Settings are kept in Chrome\'s extension sync storage, which follows your Chrome profile if you have Chrome Sync turned on. Layouts are not stored there.']],
        ['What it does not do', [
          'It does not send any data to the developer or to any third party. It has no account, no analytics, no advertising and no remote code. It does not read the content of web pages.']],
        ['Your control', [
          'You can delete any layout from the extension, and you can export all layouts to a file you keep. Removing the extension removes its local data.',
          'An exported file contains your tab URLs and titles. Treat it like your browsing history when you share it.']],
        ['Changes', ['If this policy changes in a way that affects how your data is handled, the change will be described in the store listing and in the release notes.']],
      ],
    },
  },
  it: {
    lang: 'it', other: { code: 'en', label: 'English', path: '../' }, self: 'it/',
    title: 'Window Layout Manager: salva e ripristina i layout delle finestre',
    description: 'Salva come è disposto il tuo browser e ripristinalo con un clic. Si adatta ai tuoi schermi e ogni modifica si può annullare. Privato: tutto resta sul tuo dispositivo.',
    nav: { features: 'Funzioni', how: 'Come funziona', faq: 'Domande', privacy: 'Privacy' },
    heroTitle: 'Le tue finestre, esattamente come le avevi lasciate.',
    heroSub: 'Salva come è disposto il tuo browser e ripristinalo con un clic. Ovunque siano i tuoi schermi.',
    heroAlt: 'Il popup della barra, dove si salva un layout con un nome, accanto al pannello laterale che elenca i layout salvati con una miniatura di ciascuno.',
    cta: 'Aggiungi a Chrome', ctaSoon: 'Presto sul Chrome Web Store', ctaSecondary: 'Come funziona',
    freeNote: 'Gratuito. Nessun account. Funziona con Chrome 123 e successivi.',
    featuresTitle: 'Pensata per come lavori davvero',
    features: [
      ['Salva un layout, ripristinalo con un clic', 'Finestre, tab, tab fissati, posizioni e lo schermo su cui era ogni finestra. Applica dalla barra, dal pannello laterale o con Ctrl+Maiusc+1, 2, 3.'],
      ['Si adatta ai tuoi schermi', 'Schermo di dimensioni diverse o monitor scollegato? Le finestre mantengono la posizione in proporzione e restano sempre visibili.'],
      ['Annulla qualsiasi cosa', 'Elimina, rinomina, aggiorna, importa, perfino un layout che ha chiuso le tue finestre. Un clic e torna tutto.'],
      ['Layout pronti', 'Parti da revisione del codice, scrittura con fonti, pianificazione, presentazioni, lettura o riunioni, poi rendili tuoi.'],
      ['Sa cosa hai aperto', 'Si accorge quando le tue finestre corrispondono a un layout salvato, propone di aggiornarlo e suggerisce un nome dai siti aperti.'],
      ['Privata per progetto', 'Tutto resta sul tuo dispositivo. Nessun account, nessuna analisi, nessun tracciamento, nessun codice remoto.'],
    ],
    howTitle: 'Tre passi',
    how: [['Disponi', 'Apri finestre e tab come lavori di solito.'], ['Salva', "Clicca l'icona nella barra, dai un nome al layout, premi Salva."], ['Applica', 'Un clic, o una scorciatoia. Puoi sempre annullare.']],
    galleryTitle: 'Uno sguardo dentro',
    faqTitle: 'Domande',
    faq: [
      ['Invia i miei dati da qualche parte?', "No. I layout sono salvati nel browser, sul tuo dispositivo. L'estensione non ha account né analisi e non fa richieste di rete per conto suo. I dettagli sono nell'informativa sulla privacy."],
      ['Perché chiede il permesso «tabs»?', "Per leggere indirizzo e titolo di ogni tab e salvarli, e per aprire i tab quando ripristina un layout. Senza, l'estensione non può sapere quali pagine sono aperte. Non legge mai il contenuto di una pagina."],
      ['A cosa servono gli altri permessi?', "«windows» legge e imposta posizione, dimensione e stato delle finestre. «system.display» legge la disposizione degli schermi per mettere le finestre sullo schermo giusto. «storage» conserva preset e impostazioni. «sidePanel» mostra il gestore nel pannello laterale di Chrome."],
      ['Cosa succede alle finestre già aperte quando applico un layout?', 'Scegli una volta: sostituirle, sostituirle mantenendo le finestre con tab fissati, oppure aggiungere il layout accanto. Finché non scegli, non viene chiuso nulla, e Annulla riporta indietro ciò che fosse stato chiuso.'],
      ['Quali tab vengono salvati?', 'Le pagine web (http e https). Pagine del browser, file locali e pagine di estensioni vengono saltati, e un layout importato da file viene filtrato allo stesso modo.'],
      ['È gratuita?', 'Sì.'],
    ],
    footer: 'Window Layout Manager', privacyLink: 'Informativa sulla privacy', contact: 'Contatto',
    privacy: {
      title: 'Informativa sulla privacy', updated: 'Ultimo aggiornamento: ottobre 2026',
      intro: 'Window Layout Manager salva la disposizione delle finestre e dei tab del tuo browser per poterla ripristinare in seguito.',
      sections: [
        ["Cosa conserva l'estensione", [
          "Quando salvi un layout, conserva sul tuo dispositivo l'indirizzo web (URL) e il titolo di ogni tab delle tue finestre aperte, la posizione, la dimensione e lo stato di ogni finestra, e la dimensione e la posizione dei tuoi schermi.",
          'Conserva anche le impostazioni (come applicare un layout, adattamento allo schermo, tema) e una breve cronologia delle tue modifiche, così puoi annullarle.',
          'I tab che non sono pagine web (per esempio le pagine chrome:// e i file locali) non vengono salvati.']],
        ['Dove viene conservato', [
          "I layout e la cronologia delle modifiche stanno nella memoria locale delle estensioni del browser, solo su questo dispositivo.",
          'Le impostazioni stanno nella memoria di sincronizzazione delle estensioni di Chrome, che segue il tuo profilo se hai attivato la sincronizzazione. I layout non sono conservati lì.']],
        ['Cosa non fa', [
          "Non invia alcun dato allo sviluppatore né a terzi. Non ha account, analisi, pubblicità né codice remoto. Non legge il contenuto delle pagine web."]],
        ['Il tuo controllo', [
          "Puoi eliminare qualsiasi layout dall'estensione ed esportare tutti i layout in un file che conservi tu. Rimuovendo l'estensione si rimuovono i suoi dati locali.",
          "Un file esportato contiene URL e titoli dei tuoi tab. Trattalo come la cronologia di navigazione quando lo condividi."]],
        ['Modifiche', ["Se questa informativa cambia in modo da influire sul trattamento dei tuoi dati, la modifica sarà descritta nella scheda dello store e nelle note di rilascio."]],
      ],
    },
  },
};

const CSS = `
:root{color-scheme:light dark;--accent:light-dark(#4f46e5,#a5b4fc);--accent-strong:light-dark(#4338ca,#c7d2fe);--on-accent:light-dark(#fff,#0e1020);--bg:light-dark(#f6f6fb,#0e1020);--surface:light-dark(#fff,#171a30);--border:light-dark(#dcdff0,#2c3158);--text:light-dark(#14142b,#e9ebf7);--muted:light-dark(#585d7a,#a3a9cc);--soft:light-dark(#e0e7ff,#2a2e63);--font:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:var(--font);color:var(--text);background:var(--bg);line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--accent-strong)}a:focus-visible,.btn:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:8px}
.wrap{max-width:1040px;margin:0 auto;padding:0 24px}
header.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
header.top .wrap{display:flex;align-items:center;gap:20px;min-height:60px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--text);text-decoration:none}.brand img{width:30px;height:30px;border-radius:8px}
nav.links{display:flex;gap:18px;margin-left:auto;font-size:15px}nav.links a{color:var(--muted);text-decoration:none}nav.links a:hover{color:var(--text)}
.lang{font-size:14px;border:1px solid var(--border);padding:4px 10px;border-radius:999px;text-decoration:none;color:var(--text)}
.hero{margin:32px 0 0;border-radius:28px;color:#fff;background:radial-gradient(120% 140% at 12% 0%,#6366f1 0%,#4338ca 52%,#2e2a8a 100%);box-shadow:0 24px 60px rgba(55,48,163,.35);overflow:hidden}
.hero .wrap{padding:64px 40px 0;text-align:center}.hero h1{font-size:clamp(32px,6vw,58px);line-height:1.06;letter-spacing:-.03em;margin:0 auto;max-width:760px;text-wrap:balance}
.hero p.sub{font-size:clamp(17px,2.4vw,21px);color:#e0e7ff;max-width:600px;margin:18px auto 0;text-wrap:balance}
.cta{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:30px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 24px;border-radius:14px;font-weight:650;font-size:16px;text-decoration:none;border:1px solid transparent}
.btn.primary{background:#fff;color:#2e2a8a}.btn.primary:hover{background:#eef0ff}.btn.ghost{color:#fff;border-color:rgba(255,255,255,.45)}.btn.ghost:hover{background:rgba(255,255,255,.12)}
.btn.disabled{background:rgba(255,255,255,.18);color:#fff;cursor:default;border-color:rgba(255,255,255,.25)}
.note{margin-top:14px;font-size:14px;color:#c7d2fe}
.hero img.shot{display:block;width:min(100%,900px);height:auto;margin:20px auto 0}
section{padding:72px 0 0}h2{font-size:clamp(26px,4vw,36px);letter-spacing:-.02em;line-height:1.15;margin:0 0 28px;text-align:center;text-wrap:balance}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:22px}.card h3{margin:0 0 6px;font-size:18px}.card p{margin:0;color:var(--muted)}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;counter-reset:s}.step{display:flex;gap:14px;align-items:flex-start}
.step .n{flex:none;width:34px;height:34px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;font-weight:700}.step h3{margin:0;font-size:18px}.step p{margin:2px 0 0;color:var(--muted)}
.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:16px}.gallery img{width:100%;height:auto;display:block;border-radius:16px;border:1px solid var(--border)}
details{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 20px;margin-bottom:10px}summary{cursor:pointer;font-weight:650;font-size:17px}details p{margin:10px 0 0;color:var(--muted)}
footer{margin-top:80px;border-top:1px solid var(--border);padding:28px 0 48px;color:var(--muted);font-size:14px}footer .wrap{display:flex;flex-wrap:wrap;gap:16px;align-items:center}footer a{color:var(--muted)}
.doc{max-width:720px;margin:48px auto 0;padding:0 24px}.doc h1{font-size:clamp(30px,5vw,42px);letter-spacing:-.02em;margin:0 0 6px}.doc h2{text-align:left;font-size:22px;margin:36px 0 10px}.doc p{margin:0 0 12px;color:var(--muted)}.doc .updated{font-size:14px}
@media (max-width:640px){nav.links a:not(:last-child){display:none}.hero .wrap{padding:44px 20px 0}.cta .btn{width:100%}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

const IMAGES = ['screenshot-1.jpg', 'screenshot-2.jpg', 'screenshot-3.jpg', 'screenshot-4.jpg', 'screenshot-5.jpg'];

function head(c, title, description, rel) {
  return `<!doctype html>
<html lang="${c.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="${rel}img/icon.png">
<link rel="stylesheet" href="${rel}style.css">
</head>`;
}

function header(c, rel, pagePath) {
  // Page links stay in the same language folder; only images and the stylesheet use `rel`.
  const home = pagePath === 'index.html' ? '' : 'index.html';
  const switchTo = c.other.code === 'it' ? `it/${pagePath}` : `../${pagePath}`;
  return `<header class="top"><div class="wrap">
<a class="brand" href="index.html"><img src="${rel}img/icon.png" alt="" width="30" height="30"><span>Window Layout Manager</span></a>
<nav class="links" aria-label="Main"><a href="${home}#features">${esc(c.nav.features)}</a><a href="${home}#how">${esc(c.nav.how)}</a><a href="${home}#faq">${esc(c.nav.faq)}</a><a href="privacy.html">${esc(c.nav.privacy)}</a></nav>
<a class="lang" href="${switchTo}" hreflang="${c.other.code}" lang="${c.other.code}">${esc(c.other.label)}</a>
</div></header>`;
}

function footer(c, rel) {
  const contact = CONTACT_EMAIL ? `<a href="mailto:${esc(CONTACT_EMAIL)}">${esc(c.contact)}: ${esc(CONTACT_EMAIL)}</a>` : '';
  return `<footer><div class="wrap"><span>${esc(c.footer)}</span><a href="privacy.html">${esc(c.privacyLink)}</a>${contact}</div></footer>`;
}

function landing(c, rel) {
  const cta = STORE_URL
    ? `<a class="btn primary" href="${esc(STORE_URL)}">${esc(c.cta)}</a>`
    : `<span class="btn disabled" role="note">${esc(c.ctaSoon)}</span>`;
  const features = c.features.map(([t, d]) => `<div class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('\n');
  const steps = c.how.map(([t, d], i) => `<div class="step"><span class="n" aria-hidden="true">${i + 1}</span><div><h3>${esc(t)}</h3><p>${esc(d)}</p></div></div>`).join('\n');
  const faq = c.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n');
  const gallery = IMAGES.slice(1).map((f, i) => `<img src="${rel}img/${c.lang}/${f}" alt="${esc(c.features[[1, 1, 2, 5][i]][0])}" loading="lazy" width="1280" height="800">`).join('\n');
  return `${head(c, c.title, c.description, rel)}
<body>
${header(c, rel, 'index.html')}
<main>
<div class="wrap"><div class="hero"><div class="wrap">
<h1>${esc(c.heroTitle)}</h1><p class="sub">${esc(c.heroSub)}</p>
<div class="cta">${cta}<a class="btn ghost" href="#how">${esc(c.ctaSecondary)}</a></div>
<p class="note">${esc(c.freeNote)}</p>
<img class="shot" src="${rel}img/${c.lang}/hero.png" alt="${esc(c.heroAlt)}">
</div></div></div>
<div class="wrap"><section id="features"><h2>${esc(c.featuresTitle)}</h2><div class="grid">
${features}
</div></section>
<section id="how"><h2>${esc(c.howTitle)}</h2><div class="steps">
${steps}
</div></section>
<section><h2>${esc(c.galleryTitle)}</h2><div class="gallery">
${gallery}
</div></section>
<section id="faq"><h2>${esc(c.faqTitle)}</h2>
${faq}
</section></div>
</main>
${footer(c, rel)}
</body></html>
`;
}

function privacy(c, rel) {
  const p = c.privacy;
  const body = p.sections.map(([h, paras]) => `<h2>${esc(h)}</h2>\n${paras.map(t => `<p>${esc(t)}</p>`).join('\n')}`).join('\n');
  const contact = CONTACT_EMAIL ? `<h2>${esc(c.contact)}</h2>\n<p><a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a></p>` : '';
  return `${head(c, `${p.title} · Window Layout Manager`, p.intro, rel)}
<body>
${header(c, rel, 'privacy.html')}
<main class="doc"><h1>${esc(p.title)}</h1><p class="updated">${esc(p.updated)}</p>
<p>${esc(p.intro)}</p>
${body}
${contact}
</main>
${footer(c, rel)}
</body></html>
`;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log('wrote', path.relative(root, file));
}

fs.rmSync(OUT, { recursive: true, force: true });
write(path.join(OUT, 'style.css'), CSS.trim() + '\n');
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
fs.copyFileSync(path.join(root, 'icons', 'icon128.png'), path.join(OUT, 'img', 'icon.png'));
for (const lang of ['en', 'it']) {
  fs.mkdirSync(path.join(OUT, 'img', lang), { recursive: true });
  for (const f of [...IMAGES, 'hero.png']) fs.copyFileSync(path.join(root, 'store', lang, f), path.join(OUT, 'img', lang, f));
}
write(path.join(OUT, 'index.html'), landing(COPY.en, ''));
write(path.join(OUT, 'privacy.html'), privacy(COPY.en, ''));
write(path.join(OUT, 'it', 'index.html'), landing(COPY.it, '../'));
write(path.join(OUT, 'it', 'privacy.html'), privacy(COPY.it, '../'));
