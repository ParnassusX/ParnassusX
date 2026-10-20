# Piano di monetizzazione: Window Layout Manager

Bozza. Nessuna cifra qui è un dato di mercato misurato. Le cifre marcate **[verificare]** vanno controllate sulle pagine ufficiali prima di decidere.

## 1. Principio

Il tier gratuito deve restare utile da solo: salvare e ripristinare layout in locale, senza limiti artificiali. Chi paga, paga per una cosa che il gratuito non fa: **sincronizzazione tra dispositivi e backup**. Limitare il numero di preset nel gratuito è la tentazione sbagliata: fa percepire il prodotto come rotto e danneggia la recensione nello store.

## 2. Costi fissi

| Voce | Costo | Stato |
|---|---|---|
| Registrazione sviluppatore Chrome Web Store | **$5 una tantum** (un solo pagamento per account, copre tutte le estensioni) | Noto; confermare sulla pagina ufficiale del Developer Program **[verificare]** |
| Dominio + pagina di presentazione | circa 10–15 €/anno (stima) | Stima |
| Infrastruttura sync (auth + database + storage) | 0 € sui piani gratuiti dei fornitori più comuni, oltre una certa soglia a pagamento | **[verificare]** prezzi e soglie al momento della scelta |
| Partita IVA / registrazione attività in Italia | variabile; necessaria se si incassa direttamente | Da chiedere a un commercialista |

Il costo di lancio è quindi sotto i 30 € prima di incassare il primo euro.

## 3. Tier

**Gratuito (per sempre)**
- Salvataggio e ripristino di layout in locale, preset illimitati.
- Scorciatoie da tastiera, import/export JSON.
- Nessun account richiesto.

**Pro**
- Sincronizzazione dei preset tra i dispositivi con lo stesso account Google o un account dell'estensione.
- Backup automatico con cronologia delle ultime versioni di un preset (es. ultime 10).
- Priorità sulle richieste di funzioni.

**Prezzo ipotizzato**
- $24/anno oppure $3/mese **[ipotesi: da validare con un test di prezzo reale, non con sondaggi]**.
- Lifetime a $29 è una tentazione da evitare: con il sync il costo di server è continuo, un lifetime fa perdere soldi sui clienti di lunga durata.

## 4. Pagamenti

Il vecchio sistema di pagamenti integrato nel Chrome Web Store non è più una strada pratica per nuove estensioni; i pagamenti avvengono su un servizio esterno e la licenza viene verificata dall'estensione con un token. Il dato da controllare prima di costruire è la policy attuale del Developer Program sui pagamenti esterni e sulle funzioni a pagamento **[verificare]**.

Fornitori da confrontare:

| Opzione | Come funziona | Costo per vendita (stima) | Note |
|---|---|---|---|
| Lemon Squeezy / Paddle | *Merchant of record*: loro incassano, gestiscono IVA e vendite. | circa 5% + 0,50 $ **[verificare]** | Più semplice per un singolo sviluppatore; costo più alto; l'IVA è gestita da loro. |
| Stripe diretto | Tu sei il venditore; Stripe incassa. | circa 2,9% + 0,30 $ per carta **[verificare]** | Più economico, ma IVA, fatturazione e partita IVA sono a carico tuo. |
| Stripe Managed Payments | Stripe come merchant of record. | più alto dello Stripe diretto, con una commissione aggiuntiva **[verificare]** | Da valutare se disponibile per il tuo paese. |

Raccomandazione: **Lemon Squeezy o Paddle per il primo anno**. Il costo in più è pagato per non gestire l'IVA europea da soli. Passare a Stripe diretto ha senso solo sopra qualche migliaio di euro di ricavi annui, quando il risparmio supera il costo del commercialista.

## 5. Ricavo netto per cliente

Con $24/anno e commissione 5% + $0,50:

- Incasso lordo: $24,00
- Commissione: $1,20 + $0,50 = $1,70
- **Netto: $22,30 per abbonamento annuo**

Con $3/mese: $3 − $0,15 − $0,50 = $2,35 netti al mese.

## 6. Scenari (ipotesi, non previsioni)

I numeri sono utenti attivi, percentuale di paganti e ricavo netto annuo a $22,30 per abbonato. La percentuale di conversione è un'ipotesi: nel freemium tipico è spesso nell'ordine dell'1–3%; per una utility di nicchia è più probabile il limite basso.

| Scenario | Utenti attivi | Paganti (ipotesi) | Ricavo netto annuo (circa) |
|---|---|---|---|
| Basso | 2.000 | 1% = 20 | $446 |
| Medio | 10.000 | 2% = 200 | $4.460 |
| Alto | 50.000 | 3% = 1.500 | $33.450 |

Più due correzioni che il piano deve includere:

- **Abbandono (churn).** Gli abbonamenti annuali perdono una parte dei clienti ogni anno. Se perdi il 30–40% all'anno, i numeri sopra valgono solo per il primo ciclo. Serve una stima con dati reali prima di fare piani.
- **Costi operativi del sync.** Server, supporto e tempo di sviluppo non sono gratuiti. Nello scenario basso, il ricavo copre a malapena il costo della manutenzione.

Conclusione onesta: per un'estensione con questo tipo di utenza, il realistico nei primi 12 mesi è **poche centinaia di dollari l'anno**. Non è un progetto che si mantiene da solo senza una crescita degli utenti che al momento non è misurata.

## 7. Prima di costruire il sync: validare

Ordine consigliato, dal più economico al più costoso:

1. **Store e misura (settimana 1–2).** Pubblicare la versione 0.2.0 (serve la registrazione da $5). Misurare installazioni e recensioni. Senza installazioni non c'è nulla da monetizzare. *Decisione dell'utente: pubblicare.*
2. **Pagina e lista d'attesa (settimana 2–4).** Una pagina con l'elenco del Pro e un modulo "voglio il sync". Obiettivo di segnale: 100 iscritti spontanei. Sotto quella soglia, il sync non va costruito.
3. **Prezzo reale (settimana 4–6).** Mostrare il prezzo a una parte dei visitatori e misurare il clic su "acquista". Costa zero se si usa un link a un checkout di Lemon Squeezy/Paddle senza sync: il pagamento è prematuro, ma il clic dice quanto vale.
4. **Costruzione del sync.** Solo se i passi 2 e 3 danno segnale. Il sync usa la stessa struttura di preset già presente (`lib/layout.js` valida già i dati in ingresso, quindi il server può riusare la stessa validazione).

## 8. Rischi di policy da controllare prima

- Una funzione a pagamento non deve rendere inutilizzabile la funzione di base dell'estensione. Il piano sopra la rispetta.
- Il sync trasferisce URL di navigazione. Serve un'informativa chiara su quali dati escono dal dispositivo, e un'opzione per cancellarli. Verificare i requisiti di privacy dello store **[verificare]**.
- Se si raccolgono dati di utilizzo per decidere il prezzo, va dichiarato. Il piano non ne ha bisogno: basta contare le installazioni e i clic.

## 9. Cosa decide l'utente

- Pubblicare (costo $5) o no.
- Forma giuridica per incassare: fornitore MoR (più costoso, nessuna partita IVA) o Stripe diretto (più economico, con partita IVA).
- Se il sync è l'unico Pro o se si aggiunge altro.
