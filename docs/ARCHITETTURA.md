# Architettura e scelte tecniche

Questo documento risponde alle richieste delle sezioni 2 e 11 della specifica: valutazione dello stack, modello dati e regole di calcolo.

## 1. Vincoli determinanti

1. **Rete del computer di lavoro**: blocchi su applicazioni e siti, GitHub consentito. Il servizio che conserva i dati deve essere raggiungibile *da quella rete*, altrimenti l'applicazione è inutilizzabile proprio dove serve di più.
2. **Nessuna installazione**, accesso tramite link da computer e smartphone.
3. **Funzionamento autonomo**: l'applicazione deve restare disponibile senza che alcun computer resti acceso e senza che altri utenti siano collegati.
4. **Multi-utente** con username e password individuali e permessi di modifica differenziati.

## 2. Valutazione delle alternative

| Opzione | Raggiungibilità dalla rete dell'ufficio | Autenticazione e permessi | Costi e manutenzione | Esito |
|---|---|---|---|---|
| **GitHub Pages + Supabase** (PostgreSQL, Auth, Storage) | dipende dal filtro: dominio `*.supabase.co` | robusti: Row Level Security e trigger nel database | gratuito; il progetto si sospende dopo ~7 giorni di inattività (risolto con job GitHub Actions) | **scelto** (archivio consigliato quando raggiungibile) |
| **GitHub Pages + repository GitHub privato** | massima: usa solo domini GitHub | applicati dall'applicazione; accesso ai dati protetto da token cifrato con la password di ogni utente | gratuito, nessuna sospensione; token da rinnovare alla scadenza | **scelto** (archivio garantito sulla rete dell'ufficio) |
| GitHub Pages + Firebase | dominio `googleapis.com` spesso consentito ma non garantito | buoni (regole di sicurezza) | la creazione di utenti da parte dell'amministratore e l'archivio file richiedono il piano a pagamento | scartato |
| Server applicativo (Vercel, Netlify, Render…) | domini terzi, spesso bloccati | a carico del codice server | più componenti da mantenere | scartato |
| GitHub Codespaces / Actions come server | non adatti a un uso interattivo continuo | – | a consumo | scartato |

Poiché la raggiungibilità di Supabase dalla rete dell'ufficio non è verificabile a priori, l'applicazione è stata progettata con un **livello dati intercambiabile**: la stessa interfaccia e le stesse regole funzionano con entrambi gli archivi (più un archivio dimostrativo locale). La scelta si fa al momento della pubblicazione, dopo la verifica con la pagina **Diagnostica connessione**, modificando `config.json`.

### Stack

- **Frontend**: React 19, TypeScript, Mantine 9 (componenti accessibili, tema chiaro/scuro, date in italiano), Vite. Routing con hash (`#/percorso`), compatibile con GitHub Pages senza configurazioni server.
- **Hosting**: GitHub Pages, pubblicato automaticamente da GitHub Actions (build, controllo dei tipi e test a ogni modifica).
- **Archivio GitHub**: API Git di GitHub (commit atomici con controllo "fast-forward"), WebCrypto (PBKDF2-SHA256 600.000 iterazioni, AES-GCM 256).
- **Archivio Supabase**: PostgreSQL con RLS, trigger e funzioni; Supabase Auth; Supabase Storage; una Edge Function per le operazioni che richiedono la chiave di servizio (creazione, reimpostazione password ed eliminazione utenti).
- **Test**: Vitest (dominio, motore, backend GitHub su emulatore, schema SQL su PostgreSQL reale con PGlite, backend Supabase ed Edge Function su emulatore PostgREST/Auth/Storage), Playwright (end-to-end nel browser Edge con i tre archivi).

## 3. Architettura

```
Interfaccia (React)
   │  comandi (es. "pds.modifica", "saldo.conferma")          dati condivisi
   ▼                                                              ▲
Stato applicativo ──► Backend (interfaccia comune) ───────────────┘
                        ├─ DemoBackend      → motore locale → localStorage / IndexedDB
                        ├─ GitHubBackend    → motore locale → commit nel repository privato
                        └─ SupabaseBackend  → motore locale (controlli e messaggi) → PostgREST/RPC
                                                              → RLS + trigger (controlli definitivi)
```

- **Dominio** (`src/domain`): tipi, calcolo dello stato e delle scadenze, sintesi, permessi, validazioni, descrizione dello storico. È puro e interamente testato.
- **Motore** (`src/motore`): applica un comando ai dati verificando permessi, validazioni e conflitti e produce le voci dello storico. Con Supabase è eseguito prima dell'invio per dare messaggi immediati; il database ripete comunque tutti i controlli.
- **Concorrenza**: ogni modifica porta con sé i valori dei campi "visti" dall'utente. Se nel frattempo un altro utente ha cambiato gli stessi campi la modifica viene respinta con un messaggio di conflitto (nessuna sovrascrittura silenziosa). Con GitHub, modifiche contemporanee a campi diversi vengono riapplicate automaticamente sull'ultima versione.
- **Aggiornamento automatico**: ogni minuto e al ritorno sulla finestra l'app verifica, con una richiesta leggera, se altri hanno modificato i dati.

## 4. Modello dati

Gli importi sono **interi in centesimi** nell'applicazione e nel repository GitHub, `numeric(15,2)` in PostgreSQL; le date sono `YYYY-MM-DD`.

- **Capitolo di spesa**: esercizio, codice (univoco nell'esercizio), denominazione (non mostrata nell'interfaccia), totale finanziato, autorizzazione al superamento del finanziato (flag + motivazione, riservata all'amministratore).
- **Accordo quadro**: numero, oggetto, ditta, DEC, protocollo e data di stipula, durata in giorni, importo (capienza contrattuale), note.
- **Atto di adesione** (solo quelli *a quantità indeterminata*): accordo quadro, numero, oggetto, protocollo e data di stipula, durata in giorni (predefinita 365), valore stipulato, note. Gli atti *a quantità determinata* non sono una riga a sé: coincidono con i PdS collegati direttamente all'accordo quadro.
- **PdS**: numero (**solo cifre**; l'anno arriva dall'esercizio del capitolo, quindi il PdS si legge `18/2026`), capitolo (→ esercizio), accordo quadro ed eventuale atto di adesione, ditta, ordinativo, IDV (**più codici separati da virgola**), collaboratore/DEC; importo inviato, protocollo e data di invio; protocollo, data e valore della stipula; modalità del termine (durata in giorni o mesi dalla stipula, oppure data fissa); saldo (flag, data, totale pagato a saldo); note; **eliminazione logica** (istante e utente).
- **Protocolli**: numero puro (solo cifre, zeri iniziali conservati) più la data del campo che li accompagna; l'interfaccia li compone come «Prot. n. … del …».
- **Pagamento**: PdS, data, importo (> 0), riferimento, note.
- **Allegato**: PdS, tipo (protocollo di invio, protocollo di stipula, fattura, altro), titolo, collegamento esterno **oppure** file caricato.
- **Utente/profilo**: nome utente, nome, ruolo (amministratore/utente), attivo, permessi.
- **Registro**: istante, utente, oggetto, azione (creazione/modifica/eliminazione), riferimento leggibile, campi modificati con valore precedente e nuovo.

## 5. Regole di calcolo

**Stato del PdS** (in ordine di priorità):

| Stato | Condizione |
|---|---|
| Saldato | saldo confermato |
| Scaduto | esiste una scadenza ed è superata (resta conteggiato tra gli stipulati) |
| Stipulato | stipula registrata: il PdS è in esecuzione |
| Inviato | data di invio presente, stipula non registrata |
| In preparazione | nessuna data di invio |

**Scadenza per l'esecuzione**: con modalità "durata" = data di stipula + durata; i giorni si contano escludendo il giorno iniziale (30 giorni dalla stipula del 10/01 → 09/02); i mesi terminano nel giorno corrispondente o, se manca, nell'ultimo giorno del mese (31/01 + 1 mese → 28/02). Con modalità "data" = data indicata.

**Avvisi**: PdS non saldati con scadenza superata (rosso) o entro la soglia di giorni (giallo, 30 giorni predefiniti, modificabile).

**Saldo**: richiede la stipula (data e valore). Il valore complessivo finale pagato è la somma dei pagamenti registrati al momento della conferma (eventualmente incluso il pagamento a saldo inserito nella stessa operazione). **Economia = valore di stipula − totale pagato a saldo**. Con il PdS saldato i pagamenti non sono modificabili finché il saldo non viene annullato.

**Sintesi per capitolo** (e somma complessiva):

- *Totale finanziato*: dal capitolo.
- *Impegnato (Trasmesso)*: somma degli importi inviati dei PdS con data di invio (o già stipulati).
- *Impegnato (Stipulato)*: somma dei valori di stipula dei **soli PdS stipulati**; gli importi trasmessi dei PdS non ancora stipulati sono indicati a parte tra parentesi.
- *Effettivo pagato*: somma di tutti i pagamenti registrati.
- *Economie*: somma delle economie dei PdS saldati; non sono esposte come voce a sé ma rientrano nel disponibile.
- *Disponibile da impegnare*: finanziato − stipulato + economie.
- *Residuo da pagare*: per i PdS stipulati e non saldati, valore di stipula − pagato.
- Percentuali sul finanziato (e pagato sullo stipulato, che a fine esercizio tende al 100% meno le economie).
- *Superamento del finanziato*: impegnato (trasmesso o stipulato) superiore al finanziato. Non è bloccato: è evidenziato con icona ed etichetta nella sintesi, nell'elenco dei capitoli e nella panoramica, salvo i capitoli per cui l'amministratore ha autorizzato il superamento motivandolo.

I PdS eliminati logicamente non entrano in nessun conteggio: l'interfaccia li tiene fuori da elenchi, sintesi, grafici ed esportazioni.

**Situazione degli accordi quadro**:

- *Capienza* = importo dell'AQ.
- *Impegnato* = somma dei valori degli atti di adesione a quantità indeterminata **più** l'impegno dei PdS collegati direttamente all'AQ (atti a quantità determinata).
- Un PdS collegato a un atto di adesione consuma la quota parte dell'atto e **non** altra capienza dell'AQ: la capienza è già impegnata dall'atto.
- *Residuo ordinabile* = capienza − impegnato (negativo in caso di superamento).
- L'impegno di un PdS è il valore di stipula quando la stipula è registrata, altrimenti l'importo trasmesso.

**Esportazioni**: ogni sezione produce i propri fogli e i grafici dell'andamento finanziario. `write-excel-file` genera i dati; il pacchetto `.xlsx` viene poi completato con le parti OpenXML `chart` e `drawing` (`src/esportazione/grafici.ts`), così i grafici sono grafici veri di Excel e non immagini.

## 6. Sicurezza

### Archivio Supabase
- Row Level Security su tutte le tabelle; lettura solo per profili attivi; ogni area di modifica verificata nel database, compreso l'ambito dei capitoli.
- Trigger che verificano i permessi **per gruppi di campi** (i dati del PdS, il saldo e l'eliminazione logica richiedono permessi diversi), ricalcolano il totale a saldo e scrivono lo storico: lo storico non può essere alterato dall'applicazione.
- Eliminazione logica: `pds_crea` sposta il PdS tra gli eliminati; il ripristino e l'eliminazione definitiva (`DELETE`) sono consentiti al solo amministratore, come l'autorizzazione al superamento del finanziato di un capitolo.
- Accordi quadro e atti di adesione: area di permesso `accordi`; un trigger impedisce di spostare un atto su un altro accordo quadro e di collegare a un PdS un atto che non appartiene all'accordo quadro indicato.
- Tabelle esposte alle API solo tramite `GRANT` espliciti; la chiave pubblica nel browser non consente nulla senza un utente autenticato e abilitato.
- La chiave di servizio resta nella Edge Function, che verifica che il chiamante sia un amministratore attivo.

### Archivio GitHub
- Il repository dei dati è **privato**; il token di accesso non è mai pubblicato in chiaro.
- Il portachiavi pubblico contiene solo dati cifrati: il token è cifrato con una chiave K; ogni utente ha una chiave personale protetta dalla propria password (PBKDF2 600.000 iterazioni + AES-GCM) che sblocca K. Gli amministratori custodiscono le chiavi personali con una chiave amministrativa, così possono reimpostare password e sostituire il token senza conoscere le password altrui. I nomi utente non compaiono in chiaro.
- **Limite dichiarato**: i permessi sono applicati dall'applicazione. Un utente abilitato e tecnicamente esperto, una volta entrato, dispone del token e potrebbe modificare i dati direttamente su GitHub. Ogni salvataggio resta comunque nella cronologia del repository (recuperabile). È adatto a un gruppo di colleghi fidati; per un controllo lato server usare Supabase.
- Quando un utente lascia l'ufficio: eliminarlo e **sostituire il token** (pagina Utenti) revocando il precedente su GitHub.
- Il token dei fine-grained PAT può scadere: un amministratore lo rinnova direttamente dalla pagina di accesso.

### Generale
- Password di almeno 10 caratteri con lettere e cifre.
- La sessione resta solo nella scheda del browser, salvo scelta "Resta connesso".
- Tutte le pagine GitHub Pages di uno stesso account condividono l'origine del browser: pubblicare il gestionale da un account o un'organizzazione dedicati e non ospitarvi pagine di terzi.
- Nessuna risorsa caricata da CDN esterne: font di sistema e librerie incluse nel pacchetto.
