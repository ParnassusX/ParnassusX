# È pronta? Verdetto onesto (24 ottobre 2026)

**In una riga.** È un prodotto solido e ben testato per una **beta gratuita**. Non è ancora pubblicabile senza un giorno di lavoro su una checklist, e **non è ancora vendibile**: non esiste nulla da vendere.

Legenda: **[MISURATO]** provato con Chromium reale o con numeri; **[LETTURA]** dal codice o dalla struttura del repo; **[FONTE]** da una ricerca web, con i limiti dichiarati; **[NON SO]** non verificato.

## Il quadro

| Domanda | Verdetto | Perché |
|---|---|---|
| Interessante? | **Sì, ma di nicchia** | Risolve un problema vero per chi cambia contesto o usa più monitor. Non è un "must have" per la maggior parte degli utenti. |
| UI moderna, ottobre 2026? | **Pulita e accessibile, non memorabile** | Coerente, tema chiaro e scuro, contrasti a norma. Ma ha l'aspetto generico di una utility SaaS del 2023–24. |
| Funzionale? | **Sì, nei limiti di cosa è stato provato** | 45 test unitari, 25 e 34 controlli in Chromium. Mai provata su Chrome vero, Windows, macOS o più monitor. |
| User-friendly? | **Migliorata molto, mancano le basi** | Annulla ovunque, errori chiari. Mancano onboarding e traduzioni. |
| Smart? | **No, è pratica** | Scala sui monitor e ordina per uso. Nessun suggerimento, nessun rilevamento del contesto. |
| Scalabile? | **Sì fino a centinaia di preset, dopo una correzione di oggi** | Vedi sotto: ho trovato e chiuso un difetto che bloccava tutto. |
| Vendibile? | **No** | Nessuna funzione a pagamento, nessuna licenza, concorrenti gratuiti. |
| Pronta? | **Per una beta gratuita, quasi** | Mancano asset dello store, informativa privacy pubblica, prove su Chrome reale. |

## 1. Interessante

**Cosa la distingue.** Salva e ripristina la **geometria delle finestre** (posizione, dimensione, schermo) oltre ai tab, la adatta quando cambiano gli schermi, annulla le azioni distruttive e parte da layout pronti. [LETTURA] Non ho trovato fonti che dicano che i gruppi di tab di Chrome salvino la posizione delle finestre. [NON SO] se lo facciano.

**Cosa c'è già gratis.**
- Chrome ha i gruppi di tab salvati. Un blog di un concorrente scrive che sono stabili dalla versione 149 e che c'è un tetto di circa 25 gruppi; il tetto non è confermato da una fonte indipendente. [FONTE: [Supercharge](https://www.superchargebrowser.com/library/chrome-tab-groups-25-limit-workaround.md)]
- Edge ha Workspaces, rifatto nel 2026 con sincronizzazione tramite Edge Sync e senza condivisione. [FONTE: [Chromestory](https://chromestory.com/2026/06/edge-workspaces-v2-what-changed/), [Microsoft Message Center](https://mc.merill.net/message/MC1192661)]
- Il Web Store è pieno di estensioni "workspace" per i tab. [FONTE: [Orbit Workspace](https://chromewebstore.google.com/detail/fppmdkfmppjkjngfdedpldgjmpahhija), [PageSets](https://chromewebstore.google.com/detail/inmidfdnkfljfmnokogogpjnbfpelddf)]

**Conclusione.** Il valore reale è nella geometria e nei monitor. Chi non ha più schermi o più finestre vede poco più di ciò che il browser già offre.

## 2. UI moderna (ottobre 2026)

**Cosa è fatto bene** [MISURATO]: token di colore coerenti, tema chiaro, scuro e di sistema, contrasti sopra soglia WCAG (calcolati), focus visibile, navigazione da tastiera nei tab e nei menu, dialoghi con errore inline, riduzione del movimento rispettata.

**Cosa non lo è** [LETTURA, schermate]:
- Le miniature dei preset sono rettangoli blu quasi identici: a colpo d'occhio non si distingue "Code review" da "Reading session". Mancano favicon, iniziali o colori per sito.
- Nessun elemento di identità: blu SaaS standard, icona di tre rettangoli.
- Nessuna transizione tra stati (apertura menu, comparsa banner, cambio scheda).
- Nessun onboarding: al primo avvio c'è solo uno stato vuoto con una frase.
- Popup e side panel mostrano le stesse cose in due formati; il popup non si distingue abbastanza dal pannello.
- Nessuna palette comandi né azione rapida da tastiera dentro l'interfaccia.

## 3. Funzionale

**Provato** [MISURATO]: salva, ripristina, pin del primo tab, annulla l'applicazione, versioni, rinomina, duplica, elimina, importa, libreria, ricerca, scorciatoie, paginazione, scritture concorrenti (8 su 8), URL non web rifiutati.

**Non provato** [NON SO]:
- Chrome di marca (i test usano Chromium 141 su Linux con schermo virtuale).
- Windows e macOS: posizionamento, finestre massimizzate, barre del sistema.
- Più monitor reali: la scalatura è coperta solo da test unitari.
- La side panel aperta davvero (richiede un gesto utente) e le scorciatoie reali.
- Che cosa succede ripristinando 30–40 tab: si aprono **tutti contemporaneamente**, senza metterli "in attesa". [LETTURA] Può pesare su un portatile; non è misurato.

**Limiti noti di ciò che salva**: solo pagine web (http/https); non salva gruppi di tab, finestre in incognito, posizione di scorrimento, contenuto di moduli.

## 4. User-friendly

**Meglio di prima**: errori chiari e dentro il dialogo, annullamento per ogni modifica, banner che dicono cosa è successo, tutti i preset nel popup.

**Ancora ruvido** [LETTURA]:
- Solo inglese. Il codice ha circa 60 stringhe visibili fisse, senza `_locales`.
- Il termine "preset" e il verbo "Capture" non spiegano da soli cosa succede.
- Il default "chiudi le altre finestre" resta rischioso, mitigato dall'annulla.
- Nessuna spiegazione, alla prima apertura, di cosa fanno i permessi che Chrome mostra all'installazione.

## 5. Smart

Quello che chiamo "intelligente" oggi è deterministico: scalatura proporzionale, ordine per uso recente, scorciatoie assegnabili. Non c'è alcun suggerimento, nessuna previsione e nessun rilevamento del contesto. I documenti sull'AI in `docs/strategy/` descrivono funzioni che **non esistono**. Se "smart" deve essere un argomento di vendita, oggi non lo è.

## 6. Scalabile

**Misure** [MISURATO]:

| Preset (4 finestre, 12 tab) | Caricamento side panel prima | Dopo la paginazione |
|---|---|---|
| 20 | 128 ms | 177 ms (misura separata, stessa scala) |
| 100 | 508 ms | 345 ms |
| 300 | 2076 ms, 105.000 nodi DOM | 581 ms, 17.700 nodi |

**Difetto trovato oggi** [MISURATO]: il registro di annullamento salvava 10 copie dell'intera libreria. Con 300 preset (circa 3 MB) dopo **due modifiche** lo storage era al limite e ogni successiva modifica falliva, anche l'eliminazione, con l'errore grezzo `kQuotaBytes quota exceeded`. L'utente non poteva liberare spazio.

**Corretto**: il registro ha un tetto in byte e si svuota se lo snapshot non entra, e un errore di spazio non blocca più la modifica. Nello stesso scenario ora le 12 modifiche riescono e lo storage resta a 5,84 MB. Coperto da test unitari e da un controllo end-to-end.

**Limiti di architettura che restano** [LETTURA]:
- Ogni modifica riscrive l'intera libreria in un'unica chiave (con 3 MB, 3 MB a ogni modifica).
- Nessuna sincronizzazione: `storage.sync` ha un tetto troppo basso per i preset, quindi un sync reale richiede un server.
- Nessuna build, nessun linter, nessuna CI, nessun tipo: con circa 2.400 righe va bene, con un tier a pagamento no.

## 7. Vendibile

- **Non c'è nulla da vendere** [LETTURA]: nessun codice di licenza, nessuna funzione "Pro", nessun controllo di abbonamento. Il sync, che il piano indica come unico motivo di pagamento, non esiste e richiede un backend.
- **Disponibilità a pagare** [NON SO]: non ho dati. Con concorrenti gratuiti e funzioni native nel browser, il piano di monetizzazione stima poche centinaia di dollari l'anno nei primi 12 mesi, e le ipotesi di conversione non sono misurate.
- **Regole dello store** [FONTE]: dal 1° agosto 2026 i dati raccolti devono essere strettamente necessari allo scopo dichiarato e dichiarati in modo evidente. L'estensione non invia nulla fuori dal dispositivo, il che è un vantaggio, ma salva URL e titoli e va dichiarato. [[Chrome for Developers](https://developer.chrome.com/blog/cws-policy-updates-2026)]
- **Tempi di revisione** [NON SO]: un resoconto aneddotico parla di diversi giorni; non ho trovato cifre ufficiali. Il permesso `tabs` può allungarli.

## 8. Checklist prima di pubblicare (beta gratuita)

Fatto oggi: `minimum_chrome_version` 116 nel manifest, bozza dell'informativa (`docs/PRIVACY.md`), testo dello store e giustificazione dei permessi (`docs/STORE-LISTING.md`).

Da fare, nell'ordine:
1. **Provare su Chrome di marca**, su Windows e su macOS, con almeno un secondo monitor.
2. **Screenshot dello store** (1280x800) e riquadro promozionale: non esistono.
3. **Pubblicare l'informativa** a un URL pubblico e mettere un contatto.
4. **Scegliere la licenza**: manca `LICENSE`. Scelta tua.
5. **Onboarding minimo** al primo avvio.
6. **Miniature distinguibili** (favicon o iniziali).
7. **Decidere** il comportamento predefinito alla chiusura delle finestre.

## 9. La mia raccomandazione

1. Pubblica come **beta gratuita** dopo i punti 1–4. Costa $5 una tantum e i soldi in gioco sono nulli.
2. **Misura prima di costruire il sync**: installazioni, recensioni, e quanti utenti hanno più di 10 preset o più monitor. Sono i segnali che dicono se c'è spazio per un Pro.
3. **Non vendere ancora.** Costruire licenze e backend prima di sapere se qualcuno li vuole è il modo più costoso di scoprire che la risposta è no.

---

## Aggiornamento: dopo il giro "memorabile e pubblicabile" (24 ottobre 2026)

Ho chiuso tutto quello che si poteva chiudere senza una scelta tua. Le cifre sono misurate (**[MISURATO]**), il resto è dichiarato.

**Memorabile**
- **Identità**: icona nuova, palette indaco e ambra, movimento discreto (disattivato con `prefers-reduced-motion`), illustrazione per gli stati vuoti. Tutte le 40 coppie di colori per testo e controlli superano le soglie WCAG in chiaro e in scuro. [MISURATO]
- **Miniature distinguibili**: ogni finestra ha il colore e l'iniziale del sito. Prima erano rettangoli blu quasi identici.
- **Onboarding**: pagina di benvenuto alla prima installazione, con una sola scelta.
- **Più "smart"**: riconosce a quale preset somigliano le finestre aperte, dice cosa è cambiato e propone di aggiornarlo; suggerisce un nome dai siti aperti. Test unitari e controlli in Chromium. [MISURATO]

**Più sicura e più leggera**
- Finché l'utente non sceglie come applicare i layout, non viene mai chiuso nulla (prima il default chiudeva le altre finestre). [MISURATO]
- I layout con più di 10 tab caricano solo il tab in primo piano di ogni finestra: 13 tab su 14 restano scaricati. [MISURATO]
- L'icona della barra apre il popup in modo deterministico; la side panel serve a gestire.

**Pubblicabile**
- **Italiano e inglese**: 202 stringhe, controllate da un test che fallisce se ne manca una o se un segnaposto non coincide; un test in Chromium con lingua italiana verifica che non resti inglese traducibile a schermo. [MISURATO]
- **Asset dello store**: cinque screenshot 1280x800, riquadro 440x280 e marquee 1400x560, in due lingue, generati dall'interfaccia vera. [MISURATO: dimensioni controllate da test]
- **Sito**: pagina di presentazione e informativa privacy in due lingue, senza script né richieste esterne, senza overflow a 390 px. [MISURATO]
- Manifest: nome e descrizione localizzati, `minimum_chrome_version` 123.

**Test**: 66 unitari, 30 + 44 + 19 controlli in Chromium (messaggi, interfaccia cliccata, italiano).

### Cosa resta, e non posso chiuderlo io

1. **Provarla su Chrome di marca**, su Windows e su macOS, con un secondo monitor. Tutto è stato provato solo su Chromium sotto Linux con uno schermo virtuale.
2. **La licenza**: manca `LICENSE`. Scelta tua.
3. **Contatto e URL dello store**: servono per la privacy e il pulsante del sito (`CONTACT_EMAIL`, `STORE_URL` in `tools/build-site.js`).
4. **Pubblicare il sito** (per esempio con GitHub Pages) per avere l'URL dell'informativa.
5. **Il nome.** "Window Layout Manager" è descrittivo ma generico: si trova male nelle ricerche e non si ricorda. Cambiarlo è una decisione di marchio.
6. **Il default di applicazione** dopo la scelta iniziale: ora propone "Sostituisci le mie finestre" già selezionato.
7. **La disponibilità a pagare** resta non misurata: nessuna funzione a pagamento esiste ancora.
