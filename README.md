# Gestionale PdS

Applicazione web per la gestione dei **progetti di spesa (PdS)** di un ufficio pubblico: capitoli di spesa per esercizio finanziario, ciclo di vita completo di ogni PdS (invio, stipula, tempi di esecuzione, pagamenti, saldo ed economia), sintesi finanziaria per capitolo e complessiva, avvisi sulle scadenze, utenti con permessi differenziati e storico delle modifiche.

Ogni schermata lavora su **un singolo esercizio finanziario**, scelto dalla tendina in alto. Numero del PdS ed esercizio si inseriscono separatamente (`18` + `2026`) e si leggono insieme come `18/2026`. I protocolli si digitano come numero puro (`0089567`) con la relativa data e compaiono come «Prot. n. 0089567 del 15/01/2026».

- Si usa **solo con un link**, da computer e smartphone, senza installare nulla.
- È ospitata su **GitHub Pages** e funziona **da sola nel cloud**: non serve alcun computer acceso; ogni utente accede in autonomia dal proprio dispositivo.
- L'archivio dei dati è **intercambiabile** (si sceglie nel file `public/config.json`, senza ricompilare):

| Archivio | Dove stanno i dati | Quando usarlo |
|---|---|---|
| `github` | repository GitHub **privato**, con accessi protetti da un portachiavi cifrato | la rete dell'ufficio consente solo GitHub |
| `supabase` | database PostgreSQL gestito (piano gratuito) con permessi applicati dal server | Supabase è raggiungibile dalla rete dell'ufficio (sicurezza più robusta) |
| `demo` | solo nel browser, con dati di esempio | per provare l'applicazione |

La pagina **Diagnostica connessione** (`…/#/diagnostica`, disponibile anche senza accesso) verifica dal computer di lavoro quali servizi sono raggiungibili e suggerisce l'archivio da usare.

## Documentazione

- [Pubblicazione passo passo](docs/PUBBLICAZIONE.md) – GitHub Pages, archivio GitHub o Supabase, manutenzione e recupero accessi
- [Architettura e scelte tecniche](docs/ARCHITETTURA.md) – valutazione dello stack, modello dati, regole di calcolo, sicurezza
- [Manuale utente](docs/MANUALE-UTENTE.md)

## Funzionalità (riferimenti alla specifica)

| Sezione | Implementazione |
|---|---|
| 3 – Utenti e permessi | amministratore; permessi per area (capitoli, creazione/eliminazione PdS, dati PdS, pagamenti e saldo, allegati) e per ambito di capitoli; lettura sempre consentita agli utenti attivi. **Utenti e permessi**, **Registro modifiche**, **Storico modifiche** del singolo PdS e **PdS eliminati** sono visibili solo all'amministratore |
| 3bis – Accordi quadro | capienza contrattuale di ogni AQ, **atti di adesione a quantità indeterminata** (impegnano la capienza, non i capitoli) e **a quantità determinata** (i PdS collegati direttamente all'AQ); situazione di ordinato, impegnato e residuo ordinabile per ogni AQ e per ogni atto |
| 4 – Capitoli di spesa | per esercizio finanziario, con totale finanziato; copia dei capitoli da un esercizio all'altro; l'amministratore può autorizzare il superamento del finanziato motivandolo (l'avviso rosso non viene più mostrato) |
| 5 – PdS | tutti i campi richiesti (ditta, ordinativo, **più IDV** per PdS), tempi a durata (giorni/mesi dalla stipula) o a data fissa, pagamenti multipli, conferma e annullamento del saldo con calcolo dell'economia, note, allegati (collegamenti e file), stato calcolato (in preparazione, inviato, stipulato, scaduto, saldato), storico modifiche. L'eliminazione è **logica**: il PdS finisce tra i «PdS eliminati», che solo l'amministratore vede, ripristina o elimina definitivamente |
| 6 – Sintesi finanziaria | per capitolo e complessiva: finanziato, impegnato (Trasmesso) e impegnato (Stipulato) con gli importi non ancora stipulati tra parentesi, pagato, disponibile da impegnare (finanziato − stipulato + economie), residuo da pagare; percentuali, grafico a barre, avviso di superamento del finanziato |
| 7 – Scadenze | evidenza gialla/rossa negli elenchi, pagina dedicata con soglia in giorni regolabile |
| 8 – Usabilità | filtri (capitolo, stato, DEC, avvisi) sull'esercizio scelto, ricerca testuale (numero, ditta, ordinativo, IDV, accordo quadro, protocolli), ordinamento colonne, esportazione Excel e CSV da PdS, capitoli, sintesi e accordi quadro, con **grafici nativi** dell'andamento finanziario nei file Excel |
| 9 – Formati | importi gestiti in centesimi (nessun errore di arrotondamento), formato italiano coerente, numeri e date veri nei file Excel |
| 10 – Interfaccia | desktop e mobile, tema chiaro/scuro, accessibile da tastiera |

## Sviluppo

Requisiti: Node.js 22 o successivo.

```bash
npm install
npm run dev          # applicazione su http://localhost:5173 (modalità dimostrativa)
npm run typecheck    # controllo dei tipi TypeScript
npm test             # test unitari, dei backend e dello schema SQL (PostgreSQL reale via PGlite)
npm run e2e          # test end-to-end nel browser Microsoft Edge (demo, GitHub e Supabase emulati)
npm run build        # compilazione in dist/
```

Struttura principale:

```
src/domain/        regole di dominio: tipi, calcoli, stato, sintesi, permessi, validazioni, registro
src/motore/        applicazione dei comandi (usata dai backend demo e GitHub)
src/backend/       archivi dati: demo, github (API Git + portachiavi cifrato), supabase
src/ui/            interfaccia (React + Mantine)
src/esportazione/  export Excel e CSV, con i grafici nativi del pacchetto .xlsx
supabase/          schema SQL (RLS, trigger, funzioni) ed Edge Function "gestione-utenti"
.github/workflows-da-attivare/  pubblicazione su Pages, installazione Supabase, keep-alive (vedi LEGGIMI.md)
tests/             test unitari, SQL ed end-to-end, emulatori di GitHub e Supabase
```
