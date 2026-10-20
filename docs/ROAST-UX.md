# ROAST UX (round 3): UI, flussi e funzioni

Obiettivo di questo giro: trovare quello che il primo roast e la revisione precedente non hanno visto, cioè i flussi che si fanno con i pulsanti. Nei round precedenti i test e2e chiamavano i messaggi del background direttamente e non cliccavano l'interfaccia. Quel buco ha nascosto un bug grave.

Legenda: **[PROVATO]** riprodotto con Chromium reale o misurato; **[LETTURA]** dal codice; **[DECISO]** deciso di correggere in questo giro.

## 1. Bug funzionali

1. **[PROVATO] Eliminare un preset non funziona.** Il dialogo di conferma senza campi fa `querySelector('.btn-primary').focus()`. Nel dialogo di eliminazione quel pulsante non esiste (c'è `.btn-danger`), quindi `null.focus()` lancia un'eccezione dentro l'executor della Promise. La Promise viene rifiutata, il clic su "Elimina" non ha effetto, e il preset resta. Lo stato in storage era ancora `Alpha, Bravo, ... Hotel` (8 su 8) dopo il clic. **[DECISO]** corretto; test e2e che clicca il pulsante.
2. **[PROVATO] Il dialogo di Capture si chiude quando il nome esiste già.** L'errore arriva come toast, ma il testo digitato va perso e l'utente deve ricominciare. **[DECISO]** il dialogo resta aperto con l'errore inline.
3. **[PROVATO] Il menu "⋯" non si chiude con Esc.** Si chiude solo con un clic fuori. **[DECISO]**.
4. **[LETTURA] La cattura di un nuovo preset con un nome già usato rifiuta, ma non propone alternative.** **[DECISO]** il dialogo suggerisce "Nome 2".
5. **[LETTURA] "Applica" con "chiudi le altre finestre" chiude anche la finestra da cui è stata lanciata la side panel**, e con essa la side panel. Non l'ho potuto riprodurre in Xvfb (la side panel non si apre senza gesto utente), ma il meccanismo è chiaro: la panel vive nella sua finestra. **[DECISO]** la finestra da cui parte l'azione resta aperta; il testo delle impostazioni lo dice.
6. **[LETTURA] Undo dell'applicazione a un solo livello.** `lastSession` viene sovrascritto a ogni applicazione. Dopo due applicazioni si può annullare solo la seconda. **[DECISO]** annullamento generale, vedi punto 9.
7. **[LETTURA] Importazione sovrascrive i preset con lo stesso nome senza avviso e senza modo di tornare indietro.** **[DECISO]** annullabile.

## 2. Flussi e UX

8. **[PROVATO] Il popup mostra solo 3 preset su 8.** Non c'è modo di vedere o raggiungere gli altri dal popup, e il messaggio non lo dice. **[DECISO]** lista scorrevole di tutti i preset, con ricerca.
9. **[PROVATO] Il toast copre il contenuto in basso.** Resta 6 secondi per gli errori, e copre la sezione "Scorciatoie" nelle impostazioni. **[DECISO]** toast in alto, più brevi, con pulsante Annulla quando serve.
10. **[PROVATO] Le impostazioni mostrano "Impostazione salvata" a ogni clic.** Rumore: lo stato è già visibile. **[DECISO]** niente toast per le impostazioni.
11. **[LETTURA] Due modi diversi per lo stesso salvataggio.** Il popup salva con un campo inline, la side panel con un dialogo. **[DECISO]** il dialogo resta per la side panel (serve il nome in più), il popup resta inline: l'azione è la stessa, ma il percorso è coerente nel risultato.
12. **[PROVATO] Il popup dice "1 window · 1 tab · 1 screen" e va a capo male.** Riassunto troppo lungo per la card stretta. **[DECISO]** riassunto compatto ("1 finestra · 1 tab") nel popup.
13. **[LETTURA] Ordine dei preset solo alfabetico.** Quello che si usa di più finisce in fondo se il nome è in fondo all'alfabeto. **[DECISO]** ordine per uso recente, poi alfabetico.
14. **[LETTURA] Le scorciatoie Ctrl+Shift+1/2/3 applicano i primi tre preset alfabetici, e l'interfaccia non lo mostra sulle card.** L'utente non sa quale preset è su quale tasto e non può cambiarlo. **[DECISO]** assegnazione dei tasti 1–3 da menu, con badge sulla card.
15. **[LETTURA] La ricerca guarda solo il nome.** Con "/x" non trova nulla anche se un tab ha quell'URL. **[PROVATO]** (ricerca "/x" → 0 card). **[DECISO]** la ricerca guarda anche titoli e URL dei tab.
16. **[LETTURA] Non si può togliere un tab da un preset senza ricatturare tutto.** Serve per ripulire una cattura. **[DECISO]** pulsante "rimuovi" nella lista dei tab, annullabile.
17. **[LETTURA] Il pulsante "Esporta" scrive sempre `window-presets.json`.** Il secondo download sovrascrive o crea `(1)` senza data. **[DECISO]** nome con la data.
18. **[LETTURA] Il pulsante della Libreria "Aggiungi" non dà nessun riscontro sul posto.** Il toast c'è, ma il nuovo preset non si vede senza cambiare scheda. **[DECISO]** dopo l'aggiunta il toast ha il pulsante "Vedi".

## 3. Reversibilità (richiesta esplicita)

19. **[DECISO] Azioni annullabili:** elimina, aggiorna, ripristina versione, rinomina, duplica, rimuovi tab, importa, aggiungi dalla libreria. L'applicazione era già annullabile a parte (punto 6). Implementazione: un registro di 10 snapshot dei preset in `storage.local`. Un pulsante "Annulla: <cosa>" appare sopra la lista per l'ultima modifica, e il registro si svuota da solo oltre le 10 voci.
20. **[PROVATO] Eliminare è irreversibile.** Il dialogo lo dichiara, ma non c'è modo di tornare indietro. Il punto 19 lo risolve.

## 4. Accessibilità (misurato)

Rapporti di contrasto WCAG calcolati sui colori del tema:

| Coppia | Rapporto | Minimo | Esito |
|---|---|---|---|
| Testo bianco su pulsante primario, tema scuro (#ffffff / #60a5fa) | **2.54** | 4.5 testo | **fallisce** |
| Testo bianco su pulsante eliminazione, scuro (#ffffff / #f87171) | **2.77** | 4.5 | **fallisce** |
| Testo rosso su sfondo errore, chiaro (#dc2626 / #fee2e2) | **3.95** | 4.5 | **fallisce** |
| Bordo dei campi su bianco, chiaro (#d9e0ea / #ffffff) | **1.33** | 3 (componenti) | **fallisce** |
| Testo muted, chiaro e scuro | 5.2–6.6 | 4.5 | ok |
| Testo principale | 16.4 | 4.5 | ok |

**[DECISO]** colore di testo sul primario scuro scuro (scuro su azzurro, circa 7:1), rosso più scuro per il testo di errore, bordo dei controlli più scuro.

21. **[LETTURA] Il menu non ha focus gestito**: aprendo un menu, il focus non va sulla prima voce. **[DECISO]** focus sulla prima voce, frecce, Esc chiude e rimette il focus sul pulsante.
22. **[LETTURA] La select del tema usa lo stile nativo**, che nel tema scuro non combacia con il resto. **[DECISO]** stilizzata.
23. **[LETTURA] Nessun testo alternativo utile sulla card**: l'anteprima dice "Layout preview: N windows", non quali finestre sono dove. **[DECISO]** nessuna modifica; è un'anteprima, la lista dei tab dà il dettaglio. Annotato come limite.

## 5. Icone e identità

24. **[LETTURA] L'icona "layers" dell'intestazione del popup non dice cosa fa.** **[DECISO]** etichetta testuale "Manage" accanto.
25. **[LETTURA] Il titolo è ripetuto** in ogni schermata come intestazione. Accettabile; annotato.

## 6. Funzioni che mancano rispetto ai progetti visti

| Funzione | In concorrenti/OSS | Stato |
|---|---|---|
| Annullamento generale | Tab Saver (parziale) | **Fatto** (punto 19) |
| Scorciatoie assegnabili per preset | gTile (tasti per layout) | **Fatto** (punto 14) |
| Cerca dentro i tab | Tab Session Manager | **Fatto** (punto 15) |
| Modifica prima del salvataggio (togliere tab) | Tab Session Manager | **Fatto** (punto 16) |
| Salvataggi automatici | Tab Session Manager | Non fatto: richiede `alarms` |
| Gruppi di tab | Tabs Session Saver | Non fatto: API non verificata qui |
| Ripristino per singola finestra | varie | Non fatto: aggiunge scelta nell'UI, poco richiesto |

## 7. Esito di questo giro

Legenda: **[VERIFICATO]** coperto da un test che clicca l'interfaccia o misura il colore; **[CODICE]** implementato e controllato dalla lettura, senza test dedicato; **[APERTO]** non risolto.

| Punto | Esito |
|---|---|
| 1 Eliminare non funziona | **[VERIFICATO]** corretto: il test clicca "Delete" nel menu e il preset sparisce. |
| 2 Dialogo di capture si chiude su conflitto | **[VERIFICATO]** il dialogo resta aperto, mostra l'errore e conserva il nome. |
| 3 Esc non chiude il menu | **[VERIFICATO]** Esc chiude, il focus torna sul pulsante, il clic fuori chiude. |
| 4 Nome suggerito | **[CODICE]** il dialogo di salvataggio propone "Layout", "Layout 2"… |
| 5 Chiusura della finestra della panel | **[VERIFICATO] lato background** (la finestra indicata resta aperta); **[APERTO]** il percorso reale dalla side panel non si può automatizzare. |
| 6 Annullamento dell'applicazione a un livello | **[APERTO] parziale.** L'annullamento dell'applicazione resta a un solo livello. Le modifiche ai preset invece hanno un registro di 10 voci (punto 19). |
| 7 Import non annullabile | **[VERIFICATO]** l'import si annulla dal banner. |
| 8 Popup con solo tre preset | **[VERIFICATO]** il popup elenca tutti i preset (7 su 7 nel test). |
| 9 Toast in basso | **[CODICE]** ora in alto, con azione opzionale; controllato a schermo. |
| 10 Toast su ogni impostazione | **[VERIFICATO]** nessun toast al cambio di impostazione. |
| 11 Due percorsi per il salvataggio | **Tenuto di proposito.** Il popup è inline, la side panel usa un dialogo perché serve più spazio per il nome e per l'errore. |
| 12 Riepilogo lungo nel popup | **[VERIFICATO]** formato breve con test unitario sul singolare e plurale. |
| 13 Ordine solo alfabetico | **[VERIFICATO]** ordine per uso recente, poi alfabetico (test unitario); il popup lo usa. |
| 14 Scorciatoie non assegnabili | **[VERIFICATO]** il menu assegna il tasto 2 e il gestore del comando applica il preset assegnato, non il secondo alfabetico. |
| 15 Ricerca solo per nome | **[VERIFICATO]** cerca nei titoli e negli URL dei tab. |
| 16 Nessun modo di togliere un tab | **[VERIFICATO]** si rimuove un tab e l'annullamento lo riporta. |
| 17 Esportazione con nome fisso | **[CODICE]** il nome contiene la data. |
| 18 Aggiunta dalla libreria senza riscontro | **[VERIFICATO]** l'azione "View" porta alla scheda e evidenzia il preset. |
| 19 Azioni annullabili | **[VERIFICATO]** eliminare, rinominare, aggiornare, rimuovere un tab, importare: ognuno si annulla dal banner. |
| 20 Eliminare irreversibile | **[VERIFICATO]** come sopra, e il dialogo di conferma non c'è più. |
| 21 Menu senza focus gestito | **[VERIFICATO]** Esc e ritorno del focus; **[CODICE]** il focus va sulla prima voce all'apertura, non misurato. |
| 22 Select nativo | **[CODICE]** stilizzato; non riguardato a schermo in questo giro. |
| 23 Anteprima senza dettaglio | **[APERTO]** deliberato: l'anteprima è schematica, il dettaglio è nella lista dei tab. |
| 24 Icona senza etichetta | **[VERIFICATO]** pulsante "Manage" con testo. |
| 25 Titolo ripetuto | **[APERTO]** accettato. |
| Contrasti | **[VERIFICATO]** tutti sopra soglia (tabella sopra; ricalcolati dopo la correzione). |

Due problemi trovati lungo la strada, entrambi corretti e coperti dal test:
- Il banner stampava la parola **"null"**: `replaceChildren()` converte `null` in testo, `h()` no.
- Il pulsante "Gestisci" del popup usava `chrome.windows.getCurrent`, che dentro un popup restituisce il popup stesso. Ora usa la finestra normale più recente.

## 8. Cosa non ho potuto provare

- Chiusura della side panel con "chiudi le altre finestre" (punto 5): serve un gesto utente per aprire la side panel, non fattibile in automazione.
- Comportamento su più monitor: un solo schermo virtuale.
- Scorciatoie da tastiera reali: Playwright non preme Ctrl+Shift+N a livello di browser. Il gestore è verificato chiamando la stessa funzione del listener.
