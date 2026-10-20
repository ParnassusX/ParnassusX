# ROAST: Window Layout Manager (stato al commit 1b8ee3e)

Revisione onesta del codice e della documentazione. Ogni punto è marcato come:

- **[VERIFICATO]** riprodotto con Chromium reale (Playwright + Xvfb, estensione caricata con `--load-extension`, un solo display).
- **[LETTURA]** rilevato leggendo il codice, non riprodotto in browser.
- **[DA VERIFICARE]** plausibile, ma non provato.

## Cosa funziona davvero

- **[VERIFICATO]** Il manifest è valido per Chrome e il service worker si avvia senza errori.
- **[VERIFICATO]** Cattura layout (finestre, posizione, tab, URL, pin) → salvataggio in `chrome.storage.local` → applicazione: le finestre vengono ricreate con gli URL giusti. Nessun errore nella pagina popup.
- **[VERIFICATO]** Il flag `pinned` viene catturato correttamente.

## Bug confermati

1. **[VERIFICATO] Scritture concorrenti perdono dati.** `savePreset`, `updatePreset`, `importPresets` e `deletePreset` fanno read-modify-write su una singola chiave `presets` senza serializzazione. Otto `savePreset` inviati in parallelo: **1 solo preset persistito su 8** (`scratchpad/e2e/race.js`). Ogni salvataggio concorrente cancella gli altri.
2. **[VERIFICATO] Import accetta URL non web.** `importPresets` controlla solo che `windows` e `displays` siano array. Un JSON con `file:///etc/hostname` viene importato e, all'applicazione, Chrome apre quella tab. Chi condivide un file di preset può far aprire file locali o schemi arbitrari sul PC di chi lo importa. Anche `applyPreset` non filtra gli URL salvati prima.
3. **[VERIFICATO] Il tab pinnato è perso al ripristino.** Il primo tab viene creato con `windows.create({url})`, che non accetta `pinned`. Il codice fa il loop di `tabs.create` solo da `i = 1`, quindi `pinned` del primo tab è ignorato. Nel test il primo tab risulta `pinned: false` dopo l'applicazione.
4. **[VERIFICATO] Salvare con un nome esistente sovrascrive in silenzio.** `savePreset` e `updatePreset` sono identici e `savePreset` non controlla l'esistenza. L'utente riceve "Preset saved." e perde il preset precedente.
5. **[LETTURA] Controllo truthy sulle coordinate.** In `getDisplayForWindow` la condizione `!safeGet(window, 'left')` tratta `left: 0` (o `top: 0`) come dato invalido e cade sul display primario. Su una configurazione con secondo monitor posizionato a sinistra del primario, la finestra viene assegnata al display sbagliato. Non riprodotto (un solo display in Xvfb); il test unitario nella revamp copre il caso.
6. **[LETTURA] Scorciatoia che chiude tutto.** Il default `presetBehavior` è `close_all`. Premere `Ctrl+Shift+1` chiude tutte le finestre normali senza conferma. È il comportamento più pericoloso del prodotto e il default è quello peggiore.
7. **[LETTURA] Icona non valida.** `icon.png` è un file SVG (16x16, rettangolo verde) con estensione `.png`. Chrome si aspetta un PNG nei campi `default_icon`; è molto probabile che l'icona non venga mostrata. [DA VERIFICARE in browser]
8. **[LETTURA] Dead code / campi sporchi.**
   - Il ramo `appLaunchId` in `applyPreset` non viene mai scritto dalla cattura: la cattura copia solo i campi di `chrome.windows.getAll`, e non c'è nessun `appLaunchId` nel salvataggio.
   - La cattura salva l'`id` (ID finestra della sessione, inutile su un'altra sessione) e `alwaysOnTop` viene tolto ma non c'è motivo per il resto dei campi.
9. **[LETTURA] Log con URL.** `captureCurrentWindowLayout` e `applyPreset` fanno `console.log` dell'intero layout, URL inclusi.
10. **[LETTURA] Ultimo layout catturato in memoria del popup.** `capturedLayout` vive nella variabile del popup: se il popup si chiude (clic fuori) la cattura va persa senza avviso.
11. **[LETTURA] Gestione errori di `popup.js`.** `handleResponse` ha un `if (successCallback !== displayStatus) return;` che fa uscire silenziosamente in un ramo di errore. Il flusso è difficile da seguire e più volte un errore non compare.

## Permessi

Permessi dichiarati: `windows`, `tabs`, `storage`, `system.display`, `sidePanel`.

- `windows`, `storage`, `sidePanel`: necessari per le funzioni principali.
- `tabs`: necessario per leggere gli URL delle tab (senza, `tab.url` è vuoto). Causa l'avviso "leggere la cronologia di navigazione" in review.
- `system.display`: necessario per il ripristino multi-schermo. È la parte più difficile da giustificare, perché il multi-schermo **non è stato testato** (un display solo) e nel codice è best effort.

Conclusione: sotto le funzioni attuali non si può togliere nessun permesso senza togliere una funzione. La riduzione reale è togliere `system.display` **insieme** al multi-schermo, decisione di prodotto da prendere.

## Manifest e identità

- `name` è ancora "Chrome Extension Starter", `description` è quella del template, `version` è `1.0`. In review e nello store questo è un segnale di abbandono.
- Il repo si chiama `ParnassusX/ParnassusX`, che GitHub mostra come profilo: non rinominabile da questa sessione. [da fare dall'utente]

## Codice duplicato

- `options.html`/`options.js` duplicano quasi interamente le impostazioni e l'import/export già presenti nella side panel. Due UI da mantenere per le stesse cose.
- `savePreset` e `updatePreset` sono copie quasi identiche.
- Stile `options.js` e `sidepanel.js` duplicati su `handleResponse`, status, import.

## Documentazione di strategia

- Circa **5.900 parole** in 7 documenti di concept (`PREMIUM_INFRASTRUCTURE_RESEARCH.md`, `PRODUCT_REQUIREMENTS_DOCUMENT_OUTLINE.md`, `AI_PRESET_SUGGESTIONS_CONCEPT.md`, `VISUAL_PRESET_PREVIEW_CONCEPT.md`, `MODERN_EXTENSION_FEATURES_2025.md`, `ONBOARDING_DESIGN.md`, `README.md` escluso). Nessuno validato con utenti reali.
- Il PRD dichiara come obiettivo "il leading Chrome extension" e come metrica "high user satisfaction/ratings". Sono aspirazioni, non misure: nessun dato di utenti esiste.
- `AI_PRESET_SUGGESTIONS_CONCEPT.md` descrive raccolta di analytics d'uso (opt-in) per un prodotto che non ha alcun analytics né un utente attivo misurato. È design per una feature che non esiste.
- `MODERN_EXTENSION_FEATURES_2025.md` elenca API Chrome come "novità". Non ho verificato le date e lo stato di queste API; è materiale da controllare prima di citarlo.
- Il repo contiene più piani che codice funzionante. Il codice vero sono circa 60 KB.

## Marketing non verificato nel README

- "Multi-Screen Awareness... The extension attempts to restore windows to their correct screens": formulato come best effort, ma sembra una garanzia. Non testato su più schermi.
- "Smart Close" e "Merge" sono etichettati come esperimenti; "Merge" è in pratica "non chiude le finestre", non un merge vero.

## Test

Nessun test automatico nel repo prima della revamp.

---

## Stato dopo la revamp

| Punto | Esito |
|---|---|
| 1. Scritture concorrenti | Corretto: coda di scrittura in `background.js`. Test e2e: 8/8 salvataggi paralleli persistiti (prima 1/8). |
| 2. Import/apply di URL non web | Corretto: `lib/layout.js` tiene solo `http:`/`https:`, applicato a import, save e apply. Test e2e: nessun tab `file://` aperto (prima sì). |
| 3. Pin del primo tab | Corretto: il primo tab viene pinnato dopo la creazione della finestra. Test e2e. |
| 4. Overwrite silenzioso | Corretto: `addPreset` rifiuta il nome esistente; `updatePreset` richiede che esista. Test e2e e unitari. |
| 5. Coordinate a 0 | Corretto: controllo numerico. Test unitario che sul vecchio codice restituisce il display sbagliato (1 invece di 4). |
| 6. `close_all` come default | **Non cambiato.** È una scelta di prodotto. Ora la side panel avverte che la scorciatoia chiude le altre finestre. |
| 7. Icona SVG | Corretto: sostituita con PNG 16/48/128. Le icone sono segnaposto, da disegnare. |
| 8. Dead code | Rimossi `appLaunchId`, `id`, `alwaysOnTop`, `options.html/js` (duplicati della side panel). |
| 9. Log con URL | Rimossi. |
| 10. Cattura in memoria del popup | **Non corretto.** Richiederebbe salvare la cattura in storage. |
| 11. `handleResponse` del popup | **Non corretto** nella logica interna. Il contratto di risposta è stato normalizzato (`status` sempre presente), che elimina il ramo "Unexpected response structure" per gli errori. |
| Manifest | Nome, descrizione, versione 0.2.0. |
| Permessi | Invariati: `tabs` serve per gli URL, `system.display` per il multi-schermo. Togliere `system.display` è una scelta di prodotto. |
| Strategia | Spostata in `docs/strategy/`, con PRD senza "leading" e senza metriche inventate. Resta da validare. |
| Test | 17 unitari (`npm test`) e 12 e2e in Chromium (`npm run test:e2e`). |

---

## Round 2: presets, UI, storage, adaptation

Done and verified (22 end-to-end checks in Chromium, 33 unit tests):

- **Library of real-use layouts** (`library/presets.json`): six examples, drawn for a reference screen and scaled to the screen they are applied on. Tests check they fit on a laptop, a 1080p screen and a portrait screen.
- **Screen adaptation.** Windows scale proportionally when the screen size changes (unit tests). A banner appears when saved screens differ from the current ones, and the list refreshes when a screen is plugged in or removed. A real bug was found and fixed while doing this: rounding each edge separately could push a window 1 px past the screen.
- **Undo** for the one destructive action: closing windows on apply. Checked end to end.
- **Version history** per preset (up to three), with a reversible restore. Checked end to end.
- **Rename, duplicate, search, delete with confirmation** (replaces `confirm()`).
- **Storage**: schema upgrade on read for the first version's data; all writes serialized; settings in `storage.sync`.
- **UI**: redesigned popup and side panel, light and dark themes, thumbnails, tab list per preset, keyboard-accessible tabs and menus, icons in inline SVG, SVG app icon.
- **Icons**: `icons/icon.svg` is the source; PNG sizes are generated by `tools/render-icons.js`. The old file that was an SVG named `.png` is gone.

Not done, and said so plainly:

- **Automatic saves and tab groups** from the open source projects. See `docs/INSPIRATION.md`.
- **Visual check on a real multi-monitor setup.** Screenshots were taken on one virtual display. Scaling between screens is covered by unit tests only.
- **Chrome Web Store review.** Nothing was submitted. The `tabs` and `system.display` permissions are still needed; the store listing will still show them.
- **The popup's captured layout is no longer kept in memory**, so the earlier issue is gone, but the popup still closes on outside click by design.
